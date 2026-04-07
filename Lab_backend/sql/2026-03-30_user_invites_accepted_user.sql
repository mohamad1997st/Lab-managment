BEGIN;

ALTER TABLE user_invites
  ADD COLUMN IF NOT EXISTS accepted_user_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_invites_accepted_user_id_fkey'
  ) THEN
    ALTER TABLE user_invites
      ADD CONSTRAINT user_invites_accepted_user_id_fkey
      FOREIGN KEY (accepted_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE user_invites ui
SET accepted_user_id = u.id
FROM users u
WHERE ui.accepted_user_id IS NULL
  AND ui.status = 'accepted'
  AND ui.lab_id = u.lab_id
  AND LOWER(ui.email) = LOWER(u.email);

COMMIT;
