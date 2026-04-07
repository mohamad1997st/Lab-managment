-- Allow multiple contamination records per operation_id.
-- This project uses PostgreSQL (see usage of $1 params and ::date casts).
--
-- Run this on your DB once, then the API will accept multiple rows for the same operation_id
-- (with different detected_date / notes / etc).

DO $$
DECLARE
  op_attnum int;
  r record;
BEGIN
  -- Find the attribute number for contamination_records.operation_id (used to detect constraints on it)
  SELECT a.attnum
  INTO op_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'public.contamination_records'::regclass
    AND a.attname = 'operation_id'
    AND a.attisdropped = false;

  IF op_attnum IS NULL THEN
    RAISE NOTICE 'contamination_records.operation_id not found; skipping.';
    RETURN;
  END IF;

  -- Drop UNIQUE constraints exactly on operation_id (common case: UNIQUE(operation_id))
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.contamination_records'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[op_attnum]
  LOOP
    EXECUTE format('ALTER TABLE public.contamination_records DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Dropped unique constraint %', r.conname;
  END LOOP;

  -- Drop UNIQUE indexes exactly on operation_id (in case it was created as a unique index, not a constraint)
  FOR r IN
    SELECT i.relname AS index_name
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE ix.indrelid = 'public.contamination_records'::regclass
      AND ix.indisunique = true
      AND ix.indkey::int[] = ARRAY[op_attnum]
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.index_name);
    RAISE NOTICE 'Dropped unique index %', r.index_name;
  END LOOP;
END $$;
