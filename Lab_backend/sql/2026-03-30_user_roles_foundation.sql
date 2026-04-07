BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role TEXT;

UPDATE users
SET role = 'owner'
WHERE role IS NULL;

UPDATE users
SET role = 'owner'
WHERE LOWER(role) = 'admin';

UPDATE users
SET role = 'staff'
WHERE LOWER(COALESCE(role, '')) NOT IN ('owner', 'manager', 'staff');

ALTER TABLE users
  ALTER COLUMN role SET NOT NULL;

ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'staff';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('owner', 'manager', 'staff'));
  END IF;
END $$;

COMMIT;
