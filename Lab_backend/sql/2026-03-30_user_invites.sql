BEGIN;

CREATE TABLE IF NOT EXISTS user_invites (
  id SERIAL PRIMARY KEY,
  lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_invites_role_check'
  ) THEN
    ALTER TABLE user_invites
      ADD CONSTRAINT user_invites_role_check
      CHECK (role IN ('manager', 'staff'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_invites_status_check'
  ) THEN
    ALTER TABLE user_invites
      ADD CONSTRAINT user_invites_status_check
      CHECK (status IN ('pending', 'accepted', 'revoked'));
  END IF;
END $$;

COMMIT;
