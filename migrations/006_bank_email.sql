-- Phase 6: bank-email ingestion (BCP card notifications)
-- Run against Supabase SQL editor

-- ── Allow email-sourced expenses ─────────────────────────────────

ALTER TABLE expenses DROP CONSTRAINT expenses_source_check;
ALTER TABLE expenses
  ADD CONSTRAINT expenses_source_check CHECK (source IN ('text', 'image', 'email'));

-- ── Bank operation number (idempotency key) ──────────────────────

ALTER TABLE expenses ADD COLUMN bank_reference TEXT;

-- One expense per bank operation per user. Includes soft-deleted rows on
-- purpose: a re-sent email for a deleted expense must not resurrect it.
CREATE UNIQUE INDEX expenses_user_bank_reference_key
  ON expenses (user_id, bank_reference)
  WHERE bank_reference IS NOT NULL;
