CREATE TABLE IF NOT EXISTS lab_billing_history (
  id SERIAL PRIMARY KEY,
  lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  plan_label TEXT NOT NULL,
  amount_cents INTEGER NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'issued',
  period_starts_at TIMESTAMPTZ NULL,
  period_ends_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_billing_history_lab_id_created_at
  ON lab_billing_history(lab_id, created_at DESC);
