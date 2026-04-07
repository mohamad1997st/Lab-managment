ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_labs_stripe_customer_id
  ON labs(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
