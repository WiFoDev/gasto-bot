import { describe, it, expect } from 'vitest';
import {
  formatExpenseConfirmation,
  formatClarification,
  formatError,
  formatHelp,
  formatCurrency,
} from '../../src/formatter.js';
import type { Expense, Category, PendingExpense } from '../../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    user_id: 'user-1',
    category_id: 'cat-1',
    amount: 35,
    currency: 'PEN',
    description: 'almuerzo',
    merchant: null,
    date: '2026-02-25',
    source: 'text',
    raw_input: 'almuerzo 35 soles',
    image_url: null,
    ai_confidence: 0.95,
    deleted_at: null,
    created_at: '2026-02-25T12:00:00Z',
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    user_id: 'user-1',
    name: 'Food & Dining',
    slug: 'food_dining',
    icon: '🍽',
    is_default: true,
    ...overrides,
  };
}

function makePendingExpense(
  overrides: Partial<PendingExpense> = {},
): PendingExpense {
  return {
    amount: 50,
    currency: 'PEN',
    category_slug: null,
    description: null,
    merchant: null,
    date: '2026-02-25',
    source: 'text',
    raw_input: 'spent 50',
    image_url: null,
    ai_confidence: 0.7,
    ...overrides,
  };
}

// ── formatCurrency ───────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats PEN amounts with S/ prefix', () => {
    expect(formatCurrency(35, 'PEN')).toBe('S/35.00');
  });

  it('formats USD amounts with $ prefix', () => {
    expect(formatCurrency(23.5, 'USD')).toBe('$23.50');
  });

  it('formats zero amount', () => {
    expect(formatCurrency(0, 'PEN')).toBe('S/0.00');
  });

  it('formats large amounts', () => {
    expect(formatCurrency(1234.5, 'PEN')).toBe('S/1,234.50');
  });

  it('formats unknown currency with code suffix', () => {
    expect(formatCurrency(100, 'EUR')).toBe('100.00 EUR');
  });
});

// ── formatExpenseConfirmation ────────────────────────────────────────

describe('formatExpenseConfirmation', () => {
  it('formats a basic expense', () => {
    const result = formatExpenseConfirmation(makeExpense(), makeCategory());
    expect(result).toContain('✅');
    expect(result).toContain('S/35.00');
    expect(result).toContain('Food & Dining');
    expect(result).toContain('almuerzo');
    expect(result).toContain('Feb 25');
  });

  it('formats expense with merchant', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ merchant: 'Wong' }),
      makeCategory(),
    );
    expect(result).toContain('Wong');
  });

  it('formats expense with no description', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ description: null }),
      makeCategory(),
    );
    expect(result).not.toContain('""');
    expect(result).toContain('✅');
    expect(result).toContain('S/35.00');
  });

  it('formats USD expense', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ amount: 23.5, currency: 'USD' }),
      makeCategory({ name: 'Transport', icon: '🚗' }),
    );
    expect(result).toContain('$23.50');
    expect(result).toContain('Transport');
  });

  it('formats zero amount expense', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ amount: 0 }),
      makeCategory(),
    );
    expect(result).toContain('S/0.00');
  });

  it('formats expense with long description (truncates)', () => {
    const longDesc = 'a'.repeat(100);
    const result = formatExpenseConfirmation(
      makeExpense({ description: longDesc }),
      makeCategory(),
    );
    // Should not exceed reasonable length for WhatsApp
    expect(result.length).toBeLessThan(200);
  });

  it('includes category icon', () => {
    const result = formatExpenseConfirmation(
      makeExpense(),
      makeCategory({ icon: '🚗', name: 'Transport' }),
    );
    expect(result).toContain('🚗');
  });

  it('snapshot: standard expense', () => {
    const result = formatExpenseConfirmation(makeExpense(), makeCategory());
    expect(result).toMatchInlineSnapshot(
      `"✅ S/35.00 — 🍽 Food & Dining
"almuerzo" · Feb 25"`,
    );
  });

  it('snapshot: expense with merchant', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ merchant: 'Wong', description: 'groceries' }),
      makeCategory({ name: 'Groceries', icon: '🛒', slug: 'groceries' }),
    );
    expect(result).toMatchInlineSnapshot(
      `"✅ S/35.00 — 🛒 Groceries
"groceries" at Wong · Feb 25"`,
    );
  });

  it('snapshot: expense with no description, no merchant', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ description: null, merchant: null }),
      makeCategory(),
    );
    expect(result).toMatchInlineSnapshot(
      `"✅ S/35.00 — 🍽 Food & Dining
Feb 25"`,
    );
  });
});

// ── formatClarification ──────────────────────────────────────────────

describe('formatClarification', () => {
  it('asks what the expense was for', () => {
    const result = formatClarification(makePendingExpense());
    expect(result).toContain('S/50.00');
    expect(result).toContain('?');
  });

  it('formats USD clarification', () => {
    const result = formatClarification(
      makePendingExpense({ amount: 25, currency: 'USD' }),
    );
    expect(result).toContain('$25.00');
  });

  it('snapshot: standard clarification', () => {
    const result = formatClarification(makePendingExpense());
    expect(result).toMatchInlineSnapshot(
      `"Got it — S/50.00. What was it for?"`,
    );
  });
});

// ── formatError ──────────────────────────────────────────────────────

describe('formatError', () => {
  it('returns a user-friendly error message', () => {
    const result = formatError();
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not contain technical details', () => {
    const result = formatError();
    expect(result).not.toMatch(/error|exception|stack|undefined/i);
  });

  it('snapshot', () => {
    expect(formatError()).toMatchInlineSnapshot(
      `"Something went wrong, try again."`,
    );
  });
});

// ── formatHelp ───────────────────────────────────────────────────────

describe('formatHelp', () => {
  it('returns help text', () => {
    const result = formatHelp();
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes logging instructions', () => {
    const result = formatHelp();
    expect(result).toMatch(/almuerzo 35|log/i);
  });

  it('includes summary instructions', () => {
    const result = formatHelp();
    expect(result).toMatch(/week|month|summary/i);
  });

  it('includes budget instructions', () => {
    const result = formatHelp();
    expect(result).toMatch(/budget/i);
  });

  it('includes correction instructions', () => {
    const result = formatHelp();
    expect(result).toMatch(/correct|wrong/i);
  });

  it('includes deletion instructions', () => {
    const result = formatHelp();
    expect(result).toMatch(/delete|borrar/i);
  });

  it('does not use markdown formatting', () => {
    const result = formatHelp();
    // No markdown bold/italic/headers that WhatsApp won't render
    expect(result).not.toMatch(/^#{1,3} /m);
    expect(result).not.toMatch(/\*\*/);
  });

  it('snapshot', () => {
    expect(formatHelp()).toMatchInlineSnapshot(`
      "Here's what I can do:

      📝 Log expense — "almuerzo 35 soles"
      📊 Summary — "how much this week?"
      💰 Set budget — "set food budget 800 monthly"
      ✏️ Correct — "wrong, it's transport"
      🗑️ Delete — "delete that"
      🧾 Receipt — send a photo

      Just type naturally, I'll figure it out!"
    `);
  });
});
