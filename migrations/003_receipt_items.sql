-- Receipt line items
-- Run against Supabase SQL editor

-- ── Receipt Items ────────────────────────────────────────────────

CREATE TABLE receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL,
  total NUMERIC(12, 2) NOT NULL,
  subcategory TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_receipt_items_expense ON receipt_items (expense_id);
