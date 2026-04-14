-- Add acclimatization-specific metrics to daily operations.
-- These are required for Acclimatization operations and optional otherwise.

ALTER TABLE public.daily_operations
  ADD COLUMN IF NOT EXISTS number_of_shootlets integer,
  ADD COLUMN IF NOT EXISTS number_of_cultured_trays integer,
  ADD COLUMN IF NOT EXISTS number_of_rooted_shoots integer,
  ADD COLUMN IF NOT EXISTS rooting_shoot_percentage numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_operations_number_of_shootlets_check'
      AND conrelid = 'public.daily_operations'::regclass
  ) THEN
    ALTER TABLE public.daily_operations
      ADD CONSTRAINT daily_operations_number_of_shootlets_check
      CHECK (number_of_shootlets IS NULL OR number_of_shootlets >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_operations_number_of_cultured_trays_check'
      AND conrelid = 'public.daily_operations'::regclass
  ) THEN
    ALTER TABLE public.daily_operations
      ADD CONSTRAINT daily_operations_number_of_cultured_trays_check
      CHECK (number_of_cultured_trays IS NULL OR number_of_cultured_trays >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_operations_number_of_rooted_shoots_check'
      AND conrelid = 'public.daily_operations'::regclass
  ) THEN
    ALTER TABLE public.daily_operations
      ADD CONSTRAINT daily_operations_number_of_rooted_shoots_check
      CHECK (number_of_rooted_shoots IS NULL OR number_of_rooted_shoots >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_operations_rooting_shoot_percentage_check'
      AND conrelid = 'public.daily_operations'::regclass
  ) THEN
    ALTER TABLE public.daily_operations
      ADD CONSTRAINT daily_operations_rooting_shoot_percentage_check
      CHECK (
        rooting_shoot_percentage IS NULL
        OR (rooting_shoot_percentage >= 0 AND rooting_shoot_percentage <= 100)
      );
  END IF;
END $$;
