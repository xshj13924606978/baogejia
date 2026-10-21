# Unified Migration Runner

The repository-supported migration entrypoint is:

```text
node scripts/migration-runner.mjs <status|verify|up|down|adopt-plan|help>
```

The matching package commands are `migration:status`, `migration:verify`,
`migration:up`, `migration:down`, and `migration:adopt-plan`. Legacy
`db:migrate*` commands deliberately fail closed.

## Operating contract

- The runner never loads `.env` files. Database commands use only
  `DATABASE_URL` already present in the process environment.
- URLs, passwords, tokens, and connection secrets must not appear in command
  arguments, logs, ledger descriptions, or error output.
- One `pg.Client` session owns the project-specific advisory lock, bootstrap,
  preflight, migration transaction, ledger registration, unlock, and close.
- The stable advisory lock pair is `(1363234097, 1835627122)`.
- Each forward or rollback file and its ledger transition are committed in the
  same transaction. SQL files containing top-level transaction control are
  rejected before a database connection is opened.
- Forward migrations use canonical names
  `NNN_lowercase_snake_case.sql`. A rollback is paired by the exact name
  `NNN_lowercase_snake_case.rollback.sql`.
- Versions below 127 are historical and are never executed by this runner.
  Unknown SQL file names, duplicate versions, symlinks, traversal, checksum
  drift, missing local versions, and non-prefix ledger state are fatal.
- `down` rolls back only the latest Runner-managed successful version and
  requires `--confirm NNN`. There is no implicit `down all`.

## Ledger and legacy rows

The runner reuses `public.migration_records`; it does not create another
migration ledger. `database/migration-runner/bootstrap.sql` adds nullable
Runner metadata and strict constraints only for rows marked
`runner_managed = true`. The separate singleton
`public.migration_runner_schema` is schema metadata, not a migration ledger.

Existing rows remain legacy. The runner never derives historical execution
proof from current repository files and never auto-fills a legacy checksum.
Any unreconciled legacy row blocks `up` and `down` with
`LEGACY_LEDGER_UNRECONCILED`. `adopt-plan` is read-only: it reports local
candidates and the evidence an operator must obtain. Adoption requires
separately reviewed SQL.

Migration SQL is never allowed to write to `public.migration_records`.
A fail-closed static scan (`MIGRATION_LEDGER_WRITE_FORBIDDEN`) rejects any
statement that combines the ledger with `INSERT`/`UPDATE`/`DELETE`/`MERGE`/
`TRUNCATE`/`ALTER`/`DROP`/`CREATE`/`COPY`, and it runs at two places: when
each SQL file is read from disk during discovery and again at the execution
boundary inside the transaction, immediately before the SQL is sent. That
means `CREATE TRIGGER`, `CREATE RULE`, `CREATE INDEX`, or
`COPY public.migration_records ... FROM` (including the column-list form) are
rejected whenever they name the ledger. The scan is a transaction-control
lexer that also descends recursively into `DO` blocks and `CREATE FUNCTION`/
`PROCEDURE` dollar-quoted bodies.

A dynamic `EXECUTE` is safe only when its payload is a single fully static
string literal (or dollar-quoted literal) that can itself be rescanned;
anything else is undeterminable and fails closed with
`MIGRATION_LEDGER_WRITE_UNDETERMINABLE`. Executing a PL/pgSQL variable,
string concatenation (`'UP' || 'DATE ...'`), `format()`, `chr()`, or any other
expression is never allowed to bypass the ledger guard. A static literal
payload is scanned recursively, so `EXECUTE 'UPDATE public.migration_records
...'` cannot smuggle a ledger write past the token stream, while a benign
`EXECUTE 'SELECT 1'` stays allowed. After a static payload only
whitespace/comments, the end of the statement, or an `INTO`/`USING` tail is
permitted. `CREATE TRIGGER`/`CREATE EVENT TRIGGER` use `EXECUTE FUNCTION`/
`PROCEDURE` as grammar rather than dynamic SQL and are not misclassified; a
trigger, rule, or index that actually targets the ledger is still rejected
above. References to arbitrary SQL executors such as `exec_sql` fail closed
even without a ledger token. A body that cannot be inspected (for example a
`LANGUAGE sql` function whose body is a plain string literal) fails closed
with `MIGRATION_LEDGER_WRITE_UNDETERMINABLE`. At most 64 nested scan levels
are accepted.

The lexer also fails closed on lexical forms it cannot safely decode.
`E'...'` strings containing a backslash escape are undeterminable and rejected
instead of having the backslash stripped and the tail rescanned (a payload such
as `\x55` would otherwise decode into the letter that starts `UPDATE`).
PostgreSQL `U&"..."` unicode-escaped identifiers are rejected too, because they
can spell a ledger name without its literal letters
(`U&"migration_\0072ecords"` is `migration_records`). Both fail with
`MIGRATION_LEDGER_WRITE_UNDETERMINABLE`.

Ledger registration is performed only by the runner inside the same
transaction: a fresh run uses one fully parameterized `INSERT`, and re-running
a version that the runner previously rolled back uses one parameterized,
strict compare-and-set `UPDATE` that requires the exact prior `rolled_back`
row. Rows produced by migration SQL are never upgraded into runner-managed
state; the former `xmin`/`pg_current_xact_id` upgrade path is removed. A
failed or ambiguous registration rolls the whole migration back.

`rollback_checksum` is nullable, has no column default, and is never
back-filled: a migration without a rollback file registers a `NULL`
`rollback_checksum`, and the runner never fabricates a checksum for legacy
rows.

`down` revalidates the ledger row inside the transaction before any destructive
SQL runs: the exact target row is locked with `SELECT ... FOR UPDATE` and must
still match the applied success row, otherwise the rollback aborts with
`MIGRATION_IDENTITY_DRIFT` and not a byte of rollback SQL reaches the wire.
The rollback SQL and the status transition to `rolled_back` are then committed
together, guarded by a strict compare-and-set `UPDATE` whose failure rolls
everything back.

## Read-only commands

`verify` is local unless `--database` is explicitly supplied. `status`,
database-backed `verify`, and `adopt-plan` only read the ledger; they never
run bootstrap or change database state.

## Prohibited bypasses

Running migration SQL from an SQL editor, bare `psql`, REST/RPC SQL executor,
Management API, Supabase DB Push, application HTTP route, or another repository
script is unsupported. The runner cannot technically revoke database
administrator capabilities outside the repository; operational access controls
must prohibit those paths. Manually executed SQL is not automatically trusted
or adopted.

The bootstrap and migration SQL must be reviewed before any isolated database
test. This implementation has only static and fake-client coverage until that
separate stage is approved.

## Bootstrap verification

`database/migration-runner/bootstrap.sql` is idempotent and verifies more than
existence. After each `ALTER`, it asserts exact column catalog state with
pg_attribute/pg_attrdef OID binding, type OIDs, typmods, `NOT NULL`, default
presence, and normalised default expressions. Every reference relation used
for canonical deparsing is created in the session's temporary schema and is
located through `pg_my_temp_schema()`, so a same-named permanent object can
never be substituted for the reference; every DDL statement that names a
reference relation uses the explicit `pg_temp` alias rather than
search_path resolution. The runner-managed CHECK constraint
and the partial unique index are verified by **canonical deparse**: the live
object must deparse byte-for-byte identically to a freshly declared canonical
object on a reference table with identical column types. The same server-side
deparser renders an identical pg_node_tree as identical text, so appending
`OR TRUE`, dropping a conjunct, or re-parenthesising a weakening always
produces a mismatch. The ledger CHECK set is exact: the single canonical,
validated, non-deferrable `migration_records_runner_managed_check` is the only
CHECK allowed on the ledger, so an extra unnamed or duplicate CHECK fails. The
CHECK must also bind exactly the canonical ordered column set: its `conkey` is
compared as the ordered column-name sequence against the reference through
`pg_attribute`, never as raw relation-local attnums. The
partial unique index on `(migration_version) WHERE runner_managed` is compared
as a full index shape: access method resolved on each index relation's
`pg_class.relam`, `indclass`, `indcollation` and `indoption` equality, single
key attribute, validated/ready/unique flags, non-primary/non-exclusion/
non-null-not-distinct, and byte-equal partial predicate deparse.

The singleton marker table (`public.migration_runner_schema`) is verified the
same way and must have exactly three non-dropped user columns; its primary key
is the single, validated, non-deferrable, non-deferred PK on `singleton`; and
its two CHECK constraints (`singleton` and `version = 1`) are matched to the
reference by column in a bidirectional exact multiset (two actual, two
reference, canonical definitions byte-identical), so a duplicated or missing
marker CHECK fails. The final postcondition checks the ACL for direct **and
role-inherited** write privileges (`pg_auth_members` lineages of `anon` and
`authenticated`, plus ownership), so a grant to a role that `anon` is a member
of is still caught; column-level `attacl` `INSERT`/`UPDATE` grants on user
columns are checked the same way, and the lineage walk is cycle-safe because
it deduplicates roles with `UNION` instead of recursing with `UNION ALL`.

These exact-catalog guarantees are a static SQL contract inside
`database/migration-runner/bootstrap.sql`. Until the separate approved
isolated-database execution stage runs, coverage is limited to the
source-level guards in the automated tests (which assert the catalog SQL
carries `pg_my_temp_schema`, `indclass`/`indcollation`/`indoption`,
`condeferrable`/`condeferred`, the exact marker column count, and the
cycle-safe ACL walk) plus fake-client behaviour tests; they are not a runtime
database verification.

## Signals, transactions and error output

- Signal handlers are flag-only: SIGINT/SIGTERM set `runtime.interrupted` and
  remember the first signal; they never abort a query out from under the
  library. The exit code is derived afterwards: 143 for SIGTERM, 130 for
  SIGINT, otherwise the command result code.
- `RUN_INTERRUPTED` checkpoints sit before `BEGIN`, inside each migration,
  before `COMMIT`, and between migrations. An interrupt after `BEGIN` always
  rolls back and never commits. Once `COMMIT` has been issued its outcome is
  awaited; a commit error becomes `COMMIT_OUTCOME_UNKNOWN` and no second
  `ROLLBACK` is ever sent.
- Error output is redacted recursively. `formatError` walks `code`/`message`,
  the `cause` chain, `AggregateError.errors[]`, and `secondaryDetails`, and it
  never stringifies whole error objects. Secrets are collected from
  `DATABASE_URL` plus password/user/host fragments before the error is
  formatted. Each field is redacted with the full secret set applied
  longest-first (so an overlapping secret cannot leak its suffix), and the
  whole assembled output is redacted a second time as a safety net. An
  `error.code` that passes the safe-character gate but still smells secret-like
  (`bearer`/`token`/`secret`/`password`/`host`/`user` or a `postgres://` form)
  is replaced by `[REDACTED]`.
