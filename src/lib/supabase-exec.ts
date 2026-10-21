/**
 * DEPRECATED — FAIL CLOSED (E1_13_BYPASS_SCOPE_CLOSURE)
 *
 * This module used to be an arbitrary-SQL RPC wrapper around the database
 * `exec_sql` function and was used to run DDL (CREATE / ALTER / DROP /
 * TRUNCATE / RENAME) from application code, including a schema-repair path
 * that issued `ALTER TABLE ... ADD COLUMN` from a business request.
 *
 * Application code must never execute arbitrary SQL or mutate the database
 * schema. The audited Migration Runner is the only supported migration /
 * schema entrypoint — see docs/MIGRATION_RUNNER.md.
 *
 * The wrapper therefore performs no work at all: it reads no environment,
 * creates no database client and issues no RPC. Any call throws so that a
 * leftover call site fails loudly instead of silently changing the schema.
 */

const DISABLED_MESSAGE =
  'exec_sql is disabled: arbitrary SQL / schema changes must go through the ' +
  'audited Migration Runner (see docs/MIGRATION_RUNNER.md)';

/**
 * @deprecated Arbitrary SQL execution is disabled. Use the Migration Runner.
 */
export async function exec_sql(): Promise<never> {
  throw new Error(DISABLED_MESSAGE);
}
