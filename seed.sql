-- GastoBot seed data
-- Run against Supabase SQL editor after 001_initial.sql

-- ── Default user ────────────────────────────────────────────────

INSERT INTO users (phone, name, currency, timezone)
VALUES ('+51999888777', 'Wifo', 'PEN', 'America/Lima')
ON CONFLICT (phone) DO NOTHING;

-- ── Default categories ──────────────────────────────────────────

WITH u AS (SELECT id FROM users WHERE phone = '+51999888777')
INSERT INTO categories (user_id, name, slug, icon, is_default)
VALUES
  ((SELECT id FROM u), 'Food & Dining',    'food_dining',      '🍽', true),
  ((SELECT id FROM u), 'Transport',        'transport',        '🚗', true),
  ((SELECT id FROM u), 'Groceries',        'groceries',        '🛒', true),
  ((SELECT id FROM u), 'Entertainment',    'entertainment',    '🎬', true),
  ((SELECT id FROM u), 'Health',           'health',           '💊', true),
  ((SELECT id FROM u), 'Shopping',         'shopping',         '🛍', true),
  ((SELECT id FROM u), 'Bills & Utilities','bills_utilities',  '💡', true),
  ((SELECT id FROM u), 'Education',        'education',        '📚', true),
  ((SELECT id FROM u), 'Other',            'other',            '📌', true)
ON CONFLICT (user_id, slug) DO NOTHING;
