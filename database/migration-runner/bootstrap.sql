-- Ledger bootstrap for the quote-project-v2 migration runner.
-- The runner executes this entire file inside one externally managed transaction.
--
-- Supported model: LEGACY_BASELINE_PLUS_127.
--   * public.migration_records must already exist as the migration-125 legacy ledger.
--   * The runner adds its own managed columns and one CHECK + one partial unique index.
--   * public.migration_runner_schema is the runner schema marker (exactly one row, version = 1).
--   * Empty databases are NOT initialised from 001; the runner refuses them up front.
--
-- This file is idempotent for an exact rerun against an already-bootstrapped ledger.
-- All checks are anchored on pg_catalog / information_schema; unknown equivalent
-- structures fail closed instead of being accepted.

CREATE TABLE IF NOT EXISTS public.migration_records (
  id uuid PRIMARY KEY,
  migration_key varchar NOT NULL UNIQUE,
  file_name varchar,
  description text,
  status varchar NOT NULL DEFAULT 'success',
  executor varchar,
  checksum varchar,
  duration_ms integer,
  error_message text,
  executed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

DO $preflight$
DECLARE
  v_mismatch text;
BEGIN
  SELECT pg_catalog.string_agg(expected.column_name, ', ' ORDER BY expected.column_name)
    INTO v_mismatch
    FROM (VALUES
      ('id', 'uuid', false),
      ('migration_key', 'character varying', false),
      ('file_name', 'character varying', true),
      ('description', 'text', true),
      ('status', 'character varying', false),
      ('executor', 'character varying', true),
      ('checksum', 'character varying', true),
      ('duration_ms', 'integer', true),
      ('error_message', 'text', true),
      ('executed_at', 'timestamp with time zone', false),
      ('created_at', 'timestamp with time zone', false)
    ) AS expected(column_name, data_type, is_nullable)
    LEFT JOIN information_schema.columns actual
      ON actual.table_schema = 'public'
     AND actual.table_name = 'migration_records'
     AND actual.column_name = expected.column_name
   WHERE actual.column_name IS NULL
      OR actual.data_type <> expected.data_type
      OR (actual.is_nullable = 'YES') <> expected.is_nullable;

  IF v_mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_LEDGER_BASE_SCHEMA_MISMATCH: %', v_mismatch;
  END IF;

  IF NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint constraint_record
         JOIN pg_catalog.pg_attribute attribute_record
           ON attribute_record.attrelid = constraint_record.conrelid
          AND attribute_record.attnum = constraint_record.conkey[1]
        WHERE constraint_record.conrelid = 'public.migration_records'::pg_catalog.regclass
          AND constraint_record.contype = 'p'
          AND pg_catalog.array_length(constraint_record.conkey, 1) = 1
          AND attribute_record.attname = 'id'
     )
     OR NOT EXISTS (
       SELECT 1
         FROM pg_catalog.pg_constraint constraint_record
         JOIN pg_catalog.pg_attribute attribute_record
           ON attribute_record.attrelid = constraint_record.conrelid
          AND attribute_record.attnum = constraint_record.conkey[1]
        WHERE constraint_record.conrelid = 'public.migration_records'::pg_catalog.regclass
          AND constraint_record.contype = 'u'
          AND pg_catalog.array_length(constraint_record.conkey, 1) = 1
          AND attribute_record.attname = 'migration_key'
     ) THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_LEDGER_BASE_CONSTRAINT_MISMATCH';
  END IF;
END
$preflight$;

-- The migration-125 legacy ledger defines these column defaults. Exact-normalised
-- verification rejects databases whose ledger silently dropped a required default.
DO $base_defaults$
DECLARE
  v_bad text;
BEGIN
  SELECT pg_catalog.string_agg(column_name, ', ' ORDER BY column_name)
    INTO v_bad
    FROM (
      SELECT column_name,
             pg_catalog.lower(pg_catalog.regexp_replace(
               pg_catalog.replace(COALESCE(column_default, ''), 'pg_catalog.', ''),
               '[[:space:]]+', '', 'g'
             )) AS normalized_default
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'migration_records'
         AND column_name IN ('id', 'status', 'executed_at', 'created_at')
    ) actual
   WHERE NOT (
        (actual.column_name = 'id' AND actual.normalized_default = 'gen_random_uuid()')
     OR (actual.column_name = 'status'
         AND actual.normalized_default = '''success''::charactervarying')
     OR (actual.column_name IN ('executed_at', 'created_at')
         AND actual.normalized_default = 'now()')
   );

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_LEDGER_BASE_DEFAULT_MISMATCH: %', v_bad;
  END IF;
END
$base_defaults$;

ALTER TABLE public.migration_records
  ADD COLUMN IF NOT EXISTS migration_version integer,
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS runner_schema_version integer,
  ADD COLUMN IF NOT EXISTS runner_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS rollback_checksum varchar,
  ALTER COLUMN runner_managed SET DEFAULT false,
  ALTER COLUMN runner_managed SET NOT NULL;

-- rollback_checksum and every other runner-owned column must remain WITHOUT a
-- DEFAULT. Dropping a default is a no-op when none exists, so this repair is
-- idempotent and never fabricates rollback checksums for legacy or future rows.
ALTER TABLE public.migration_records
  ALTER COLUMN migration_version DROP DEFAULT,
  ALTER COLUMN run_id DROP DEFAULT,
  ALTER COLUMN runner_schema_version DROP DEFAULT,
  ALTER COLUMN rolled_back_at DROP DEFAULT,
  ALTER COLUMN rollback_checksum DROP DEFAULT;

DO $runner_columns_exact$
DECLARE
  v_ledger_oid oid;
  v_mismatch text;
BEGIN
  v_ledger_oid := 'public.migration_records'::pg_catalog.regclass;

  -- Exact pg_attribute binding of every runner-owned column: real relation OID,
  -- exact type OID, exact typmod, NOT NULL, default presence and the exact default
  -- expression. information_schema.data_type is never the authority here.
  SELECT pg_catalog.string_agg(expected.column_name, ', ' ORDER BY expected.column_name)
    INTO v_mismatch
    FROM (VALUES
      ('migration_version', 'integer'::pg_catalog.regtype::oid, -1, false, false, NULL::text),
      ('run_id', 'uuid'::pg_catalog.regtype::oid, -1, false, false, NULL::text),
      ('runner_schema_version', 'integer'::pg_catalog.regtype::oid, -1, false, false, NULL::text),
      ('runner_managed', 'boolean'::pg_catalog.regtype::oid, -1, true, true, 'false'),
      ('rolled_back_at', 'timestamptz'::pg_catalog.regtype::oid, -1, false, false, NULL::text),
      ('rollback_checksum', 'varchar'::pg_catalog.regtype::oid, -1, false, false, NULL::text)
    ) AS expected(column_name, type_oid, expected_typmod, is_not_null, has_default, default_normalized)
    LEFT JOIN pg_catalog.pg_attribute actual
      ON actual.attrelid = v_ledger_oid
     AND actual.attname = expected.column_name
     AND actual.attnum > 0
     AND NOT actual.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef default_record
      ON default_record.adrelid = v_ledger_oid
     AND default_record.adnum = actual.attnum
   WHERE actual.attname IS NULL
      OR actual.atttypid <> expected.type_oid
      OR actual.atttypmod <> expected.expected_typmod
      OR actual.attnotnull <> expected.is_not_null
      OR (default_record.adnum IS NOT NULL) IS DISTINCT FROM expected.has_default
      OR (
        expected.has_default
        AND pg_catalog.lower(pg_catalog.regexp_replace(
              pg_catalog.replace(pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid), 'pg_catalog.', ''),
              '[[:space:]]+', '', 'g'
            )) IS DISTINCT FROM expected.default_normalized
      );

  IF v_mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_LEDGER_COLUMN_MISMATCH: %', v_mismatch;
  END IF;
END
$runner_columns_exact$;

DO $constraints$
DECLARE
  v_constraint_oid oid;
  v_reference_check_oid oid;
  v_canonical_match boolean;
  v_conkey_match boolean;
BEGIN
  SELECT constraint_record.oid
    INTO v_constraint_oid
    FROM pg_catalog.pg_constraint constraint_record
   WHERE constraint_record.conrelid = 'public.migration_records'::pg_catalog.regclass
     AND constraint_record.conname = 'migration_records_runner_managed_check';

  IF v_constraint_oid IS NULL THEN
    ALTER TABLE public.migration_records
      ADD CONSTRAINT migration_records_runner_managed_check
      CHECK (
        NOT runner_managed OR (
          migration_version IS NOT NULL
          AND migration_version >= 127
          AND checksum IS NOT NULL
          AND checksum ~ '^[0-9a-f]{64}$'
          AND (rollback_checksum IS NULL OR rollback_checksum ~ '^[0-9a-f]{64}$')
          AND run_id IS NOT NULL
          AND runner_schema_version = 1
          AND file_name IS NOT NULL
          AND status IN ('success', 'rolled_back')
        )
      );

    SELECT constraint_record.oid
      INTO v_constraint_oid
      FROM pg_catalog.pg_constraint constraint_record
     WHERE constraint_record.conrelid = 'public.migration_records'::pg_catalog.regclass
       AND constraint_record.conname = 'migration_records_runner_managed_check';
  END IF;

  IF v_constraint_oid IS NULL OR NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
     WHERE constraint_record.oid = v_constraint_oid
       AND constraint_record.contype = 'c'
       AND constraint_record.convalidated
       AND NOT constraint_record.condeferrable
  ) THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_CONSTRAINT_DEFINITION_MISMATCH';
  END IF;

  -- Canonical definition match. The live constraint must deparse byte-for-byte
  -- identically to a freshly declared canonical constraint declared on a
  -- reference table with the same column types. Both definitions are deparsed
  -- by the same server-side deparser, so an identical pg_node_tree yields
  -- identical text; a relaxed definition (appended OR TRUE, a dropped
  -- conjunct, a re-parenthesised weakening) always deparses differently. No
  -- substring or clause-level comparison is used.
  CREATE TEMP TABLE _migration_runner_check_reference (
    runner_managed boolean,
    migration_version integer,
    checksum varchar,
    rollback_checksum varchar,
    run_id uuid,
    runner_schema_version integer,
    file_name varchar,
    status varchar
  ) ON COMMIT DROP;

  -- Bind the reference by OID in this session's temporary schema so a
  -- same-named permanent object can never be substituted for it. Every later
  -- catalog lookup uses this OID; every DDL statement that must name the table
  -- uses the explicit pg_temp alias rather than search_path resolution.
  SELECT relation_record.oid
    INTO v_reference_check_oid
    FROM pg_catalog.pg_class relation_record
   WHERE relation_record.relname = '_migration_runner_check_reference'
     AND relation_record.relnamespace = pg_catalog.pg_my_temp_schema();

  IF v_reference_check_oid IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_CONSTRAINT_DEFINITION_MISMATCH: reference relation missing';
  END IF;

  ALTER TABLE pg_temp._migration_runner_check_reference
    ADD CONSTRAINT migration_records_runner_managed_check
    CHECK (
      NOT runner_managed OR (
        migration_version IS NOT NULL
        AND migration_version >= 127
        AND checksum IS NOT NULL
        AND checksum ~ '^[0-9a-f]{64}$'
        AND (rollback_checksum IS NULL OR rollback_checksum ~ '^[0-9a-f]{64}$')
        AND run_id IS NOT NULL
        AND runner_schema_version = 1
        AND file_name IS NOT NULL
        AND status IN ('success', 'rolled_back')
      )
    );

  SELECT pg_catalog.pg_get_constraintdef(v_constraint_oid, false)
         = pg_catalog.pg_get_constraintdef(reference_record.oid, false)
    INTO v_canonical_match
    FROM pg_catalog.pg_constraint reference_record
   WHERE reference_record.conrelid = v_reference_check_oid
     AND reference_record.conname = 'migration_records_runner_managed_check';

  -- The CHECK must bind exactly the fixed runner columns in the canonical
  -- order. Raw conkey arrays are relation-local attnums, so the actual conkey
  -- is compared to the reference conkey as the ordered column-name sequence
  -- derived through pg_attribute.
  SELECT (
    (SELECT pg_catalog.array_agg(actual_attribute.attname ORDER BY ordinality.col)
       FROM pg_catalog.pg_constraint actual_constraint
       CROSS JOIN LATERAL unnest(actual_constraint.conkey)
            WITH ORDINALITY AS ordinality(attnum, col)
       JOIN pg_catalog.pg_attribute actual_attribute
         ON actual_attribute.attrelid = actual_constraint.conrelid
        AND actual_attribute.attnum = ordinality.attnum
      WHERE actual_constraint.oid = v_constraint_oid)
    =
    (SELECT pg_catalog.array_agg(reference_attribute.attname ORDER BY ordinality.col)
       FROM pg_catalog.pg_constraint reference_constraint
       CROSS JOIN LATERAL unnest(reference_constraint.conkey)
            WITH ORDINALITY AS ordinality(attnum, col)
       JOIN pg_catalog.pg_attribute reference_attribute
         ON reference_attribute.attrelid = reference_constraint.conrelid
        AND reference_attribute.attnum = ordinality.attnum
      WHERE reference_constraint.conrelid = v_reference_check_oid
        AND reference_constraint.conname = 'migration_records_runner_managed_check')
  ) INTO v_conkey_match;

  -- Release the reference table: in a single externally managed transaction
  -- ON COMMIT DROP would otherwise keep it alive until the outer COMMIT.
  DROP TABLE pg_temp._migration_runner_check_reference;

  IF v_canonical_match IS DISTINCT FROM true
     OR v_conkey_match IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_CONSTRAINT_DEFINITION_MISMATCH: canonical definition or conkey';
  END IF;
END
$constraints$;

-- Functional verification of the actual CHECK definition. Textual substring
-- comparisons can be bypassed by a relaxed definition (for example an appended
-- OR TRUE); probing the live constraint on a temporary LIKE-copy cannot.
DO $constraint_probe$
DECLARE
  v_run_id uuid := '00000000-0000-4000-8000-0000000000ff';
  v_sha varchar := pg_catalog.repeat('a', 64);
  v_rollback_sha varchar := pg_catalog.repeat('b', 64);
  v_insert_allowed boolean;
  v_probe_row record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_constraint constraint_record
     WHERE constraint_record.conrelid = 'public.migration_records'::pg_catalog.regclass
       AND constraint_record.conname = 'migration_records_runner_managed_check'
       AND constraint_record.contype = 'c'
       AND constraint_record.convalidated
  ) THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_CONSTRAINT_DEFINITION_MISMATCH';
  END IF;

  CREATE TEMP TABLE _migration_runner_constraint_probe
    (LIKE public.migration_records INCLUDING ALL)
    ON COMMIT DROP;

  -- Each forbidden runner row must be rejected by the live CHECK.
  FOR v_probe_row IN SELECT * FROM (VALUES
    (1, NULL::integer, true, NULL::varchar, 'version_null'),
    (2, 126, true, v_sha, 'version_below_floor'),
    (3, 127, true, NULL::varchar, 'checksum_null'),
    (4, 127, true, 'not-a-sha256', 'checksum_format'),
    (5, 127, true, v_sha, 'run_id_null'),
    (6, 127, true, v_sha, 'schema_version_wrong'),
    (7, 127, true, v_sha, 'file_name_null'),
    (8, 127, true, v_sha, 'status_forbidden'),
    (9, 127, true, v_sha, 'rollback_checksum_format')
  ) AS probe(n, migration_version_value, runner_managed_value, checksum_value, label)
  LOOP
    v_insert_allowed := true;
    BEGIN
      INSERT INTO pg_temp._migration_runner_constraint_probe
        (id, migration_key, migration_version, runner_managed, checksum,
         run_id, runner_schema_version, file_name, status, rollback_checksum)
      VALUES (
        ('00000000-0000-4000-8000-' || pg_catalog.lpad(v_probe_row.n::text, 12, '0'))::uuid,
        'probe_' || v_probe_row.n,
        v_probe_row.migration_version_value,
        v_probe_row.runner_managed_value,
        v_probe_row.checksum_value,
        CASE WHEN v_probe_row.label = 'run_id_null' THEN NULL ELSE v_run_id END,
        CASE WHEN v_probe_row.label = 'schema_version_wrong' THEN 2 ELSE 1 END,
        CASE WHEN v_probe_row.label = 'file_name_null' THEN NULL ELSE '127_probe.sql' END,
        CASE WHEN v_probe_row.label = 'status_forbidden' THEN 'failed' ELSE 'success' END,
        CASE WHEN v_probe_row.label = 'rollback_checksum_format' THEN 'not-a-sha256' ELSE NULL END
      );
      v_insert_allowed := false;
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
    IF NOT v_insert_allowed THEN
      RAISE EXCEPTION 'MIGRATION_RUNNER_CONSTRAINT_DEFINITION_MISMATCH: probe % accepted', v_probe_row.label;
    END IF;
  END LOOP;

  -- A valid runner-managed row (including one without a rollback file) must be accepted.
  v_insert_allowed := false;
  BEGIN
    INSERT INTO pg_temp._migration_runner_constraint_probe
      (id, migration_key, migration_version, runner_managed, checksum,
       run_id, runner_schema_version, file_name, rollback_checksum)
    VALUES (
      '00000000-0000-4000-8000-00000000000a',
      'probe_valid_no_rollback',
      127, true, v_sha, v_run_id, 1, '127_probe.sql', NULL
    );
    v_insert_allowed := true;
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF NOT v_insert_allowed THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_CONSTRAINT_DEFINITION_MISMATCH: valid row rejected';
  END IF;

  v_insert_allowed := false;
  BEGIN
    INSERT INTO pg_temp._migration_runner_constraint_probe
      (id, migration_key, migration_version, runner_managed, checksum,
       run_id, runner_schema_version, file_name, rollback_checksum)
    VALUES (
      '00000000-0000-4000-8000-00000000000b',
      'probe_valid_with_rollback',
      128, true, v_sha, v_run_id, 1, '128_probe.sql', v_rollback_sha
    );
    v_insert_allowed := true;
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF NOT v_insert_allowed THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_CONSTRAINT_DEFINITION_MISMATCH: valid rollback row rejected';
  END IF;

  -- Legacy historical rows (runner_managed = false, all runner columns NULL)
  -- must remain accepted and nullable; nothing is fabricated for them.
  v_insert_allowed := false;
  BEGIN
    INSERT INTO pg_temp._migration_runner_constraint_probe (id, migration_key, status)
    VALUES (
      '00000000-0000-4000-8000-00000000000c',
      'probe_legacy_row',
      'success'
    );
    v_insert_allowed := true;
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF NOT v_insert_allowed THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_CONSTRAINT_DEFINITION_MISMATCH: legacy row rejected';
  END IF;

  DROP TABLE pg_temp._migration_runner_constraint_probe;
END
$constraint_probe$;

DO $index_preflight$
DECLARE
  v_index_oid oid;
  v_reference_index_oid oid;
  v_index_ok boolean;
BEGIN
  SELECT pg_catalog.to_regclass('public.uq_migration_records_runner_version')
    INTO v_index_oid;

  -- Absent on the first bootstrap run: the index is created right below and
  -- verified canonically in the final postcondition. Present on an idempotent
  -- rerun: it must already be exact, fail closed otherwise.
  IF v_index_oid IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE _migration_runner_index_reference (
    migration_version integer,
    runner_managed boolean
  ) ON COMMIT DROP;

  CREATE UNIQUE INDEX uq_migration_records_runner_version_reference
    ON pg_temp._migration_runner_index_reference (migration_version)
    WHERE runner_managed;

  SELECT ref_index.indexrelid
    INTO v_reference_index_oid
    FROM pg_catalog.pg_index ref_index
    JOIN pg_catalog.pg_class ref_table
      ON ref_table.oid = ref_index.indrelid
   WHERE ref_table.relname = '_migration_runner_index_reference'
     AND ref_table.relnamespace = pg_catalog.pg_my_temp_schema();

  SELECT actual_index.indisunique
         AND actual_index.indisvalid
         AND actual_index.indisready
         AND NOT actual_index.indisprimary
         AND NOT actual_index.indisexclusion
         AND NOT actual_index.indnullsnotdistinct
         AND actual_index.indnkeyatts = 1
         AND actual_index.indnatts = 1
         AND actual_index.indpred IS NOT NULL
         AND actual_index.indexprs IS NULL
         AND actual_index_class.relam = reference_index_class.relam
         AND actual_index.indclass = reference_index.indclass
         AND actual_index.indcollation = reference_index.indcollation
         AND actual_index.indoption = reference_index.indoption
         AND key_attribute.attname = 'migration_version'
         AND pg_catalog.pg_get_expr(actual_index.indpred, actual_index.indrelid)
             = pg_catalog.pg_get_expr(reference_index.indpred, reference_index.indrelid)
    INTO v_index_ok
    FROM pg_catalog.pg_index actual_index
    JOIN pg_catalog.pg_attribute key_attribute
      ON key_attribute.attrelid = actual_index.indrelid
     AND key_attribute.attnum = actual_index.indkey[0]
    JOIN pg_catalog.pg_class actual_index_class
      ON actual_index_class.oid = actual_index.indexrelid
    CROSS JOIN pg_catalog.pg_index reference_index
    JOIN pg_catalog.pg_class reference_index_class
      ON reference_index_class.oid = reference_index.indexrelid
   WHERE actual_index.indexrelid = v_index_oid
     AND actual_index.indrelid = 'public.migration_records'::pg_catalog.regclass
     AND reference_index.indexrelid = v_reference_index_oid;

  DROP TABLE pg_temp._migration_runner_index_reference;

  IF v_index_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_INDEX_DEFINITION_MISMATCH';
  END IF;
END
$index_preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_migration_records_runner_version
  ON public.migration_records (migration_version)
  WHERE runner_managed;

CREATE TABLE IF NOT EXISTS public.migration_runner_schema (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version integer NOT NULL CHECK (version = 1),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

INSERT INTO public.migration_runner_schema (singleton, version, updated_at)
VALUES (true, 1, pg_catalog.now())
ON CONFLICT (singleton) DO UPDATE
  SET version = EXCLUDED.version,
      updated_at = EXCLUDED.updated_at
WHERE public.migration_runner_schema.version = 1;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.migration_records FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.migration_runner_schema FROM PUBLIC;

DO $roles$
BEGIN
  IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.migration_records FROM anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.migration_runner_schema FROM anon;
  END IF;
  IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.migration_records FROM authenticated;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.migration_runner_schema FROM authenticated;
  END IF;
END
$roles$;

DO $postcondition$
DECLARE
  v_runner_columns integer;
  v_runner_constraint_ok boolean;
  v_index_ok boolean;
  v_marker_columns_ok boolean;
  v_marker_pk_ok boolean;
  v_marker_checks_ok boolean;
  v_marker_row_ok boolean;
  v_acl_ok boolean;
  v_marker_oid oid;
  v_marker_reference_oid oid;
  v_reference_index_oid oid;
  v_mismatch text;
  v_marker_column_total integer;
  v_marker_columns_total_ok boolean;
BEGIN
  v_marker_oid := 'public.migration_runner_schema'::pg_catalog.regclass;

  SELECT pg_catalog.count(*)
    INTO v_runner_columns
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'migration_records'
     AND column_name IN (
       'migration_version', 'run_id', 'runner_schema_version',
       'runner_managed', 'rolled_back_at', 'rollback_checksum'
     );

  -- Runner-managed CHECK set on the ledger is exact: the only CHECK present is
  -- the canonical named one. A correct canonical constraint plus any extra
  -- unnamed or duplicate CHECK fails closed.
  SELECT (
    (SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.migration_records'::pg_catalog.regclass
        AND contype = 'c') = 1
    AND EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint constraint_record
       WHERE constraint_record.conrelid = 'public.migration_records'::pg_catalog.regclass
         AND constraint_record.conname = 'migration_records_runner_managed_check'
         AND constraint_record.contype = 'c'
         AND constraint_record.convalidated
         AND NOT constraint_record.condeferrable
         AND NOT constraint_record.condeferred
    )
  ) INTO v_runner_constraint_ok;

  -- Exact partial unique index verification against a reference index that is
  -- deparsed by the same server. The reference index is bound through the
  -- session temporary schema; the actual index is matched against the
  -- reference by access method (pg_class.relam on each index relation),
  -- indclass/indcollation/indoption, the single key attribute and canonical
  -- predicate text equality.
  CREATE TEMP TABLE _migration_runner_index_reference (
    migration_version integer,
    runner_managed boolean
  ) ON COMMIT DROP;

  CREATE UNIQUE INDEX uq_migration_records_runner_version_reference
    ON pg_temp._migration_runner_index_reference (migration_version)
    WHERE runner_managed;

  SELECT ref_index.indexrelid
    INTO v_reference_index_oid
    FROM pg_catalog.pg_index ref_index
    JOIN pg_catalog.pg_class ref_table
      ON ref_table.oid = ref_index.indrelid
   WHERE ref_table.relname = '_migration_runner_index_reference'
     AND ref_table.relnamespace = pg_catalog.pg_my_temp_schema();

  SELECT actual_index.indisunique
         AND actual_index.indisvalid
         AND actual_index.indisready
         AND NOT actual_index.indisprimary
         AND NOT actual_index.indisexclusion
         AND NOT actual_index.indnullsnotdistinct
         AND actual_index.indnkeyatts = 1
         AND actual_index.indnatts = 1
         AND actual_index.indpred IS NOT NULL
         AND actual_index.indexprs IS NULL
         AND actual_index_class.relam = reference_index_class.relam
         AND actual_index.indclass = reference_index.indclass
         AND actual_index.indcollation = reference_index.indcollation
         AND actual_index.indoption = reference_index.indoption
         AND key_attribute.attname = 'migration_version'
         AND pg_catalog.pg_get_expr(actual_index.indpred, actual_index.indrelid)
             = pg_catalog.pg_get_expr(reference_index.indpred, reference_index.indrelid)
    INTO v_index_ok
    FROM pg_catalog.pg_index actual_index
    JOIN pg_catalog.pg_attribute key_attribute
      ON key_attribute.attrelid = actual_index.indrelid
     AND key_attribute.attnum = actual_index.indkey[0]
    JOIN pg_catalog.pg_class actual_index_class
      ON actual_index_class.oid = actual_index.indexrelid
    CROSS JOIN pg_catalog.pg_index reference_index
    JOIN pg_catalog.pg_class reference_index_class
      ON reference_index_class.oid = reference_index.indexrelid
   WHERE actual_index.indexrelid = pg_catalog.to_regclass('public.uq_migration_records_runner_version')
     AND actual_index.indrelid = 'public.migration_records'::pg_catalog.regclass
     AND reference_index.indexrelid = v_reference_index_oid;

  DROP TABLE pg_temp._migration_runner_index_reference;

  -- Marker columns: exact pg_attribute / pg_attrdef binding (type OID, typmod,
  -- NOT NULL, default presence, normalised default expression).
  SELECT pg_catalog.string_agg(expected.column_name, ', ' ORDER BY expected.column_name)
    INTO v_mismatch
    FROM (VALUES
      ('singleton', 'boolean'::pg_catalog.regtype::oid, -1, true, true, 'true'),
      ('version', 'integer'::pg_catalog.regtype::oid, -1, true, false, NULL::text),
      ('updated_at', 'timestamptz'::pg_catalog.regtype::oid, -1, true, true, 'now()')
    ) AS expected(column_name, type_oid, expected_typmod, is_not_null, has_default, default_normalized)
    LEFT JOIN pg_catalog.pg_attribute actual
      ON actual.attrelid = v_marker_oid
     AND actual.attname = expected.column_name
     AND actual.attnum > 0
     AND NOT actual.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef default_record
      ON default_record.adrelid = v_marker_oid
     AND default_record.adnum = actual.attnum
   WHERE actual.attname IS NULL
      OR actual.atttypid <> expected.type_oid
      OR actual.atttypmod <> expected.expected_typmod
      OR actual.attnotnull <> expected.is_not_null
      OR (default_record.adnum IS NOT NULL) IS DISTINCT FROM expected.has_default
      OR (
        expected.has_default
        AND pg_catalog.lower(pg_catalog.regexp_replace(
              pg_catalog.replace(pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid), 'pg_catalog.', ''),
              '[[:space:]]+', '', 'g'
            )) IS DISTINCT FROM expected.default_normalized
      );

  v_marker_columns_ok := (v_mismatch IS NULL);

  -- Exact column count on the marker relation: required count equals the total
  -- number of non-dropped user columns, so an extra column fails closed.
  SELECT pg_catalog.count(*)
    INTO v_marker_column_total
    FROM pg_catalog.pg_attribute
   WHERE attrelid = v_marker_oid
     AND attnum > 0
     AND NOT attisdropped;
  v_marker_columns_total_ok := (v_marker_column_total = 3);

  -- Marker PK must be the only primary key on the relation, single-column on
  -- 'singleton', validated, non-deferrable and non-deferred.
  SELECT (
    (SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_constraint
      WHERE conrelid = v_marker_oid
        AND contype = 'p') = 1
    AND EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint constraint_record
        JOIN pg_catalog.pg_attribute attribute_record
          ON attribute_record.attrelid = constraint_record.conrelid
         AND attribute_record.attnum = constraint_record.conkey[1]
       WHERE constraint_record.conrelid = v_marker_oid
         AND constraint_record.contype = 'p'
         AND constraint_record.convalidated
         AND NOT constraint_record.condeferrable
         AND NOT constraint_record.condeferred
         AND pg_catalog.array_length(constraint_record.conkey, 1) = 1
         AND attribute_record.attname = 'singleton'
    )
  ) INTO v_marker_pk_ok;

  -- Marker CHECK constraints: exactly two, each validated and single-column,
  -- and each deparsing byte-for-byte identically to the freshly declared
  -- canonical constraint on the matching reference column. Reference DDL uses
  -- explicit names; matching is by referenced column, never by name.
  CREATE TEMP TABLE _migration_runner_marker_reference (
    singleton boolean NOT NULL DEFAULT true,
    version integer NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
  ) ON COMMIT DROP;

  -- Bind the marker reference by OID in the session temporary schema and name
  -- it through the explicit pg_temp alias everywhere, never search_path.
  SELECT relation_record.oid
    INTO v_marker_reference_oid
    FROM pg_catalog.pg_class relation_record
   WHERE relation_record.relname = '_migration_runner_marker_reference'
     AND relation_record.relnamespace = pg_catalog.pg_my_temp_schema();

  IF v_marker_reference_oid IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_BOOTSTRAP_POSTCONDITION_FAILED: marker reference missing';
  END IF;

  ALTER TABLE pg_temp._migration_runner_marker_reference
    ADD CONSTRAINT migration_runner_schema_singleton_check CHECK (singleton);

  ALTER TABLE pg_temp._migration_runner_marker_reference
    ADD CONSTRAINT migration_runner_schema_version_check CHECK (version = 1);

  -- Exact multiset comparison: actual CHECK count == 2 and reference CHECK
  -- count == 2; every actual CHECK is validated, non-deferrable and matched by
  -- exactly one reference CHECK on the same column with a byte-for-byte equal
  -- canonical definition; and every reference CHECK is matched by an actual
  -- one. A duplicated CHECK(singleton) or a missing CHECK(version) therefore
  -- fails even when the marker row is still true/1.
  SELECT (
    (SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_constraint actual
      WHERE actual.conrelid = v_marker_oid
        AND actual.contype = 'c') = 2
    AND (SELECT pg_catalog.count(*)
       FROM pg_catalog.pg_constraint reference
      WHERE reference.conrelid = v_marker_reference_oid
        AND reference.contype = 'c') = 2
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint actual
       WHERE actual.conrelid = v_marker_oid
         AND actual.contype = 'c'
         AND (
           NOT actual.convalidated
           OR actual.condeferrable
           OR pg_catalog.array_length(actual.conkey, 1) <> 1
           OR NOT EXISTS (
             SELECT 1
               FROM pg_catalog.pg_attribute actual_attribute
               JOIN pg_catalog.pg_constraint reference
                 ON reference.conrelid = v_marker_reference_oid
                AND reference.contype = 'c'
               JOIN pg_catalog.pg_attribute reference_attribute
                 ON reference_attribute.attrelid = reference.conrelid
                AND reference_attribute.attnum = reference.conkey[1]
              WHERE actual_attribute.attrelid = actual.conrelid
                AND actual_attribute.attnum = actual.conkey[1]
                AND reference_attribute.attname = actual_attribute.attname
                AND pg_catalog.pg_get_constraintdef(reference.oid, false)
                    = pg_catalog.pg_get_constraintdef(actual.oid, false)
           )
         )
    )
    AND NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_constraint reference
       WHERE reference.conrelid = v_marker_reference_oid
         AND reference.contype = 'c'
         AND NOT EXISTS (
           SELECT 1
             FROM pg_catalog.pg_attribute reference_attribute
             JOIN pg_catalog.pg_constraint actual
               ON actual.conrelid = v_marker_oid
              AND actual.contype = 'c'
             JOIN pg_catalog.pg_attribute actual_attribute
               ON actual_attribute.attrelid = actual.conrelid
              AND actual_attribute.attnum = actual.conkey[1]
            WHERE reference_attribute.attrelid = reference.conrelid
              AND reference_attribute.attnum = reference.conkey[1]
              AND actual_attribute.attname = reference_attribute.attname
              AND pg_catalog.pg_get_constraintdef(reference.oid, false)
                  = pg_catalog.pg_get_constraintdef(actual.oid, false)
         )
    )
  )
  INTO v_marker_checks_ok;

  DROP TABLE pg_temp._migration_runner_marker_reference;

  SELECT NOT EXISTS (
    SELECT 1
      FROM public.migration_runner_schema
     WHERE NOT singleton
        OR version IS DISTINCT FROM 1
  ) AND EXISTS (
    SELECT 1
      FROM public.migration_runner_schema
     WHERE singleton AND version = 1
  ) INTO v_marker_row_ok;

  -- ACL: no direct or role-inherited write privilege for PUBLIC, anon or
  -- authenticated on either relation, and neither relation is owned by a role
  -- those two inherit from. anon/authenticated_lineage walk pg_auth_members so
  -- a grant to a role that anon is a member of is caught too.
  -- Cycle-safe role inheritance: UNION deduplicates visited roles instead of
  -- UNION ALL, which could recurse forever on a role-membership cycle. The
  -- grantee must never resolve to PUBLIC, anon's full inheritance lineage or
  -- authenticated's full inheritance lineage.
  WITH RECURSIVE anon_lineage(roleid) AS (
    SELECT pg_catalog.to_regrole('anon')::oid
    UNION
    SELECT membership.roleid
      FROM pg_catalog.pg_auth_members membership
      JOIN anon_lineage lineage
        ON lineage.roleid = membership.member
  ),
  authenticated_lineage(roleid) AS (
    SELECT pg_catalog.to_regrole('authenticated')::oid
    UNION
    SELECT membership.roleid
      FROM pg_catalog.pg_auth_members membership
      JOIN authenticated_lineage lineage
        ON lineage.roleid = membership.member
  )
  SELECT NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class relation_record
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(
          relation_record.relacl,
          pg_catalog.acldefault('r', relation_record.relowner)
        )
      ) acl_record
     WHERE relation_record.oid IN (
       'public.migration_records'::pg_catalog.regclass,
       'public.migration_runner_schema'::pg_catalog.regclass
     )
       AND acl_record.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
       AND (
         acl_record.grantee = 0
         OR acl_record.grantee IN (SELECT lineage.roleid FROM anon_lineage lineage)
         OR acl_record.grantee IN (SELECT lineage.roleid FROM authenticated_lineage lineage)
       )
  )
  AND NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class relation_record
     WHERE relation_record.oid IN (
       'public.migration_records'::pg_catalog.regclass,
       'public.migration_runner_schema'::pg_catalog.regclass
     )
       AND (
         relation_record.relowner IN (SELECT lineage.roleid FROM anon_lineage lineage)
         OR relation_record.relowner IN (SELECT lineage.roleid FROM authenticated_lineage lineage)
       )
  )
  -- Column-level ACLs on every user column of both relations: pg_attribute.
  -- attacl must not carry INSERT/UPDATE for PUBLIC or either inheritance
  -- lineage. pg_attribute.attacl is NULL unless column-level grants exist, so
  -- aclexplode is only applied to non-NULL entries.
  AND NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_attribute attribute_record
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_record.attacl) acl_record
     WHERE attribute_record.attrelid IN (
       'public.migration_records'::pg_catalog.regclass,
       'public.migration_runner_schema'::pg_catalog.regclass
     )
       AND attribute_record.attnum > 0
       AND NOT attribute_record.attisdropped
       AND attribute_record.attacl IS NOT NULL
       AND acl_record.privilege_type IN ('INSERT', 'UPDATE')
       AND (
         acl_record.grantee = 0
         OR acl_record.grantee IN (SELECT lineage.roleid FROM anon_lineage lineage)
         OR acl_record.grantee IN (SELECT lineage.roleid FROM authenticated_lineage lineage)
       )
  )
  INTO v_acl_ok;

  IF v_runner_columns <> 6
     OR v_runner_constraint_ok IS DISTINCT FROM true
     OR v_index_ok IS DISTINCT FROM true
     OR v_marker_columns_ok IS DISTINCT FROM true
     OR v_marker_columns_total_ok IS DISTINCT FROM true
     OR v_marker_pk_ok IS DISTINCT FROM true
     OR v_marker_checks_ok IS DISTINCT FROM true
     OR v_marker_row_ok IS DISTINCT FROM true
     OR v_acl_ok IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'MIGRATION_RUNNER_BOOTSTRAP_POSTCONDITION_FAILED';
  END IF;
END
$postcondition$;
