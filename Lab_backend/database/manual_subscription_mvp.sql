ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS subscription_starts_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ NULL DEFAULT (NOW() + interval '14 days'),
  ADD COLUMN IF NOT EXISTS max_users INTEGER NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_employees INTEGER NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_species INTEGER NULL DEFAULT 20;

UPDATE labs
SET
  subscription_plan = COALESCE(NULLIF(subscription_plan, ''), 'trial'),
  subscription_status = COALESCE(NULLIF(subscription_status, ''), 'trialing'),
  trial_ends_at = COALESCE(trial_ends_at, NOW() + interval '14 days'),
  max_users = COALESCE(max_users, 3),
  max_employees = COALESCE(max_employees, 10),
  max_species = COALESCE(max_species, 20);
