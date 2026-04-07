BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_employee_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
