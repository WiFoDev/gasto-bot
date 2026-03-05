-- Dynamic categories + payment methods
-- Run against Supabase SQL editor

-- ── Payment type enum ────────────────────────────────────────────

CREATE TYPE payment_type AS ENUM ('cash', 'credit_card', 'debit_card', 'digital_wallet', 'bank_transfer', 'other');

-- ── Add payment fields to expenses ──────────────────────────────

ALTER TABLE expenses
  ADD COLUMN payment_type payment_type,
  ADD COLUMN payment_method_name TEXT;

-- ── Add created_at to categories ────────────────────────────────

ALTER TABLE categories
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
