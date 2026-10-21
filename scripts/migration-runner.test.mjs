import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { lstatSync, symlinkSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ADVISORY_LOCK_KEYS,
  BOOTSTRAP_FILE,
  LEGACY_BASELINE,
  acquireAdvisoryLock,
  applyPendingMigrations,
  assertNoLegacyRows,
  assertNoMigrationLedgerWrites,
  assertNotSymbolicLink,
  assertNoTopLevelTransactionControl,
  bootstrapLedger,
  buildAdoptionPlan,
  collectSecretsFromUrl,
  discoverMigrations,
  executeMigration,
  executeRollback,
  formatError,
  installSignalHandlers,
  isLegacyBaselineRow,
  queryClient,
  redactSecrets,
  releaseAdvisoryLock,
  run,
  runInTransaction,
  safeSqlFile,
  selectRollbackTarget,
  sha256,
  validateAppliedState,
  validateLocalCommand,
} from './migration-runner.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function migrationFixture(version, { checksum = 'a', rollbackChecksum = null, sql = null } = {}) {
  const padded = String(version).padStart(3, '0');
  const fileName = `${padded}_fixture.sql`;
  const rollback = rollbackChecksum
    ? {
        fileName: `${padded}_fixture.rollback.sql`,
        checksum: rollbackChecksum.repeat(64),
        sql: `DROP ${padded};`,
      }
    : null;
  return {
    version,
    key: `${padded}_fixture`,
    fileName,
    checksum: checksum.repeat(64),
    sql: sql ?? `SELECT ${version};`,
    rollback,
  };
}

function ledgerRow(migration, status = 'success') {
  return {
    id: `00000000-0000-4000-8000-${String(migration.version).padStart(12, '0')}`,
    runner_managed: true,
    status,
    migration_version: migration.version,
    migration_key: migration.key,
    file_name: migration.fileName,
    checksum: migration.checksum,
    rollback_checksum: migration.rollback ? migration.rollback.checksum : null,
  };
}

async function withMigrationDirectory(files, callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'quote-runner-test-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(directory, name), content);
    }
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

class SequenceClient {
  constructor(steps = []) {
    this.steps = [...steps];
    this.queries = [];
    this.connected = false;
    this.ended = false;
  }

  async connect() {
    this.connected = true;
  }

  async end() {
    this.ended = true;
  }

  async query(text, values) {
    if (text && typeof text === 'object') {
      values = text.values ?? [];
      text = text.text;
    }
    this.queries.push({ text, values });
    if (this.steps.length === 0) return { rows: [], rowCount: 0 };
    const step = this.steps.shift();
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step(text, values, this) : step;
  }
}

const WRITE_PREFIX = /^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|BEGIN|COMMIT|ROLLBACK)/i;

function assertReadOnly(queries) {
  for (const query of queries) {
    assert.doesNotMatch(query.text, WRITE_PREFIX, `unexpected write statement: ${query.text.slice(0, 80)}`);
  }
}

test('01 sha256 is deterministic', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('02 secrets are redacted', () => {
  const secret = 'postgresql://user:password@example.invalid/db?token=abc';
  const output = redactSecrets(`failed ${secret} password=hunter2 token=abc`, [secret]);
  assert.equal(output.includes(secret), false);
  assert.equal(output.includes('hunter2'), false);
});

test('03 top-level transaction control is rejected', () => {
  for (const sql of ['BEGIN; SELECT 1;', 'COMMIT;', 'ROLLBACK;', 'START TRANSACTION;', 'END TRANSACTION;']) {
    assert.throws(() => assertNoTopLevelTransactionControl(sql), { code: 'TRANSACTION_CONTROL_FORBIDDEN' });
  }
});

test('04 transaction words in comments are ignored', () => {
  assert.doesNotThrow(() => assertNoTopLevelTransactionControl('-- BEGIN\n/* COMMIT /* ROLLBACK */ */ SELECT 1;'));
});

test('05 transaction words in strings are ignored', () => {
  assert.doesNotThrow(() => assertNoTopLevelTransactionControl("SELECT 'BEGIN; COMMIT', \"ROLLBACK\";"));
});

test('06 transaction words in dollar quotes are ignored', () => {
  assert.doesNotThrow(() => assertNoTopLevelTransactionControl('CREATE FUNCTION f() RETURNS void AS $body$ BEGIN NULL; END $body$ LANGUAGE plpgsql;'));
  assert.doesNotThrow(() => assertNoTopLevelTransactionControl("SELECT E'escaped\\' COMMIT';"));
});

test('07 ledger writes inside migration SQL are rejected', () => {
  for (const sql of [
    'INSERT INTO public.migration_records (id) VALUES (\'x\');',
    'UPDATE public.migration_records SET status = \'failed\';',
    'DELETE FROM public.migration_records;',
    'ALTER TABLE public.migration_records ADD COLUMN x integer;',
  ]) {
    assert.throws(() => assertNoMigrationLedgerWrites(sql), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  }
});

test('08 ledger read statements referencing migration_records stay allowed', () => {
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites('SELECT migration_version FROM public.migration_records;'));
});

test('09 file sorting is numeric', async () => {
  await withMigrationDirectory({ '129_c.sql': 'SELECT 3;', '127_a.sql': 'SELECT 1;', '128_b.sql': 'SELECT 2;' },
    async (directory) => assert.deepEqual((await discoverMigrations(directory)).map((item) => item.version), [127, 128, 129]));
});

test('10 duplicate versions are rejected', async () => {
  await withMigrationDirectory({ '127_a.sql': 'SELECT 1;', '127_b.sql': 'SELECT 2;' },
    async (directory) => assert.rejects(discoverMigrations(directory), { code: 'DUPLICATE_MIGRATION_VERSION' }));
});

test('11 invalid migration filenames are rejected', async () => {
  await withMigrationDirectory({ '127-BAD.sql': 'SELECT 1;' },
    async (directory) => assert.rejects(discoverMigrations(directory), { code: 'INVALID_MIGRATION_FILENAME' }));
});

test('12 orphan rollback files are rejected', async () => {
  await withMigrationDirectory({ '127_a.rollback.sql': 'SELECT 1;' },
    async (directory) => assert.rejects(discoverMigrations(directory), { code: 'ORPHAN_ROLLBACK_FILE' }));
});

test('13 path traversal is rejected', async () => {
  await withMigrationDirectory({}, async (directory) =>
    assert.rejects(safeSqlFile(directory, '../outside.sql'), { code: 'PATH_TRAVERSAL_REJECTED' }));
});

test('14 symlink SQL is rejected on a real filesystem symlink', { skip: process.platform === 'win32' ? 'creating symlinks on Windows requires privilege' : false }, async () => {
  await withMigrationDirectory({ '127_target.sql': 'SELECT 1;' }, async (directory) => {
    const linkPath = path.join(directory, '127_link.sql');
    symlinkSync(path.join(directory, '127_target.sql'), linkPath);
    assert.equal(lstatSync(linkPath).isSymbolicLink(), true);
    await assert.rejects(discoverMigrations(directory), { code: 'SYMLINK_SQL_REJECTED' });
  });
  // The pure predicate still rejects a symlink-shaped entry directly.
  assert.throws(() => assertNotSymbolicLink({ isSymbolicLink: () => true }, '127_link.sql'),
    { code: 'SYMLINK_SQL_REJECTED' });
});

test('15 legacy files below the runner floor are ignored by discovery', async () => {
  await withMigrationDirectory(
    { '005_legacy.sql': 'SELECT 1;', 'ALTER_TABLE_FIX.sql': 'SELECT 1;', '042_add_points_atomic.sql': 'SELECT 1;' },
    async (directory) => {
      const migrations = await discoverMigrations(directory);
      assert.equal(migrations.length, 0);
    });
});

test('16 a local migration gap is rejected', async () => {
  await withMigrationDirectory({ '127_a.sql': 'SELECT 1;', '129_c.sql': 'SELECT 3;' },
    async (directory) => assert.rejects(discoverMigrations(directory), { code: 'LOCAL_MIGRATION_GAP' }));
});

test('17 checksum drift is rejected', () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  assert.throws(() => validateAppliedState([local], [{ ...ledgerRow(local), checksum: '0'.repeat(64) }]),
    { code: 'CHECKSUM_DRIFT' });
});

test('18 an applied version missing locally is rejected', () => {
  assert.throws(() => validateAppliedState([], [{
    runner_managed: true, status: 'success', migration_version: 127, checksum: 'a'.repeat(64),
  }]), { code: 'APPLIED_VERSION_MISSING_LOCALLY' });
});

test('19 an applied version gap is rejected', () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const m128 = migrationFixture(128, { checksum: 'c', rollbackChecksum: 'd' });
  const m129 = migrationFixture(129, { checksum: 'e' });
  assert.throws(() => validateAppliedState([m127, m128, m129], [ledgerRow(m127), ledgerRow(m129)]),
    { code: 'APPLIED_VERSION_GAP' });
});

test('20 a local file gap in the applied range is rejected', () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const m129 = migrationFixture(129, { checksum: 'e' });
  assert.throws(() => validateAppliedState([m127, m129], [ledgerRow(m127), ledgerRow(m129)]),
    { code: 'LOCAL_MIGRATION_GAP' });
});

test('21 a rolled_back ledger row without a local rollback file is rejected', () => {
  const local = migrationFixture(127, { checksum: 'a' });
  assert.throws(() => validateAppliedState([local], [ledgerRow(local, 'rolled_back')]),
    { code: 'ROLLBACK_FILE_MISSING' });
});

test('22 a rolled_back tail row keeps post-rollback state valid', () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const m128 = migrationFixture(128, { checksum: 'c', rollbackChecksum: 'd' });
  const applied = validateAppliedState([m127, m128], [ledgerRow(m127), ledgerRow(m128, 'rolled_back')]);
  assert.deepEqual(applied.map((row) => row.migration_version), [127]);
});

test('23 duplicate ledger identity is rejected', () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  assert.throws(() => validateAppliedState([local], [ledgerRow(local), ledgerRow(local)]),
    { code: 'MIGRATION_LEDGER_IDENTITY_CONFLICT' });
});

test('24 legacy baseline rows are the only tolerated legacy rows', () => {
  const baselineRow = {
    runner_managed: false,
    migration_key: LEGACY_BASELINE.migrationKey,
    file_name: LEGACY_BASELINE.fileName,
    status: LEGACY_BASELINE.status,
    executor: LEGACY_BASELINE.executor,
  };
  assert.equal(isLegacyBaselineRow(baselineRow), true);
  assert.equal(isLegacyBaselineRow({ ...baselineRow, status: 'failed' }), false);
  assert.doesNotThrow(() => assertNoLegacyRows([baselineRow]));
  assert.throws(() => assertNoLegacyRows([{ ...baselineRow, status: 'failed' }]),
    { code: 'LEGACY_LEDGER_UNRECONCILED' });
});

test('25 adoption plan never treats legacy checksums as proof', () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const plan = buildAdoptionPlan([{ migration_key: local.key, file_name: local.fileName,
    checksum: local.checksum, runner_managed: false }], [local]);
  assert.equal(plan[0].conflict, 'legacy-checksum-is-not-runner-proof');
  assert.equal(plan[0].localSha256, local.checksum);
});

test('26 advisory lock timeout stops execution', async () => {
  let clock = 0;
  const client = new SequenceClient(Array.from({ length: 3 }, () => ({ rows: [{ locked: false }] })));
  await assert.rejects(acquireAdvisoryLock(client, {
    timeoutMs: 2, now: () => clock, wait: async () => { clock += 1; },
  }), { code: 'ADVISORY_LOCK_TIMEOUT' });
  assert.deepEqual(client.queries[0].values, ADVISORY_LOCK_KEYS);
});

test('27 advisory unlock uses the same stable keys', async () => {
  const client = new SequenceClient([{ rows: [{ unlocked: true }] }]);
  await releaseAdvisoryLock(client);
  assert.deepEqual(client.queries[0].values, ADVISORY_LOCK_KEYS);
});

test('28 runInTransaction checks interruption before BEGIN', async () => {
  const client = new SequenceClient();
  await assert.rejects(runInTransaction(client, { interrupted: true }, async () => {}),
    { code: 'RUN_INTERRUPTED' });
  assert.equal(client.queries.length, 0);
});

test('29 a commit with unknown outcome never issues a second rollback', async () => {
  const client = new SequenceClient([{ rowCount: null }, { rowCount: null }, new Error('commit-failed')]);
  await assert.rejects(
    runInTransaction(client, { interrupted: false }, async () => { await queryClient(client, 'SELECT 1;'); }),
    { code: 'COMMIT_OUTCOME_UNKNOWN' });
  assert.deepEqual(client.queries.map((query) => query.text), ['BEGIN', 'SELECT 1;', 'COMMIT']);
});

test('30 bootstrap failure rolls back its outer transaction', async () => {
  const client = new SequenceClient([{ rowCount: null }, new Error('bootstrap-failed'), { rowCount: null }]);
  await assert.rejects(bootstrapLedger(client, 'SELECT invalid;'), /bootstrap-failed/);
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
});

test('31 migration SQL is sent once, unsplit, inside one transaction', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([
    { rowCount: null }, { rows: [], rowCount: 0 }, { rowCount: null }, { rows: [], rowCount: 0 },
    { rowCount: 1 }, { rowCount: null },
  ]);
  await executeMigration(client, local, '00000000-0000-4000-8000-000000000001');
  assert.equal(client.queries.filter((query) => query.text === local.sql).length, 1);
  assert.equal(client.queries.at(-1).text, 'COMMIT');
});

test('32 fresh ledger registration is fully parameterized and commits', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([
    { rowCount: null }, { rows: [], rowCount: 0 }, { rowCount: null }, { rows: [], rowCount: 0 },
    { rowCount: 1 }, { rowCount: null },
  ]);
  await executeMigration(client, local, '00000000-0000-4000-8000-000000000001');
  const insert = client.queries.find((query) => /^INSERT INTO public\.migration_records/.test(query.text.trim()));
  assert.ok(insert, 'expected a parameterized INSERT from the runner');
  assert.doesNotMatch(insert.text, /'00000000-0000-4000-8000-000000000001'/, 'run id must not be interpolated');
  assert.doesNotMatch(insert.text, /'(127_fixture|127_fixture\.sql)'/, 'identity must not be interpolated');
  assert.equal(insert.values.length, 9);
});

test('33 ledger registration failure rolls back', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([
    { rowCount: null }, { rows: [], rowCount: 0 }, { rowCount: null }, { rows: [], rowCount: 0 },
    { rowCount: 0 }, { rowCount: null },
  ]);
  await assert.rejects(executeMigration(client, local), { code: 'LEDGER_REGISTRATION_FAILED' });
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
});

test('34 migration SQL failure rolls back', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([{ rowCount: null }, { rows: [], rowCount: 0 }, new Error('sql-failed'), { rowCount: null }]);
  await assert.rejects(executeMigration(client, local), /sql-failed/);
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
});

test('35 an interrupted migration rolls back before registration', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const runtime = { interrupted: false };
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [], rowCount: 0 },
    () => { runtime.interrupted = true; return { rowCount: null }; },
    { rowCount: null },
  ]);
  await assert.rejects(executeMigration(client, local, undefined, runtime), { code: 'RUN_INTERRUPTED' });
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
  assert.equal(client.queries.some((query) => /INSERT INTO public\.migration_records/.test(query.text)), false);
});

test('36 re-running a rolled_back migration uses strict CAS without the xmin backdoor', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const rolledBackRow = ledgerRow(local, 'rolled_back');
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [rolledBackRow], rowCount: 1 },
    { rowCount: null },
    { rows: [rolledBackRow], rowCount: 1 },
    { rowCount: 1 },
    { rowCount: null },
  ]);
  await executeMigration(client, local, '00000000-0000-4000-8000-000000000001');
  const update = client.queries.find((query) => /^UPDATE public\.migration_records/.test(query.text.trim()));
  assert.ok(update, 'expected a strict CAS UPDATE from the runner');
  assert.match(update.text, /status = 'rolled_back'/);
  assert.match(update.text, /runner_managed = true/);
  assert.doesNotMatch(update.text, /xmin|pg_current_xact_id/);
  assert.equal(client.queries.at(-1).text, 'COMMIT');
});

test('37 migration self-registration into the ledger is rejected and rolls back', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const selfRow = { ...ledgerRow(local), runner_managed: false, status: 'success' };
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [], rowCount: 0 },
    { rowCount: null },
    { rows: [selfRow], rowCount: 1 },
    { rowCount: null },
  ]);
  await assert.rejects(executeMigration(client, local), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
});

test('38 rollback without a rollback file is rejected before BEGIN', async () => {
  const client = new SequenceClient();
  await assert.rejects(executeRollback(client, { ...migrationFixture(127, { checksum: 'a' }), rollback: null }, {
    checksum: 'a'.repeat(64),
  }), { code: 'ROLLBACK_FILE_MISSING' });
  assert.equal(client.queries.length, 0);
});

test('39 rollback ledger CAS failure rolls back the rollback SQL', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [ledgerRow(local)], rowCount: 1 },
    { rowCount: null },
    { rowCount: 0 },
    { rowCount: null },
  ]);
  await assert.rejects(executeRollback(client, local, ledgerRow(local)), { code: 'ROLLBACK_LEDGER_CAS_FAILED' });
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
});

test('40 rollback checksum drift is rejected before any query', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient();
  const driftedRow = { ...ledgerRow(local), checksum: '0'.repeat(64) };
  await assert.rejects(executeRollback(client, local, driftedRow), { code: 'CHECKSUM_DRIFT' });
  assert.equal(client.queries.length, 0);
});

test('41 down targets only the latest version and needs exact confirmation', () => {
  const rows = [{ migration_version: 127 }, { migration_version: 128 }];
  assert.equal(selectRollbackTarget(rows, '128').migration_version, 128);
  assert.throws(() => selectRollbackTarget(rows, '127'), { code: 'INVALID_CONFIRMATION' });
  assert.throws(() => selectRollbackTarget([], '128'), { code: 'NO_RUNNER_MIGRATION_TO_ROLL_BACK' });
});

test('42 local command validation rejects unknown targets and bad confirmations', () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  assert.doesNotThrow(() => validateLocalCommand('up', { to: '127' }, [local]));
  assert.doesNotThrow(() => validateLocalCommand('down', { confirm: '127' }, [local]));
  assert.throws(() => validateLocalCommand('up', { to: '999' }, [local]), { code: 'INVALID_TARGET_VERSION' });
  assert.throws(() => validateLocalCommand('up', { to: 'abc' }, [local]), { code: 'INVALID_TARGET_VERSION' });
  assert.throws(() => validateLocalCommand('down', {}, [local]), { code: 'INVALID_CONFIRMATION' });
  assert.throws(() => validateLocalCommand('down', { confirm: '128' }, [local]), { code: 'INVALID_CONFIRMATION' });
});

test('43 applyPendingMigrations applies pending versions and emits APPLIED', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([
    { rowCount: null }, { rows: [], rowCount: 0 }, { rowCount: null }, { rows: [], rowCount: 0 },
    { rowCount: 1 }, { rowCount: null },
  ]);
  const emits = [];
  await applyPendingMigrations(client, [local], [], { output: (message) => emits.push(message) });
  assert.deepEqual(emits, [`APPLIED 127 ${'a'.repeat(64)}`]);
  assert.equal(client.queries.filter((query) => query.text === local.sql).length, 1);
});

test('44 applyPendingMigrations honours --to and skips applied versions', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const m128 = migrationFixture(128, { checksum: 'c', rollbackChecksum: 'd' });
  const client = new SequenceClient([
    { rowCount: null }, { rows: [], rowCount: 0 }, { rowCount: null }, { rows: [], rowCount: 0 },
    { rowCount: 1 }, { rowCount: null },
  ]);
  const emits = [];
  await applyPendingMigrations(client, [m127, m128], [ledgerRow(m127)],
    { to: 128, output: (message) => emits.push(message) });
  assert.deepEqual(emits, [`APPLIED 128 ${'c'.repeat(64)}`]);
});

test('45 runner source has no dotenv loading and no xmin backdoor', async () => {
  const source = await readFile(path.join(REPO_ROOT, 'scripts/migration-runner.mjs'), 'utf8');
  assert.doesNotMatch(source, /dotenv/);
  assert.doesNotMatch(source, /pg_current_xact_id|\bxmin\b/);
});

test('46 help prints the usage and returns 0', async () => {
  const outputs = [];
  assert.equal(await run(['help'], { output: (message) => outputs.push(message) }), 0);
  assert.match(outputs.join('\n'), /Usage: node scripts\/migration-runner\.mjs/);
});

test('47 legacy-disabled returns code 2', async () => {
  const errors = [];
  const code = await run(['legacy-disabled'], {
    environment: {},
    output: () => {},
    errorOutput: (message) => errors.push(message),
  });
  assert.equal(code, 2);
  assert.match(errors.join('\n'), /Legacy migration entrypoint disabled/);
});

test('48 unknown commands are rejected', async () => {
  await assert.rejects(run(['frobnicate'], { output: () => {} }), { code: 'UNKNOWN_COMMAND' });
});

test('49 verify is pure local by default', async () => {
  let factoryCalled = false;
  const outputs = [];
  assert.equal(await run(['verify'], {
    environment: {},
    clientFactory: async () => { factoryCalled = true; throw new Error('must-not-connect'); },
    output: (message) => outputs.push(message),
  }), 0);
  assert.equal(factoryCalled, false);
  assert.match(outputs[0], /^LOCAL_VERIFY_OK migrations=\d+$/);
});

test('50 status is read-only, healthy, and closes the connection', async () => {
  const columns = ['migration_version', 'run_id', 'runner_schema_version', 'runner_managed', 'rolled_back_at'];
  const client = new SequenceClient([
    { rows: [{ ledger_exists: true, marker_exists: true, columns_match: true }], rowCount: 1 },
    { rows: [{ matching_rows: 1 }], rowCount: 1 },
    { rows: columns.map((column_name) => ({ column_name })) },
    { rows: [], rowCount: 0 },
  ]);
  const outputs = [];
  const runtime = {};
  assert.equal(await run(['status'], {
    environment: { DATABASE_URL: 'postgresql://redacted.invalid/db' },
    clientFactory: async () => client,
    output: (message) => outputs.push(message),
    runtime,
  }), 0);
  assertReadOnly(client.queries);
  assert.equal(client.ended, true);
  assert.equal(JSON.parse(outputs.at(-1)).status, 'OK');
});

test('51 status without the legacy baseline returns code 3', async () => {
  const client = new SequenceClient([
    { rows: [{ ledger_exists: false, marker_exists: false, columns_match: false }], rowCount: 1 },
  ]);
  const outputs = [];
  assert.equal(await run(['status'], {
    environment: { DATABASE_URL: 'postgresql://redacted.invalid/db' },
    clientFactory: async () => client,
    output: (message) => outputs.push(message),
  }), 3);
  assert.equal(JSON.parse(outputs.at(-1)).status, 'LEGACY_BASELINE_REQUIRED');
});

test('52 adopt-plan is read-only and reports unreconciled legacy rows', async () => {
  const columns = ['migration_version', 'run_id', 'runner_schema_version', 'runner_managed', 'rolled_back_at'];
  const client = new SequenceClient([
    { rows: [{ ledger_exists: true, marker_exists: true, columns_match: true }], rowCount: 1 },
    { rows: [{ matching_rows: 1 }], rowCount: 1 },
    { rows: columns.map((column_name) => ({ column_name })) },
    { rows: [{
      id: 'legacy-id', migration_key: 'legacy_x', file_name: null, status: 'success', executor: 'legacy',
      checksum: null, rollback_checksum: null, executed_at: '2026-01-01T00:00:00Z',
      migration_version: null, run_id: null, runner_schema_version: null,
      runner_managed: false, rolled_back_at: null,
    }], rowCount: 1 },
  ]);
  const outputs = [];
  assert.equal(await run(['adopt-plan'], {
    environment: { DATABASE_URL: 'postgresql://redacted.invalid/db' },
    clientFactory: async () => client,
    output: (message) => outputs.push(message),
  }), 3);
  assertReadOnly(client.queries);
  assert.equal(client.ended, true);
  const parsed = JSON.parse(outputs.at(-1));
  assert.equal(parsed.status, 'LEGACY_LEDGER_UNRECONCILED');
  assert.equal(parsed.plan[0].migrationKey, 'legacy_x');
  assert.equal(parsed.plan[0].conflict, 'legacy-checksum-missing');
});

test('53 up fails closed on a missing legacy baseline and still closes', async () => {
  const client = new SequenceClient([
    { rows: [{ locked: true }] },
    { rows: [{ ledger_exists: false, marker_exists: false, columns_match: false }], rowCount: 1 },
    { rows: [{ unlocked: true }] },
  ]);
  await assert.rejects(run(['up'], {
    environment: { DATABASE_URL: 'postgresql://redacted.invalid/db' },
    clientFactory: async () => client,
    output: () => {},
  }), { code: 'LEGACY_BASELINE_REQUIRED' });
  assert.equal(client.ended, true);
});

test('54 invalid options are rejected before connecting', async () => {
  let factoryCalled = false;
  await assert.rejects(run(['up', '--file', '../arbitrary.sql'], {
    environment: {},
    clientFactory: async () => { factoryCalled = true; throw new Error('must-not-connect'); },
    output: () => {},
  }), { code: 'INVALID_OPTION' });
  assert.equal(factoryCalled, false);
});

test('55 down without an exact confirmation is rejected locally', async () => {
  let factoryCalled = false;
  await assert.rejects(run(['down'], {
    environment: {},
    clientFactory: async () => { factoryCalled = true; throw new Error('must-not-connect'); },
    output: () => {},
  }), { code: 'INVALID_CONFIRMATION' });
  assert.equal(factoryCalled, false);
});

test('56 HTTP disabled helper is fixed and accepts no dynamic error', async () => {
  const source = await readFile(path.join(REPO_ROOT, 'src/lib/migration-endpoint-disabled.ts'), 'utf8');
  assert.match(source, /migration-endpoint-disabled/);
  assert.match(source, /status: 410/);
  assert.match(source, /function migrationEndpointDisabled\(\)/);
});

test('57 legacy scripts cannot execute arbitrary SQL', async () => {
  for (const relative of ['scripts/exec-sql.ts', 'scripts/run-migrations.ts', 'scripts/migrate-via-rest.ts']) {
    const source = await readFile(path.join(REPO_ROOT, relative), 'utf8');
    assert.match(source, /Legacy migration entrypoint disabled/);
    assert.doesNotMatch(source, /exec_sql|readFile|psql|DATABASE_URL/);
  }
});

test('58 bootstrap static guards: no top-level txn, canonical deparse, exact catalog', async () => {
  const source = await readFile(BOOTSTRAP_FILE, 'utf8');
  assert.doesNotThrow(() => assertNoTopLevelTransactionControl(source));
  assert.match(source, /migration_records_runner_managed_check/);
  assert.match(source, /MIGRATION_RUNNER_BOOTSTRAP_POSTCONDITION_FAILED/);
  assert.match(source, /LIKE public\.migration_records INCLUDING ALL/);
  assert.match(source, /ON COMMIT DROP/);
  assert.match(source, /migration_version >= 127/);
  assert.match(source, /MIGRATION_RUNNER_CONSTRAINT_DEFINITION_MISMATCH/);
  assert.match(source, /pg_get_constraintdef/);
  assert.match(source, /canonical definition/);
  assert.match(source, /pg_catalog\.aclexplode/);
  assert.match(source, /pg_auth_members/);
});

test('59 guard rejects every ledger write verb and schema-qualified variant', () => {
  const attempts = [
    "INSERT INTO public.migration_records (id) VALUES ('x');",
    "UPDATE public.migration_records SET status = 'success';",
    'DELETE FROM public.migration_records;',
    'MERGE INTO public.migration_records USING (SELECT 1) s ON true WHEN MATCHED THEN DELETE;',
    'TRUNCATE TABLE public.migration_records;',
    'DROP TABLE public.migration_records;',
    'ALTER TABLE public.migration_records ADD COLUMN hacked boolean;',
    'INSERT INTO "public"."migration_records" (id) VALUES (\'x\');',
    'INSERT INTO MIGRATION_RECORDS (id) VALUES (\'x\');',
    // CREATE-on-ledger is part of the write-verb set (E1-R06): CREATE
    // TRIGGER / RULE / INDEX on the ledger would alter its behaviour or
    // structure and must be rejected.
    'CREATE TRIGGER _runner_trigger AFTER INSERT ON public.migration_records FOR EACH ROW EXECUTE FUNCTION public.f();',
    'CREATE RULE _runner_rule AS ON DELETE TO public.migration_records DO INSTEAD NOTHING;',
    'CREATE INDEX _runner_idx ON public.migration_records (id);',
    'CREATE INDEX ON public.migration_records USING btree (migration_version);',
    'CREATE INDEX ON "public"."migration_records" (id);',
    // COPY writes rows into the ledger and is therefore rejected too.
    'COPY public.migration_records FROM \'/tmp/x.csv\';',
    'COPY public.migration_records (id, migration_key) FROM stdin;',
    'COPY "public"."migration_records" (id) FROM stdin;',
  ];
  for (const sql of attempts) {
    assert.throws(() => assertNoMigrationLedgerWrites(sql),
      { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' }, sql);
  }
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(
    'SELECT migration_version, status FROM public.migration_records ORDER BY migration_version;'));
  // A trigger/index that targets a non-ledger table uses EXECUTE FUNCTION as
  // grammar, not dynamic SQL, and must not be rejected.
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(
    'CREATE TRIGGER _ok_trigger AFTER INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_product();'));
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(
    'CREATE INDEX _ok_idx ON public.products (id);'));
});

test('60 guard descends into DO block bodies', () => {
  assert.throws(() => assertNoMigrationLedgerWrites(`DO $block$
BEGIN
  INSERT INTO public.migration_records (id, runner_managed)
  VALUES ('00000000-0000-4000-8000-000000000001', true);
END
$block$;`), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(`DO $block$
BEGIN
  PERFORM 1;
END
$block$;`));
});

test('61 guard descends into CREATE FUNCTION / PROCEDURE dollar-quoted bodies', () => {
  assert.throws(() => assertNoMigrationLedgerWrites(`CREATE OR REPLACE FUNCTION public._runner_attack()
RETURNS void
LANGUAGE plpgsql
AS $body$
BEGIN
  INSERT INTO public.migration_records (id) VALUES ('00000000-0000-4000-8000-000000000001');
END
$body$;`), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.throws(() => assertNoMigrationLedgerWrites(`CREATE PROCEDURE public._runner_attack()
LANGUAGE plpgsql
AS $body$
BEGIN
  UPDATE public.migration_records SET runner_managed = true;
END
$body$;`), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.throws(() => assertNoMigrationLedgerWrites(
    "CREATE FUNCTION public._runner_attack() RETURNS void LANGUAGE sql AS 'INSERT INTO public.migration_records (id) VALUES (1)';"),
  { code: 'MIGRATION_LEDGER_WRITE_UNDETERMINABLE' });
});

test('62 dynamic EXECUTE cannot smuggle a ledger write past the scanner', () => {
  assert.throws(() => assertNoMigrationLedgerWrites(`DO $outer$
BEGIN
  EXECUTE 'INSERT INTO public.migration_records (id) VALUES (1)';
END
$outer$;`), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.throws(() => assertNoMigrationLedgerWrites(`DO $outer$
BEGIN
  EXECUTE E'INSERT INTO public.migration_records (id) VALUES (1)';
END
$outer$;`), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.throws(() => assertNoMigrationLedgerWrites(`DO $outer$
BEGIN
  EXECUTE $inner$
    INSERT INTO public.migration_records (id) VALUES (1);
  $inner$;
END
$outer$;`), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(`DO $outer$
BEGIN
  EXECUTE 'SELECT 1';
END
$outer$;`));
});

test('63 exec_sql is fail-closed; ledger reads and unrelated writes stay allowed', () => {
  assert.throws(() => assertNoMigrationLedgerWrites("SELECT exec_sql('SELECT 1');"),
    { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.throws(() => assertNoMigrationLedgerWrites('SELECT "exec_sql"(\'SELECT 1\');'),
    { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.throws(() => assertNoMigrationLedgerWrites(`DO $b$
BEGIN
  PERFORM exec_sql('DROP TABLE x');
END
$b$;`), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(
    "INSERT INTO public.audit_log (note) VALUES ('exec_sql is mentioned in a string only');"));
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(
    '-- comments may mention migration_records freely\nSELECT 1;'));
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(
    'SELECT * FROM public.migration_records WHERE runner_managed;'));
});

test('64 guard runs at SQL ingestion time for discovered migrations', async () => {
  await withMigrationDirectory({
    '127_write.sql': 'INSERT INTO public.migration_records (id) VALUES (1);',
  }, async (directory) => {
    await assert.rejects(discoverMigrations(directory), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  });
});

test('65 executeMigration fails closed without sending ledger-writing SQL', async () => {
  const local = {
    ...migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' }),
    sql: 'INSERT INTO public.migration_records (id) VALUES (1);',
  };
  const client = new SequenceClient([{ rowCount: null }]);
  await assert.rejects(executeMigration(client, local), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
  assert.equal(client.queries.some((query) => query.text.includes('INSERT INTO public.migration_records')), false);
});

test('66 executeRollback fails closed on ledger-writing rollback SQL', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  local.rollback.sql = 'UPDATE public.migration_records SET status = \'failed\';';
  const client = new SequenceClient([{ rowCount: null }]);
  await assert.rejects(executeRollback(client, local, ledgerRow(local)), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  assert.equal(client.queries.at(-1).text, 'ROLLBACK');
  assert.equal(client.queries.some((query) => query.text.includes('UPDATE public.migration_records')), false);
});

test('67 migrations without a rollback file register rollback_checksum as NULL', async () => {
  const local = migrationFixture(127, { checksum: 'a' });
  const client = new SequenceClient([
    { rowCount: null }, { rows: [], rowCount: 0 }, { rowCount: null }, { rows: [], rowCount: 0 },
    { rowCount: 1 }, { rowCount: null },
  ]);
  await executeMigration(client, local, '00000000-0000-4000-8000-000000000001');
  const insert = client.queries.find((query) => /^INSERT INTO public\.migration_records/.test(query.text.trim()));
  assert.ok(insert, 'expected a parameterized INSERT from the runner');
  assert.equal(insert.values[5], null, 'rollback_checksum must be NULL, never a fabricated checksum');
});

test('68 bootstrap leaves rollback_checksum nullable with NO DEFAULT and drops stray defaults', async () => {
  const source = await readFile(BOOTSTRAP_FILE, 'utf8');
  assert.match(source, /ALTER COLUMN rollback_checksum DROP DEFAULT/);
  const offenders = source.split('\n').filter((line) => /rollback_checksum/i.test(line)
    && /DEFAULT/i.test(line)
    && !/DROP DEFAULT/i.test(line));
  assert.deepEqual(offenders, [], 'no line may give rollback_checksum a DEFAULT');
});

test('69 formatError redacts direct, nested cause, AggregateError and secondary details', () => {
  const url = 'postgresql://alice:s3cr3t@db.internal:5432/main?sslmode=require';
  const secrets = [...collectSecretsFromUrl(url), 'abc123'];
  const leaf = new Error(`leaf connected to ${url}`);
  leaf.code = 'LEAF';
  const middle = new Error('middle pushed to db.internal with token=abc123');
  middle.code = 'MIDDLE';
  middle.cause = leaf;
  const aggregate = new AggregateError([middle], `aggregate over ${url}`);
  aggregate.code = 'AGG';
  const root = new Error('root with password=s3cr3t and user alice');
  root.code = 'ROOT';
  root.cause = aggregate;
  root.errors = [leaf, new Error('second with token=abc123')];
  root.secondaryDetails = [`cleanup failed for ${url}`];
  const output = formatError(root, secrets);
  for (const needle of ['s3cr3t', 'alice', 'db.internal', 'abc123', url]) {
    assert.equal(output.includes(needle), false, `secret leaked: ${needle}`);
  }
  assert.match(output, /code=ROOT/);
  assert.match(output, /cause=code=AGG/);
  assert.match(output, /errors\[0\]=code=MIDDLE/);
  assert.match(output, /cause=code=LEAF/);
  assert.match(output, /secondary=cleanup failed/);
});

test('70 formatError never stringifies whole objects', () => {
  const err = new Error('boom');
  err.cause = { password: 's3cr3t' };
  const output = formatError(err, ['s3cr3t']);
  assert.equal(output.includes('s3cr3t'), false);
  assert.doesNotMatch(output, /\{"password"/);
});

test('71 an interrupt arriving while COMMIT is in flight resolves with a known outcome', async () => {
  const runtime = { interrupted: false };
  const client = new SequenceClient([
    { rowCount: null },
    () => ({ rowCount: null }),
    (text) => { assert.equal(text, 'COMMIT'); runtime.interrupted = true; return { rowCount: null }; },
  ]);
  await runInTransaction(client, runtime, async () => { await queryClient(client, 'SELECT 1;'); });
  assert.deepEqual(client.queries.map((query) => query.text), ['BEGIN', 'SELECT 1;', 'COMMIT']);
  assert.equal(runtime.interrupted, true);
  assert.equal(client.queries.some((query) => query.text === 'ROLLBACK'), false);
});

test('72 an interrupt after BEGIN rolls back before COMMIT', async () => {
  const runtime = { interrupted: false };
  const client = new SequenceClient([{ rowCount: null }]);
  await assert.rejects(runInTransaction(client, runtime, async () => { runtime.interrupted = true; }),
    { code: 'RUN_INTERRUPTED' });
  assert.deepEqual(client.queries.map((query) => query.text), ['BEGIN', 'ROLLBACK']);
});

test('73 a failing cleanup keeps the primary error and attaches the secondary', async () => {
  const client = new SequenceClient([{ rowCount: null }, { rowCount: null }, new Error('cleanup-boom')]);
  const primary = await runInTransaction(client, { interrupted: false }, async () => {
    await queryClient(client, 'SELECT 1;');
    const error = new Error('boom');
    error.code = 'E1_OP_FAILED';
    throw error;
  }).then(() => null, (error) => error);
  assert.equal(primary.code, 'E1_OP_FAILED');
  assert.equal(primary.secondaryDetails.length, 1);
  assert.match(primary.secondaryDetails[0], /cleanup-boom/);
  const output = formatError(primary, []);
  assert.match(output, /code=E1_OP_FAILED/);
  assert.match(output, /cleanup-boom/);
});

test('74 signal handlers are flag-only and removable', () => {
  const source = new EventEmitter();
  const runtime = { interrupted: false, signal: null };
  const remove = installSignalHandlers(runtime, source);
  source.emit('SIGINT');
  assert.equal(runtime.interrupted, true);
  assert.equal(runtime.signal, 'SIGINT');
  remove();
  const second = { interrupted: false, signal: null };
  const removeSecond = installSignalHandlers(second, source);
  removeSecond();
  source.emit('SIGTERM');
  assert.equal(second.interrupted, false);
});

test('75 a real POSIX SIGINT makes the child exit 130 (linux)', { skip: process.platform === 'win32' }, async () => {
  const program = [
    "import { pathToFileURL } from 'node:url';",
    'const { installSignalHandlers } = await import(pathToFileURL(process.env.RUNNER_MJS_FILE).href);',
    'const runtime = { interrupted: false, signal: null };',
    'installSignalHandlers(runtime, process);',
    "process.stdout.write('READY\\n');",
    'const timer = setInterval(() => {',
    "  if (runtime.interrupted) { clearInterval(timer); process.exit(runtime.signal === 'SIGTERM' ? 143 : 130); }",
    '}, 5);',
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', program], {
    env: { ...process.env, RUNNER_MJS_FILE: path.join(REPO_ROOT, 'scripts', 'migration-runner.mjs') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve('timeout'); }, 8000);
    let ready = false;
    child.stdout.on('data', () => {
      if (!ready) {
        ready = true;
        clearTimeout(timer);
        process.kill(child.pid, 'SIGINT');
      }
    });
    child.on('close', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
  });
  assert.equal(code, 130, stderr || `child exited ${code}`);
});

test('76 cliMain maps signals to exit codes and redacts via DATABASE_URL secrets', async () => {
  const source = await readFile(path.join(REPO_ROOT, 'scripts', 'migration-runner.mjs'), 'utf8');
  assert.match(source, /return runtime\.signal === 'SIGTERM' \? 143 : runtime\.interrupted \? 130 : code;/);
  assert.match(source, /collectSecretsFromUrl\(process\.env\.DATABASE_URL\)/);
});

test('77 the 042 stub is statically fail-closed with a fixed exit 2', async () => {
  const source = await readFile(path.join(REPO_ROOT, 'scripts', 'migrate-042-add-points-atomic.mts'), 'utf8');
  assert.match(source, /process\.exitCode\s*=\s*2/);
  assert.match(source, /migration-runner\.mjs/);
  assert.doesNotMatch(source, /exec_sql|createClient|from ['"]pg['"]|process\.env\.DATABASE_URL/);
});

test('78 applyPendingMigrations honours an upper cap without issuing queries', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const m128 = migrationFixture(128, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient();
  const emits = [];
  await applyPendingMigrations(client, [m127, m128], [ledgerRow(m127)],
    { to: 127, output: (message) => emits.push(message) });
  assert.deepEqual(emits, []);
  assert.equal(client.queries.length, 0);
});

test('79 an interrupt between migrations stops before the next BEGIN', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const m128 = migrationFixture(128, { checksum: 'a', rollbackChecksum: 'b' });
  const runtime = { interrupted: false };
  const client = new SequenceClient([
    { rowCount: null }, { rows: [], rowCount: 0 }, { rowCount: null }, { rows: [], rowCount: 0 },
    { rowCount: 1 }, { rowCount: null },
  ]);
  await assert.rejects(
    applyPendingMigrations(client, [m127, m128], [], {
      output: (message) => { if (String(message).includes('APPLIED 127')) runtime.interrupted = true; },
    }, runtime),
    { code: 'RUN_INTERRUPTED' });
  assert.equal(client.queries.some((query) => query.text === 'SELECT 128;'), false);
  assert.equal(client.queries.filter((query) => query.text === 'BEGIN').length, 1);
});

test('80 executeMigration refuses to start when already interrupted', async () => {
  const local = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient();
  await assert.rejects(executeMigration(client, local, undefined, { interrupted: true }), { code: 'RUN_INTERRUPTED' });
  assert.equal(client.queries.length, 0);
});

// ---------------------------------------------------------------------------
// Round 4 regression suite (E1-R06 / R08 / R09 / R10 / R12). These are local
// behaviour tests only; PostgreSQL runtime behaviour stays NOT_VERIFIED until
// the isolated database phase.
// ---------------------------------------------------------------------------

function queryKinds(queries) {
  return queries.map(({ text }) => {
    if (text === 'BEGIN') return 'BEGIN';
    if (text === 'COMMIT') return 'COMMIT';
    if (text === 'ROLLBACK') return 'ROLLBACK';
    if (text.startsWith('SELECT') && text.includes('FOR UPDATE')) return 'rowlock';
    if (text === 'SELECT 127;') return 'migration-sql';
    if (text === 'DROP 127;') return 'rollback-sql';
    if (text.startsWith('INSERT INTO public.migration_records')) return 'register-insert';
    if (text.startsWith('UPDATE public.migration_records') && text.includes("status = 'rolled_back'")) return 'rollback-update';
    if (text.startsWith('UPDATE public.migration_records')) return 'register-update';
    return 'other';
  });
}

test('81 dynamic EXECUTE fails closed unless it is a single static literal (R06)', () => {
  const dynamic = [
    // EXECUTE of a variable: undeterminable.
    `DO $b$
BEGIN
  EXECUTE sql_command;
END
$b$;`,
    // Static-looking concatenation that builds a ledger UPDATE.
    `DO $b$
BEGIN
  EXECUTE 'UP' || 'DATE public.migration_records SET runner_managed = true WHERE false';
END
$b$;`,
    // format() builds the payload at runtime.
    `DO $b$
BEGIN
  EXECUTE format('INSERT INTO public.migration_records (id) VALUES (%L)', 'x');
END
$b$;`,
    // chr() assembles the payload byte by byte.
    `DO $b$
BEGIN
  EXECUTE chr(73) || chr(78) || chr(83) || chr(69) || chr(82) || chr(84);
END
$b$;`,
    // A static full literal that writes the ledger is FORBIDDEN, not merely
    // undeterminable.
  ];
  for (const sql of dynamic) {
    assert.throws(() => assertNoMigrationLedgerWrites(sql),
      { code: 'MIGRATION_LEDGER_WRITE_UNDETERMINABLE' }, sql);
  }
  // A single fully static literal whose content writes the ledger is scanned
  // recursively and rejected as a ledger write.
  assert.throws(() => assertNoMigrationLedgerWrites(`DO $b$
BEGIN
  EXECUTE 'UPDATE public.migration_records SET runner_managed = true WHERE false';
END
$b$;`), { code: 'MIGRATION_LEDGER_WRITE_FORBIDDEN' });
  // A static literal with a safe body stays allowed.
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(`DO $b$
BEGIN
  EXECUTE 'SELECT 1';
END
$b$;`));
});

test('82 rollback add/delete/change drift fails closed on real files (R12)', async () => {
  // (A) adding a rollback file after the forward fingerprint was recorded.
  await withMigrationDirectory({ '127_a.sql': 'SELECT 1;' }, async (directory) => {
    const before = await discoverMigrations(directory);
    const row = ledgerRow(before[0]);
    await writeFile(path.join(directory, '127_a.rollback.sql'), 'SELECT 1;');
    const after = await discoverMigrations(directory);
    await assert.rejects(async () => validateAppliedState(after, [row]), { code: 'ROLLBACK_CHECKSUM_DRIFT' });
  });
  // (B) deleting the rollback file that was part of the applied fingerprint.
  await withMigrationDirectory({ '127_a.sql': 'SELECT 1;', '127_a.rollback.sql': 'SELECT 1;' }, async (directory) => {
    const before = await discoverMigrations(directory);
    const row = ledgerRow(before[0]);
    await rm(path.join(directory, '127_a.rollback.sql'));
    const after = await discoverMigrations(directory);
    await assert.rejects(async () => validateAppliedState(after, [row]), { code: 'ROLLBACK_CHECKSUM_DRIFT' });
  });
  // (C) silently modifying the rollback content after it was applied.
  await withMigrationDirectory({ '127_a.sql': 'SELECT 1;', '127_a.rollback.sql': 'SELECT 1;' }, async (directory) => {
    const before = await discoverMigrations(directory);
    const row = ledgerRow(before[0]);
    await writeFile(path.join(directory, '127_a.rollback.sql'), 'SELECT 2;');
    const after = await discoverMigrations(directory);
    await assert.rejects(async () => validateAppliedState(after, [row]), { code: 'ROLLBACK_CHECKSUM_DRIFT' });
  });
});

test('83 down then re-up reuses the exact same ledger row id and never inserts a second row (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const ledgerId = '11111111-2222-4333-8444-555566667777';
  const row = { ...ledgerRow(m127), id: ledgerId };
  const downClient = new SequenceClient([
    { rowCount: null },
    { rows: [row], rowCount: 1 },
    { rowCount: null },
    { rowCount: 1 },
    { rowCount: null },
  ]);
  await executeRollback(downClient, m127, row, 'run-id-down', { interrupted: false });
  assert.deepEqual(queryKinds(downClient.queries), ['BEGIN', 'rowlock', 'rollback-sql', 'rollback-update', 'COMMIT']);
  assert.equal(downClient.queries.at(-1).text, 'COMMIT');
  const rolledBack = { ...row, status: 'rolled_back' };
  const upClient = new SequenceClient([
    { rowCount: null },
    { rows: [rolledBack], rowCount: 1 },
    { rowCount: null },
    { rows: [rolledBack], rowCount: 1 },
    { rowCount: 1 },
    { rowCount: null },
  ]);
  await executeMigration(upClient, m127, 'run-id-up', { interrupted: false });
  const queries = upClient.queries;
  assert.equal(queries.filter((query) => query.text.startsWith('INSERT INTO public.migration_records')).length, 0,
    're-up must never insert a second ledger row');
  const updates = queries.filter((query) => query.text.startsWith('UPDATE public.migration_records'));
  assert.equal(updates.length, 1, 'exactly one re-up UPDATE');
  assert.ok(updates[0].text.includes('WHERE id = $2')
    && updates[0].text.includes("AND status = 'rolled_back'")
    && updates[0].text.includes('AND runner_schema_version = $8'),
    're-up must CAS on the rolled_back ledger row');
  assert.equal(updates[0].values[1], ledgerId,
    'PostgreSQL $2 (WHERE id) must be bound to the exact same ledger row id that down used');
  assert.equal(queries.at(-1).text, 'COMMIT');
});

test('84 interruption resolved at BEGIN sends an explicit ROLLBACK (R09/R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const runtime = { interrupted: false };
  const client = new SequenceClient([
    (text) => { if (text === 'BEGIN') runtime.interrupted = true; return { rowCount: null }; },
  ]);
  await assert.rejects(executeMigration(client, m127, 'run-id-1', runtime), { code: 'RUN_INTERRUPTED' });
  assert.deepEqual(client.queries.map((query) => query.text), ['BEGIN', 'ROLLBACK']);
});

test('85 interruption at row-lock resolution sends no business SQL (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const runtime = { interrupted: false };
  const client = new SequenceClient([
    { rowCount: null },
    (text) => { if (text.startsWith('SELECT')) runtime.interrupted = true; return { rows: [], rowCount: 0 }; },
  ]);
  await assert.rejects(executeMigration(client, m127, 'run-id-1', runtime), { code: 'RUN_INTERRUPTED' });
  assert.deepEqual(queryKinds(client.queries), ['BEGIN', 'rowlock', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text === 'SELECT 127;'), false);
});

test('86 interruption at business-SQL resolution sends no registration (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const runtime = { interrupted: false };
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [], rowCount: 0 },
    (text) => { if (text === 'SELECT 127;') runtime.interrupted = true; return { rowCount: null }; },
  ]);
  await assert.rejects(executeMigration(client, m127, 'run-id-1', runtime), { code: 'RUN_INTERRUPTED' });
  assert.deepEqual(queryKinds(client.queries), ['BEGIN', 'rowlock', 'migration-sql', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text.startsWith('INSERT INTO public.migration_records')), false);
});

test('87 interruption at registration resolution sends no COMMIT (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const runtime = { interrupted: false };
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [], rowCount: 0 },
    { rowCount: null },
    { rows: [], rowCount: 0 },
    (text) => { if (text.startsWith('INSERT INTO public.migration_records')) runtime.interrupted = true; return { rowCount: 1 }; },
  ]);
  await assert.rejects(executeMigration(client, m127, 'run-id-1', runtime), { code: 'RUN_INTERRUPTED' });
  assert.deepEqual(queryKinds(client.queries), ['BEGIN', 'rowlock', 'migration-sql', 'rowlock', 'register-insert', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text === 'COMMIT'), false);
});

test('88 interruption at rollback-SQL resolution sends no ledger status update (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const runtime = { interrupted: false };
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [ledgerRow(m127)], rowCount: 1 },
    (text) => { if (text === 'DROP 127;') runtime.interrupted = true; return { rowCount: null }; },
  ]);
  await assert.rejects(executeRollback(client, m127, ledgerRow(m127), 'run-id-1', runtime), { code: 'RUN_INTERRUPTED' });
  assert.deepEqual(queryKinds(client.queries), ['BEGIN', 'rowlock', 'rollback-sql', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text.startsWith('UPDATE public.migration_records')), false);
  assert.equal(client.queries.some((query) => query.text === 'COMMIT'), false);
});

test('89 interruption at bootstrap-SQL resolution sends no COMMIT (R12)', async () => {
  const runtime = { interrupted: false };
  const client = new SequenceClient([
    { rowCount: null },
    (text) => { if (text === 'SELECT bootstrap_marker;') runtime.interrupted = true; return { rowCount: null }; },
  ]);
  await assert.rejects(bootstrapLedger(client, 'SELECT bootstrap_marker;', runtime), { code: 'RUN_INTERRUPTED' });
  assert.deepEqual(client.queries.map((query) => query.text),
    ['BEGIN', 'SELECT bootstrap_marker;', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text === 'COMMIT'), false);
});

test('90 migration SQL failure has the exact BEGIN/lock/SQL/ROLLBACK order (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [], rowCount: 0 },
    new Error('boom migration sql'),
  ]);
  const error = await executeMigration(client, m127, 'run-id-1').then(() => null, (err) => err);
  assert.ok(error, 'expected executeMigration to reject');
  assert.match(String(error.message), /boom migration sql/);
  assert.deepEqual(queryKinds(client.queries), ['BEGIN', 'rowlock', 'migration-sql', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text.startsWith('INSERT INTO public.migration_records')), false);
  assert.equal(client.queries.some((query) => query.text === 'COMMIT'), false);
});

test('91 registration failure has the exact full query order and no COMMIT (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [], rowCount: 0 },
    { rowCount: null },
    { rows: [], rowCount: 0 },
    { rowCount: 0 },
  ]);
  const error = await executeMigration(client, m127, 'run-id-1').then(() => null, (err) => err);
  assert.ok(error, 'expected executeMigration to reject');
  assert.match(`${error.code ?? ''} ${String(error.message)}`, /REGISTRATION/);
  assert.deepEqual(queryKinds(client.queries),
    ['BEGIN', 'rowlock', 'migration-sql', 'rowlock', 'register-insert', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text === 'COMMIT'), false);
});

test('92 rollback SQL failure never touches the ledger status (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [ledgerRow(m127)], rowCount: 1 },
    new Error('boom rollback sql'),
  ]);
  const error = await executeRollback(client, m127, ledgerRow(m127), 'run-id-1').then(() => null, (err) => err);
  assert.ok(error, 'expected executeRollback to reject');
  assert.match(String(error.message), /boom rollback sql/);
  assert.deepEqual(queryKinds(client.queries), ['BEGIN', 'rowlock', 'rollback-sql', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text.startsWith('UPDATE public.migration_records')), false);
  assert.equal(client.queries.some((query) => query.text === 'COMMIT'), false);
});

const CLEANUP_DATABASE_URL = 'postgresql://alice:secretpw@db.internal:5432/appdb';

class FailingEndClient extends SequenceClient {
  constructor(steps = [], endMessage = 'end-boom') {
    super(steps);
    this.endMessage = endMessage;
  }

  async end() {
    this.ended = true;
    throw new Error(this.endMessage);
  }
}

class ConnectRejectClient extends SequenceClient {
  async connect() {
    throw new Error('connect-boom');
  }
}

class ConnectRejectEndRejectClient extends ConnectRejectClient {
  async end() {
    this.ended = true;
    throw new Error('end-boom');
  }
}

// The exact run('up') query order up to a bootstrap failure is:
//   advisory-lock SELECT -> legacy-catalog preflight -> legacy-record
//   preflight -> BEGIN -> bootstrap SQL (fails) -> ROLLBACK -> unlock.
// `end()` is not a query in SequenceClient; a FailingEndClient makes the
// final cleanup step fail after the unlock step has run.
function bootstrapFailureUpClient({
  unlockStep,
  endFailure = false,
  primaryMessage = 'bootstrap-failed-for-test',
  endMessage = 'end-boom',
}) {
  const steps = [
    { rows: [{ locked: true }] },
    { rows: [{ ledger_exists: true, marker_exists: true, columns_match: true }] },
    { rows: [{ matching_rows: 1 }] },
    { rowCount: null },
  ];
  const error = new Error(primaryMessage);
  error.code = 'E1_BOOTSTRAP_BOOM';
  steps.push(error);
  steps.push({ rowCount: null });
  steps.push(unlockStep);
  return endFailure ? new FailingEndClient(steps, endMessage) : new SequenceClient(steps);
}

async function runUpBootstrapFailure(client, clientFactory) {
  try {
    await run(['up'], {
      environment: { ...process.env, DATABASE_URL: CLEANUP_DATABASE_URL },
      clientFactory: clientFactory ?? (async () => client),
      output: () => {},
      runtime: { interrupted: false, signal: null },
    });
  } catch (error) {
    return error;
  }
  return null;
}

test('93 cleanup failure after unlock keeps the primary error and one secondary (R12/R14)', async () => {
  const primarySecret = 'PRIMARY_SECRET_123';
  const unlockSecret = 'UNLOCK_SECRET_456';
  const client = bootstrapFailureUpClient({
    unlockStep: new Error(`unlock-boom release-advisory-lock failed ${unlockSecret}`),
    primaryMessage: `bootstrap-failed-for-test with ${primarySecret}`,
  });
  const error = await runUpBootstrapFailure(client);
  assert.ok(error && error.code === 'E1_BOOTSTRAP_BOOM', `unexpected error: ${error?.message ?? 'none'}`);
  assert.ok(error.message.includes(primarySecret), 'primary error must really carry the secret before formatting');
  assert.equal(error.secondaryDetails.length, 1);
  assert.ok(error.secondaryDetails[0].includes(unlockSecret), 'unlock secondary must really carry the secret before formatting');
  assert.match(error.secondaryDetails[0], /cleanup-releaseAdvisoryLock/);
  assert.match(error.secondaryDetails[0], /unlock-boom/);
  const output = formatError(error, [...collectSecretsFromUrl(CLEANUP_DATABASE_URL), primarySecret, unlockSecret]);
  assert.equal(output.includes(primarySecret), false, `formatted output leaked the primary secret: ${output}`);
  assert.equal(output.includes(unlockSecret), false, `formatted output leaked the unlock secret: ${output}`);
  assert.equal(output.includes('secretpw'), false, 'formatted output leaked the database password');
  assert.match(output, /code=E1_BOOTSTRAP_BOOM/);
  assert.match(output, /cleanup-releaseAdvisoryLock/);
});

test('94 cleanup failure on end keeps the primary error and one secondary (R12/R14)', async () => {
  const primarySecret = 'PRIMARY_SECRET_123';
  const endSecret = 'END_SECRET_789';
  const client = bootstrapFailureUpClient({
    unlockStep: { rows: [{ unlocked: true }] },
    endFailure: true,
    primaryMessage: `bootstrap-failed-for-test with ${primarySecret}`,
    endMessage: `end-boom with ${endSecret}`,
  });
  const error = await runUpBootstrapFailure(client);
  assert.ok(error && error.code === 'E1_BOOTSTRAP_BOOM', `unexpected error: ${error?.message ?? 'none'}`);
  assert.ok(error.message.includes(primarySecret), 'primary error must really carry the secret before formatting');
  assert.equal(error.secondaryDetails.length, 1);
  assert.ok(error.secondaryDetails[0].includes(endSecret), 'end secondary must really carry the secret before formatting');
  assert.match(error.secondaryDetails[0], /cleanup-end/);
  assert.match(error.secondaryDetails[0], /end-boom/);
  const output = formatError(error, [...collectSecretsFromUrl(CLEANUP_DATABASE_URL), primarySecret, endSecret]);
  assert.equal(output.includes(primarySecret), false, `formatted output leaked the primary secret: ${output}`);
  assert.equal(output.includes(endSecret), false, `formatted output leaked the end secret: ${output}`);
  assert.equal(output.includes('secretpw'), false, 'formatted output leaked the database password');
  assert.match(output, /code=E1_BOOTSTRAP_BOOM/);
  assert.match(output, /cleanup-end/);
});

test('95 cleanup failures on unlock and end both become secondaries (R12/R14)', async () => {
  const primarySecret = 'PRIMARY_SECRET_123';
  const unlockSecret = 'UNLOCK_SECRET_456';
  const endSecret = 'END_SECRET_789';
  const client = bootstrapFailureUpClient({
    unlockStep: new Error(`unlock-boom with ${unlockSecret}`),
    endFailure: true,
    primaryMessage: `bootstrap-failed-for-test with ${primarySecret}`,
    endMessage: `end-boom with ${endSecret}`,
  });
  const error = await runUpBootstrapFailure(client);
  assert.ok(error && error.code === 'E1_BOOTSTRAP_BOOM', `unexpected error: ${error?.message ?? 'none'}`);
  assert.ok(error.message.includes(primarySecret), 'primary error must really carry the secret before formatting');
  assert.equal(error.secondaryDetails.length, 2);
  assert.ok(error.secondaryDetails[0].includes(unlockSecret), 'secondary 0 (unlock) must really carry the secret before formatting');
  assert.ok(error.secondaryDetails[1].includes(endSecret), 'secondary 1 (end) must really carry the secret before formatting');
  assert.match(error.secondaryDetails[0], /unlock-boom/);
  assert.match(error.secondaryDetails[1], /end-boom/);
  const output = formatError(error, [...collectSecretsFromUrl(CLEANUP_DATABASE_URL), primarySecret, unlockSecret, endSecret]);
  assert.equal(output.includes(primarySecret), false, `formatted output leaked the primary secret: ${output}`);
  assert.equal(output.includes(unlockSecret), false, `formatted output leaked the unlock secret: ${output}`);
  assert.equal(output.includes(endSecret), false, `formatted output leaked the end secret: ${output}`);
  assert.equal(output.includes('secretpw'), false, 'formatted output leaked the database password');
  assert.match(output, /code=E1_BOOTSTRAP_BOOM/);
  const unlockPos = output.indexOf('cleanup-releaseAdvisoryLock');
  const endPos = output.indexOf('cleanup-end');
  assert.ok(unlockPos >= 0 && endPos > unlockPos, 'cleanup secondary order must stay unlock then end in the formatted output');
});

test('96 connect rejection preserves the primary connect error (R12/R14)', async () => {
  const client = new ConnectRejectClient();
  const error = await run(['up'], {
    environment: { ...process.env, DATABASE_URL: CLEANUP_DATABASE_URL },
    clientFactory: async () => client,
    output: () => {},
    runtime: { interrupted: false, signal: null },
  }).then(() => null, (err) => err);
  assert.ok(error, 'expected connect rejection to surface');
  assert.match(String(error.message), /connect-boom/);
  assert.equal(error.secondaryDetails?.length ?? 0, 0);
  assert.equal(client.queries.length, 0);
  assert.equal(client.connected, false);
});

test('97 connect rejection plus end rejection keeps primary and one cleanup secondary (R12/R14)', async () => {
  const client = new ConnectRejectEndRejectClient();
  const error = await run(['up'], {
    environment: { ...process.env, DATABASE_URL: CLEANUP_DATABASE_URL },
    clientFactory: async () => client,
    output: () => {},
    runtime: { interrupted: false, signal: null },
  }).then(() => null, (err) => err);
  assert.ok(error, 'expected connect rejection to surface');
  assert.match(String(error.message), /connect-boom/);
  assert.equal(error.secondaryDetails.length, 1);
  assert.match(error.secondaryDetails[0], /cleanup-end/);
  assert.equal(client.queries.length, 0);
  assert.equal(client.connected, false);
});

test('98 a real POSIX SIGTERM makes the child exit 143 (linux)', { skip: process.platform === 'win32' }, async () => {
  const program = [
    "import { pathToFileURL } from 'node:url';",
    'const { installSignalHandlers } = await import(pathToFileURL(process.env.RUNNER_MJS_FILE).href);',
    'const runtime = { interrupted: false, signal: null };',
    'installSignalHandlers(runtime, process);',
    "process.stdout.write('READY\\n');",
    'const timer = setInterval(() => {',
    "  if (runtime.interrupted) { clearInterval(timer); process.exit(runtime.signal === 'SIGTERM' ? 143 : 130); }",
    '}, 5);',
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', program], {
    env: { ...process.env, RUNNER_MJS_FILE: path.join(REPO_ROOT, 'scripts', 'migration-runner.mjs') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve('timeout'); }, 8000);
    let ready = false;
    child.stdout.on('data', () => {
      if (!ready) {
        ready = true;
        clearTimeout(timer);
        process.kill(child.pid, 'SIGTERM');
      }
    });
    child.on('close', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
  });
  assert.equal(code, 143, stderr || `child exited ${code}`);
});

test('99 the real 042 child process exits 2 with runner guidance (R12)', async (t) => {
  const child = spawn(process.execPath, ['scripts/migrate-042-add-points-atomic.mts'], { cwd: REPO_ROOT });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('close', resolve);
    child.once('error', reject);
  });
  const output = `${stdout}\n${stderr}`;
  if (code !== 2 && /ERR_UNKNOWN_FILE_EXTENSION|Unsupported file extension|TypeError \[ERR_/.test(output)) {
    t.skip(`node ${process.version} cannot execute .mts in this runtime`);
    return;
  }
  assert.equal(code, 2, output || `child exited ${code}`);
  assert.match(output, /scripts\/migration-runner\.mjs/);
  assert.match(output, /docs\/MIGRATION_RUNNER\.md/);
});

test('100 formatError masks bearer tokens and apikey variants (R08)', () => {
  const output = formatError({
    message: 'Authorization: Bearer very-secret-value rejected, apikey=val1 api_key=val2 x-api-key=val3 APIKEY=val4',
  });
  assert.equal(output.includes('very-secret-value'), false);
  for (const secret of ['val1', 'val2', 'val3', 'val4']) {
    assert.equal(output.includes(secret), false, `apikey value leaked: ${output}`);
  }
  assert.match(output, /Bearer \[REDACTED\]/);
});

test('101 error.code goes through redaction and a safe-characters gate (R08)', () => {
  const secrets = collectSecretsFromUrl('postgresql://alice:secretpw@db.internal/appdb');
  const output = formatError({ code: 'postgres://user:secretpw@db.internal/appdb', message: 'boom' }, secrets);
  assert.equal(output.includes('secretpw'), false);
  assert.equal(output.includes('postgres://'), false);
  assert.equal(output.includes('db.internal'), false);
  assert.match(output, /code=\[REDACTED\]/);
  const safe = formatError({ code: 'RUN_INTERRUPTED', message: 'stopped' });
  assert.match(safe, /code=RUN_INTERRUPTED/);
});

test('102 malformed percent-encoded URL components still mask host/user/password (R08)', () => {
  const url = 'postgresql://alice:p%zzsecret@db.internal:5432/appdb?x=1';
  const secrets = collectSecretsFromUrl(url);
  const output = formatError(new Error(`connect to ${url} as alice with password p%zzsecret at db.internal failed`), secrets);
  assert.equal(output.includes('postgresql://'), false);
  assert.equal(output.includes('alice'), false);
  assert.equal(output.includes('p%zzsecret'), false);
  assert.equal(output.includes('db.internal'), false);
});

test('103 raw and percent-encoded password forms are both masked (R08)', () => {
  const url = 'postgresql://alice:p%40ss@db.internal:5432/appdb';
  const secrets = collectSecretsFromUrl(url);
  const output = formatError(new Error(`raw p@ss and encoded p%40ss on db.internal`), secrets);
  assert.equal(output.includes('p@ss'), false);
  assert.equal(output.includes('p%40ss'), false);
  assert.equal(output.includes('db.internal'), false);
});

// Pure-test static guard (never part of the production Runner): any DDL / DML
// / regclass lookup that resolves one of the two runner-managed reference
// relations must name it explicitly as pg_temp.<reference> (or be bound by
// relation OID through pg_my_temp_schema()). An unqualified reference would
// resolve through search_path and is rejected here. CREATE TEMP TABLE is not a
// resolving form: PostgreSQL always creates TEMP tables in the session
// temporary schema regardless of search_path.
function assertBootstrapReferenceObjectsAreQualified(source) {
  const referenceNames = ['_migration_runner_check_reference', '_migration_runner_marker_reference'];
  const code = source.replace(/--[^\n\r]*/g, '');
  const violations = [];
  for (const name of referenceNames) {
    const resolvingForms = [
      { label: 'ALTER TABLE', pattern: String.raw`\bALTER\s+TABLE\s+(?!pg_temp\.)${name}\b` },
      { label: 'INSERT INTO', pattern: String.raw`\bINSERT\s+INTO\s+(?!pg_temp\.)${name}\b` },
      { label: 'DROP TABLE', pattern: String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?!pg_temp\.)${name}\b` },
      { label: 'UPDATE', pattern: String.raw`\bUPDATE\s+(?!pg_temp\.)${name}\b` },
      { label: 'DELETE FROM', pattern: String.raw`\bDELETE\s+FROM\s+(?!pg_temp\.)${name}\b` },
      { label: 'TRUNCATE', pattern: String.raw`\bTRUNCATE\s+(?:TABLE\s+)?(?!pg_temp\.)${name}\b` },
      { label: 'to_regclass', pattern: String.raw`to_regclass\s*\(\s*['"]${name}['"]` },
    ];
    for (const { label, pattern } of resolvingForms) {
      const matcher = new RegExp(pattern, 'gi');
      let match;
      while ((match = matcher.exec(code)) !== null) {
        violations.push(`unqualified ${label} resolves ${name} through search_path`);
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`bootstrap.sql must never resolve a reference object unqualified:\n- ${violations.join('\n- ')}`);
  }
}

test('104 bootstrap.sql carries the R10 exact-catalog static contract (source guards only)', async () => {
  const source = await readFile(path.join(REPO_ROOT, 'database', 'migration-runner', 'bootstrap.sql'), 'utf8');
  // These are static source guards against the known R10 regressions, not a
  // runtime catalog verification (R10 runtime remains
  // E1-R10_RUNTIME_DB_VERIFIED=NO).
  for (const token of [
    'pg_my_temp_schema',
    'pg_temp._migration_runner_check_reference',
    'pg_temp._migration_runner_marker_reference',
    'pg_my_temp_schema()',
    'pg_class.relam',
    'actual_index_class.relam = reference_index_class.relam',
    'WITH ORDINALITY',
    'indclass',
    'indcollation',
    'indoption',
    'attacl',
    'condeferrable',
    'condeferred',
    'v_marker_column_total = 3',
  ]) {
    assert.ok(source.includes(token), `bootstrap.sql must include ${token}`);
  }
  // Access method must be compared through pg_class.relam on each index
  // relation, never through pg_index.indamid; unqualified function-style
  // catalogs are banned; reference-object DDL must be pg_temp-qualified and
  // located through pg_my_temp_schema(), never through search_path.
  for (const forbidden of ['indamid', 'pg_index.indamid', 'pg_catalog.coalesce']) {
    assert.equal(source.includes(forbidden), false, `bootstrap.sql must not reintroduce ${forbidden}`);
  }
  assert.doesNotMatch(source, /ALTER TABLE (?!pg_temp\.)_migration_runner_/,
    'reference-object DDL must be qualified through the explicit pg_temp alias');
  assert.doesNotMatch(source, /UNION ALL\n/, 'ACL lineage recursion must be cycle-safe (no UNION ALL)');
  // The real source must also satisfy the reference-object qualification guard:
  // relation-resolving DDL / DML / regclass lookups on the reference relations
  // must be pg_temp-qualified or OID-bound via pg_my_temp_schema().
  assertBootstrapReferenceObjectsAreQualified(source);
});

test('105 concurrent rollback when the ledger row vanished aborts before rollback SQL (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [], rowCount: 0 },
  ]);
  await assert.rejects(executeRollback(client, m127, ledgerRow(m127), 'run-id-1'), { code: 'MIGRATION_IDENTITY_DRIFT' });
  assert.deepEqual(queryKinds(client.queries), ['BEGIN', 'rowlock', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text === 'DROP 127;'), false, 'no rollback SQL after the row vanished');
  assert.equal(client.queries.some((query) => query.text.startsWith('UPDATE public.migration_records')), false);
  assert.equal(client.queries.some((query) => query.text === 'COMMIT'), false);
});

test('106 locked row identity drift aborts before rollback SQL (R12)', async () => {
  const m127 = migrationFixture(127, { checksum: 'a', rollbackChecksum: 'b' });
  const drifted = { ...ledgerRow(m127), checksum: '0'.repeat(64) };
  const client = new SequenceClient([
    { rowCount: null },
    { rows: [drifted], rowCount: 1 },
  ]);
  await assert.rejects(executeRollback(client, m127, ledgerRow(m127), 'run-id-1'), { code: 'MIGRATION_IDENTITY_DRIFT' });
  assert.deepEqual(queryKinds(client.queries), ['BEGIN', 'rowlock', 'ROLLBACK']);
  assert.equal(client.queries.some((query) => query.text === 'DROP 127;'), false, 'no rollback SQL after identity drift');
  assert.equal(client.queries.some((query) => query.text.startsWith('UPDATE public.migration_records')), false);
  assert.equal(client.queries.some((query) => query.text === 'COMMIT'), false);
});

test('107 E-string backslash-escaped payloads fail closed (R06)', () => {
  // In PostgreSQL E'...' strings, \x55 decodes to the byte 'U', so an
  // E-string payload can spell "UPDATE public.migration_records ..." at
  // runtime. The static scanner never strips the backslash and rescans: any
  // backslash escape in an E-string payload is undeterminable and fails closed.
  const payloads = [
    `DO $b$
BEGIN
  EXECUTE E'\\x55PDATE public.migration_records SET runner_managed = true WHERE false';
END
$b$;`,
    `DO $b$
BEGIN
  EXECUTE e'\\x55PDATE public.migration_records SET runner_managed = true WHERE false';
END
$b$;`,
    `DO $b$
BEGIN
  EXECUTE E'\\x49NSERT INTO public.migration_records (id) VALUES (1)';
END
$b$;`,
    `DO $b$
BEGIN
  EXECUTE E'SELECT \\0072ecords';
END
$b$;`,
  ];
  for (const sql of payloads) {
    assert.throws(() => assertNoMigrationLedgerWrites(sql),
      { code: 'MIGRATION_LEDGER_WRITE_UNDETERMINABLE' }, sql);
  }
  // A backslash-free E-string whose decoded content is safe stays allowed, so
  // the guard is precise rather than blanket.
  assert.doesNotThrow(() => assertNoMigrationLedgerWrites(`DO $b$
BEGIN
  EXECUTE E'SELECT 1';
END
$b$;`));
});

test('108 Unicode-escaped executable identifiers fail closed (R06)', () => {
  // U&"migration_\0072ecords" decodes to migration_records and
  // U&"exec_\0073ql" decodes to exec_sql. Each must fail closed even though no
  // literal migration_records / exec_sql token appears in the source.
  const payloads = [
    `INSERT INTO U&"migration_\\0072ecords" (id) VALUES (1);`,
    `SELECT U&"exec_\\0073ql"('SELECT 1');`,
    // Malformed \\XXXX escape: the guard cannot decode it and fails closed.
    `INSERT INTO U&"migration_\\00zzecords" (id) VALUES (1);`,
    // UESCAPE '!' moves the escape character; the identifier still spells a
    // ledger/executor name and must fail closed.
    `INSERT INTO U&"migration_!0072ecords" UESCAPE '!' (id) VALUES (1);`,
    `SELECT U&"exec_!0073ql" UESCAPE '!'('SELECT 1');`,
  ];
  for (const sql of payloads) {
    assert.throws(() => assertNoMigrationLedgerWrites(sql),
      { code: 'MIGRATION_LEDGER_WRITE_UNDETERMINABLE' }, sql);
  }
});

test('109 redaction regressions: short bearer, code gate, overlap, recursion (R08)', () => {
  // A. A short bare "Bearer X" token must be masked too (no minimum length).
  const shortBearer = redactSecrets('Authorization: Bearer X rejected');
  assert.equal(shortBearer.includes('Bearer X'), false, shortBearer);
  assert.match(shortBearer, /Bearer \[REDACTED\]/);
  // B. A longer bare Bearer token must not leak.
  const longBearer = redactSecrets('access rejected: Bearer SUPERSECRET for service');
  assert.equal(longBearer.includes('SUPERSECRET'), false, longBearer);
  assert.match(longBearer, /Bearer \[REDACTED\]/);
  // C. A safe-character error.code that still smells secret-like must not be
  // echoed verbatim.
  const codeOutput = formatError({ code: 'Bearer_SUPERSECRET_private-host', message: 'denied' });
  assert.equal(codeOutput.includes('Bearer_SUPERSECRET_private-host'), false, codeOutput);
  assert.equal(codeOutput.includes('SUPERSECRET'), false, codeOutput);
  assert.match(codeOutput, /code=\[REDACTED\]/);
  // D. Overlapping fragments are removed longest-first (no suffix leak).
  const overlap = redactSecrets('failed aliceSUPERSECRET now', ['alice', 'aliceSUPERSECRET', 'SUPERSECRET']);
  assert.equal(overlap.includes('alice'), false, overlap);
  assert.equal(overlap.includes('SUPERSECRET'), false, overlap);
  assert.equal(overlap.includes('aliceSUPERSECRET'), false, overlap);
  // E. The same secrets are removed through the cause and secondaryDetails
  // recursion of the formatted output.
  const root = new Error('outer PRIMARY_SECRET_123 failed aliceSUPERSECRET');
  root.code = 'RUN_INTERRUPTED';
  root.cause = new Error('cause Bearer SUPERSECRET leaked');
  root.secondaryDetails = ['second UNLOCK_SECRET_456 tail', 'third Bearer X tail'];
  const recursive = formatError(root, ['PRIMARY_SECRET_123', 'UNLOCK_SECRET_456', 'alice', 'aliceSUPERSECRET', 'SUPERSECRET']);
  for (const secret of ['PRIMARY_SECRET_123', 'UNLOCK_SECRET_456', 'alice', 'aliceSUPERSECRET', 'SUPERSECRET']) {
    assert.equal(recursive.includes(secret), false, `recursive output leaked ${secret}: ${recursive}`);
  }
  assert.match(recursive, /code=RUN_INTERRUPTED/);
  assert.match(recursive, /outer/);
  assert.match(recursive, /cause Bearer \[REDACTED\]/);
  assert.match(recursive, /second \[REDACTED\] tail/);
  assert.match(recursive, /third Bearer \[REDACTED\] tail/);
});

test('110 reference-object qualification guard catches known R10 regressions (static source mutations)', async () => {
  // Static source regression guard only. It never claims a PostgreSQL runtime
  // catalog verification: E1-R10_RUNTIME_DB_VERIFIED stays NO.
  const sourcePath = path.join(REPO_ROOT, 'database', 'migration-runner', 'bootstrap.sql');
  const source = await readFile(sourcePath, 'utf8');

  // The current FIXED source must satisfy the qualification contract.
  assert.doesNotThrow(() => assertBootstrapReferenceObjectsAreQualified(source),
    'the real bootstrap.sql must keep every reference relation qualified');

  // Allowed forms stay allowed: explicit pg_temp qualification, qualified
  // IF EXISTS DROP, qualified regclass literal, CREATE TEMP TABLE (implicit
  // temp schema, no search_path resolution) and the pg_my_temp_schema() +
  // relname OID-binding catalog filter.
  const qualifiedForms = [
    'ALTER TABLE pg_temp._migration_runner_check_reference ADD COLUMN x int;',
    'INSERT INTO pg_temp._migration_runner_marker_reference (singleton) VALUES (true);',
    'DROP TABLE pg_temp._migration_runner_check_reference;',
    'DROP TABLE IF EXISTS pg_temp._migration_runner_marker_reference;',
    "SELECT to_regclass('pg_temp._migration_runner_check_reference');",
    'CREATE TEMP TABLE _migration_runner_check_reference (x int) ON COMMIT DROP;',
    "WHERE relation_record.relname = '_migration_runner_check_reference'\n    AND relation_record.relnamespace = pg_catalog.pg_my_temp_schema();",
  ];
  for (const good of qualifiedForms) {
    assert.doesNotThrow(() => assertBootstrapReferenceObjectsAreQualified(good), good);
  }

  // Forbidden forms, including verbs the runner does not use today (UPDATE /
  // DELETE / TRUNCATE) and whitespace / newline variants, must fail closed.
  const unqualifiedForms = [
    'ALTER TABLE _migration_runner_check_reference ADD COLUMN x int;',
    'ALTER TABLE\n  _migration_runner_check_reference ADD COLUMN x int;',
    'INSERT INTO _migration_runner_check_reference (runner_managed) VALUES (true);',
    'INSERT\n  INTO _migration_runner_marker_reference (singleton) VALUES (true);',
    'DROP TABLE _migration_runner_check_reference;',
    'DROP TABLE IF EXISTS _migration_runner_marker_reference;',
    'DROP TABLE IF EXISTS\n  _migration_runner_check_reference;',
    'UPDATE _migration_runner_marker_reference SET singleton = true;',
    'DELETE FROM _migration_runner_check_reference;',
    'TRUNCATE TABLE _migration_runner_marker_reference;',
    "SELECT to_regclass('_migration_runner_check_reference');",
    'SELECT to_regclass("_migration_runner_marker_reference");',
  ];
  for (const bad of unqualifiedForms) {
    assert.throws(() => assertBootstrapReferenceObjectsAreQualified(bad), /unqualified/, bad);
  }

  // Mutation A - DROP regression: qualify no longer, resolve by search_path.
  const checkDrop = 'DROP TABLE pg_temp._migration_runner_check_reference;';
  assert.ok(source.includes(checkDrop), 'mutation A anchor must exist in the source');
  const mutatedDrop = source.replace(checkDrop, 'DROP TABLE _migration_runner_check_reference;');
  assert.ok(mutatedDrop !== source, 'mutation A must change the source');
  assert.throws(() => assertBootstrapReferenceObjectsAreQualified(mutatedDrop), /DROP TABLE/,
    'an unqualified DROP TABLE on the check reference must be caught');

  // Mutation B - INSERT regression: the source has no unqualified INSERT
  // today, so the real marker DROP line is rewritten in memory into the
  // prohibited unqualified INSERT form.
  const markerDrop = 'DROP TABLE pg_temp._migration_runner_marker_reference;';
  assert.ok(source.includes(markerDrop), 'mutation B anchor must exist in the source');
  const mutatedInsert = source.replace(
    markerDrop,
    'INSERT INTO _migration_runner_marker_reference (singleton, version) VALUES (true, 1);'
  );
  assert.ok(mutatedInsert !== source, 'mutation B must change the source');
  assert.throws(() => assertBootstrapReferenceObjectsAreQualified(mutatedInsert), /INSERT INTO/,
    'an unqualified INSERT INTO on the marker reference must be caught');

  // Mutation C - regclass regression: the real pg_my_temp_schema() + relname
  // OID-binding WHERE clause is rewritten in memory into a
  // search_path-dependent to_regclass lookup.
  const oidBoundWhere = "WHERE relation_record.relname = '_migration_runner_marker_reference'";
  assert.ok(source.includes(oidBoundWhere), 'mutation C anchor must exist in the source');
  const mutatedRegclass = source.replace(
    oidBoundWhere,
    "WHERE to_regclass('_migration_runner_marker_reference') IS NOT NULL"
  );
  assert.ok(mutatedRegclass !== source, 'mutation C must change the source');
  assert.throws(() => assertBootstrapReferenceObjectsAreQualified(mutatedRegclass), /to_regclass/,
    'an unqualified to_regclass lookup on the marker reference must be caught');
});

// ---------------------------------------------------------------------------
// RUNNER-REDACTION-UNIX-SOCKET-URL-01 bounded repatch coverage.
// The legal libpq empty-authority Unix-socket connection string
// `postgresql://user:password@/db?host=/tmp/socket` is rejected by the WHATWG
// URL parser, so collectSecretsFromUrl must recover the userinfo through its
// bounded fallback parser. Every secret below is synthetic: nothing in this
// block connects to a database.
// ---------------------------------------------------------------------------
const UNIX_SOCKET_URL =
  'postgresql://e1_user:E1_SYNTHETIC_DB_SECRET_DO_NOT_USE@/e1_db?host=/tmp/e1_socket';
const UNIX_SOCKET_PASSWORD = 'E1_SYNTHETIC_DB_SECRET_DO_NOT_USE';

function whatwgParseFailure(value) {
  try {
    new URL(value);
    return null;
  } catch (error) {
    return error;
  }
}

test('111 empty-authority Unix-socket URL goes through the bounded fallback (R08)', () => {
  const failure = whatwgParseFailure(UNIX_SOCKET_URL);
  // The fixture must be exactly the form the WHATWG parser rejects: that
  // rejection is what routes collection through the bounded fallback.
  assert.ok(failure, 'the fixture must not parse with WHATWG URL');
  assert.equal(failure.code, 'ERR_INVALID_URL');
  const secrets = collectSecretsFromUrl(UNIX_SOCKET_URL);
  for (const fragment of [UNIX_SOCKET_URL, UNIX_SOCKET_PASSWORD, 'e1_user', '/tmp/e1_socket']) {
    assert.ok(secrets.includes(fragment), `fragment missing from collection: ${fragment}`);
  }
  // The bounded parser must not degrade into punctuation-level redaction.
  assert.equal(secrets.includes('/'), false, 'a bare "/" must never become a fragment');
  assert.equal(secrets.includes(':'), false, 'a bare ":" must never become a fragment');
  // The legacy postgres:// scheme is covered as well.
  const legacyScheme = collectSecretsFromUrl(UNIX_SOCKET_URL.replace('postgresql://', 'postgres://'));
  assert.ok(legacyScheme.includes(UNIX_SOCKET_PASSWORD));
  // No secrets configured: ordinary text with slashes and colons stays intact.
  assert.equal(redactSecrets('boot failed at 12:30 in /var/log', []),
    'boot failed at 12:30 in /var/log');
  // A userinfo-free connection string still fails closed (no invented fragments)
  // and never throws.
  let anonymous = [];
  assert.doesNotThrow(() => { anonymous = collectSecretsFromUrl('postgresql:///e1_db?host=/tmp/e1_socket'); });
  assert.ok(anonymous.includes('postgresql:///e1_db?host=/tmp/e1_socket'));
  assert.equal(anonymous.includes('e1_user'), false);
  assert.equal(anonymous.includes(UNIX_SOCKET_PASSWORD), false);
});

test('112 a bare Unix-socket password fragment is redacted (R08)', () => {
  const secrets = collectSecretsFromUrl(UNIX_SOCKET_URL);
  const output = redactSecrets(`password ${UNIX_SOCKET_PASSWORD} rejected`, secrets);
  assert.equal(output.includes(UNIX_SOCKET_PASSWORD), false, output);
  assert.match(output, /\[REDACTED\]/);
  // Diagnostics are preserved: only the secret is replaced.
  assert.match(output, /password/);
  assert.match(output, /rejected/);
});

test('113 formatError removes the Unix-socket password from message and cause (R08)', () => {
  const secrets = collectSecretsFromUrl(UNIX_SOCKET_URL);
  const error = new Error(`connect failed with ${UNIX_SOCKET_PASSWORD}`);
  error.code = 'ECONNREFUSED';
  error.cause = new Error(`inner ${UNIX_SOCKET_PASSWORD}`);
  const output = formatError(error, secrets);
  assert.equal(output.includes(UNIX_SOCKET_PASSWORD), false, output);
  assert.match(output, /\[REDACTED\]/);
  assert.match(output, /code=ECONNREFUSED/);
  assert.match(output, /connect failed with/);
});

test('114 percent-encoded Unix-socket password is masked in both forms (R08)', () => {
  const url = 'postgresql://alice:p%40ss%3Aword@/e1_db?host=/tmp/e1_socket';
  assert.ok(whatwgParseFailure(url), 'the encoded fixture must exercise the fallback');
  const secrets = collectSecretsFromUrl(url);
  const output = formatError(new Error('auth failed with p@ss:word (encoded p%40ss%3Aword)'), secrets);
  assert.equal(output.includes('p@ss:word'), false, output);
  assert.equal(output.includes('p%40ss%3Aword'), false, output);
  assert.equal(output.includes('alice'), false, output);
  assert.match(output, /\[REDACTED\]/);
});

test('115 malformed percent-encoding never aborts the other fragments or throws (R08)', () => {
  const url = 'postgresql://alice:p%zz@/e1_db?host=/tmp/e1_socket';
  assert.ok(whatwgParseFailure(url), 'the malformed fixture must exercise the fallback');
  let secrets = [];
  assert.doesNotThrow(() => { secrets = collectSecretsFromUrl(url); });
  // The decodable username and the undecodable raw password are both collected.
  assert.ok(secrets.includes('alice'));
  assert.ok(secrets.includes('p%zz'));
  const output = formatError(new Error('auth failed for alice with p%zz at /tmp/e1_socket'), secrets);
  assert.equal(output.includes('p%zz'), false, output);
  assert.equal(output.includes('alice'), false, output);
  assert.doesNotThrow(() => redactSecrets('bad %zz tail', secrets));
  // A username-only userinfo must not invent a password fragment.
  const usernameOnly = collectSecretsFromUrl('postgresql://e1_user@/e1_db?host=/tmp/e1_socket');
  assert.ok(usernameOnly.includes('e1_user'));
  assert.equal(usernameOnly.includes(UNIX_SOCKET_PASSWORD), false);
  // Non-postgres schemes stay out of scope for the bounded fallback.
  assert.doesNotThrow(() => collectSecretsFromUrl('redis://:pw@/0?host=/tmp/e1_socket'));
});
