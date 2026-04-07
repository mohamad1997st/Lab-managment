CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  lab_id BIGINT REFERENCES labs(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'footer',
  status TEXT NOT NULL DEFAULT 'active',
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscriptions_lab_email_unique
  ON newsletter_subscriptions (lab_id, email);
