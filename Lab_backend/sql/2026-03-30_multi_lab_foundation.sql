BEGIN;

CREATE TABLE IF NOT EXISTS labs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO labs (name)
SELECT 'Default Lab'
WHERE NOT EXISTS (SELECT 1 FROM labs);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lab_id INTEGER;

UPDATE users
SET lab_id = (SELECT id FROM labs ORDER BY id LIMIT 1)
WHERE lab_id IS NULL;

ALTER TABLE users
  ALTER COLUMN lab_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_lab_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_lab_id_fkey
      FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE species
  ADD COLUMN IF NOT EXISTS lab_id INTEGER;

UPDATE species
SET lab_id = (SELECT id FROM labs ORDER BY id LIMIT 1)
WHERE lab_id IS NULL;

ALTER TABLE species
  ALTER COLUMN lab_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'species_lab_id_fkey'
  ) THEN
    ALTER TABLE species
      ADD CONSTRAINT species_lab_id_fkey
      FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS lab_id INTEGER;

UPDATE employees
SET lab_id = (SELECT id FROM labs ORDER BY id LIMIT 1)
WHERE lab_id IS NULL;

ALTER TABLE employees
  ALTER COLUMN lab_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_lab_id_fkey'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_lab_id_fkey
      FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS lab_id INTEGER;

UPDATE inventory i
SET lab_id = s.lab_id
FROM species s
WHERE s.id = i.species_id
  AND i.lab_id IS NULL;

UPDATE inventory
SET lab_id = (SELECT id FROM labs ORDER BY id LIMIT 1)
WHERE lab_id IS NULL;

ALTER TABLE inventory
  ALTER COLUMN lab_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_lab_id_fkey'
  ) THEN
    ALTER TABLE inventory
      ADD CONSTRAINT inventory_lab_id_fkey
      FOREIGN KEY (lab_id) REFERENCES labs(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
