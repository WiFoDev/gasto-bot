-- Financial rules engine
-- Run against Supabase SQL editor

-- ── Rule type enum ───────────────────────────────────────────────

CREATE TYPE rule_type AS ENUM ('spending_limit', 'payment_default', 'prohibition', 'habit');

-- ── Financial Rules ──────────────────────────────────────────────

CREATE TABLE financial_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  rule_type rule_type NOT NULL,
  category_id UUID REFERENCES categories(id),
  threshold NUMERIC(12, 2),
  period TEXT CHECK (period IN ('daily', 'weekly', 'monthly')),
  action_value TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_financial_rules_user_active ON financial_rules (user_id, is_active);
