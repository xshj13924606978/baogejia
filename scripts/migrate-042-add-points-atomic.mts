// scripts/migrate-042-add-points-atomic.mts
//
// FAIL-CLOSED STUB (E1-R11).
//
// This historical one-off entrypoint no longer performs any database work
// and cannot perform any in the future. This file intentionally:
//   * never imports or initialises a Supabase / RPC execution path
//   * never reads environment variables
//   * never creates a client
//   * never issues RPC calls or UPDATE statements
//   * never executes migrations
//   * keeps no E2E database execution path
//
// All migrations for this project must go through the audited Migration
// Runner at scripts/migration-runner.mjs (see docs/MIGRATION_RUNNER.md).
// This stub always exits with a fixed code of 2.

const MESSAGE = [
  'migrate-042-add-points-atomic is disabled (fail-closed).',
  'This one-off entrypoint performs no database work and never will again.',
  '',
  'Apply migrations through the audited Migration Runner instead:',
  '  node scripts/migration-runner.mjs <command>',
  'See docs/MIGRATION_RUNNER.md for the supported contract.',
].join('\n');

console.error(MESSAGE);
process.exitCode = 2;
