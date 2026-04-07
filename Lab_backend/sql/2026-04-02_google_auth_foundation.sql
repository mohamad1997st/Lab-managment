BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_sub TEXT;

UPDATE users
SET auth_provider = 'password'
WHERE auth_provider IS NULL OR TRIM(auth_provider) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_auth_provider_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_auth_provider_check
      CHECK (auth_provider IN ('password', 'google'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique
  ON users (google_sub)
  WHERE google_sub IS NOT NULL;

COMMIT;
