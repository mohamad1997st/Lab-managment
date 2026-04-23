-- Add soft-deactivation for employees (hide name when left job)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

-- Backfill existing rows
UPDATE employees
SET is_active = true
WHERE is_active IS DISTINCT FROM true;

