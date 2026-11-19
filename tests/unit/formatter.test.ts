import { describe, it, expect } from 'vitest';
import {
  BUTTON_IDS,
  expenseConfirmButtons,
  newCategoryButtons,
  formatButtonExpired,
  formatExpenseConfirmation,
  formatClarification,
  formatCorrection,
  formatAmountCorrection,
  formatDeletion,
  formatNoExpenseToModify,
  formatError,
  formatUnknown,
  formatParseError,
  formatDatabaseError,
  formatHelp,
  formatCurrency,
  formatBudgetConfirmation,
  formatBudgetStatus,
  formatBudgetAlert,
  formatNoBudget,
  formatSummary,
  formatReceiptConfirmation,
  formatReceiptUnclear,
  formatUnknownUser,
  formatUnsupportedMedia,
  formatMerchantCorrection,
  formatCorrectionGeneric,
  formatNewCategoryConfirmation,
  formatCategoryCreated,
  formatCategoryList,
  formatMonthlyClosing,
  formatRuleCreated,
  formatRuleDeleted,
  formatRuleList,
  formatRuleViolation,
  formatNoRuleFound,
} from '../../src/formatter.js';
import type { Expense, Category, PendingExpense, Budget, SummaryResult, MonthlyClosingData, ReceiptItemParsed, FinancialRule, RuleType } from '../../src/types.js';
import type { RuleViolation } from '../../src/rules.js';

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
    payment_type: null,
    payment_method_name: null,
    deleted_at: null,
    created_at: '2026-02-25T12:00:00Z',
    bank_reference: null,
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
    created_at: '2026-01-01T00:00:00Z',
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
    suggested_category_name: null,
    description: null,
    merchant: null,
    date: '2026-02-25',
    source: 'text',
    raw_input: 'spent 50',
    image_url: null,
    ai_confidence: 0.7,
    payment_type: null,
    payment_method_name: null,
    items: [],
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
    expect(result).toContain('25 feb');
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
"almuerzo" · 25 feb"`,
    );
  });

  it('snapshot: expense with merchant', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ merchant: 'Wong', description: 'groceries' }),
      makeCategory({ name: 'Groceries', icon: '🛒', slug: 'groceries' }),
    );
    expect(result).toMatchInlineSnapshot(
      `"✅ S/35.00 — 🛒 Groceries
"groceries" en Wong · 25 feb"`,
    );
  });

  it('snapshot: expense with no description, no merchant', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ description: null, merchant: null }),
      makeCategory(),
    );
    expect(result).toMatchInlineSnapshot(
      `"✅ S/35.00 — 🍽 Food & Dining
25 feb"`,
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
      `"Listo — S/50.00. ¿En qué fue?"`,
    );
  });
});

// ── formatCorrection ─────────────────────────────────────────────────

describe('formatCorrection', () => {
  it('shows updated category with old category', () => {
    const expense = makeExpense({ amount: 12.5, currency: 'PEN' });
    const oldCat = makeCategory({ name: 'Food & Dining', icon: '🍽' });
    const newCat = makeCategory({ name: 'Transport', icon: '🚗', slug: 'transport' });
    const result = formatCorrection(expense, oldCat, newCat);
    expect(result).toContain('Actualizado');
    expect(result).toContain('S/12.50');
    expect(result).toContain('Transport');
    expect(result).toContain('era:');
    expect(result).toContain('Food & Dining');
  });

  it('snapshot: category correction', () => {
    const expense = makeExpense({ amount: 12.5 });
    const oldCat = makeCategory({ name: 'Food & Dining', icon: '🍽' });
    const newCat = makeCategory({ name: 'Transport', icon: '🚗' });
    expect(formatCorrection(expense, oldCat, newCat)).toMatchInlineSnapshot(
      `"✅ Actualizado: S/12.50 — 🚗 Transport (era: 🍽 Food & Dining)"`,
    );
  });
});

// ── formatAmountCorrection ──────────────────────────────────────────

describe('formatAmountCorrection', () => {
  it('shows updated amount with old amount', () => {
    const expense = makeExpense({ amount: 40 });
    const cat = makeCategory();
    const result = formatAmountCorrection(expense, cat, 35);
    expect(result).toContain('Actualizado');
    expect(result).toContain('S/40.00');
    expect(result).toContain('era:');
    expect(result).toContain('S/35.00');
  });

  it('snapshot: amount correction', () => {
    const expense = makeExpense({ amount: 40 });
    const cat = makeCategory();
    expect(formatAmountCorrection(expense, cat, 35)).toMatchInlineSnapshot(
      `"✅ Actualizado: S/40.00 — 🍽 Food & Dining (era: S/35.00)"`,
    );
  });
});

// ── formatDeletion ──────────────────────────────────────────────────

describe('formatDeletion', () => {
  it('shows deleted expense details', () => {
    const expense = makeExpense({ amount: 12.5, date: '2026-02-25' });
    const cat = makeCategory({ name: 'Transport', icon: '🚗' });
    const result = formatDeletion(expense, cat);
    expect(result).toContain('🗑️');
    expect(result).toContain('Eliminado');
    expect(result).toContain('S/12.50');
    expect(result).toContain('Transport');
    expect(result).toContain('25 feb');
  });

  it('snapshot: standard deletion', () => {
    const expense = makeExpense({ amount: 12.5, date: '2026-02-25' });
    const cat = makeCategory({ name: 'Transport', icon: '🚗' });
    expect(formatDeletion(expense, cat)).toMatchInlineSnapshot(
      `"🗑️ Eliminado: S/12.50 — 🚗 Transport · 25 feb"`,
    );
  });
});

// ── formatNoExpenseToModify ─────────────────────────────────────────

describe('formatNoExpenseToModify', () => {
  it('returns a user-friendly message', () => {
    const result = formatNoExpenseToModify();
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('snapshot', () => {
    expect(formatNoExpenseToModify()).toMatchInlineSnapshot(
      `"No hay gasto reciente para modificar."`,
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
    expect(result).not.toMatch(/exception|stack|undefined/i);
  });

  it('snapshot', () => {
    expect(formatError()).toMatchInlineSnapshot(
      `"Algo salió mal, intenta de nuevo."`,
    );
  });
});

// ── formatUnknown ───────────────────────────────────────────────────

describe('formatUnknown', () => {
  it('returns a helpful message with example', () => {
    const result = formatUnknown();
    expect(result).toContain('almuerzo 35 soles');
    expect(result).toContain('ayuda');
  });

  it('snapshot', () => {
    expect(formatUnknown()).toMatchInlineSnapshot(
      `"No entendí eso. Prueba algo como "almuerzo 35 soles" o envía "ayuda"."`,
    );
  });
});

// ── formatParseError ─────────────────────────────────────────────────

describe('formatParseError', () => {
  it('returns a user-friendly AI error message', () => {
    const result = formatParseError();
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not contain technical details', () => {
    const result = formatParseError();
    expect(result).not.toMatch(/exception|stack|timeout|api/i);
  });

  it('snapshot', () => {
    expect(formatParseError()).toMatchInlineSnapshot(
      `"Me trabé pensando, intenta de nuevo."`,
    );
  });
});

// ── formatDatabaseError ─────────────────────────────────────────────

describe('formatDatabaseError', () => {
  it('returns a user-friendly database error message', () => {
    const result = formatDatabaseError();
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not contain technical details', () => {
    const result = formatDatabaseError();
    expect(result).not.toMatch(/exception|stack|database|sql|supabase/i);
  });

  it('snapshot', () => {
    expect(formatDatabaseError()).toMatchInlineSnapshot(
      `"No pude guardar eso, intenta de nuevo."`,
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
    expect(result).toMatch(/almuerzo 35/i);
  });

  it('includes summary instructions', () => {
    const result = formatHelp();
    expect(result).toMatch(/semana|mes|resumen/i);
  });

  it('includes budget instructions', () => {
    const result = formatHelp();
    expect(result).toMatch(/presupuesto/i);
  });

  it('includes correction instructions', () => {
    const result = formatHelp();
    expect(result).toMatch(/corregir|no,/i);
  });

  it('includes deletion instructions', () => {
    const result = formatHelp();
    expect(result).toMatch(/borrar|borra/i);
  });

  it('does not use markdown formatting', () => {
    const result = formatHelp();
    // No markdown bold/italic/headers that WhatsApp won't render
    expect(result).not.toMatch(/^#{1,3} /m);
    expect(result).not.toMatch(/\*\*/);
  });

  it('snapshot', () => {
    expect(formatHelp()).toMatchInlineSnapshot(`
      "Esto es lo que puedo hacer:

      📝 Registrar gasto — "almuerzo 35 soles"
      📊 Resumen — "cuánto gasté esta semana?"
      💰 Presupuesto — "presupuesto comida 800 mensual"
      ✏️ Corregir — "no, es transporte"
      🗑️ Borrar — "borra eso"
      🧾 Recibo — envía una foto

      Escribe con naturalidad, yo me encargo."
    `);
  });
});

// ── Budget helpers ──────────────────────────────────────────────────

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1',
    user_id: 'user-1',
    category_id: 'cat-1',
    amount: 800,
    currency: 'PEN',
    period: 'monthly',
    start_date: '2026-02-01',
    created_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

// ── formatSummary helper ────────────────────────────────────────────

function makeSummary(overrides: Partial<SummaryResult> = {}): SummaryResult {
  return {
    total: 342.5,
    byCategory: [
      { slug: 'food_dining', name: 'Food & Dining', icon: '🍽', total: 185 },
      { slug: 'transport', name: 'Transport', icon: '🚗', total: 87.5 },
      { slug: 'groceries', name: 'Groceries', icon: '🛒', total: 70 },
    ],
    startDate: '2026-02-19',
    endDate: '2026-02-25',
    ...overrides,
  };
}

// ── formatBudgetConfirmation ────────────────────────────────────────

describe('formatBudgetConfirmation', () => {
  it('formats confirmation with category', () => {
    const result = formatBudgetConfirmation(makeCategory(), 800, 'PEN', 'monthly');
    expect(result).toContain('💰');
    expect(result).toContain('Food & Dining');
    expect(result).toContain('S/800.00');
    expect(result).toContain('mensual');
  });

  it('formats confirmation without category (overall)', () => {
    const result = formatBudgetConfirmation(null, 2000, 'PEN', 'monthly');
    expect(result).toContain('General');
    expect(result).toContain('S/2,000.00');
  });

  it('formats weekly budget', () => {
    const result = formatBudgetConfirmation(makeCategory(), 200, 'PEN', 'weekly');
    expect(result).toContain('semanal');
  });

  it('formats USD budget', () => {
    const result = formatBudgetConfirmation(makeCategory(), 100, 'USD', 'monthly');
    expect(result).toContain('$100.00');
  });

  it('snapshot: category monthly', () => {
    expect(formatBudgetConfirmation(makeCategory(), 800, 'PEN', 'monthly'))
      .toMatchInlineSnapshot(`"💰 Presupuesto de 🍽 Food & Dining: S/800.00 mensual"`);
  });

  it('snapshot: overall monthly', () => {
    expect(formatBudgetConfirmation(null, 2000, 'PEN', 'monthly'))
      .toMatchInlineSnapshot(`"💰 Presupuesto de General: S/2,000.00 mensual"`);
  });
});

// ── formatBudgetStatus ──────────────────────────────────────────────

describe('formatBudgetStatus', () => {
  it('formats status at 50% usage', () => {
    const result = formatBudgetStatus(makeCategory(), makeBudget(), 400, 15);
    expect(result).toContain('Food & Dining');
    expect(result).toContain('S/400.00');
    expect(result).toContain('S/800.00');
    expect(result).toContain('50%');
    expect(result).toContain('S/400.00');
    expect(result).not.toContain('⚠️');
    expect(result).not.toContain('🚨');
  });

  it('shows warning at 80% usage', () => {
    const result = formatBudgetStatus(makeCategory(), makeBudget(), 640, 5);
    expect(result).toContain('80%');
    expect(result).toContain('⚠️');
    expect(result).toContain('5 días restantes en el mes');
  });

  it('shows warning at 90% usage', () => {
    const result = formatBudgetStatus(makeCategory(), makeBudget(), 720, 3);
    expect(result).toContain('90%');
    expect(result).toContain('⚠️');
    expect(result).toContain('3 días');
  });

  it('shows over budget alert at 100%+', () => {
    const result = formatBudgetStatus(makeCategory(), makeBudget(), 900, 2);
    expect(result).toContain('🚨');
    expect(result).toContain('Excediste por');
    expect(result).toContain('S/100.00');
  });

  it('uses singular "día" when 1 day remaining', () => {
    const result = formatBudgetStatus(makeCategory(), makeBudget(), 680, 1);
    expect(result).toContain('1 día restante');
    expect(result).not.toContain('1 días');
  });

  it('formats weekly period label', () => {
    const result = formatBudgetStatus(
      makeCategory(),
      makeBudget({ period: 'weekly', amount: 200 }),
      180,
      2,
    );
    expect(result).toContain('semana');
  });

  it('formats without category (overall)', () => {
    const result = formatBudgetStatus(null, makeBudget(), 400, 15);
    expect(result).toContain('📊 General');
  });

  it('snapshot: 50% usage', () => {
    expect(formatBudgetStatus(makeCategory(), makeBudget(), 400, 15))
      .toMatchInlineSnapshot(`
      "🍽 Food & Dining
      Gastado: S/400.00 / S/800.00 (50%)
      Restante: S/400.00"
    `);
  });

  it('snapshot: 85% usage with warning', () => {
    expect(formatBudgetStatus(makeCategory(), makeBudget(), 680, 5))
      .toMatchInlineSnapshot(`
      "🍽 Food & Dining
      Gastado: S/680.00 / S/800.00 (85%)
      Restante: S/120.00
      ⚠️ 5 días restantes en el mes"
    `);
  });

  it('snapshot: over budget', () => {
    expect(formatBudgetStatus(makeCategory(), makeBudget(), 950, 2))
      .toMatchInlineSnapshot(`
      "🍽 Food & Dining
      Gastado: S/950.00 / S/800.00 (119%)
      Restante: S/0.00
      🚨 Excediste por S/150.00!"
    `);
  });
});

// ── formatNoBudget ──────────────────────────────────────────────────

describe('formatNoBudget', () => {
  it('formats with category', () => {
    const result = formatNoBudget(makeCategory());
    expect(result).toContain('Food & Dining');
    expect(result).toContain('No hay presupuesto');
  });

  it('formats without category', () => {
    const result = formatNoBudget(null);
    expect(result).toContain('general');
    expect(result).toContain('No hay presupuesto');
  });
});

describe('formatSummary', () => {
  it('includes period header with date range', () => {
    const result = formatSummary(makeSummary(), 'week', 'PEN');
    expect(result).toContain('📊');
    expect(result).toContain('Esta semana');
    expect(result).toContain('19 feb');
    expect(result).toContain('25 feb');
  });

  it('includes total amount', () => {
    const result = formatSummary(makeSummary(), 'week', 'PEN');
    expect(result).toContain('S/342.50');
  });

  it('lists categories sorted by total descending', () => {
    const result = formatSummary(makeSummary(), 'week', 'PEN');
    const foodIdx = result.indexOf('Food & Dining');
    const transportIdx = result.indexOf('Transport');
    const groceriesIdx = result.indexOf('Groceries');
    expect(foodIdx).toBeLessThan(transportIdx);
    expect(transportIdx).toBeLessThan(groceriesIdx);
  });

  it('includes category icons and amounts', () => {
    const result = formatSummary(makeSummary(), 'week', 'PEN');
    expect(result).toContain('🍽 Food & Dining');
    expect(result).toContain('S/185.00');
    expect(result).toContain('🚗 Transport');
    expect(result).toContain('S/87.50');
  });

  it('shows "Sin gastos registrados." for empty period', () => {
    const result = formatSummary(
      makeSummary({ total: 0, byCategory: [] }),
      'week',
      'PEN',
    );
    expect(result).toContain('Sin gastos registrados.');
    expect(result).toContain('S/0.00');
  });

  it('formats today period correctly', () => {
    const result = formatSummary(
      makeSummary({ startDate: '2026-02-25', endDate: '2026-02-25' }),
      'today',
      'PEN',
    );
    expect(result).toContain('Hoy');
    expect(result).toContain('25 feb');
  });

  it('formats month period correctly', () => {
    const result = formatSummary(
      makeSummary({ startDate: '2026-02-01', endDate: '2026-02-25' }),
      'month',
      'PEN',
    );
    expect(result).toContain('Este mes');
    expect(result).toContain('1 feb');
    expect(result).toContain('25 feb');
  });

  it('formats USD currency', () => {
    const result = formatSummary(makeSummary({ total: 100 }), 'week', 'USD');
    expect(result).toContain('$100.00');
  });

  it('snapshot: week summary', () => {
    expect(formatSummary(makeSummary(), 'week', 'PEN')).toMatchInlineSnapshot(`
      "📊 Esta semana (19 feb–25 feb)
      Total: S/342.50

      🍽 Food & Dining  S/185.00
      🚗 Transport  S/87.50
      🛒 Groceries  S/70.00"
    `);
  });

  it('snapshot: empty today', () => {
    expect(
      formatSummary(
        makeSummary({ total: 0, byCategory: [], startDate: '2026-02-25', endDate: '2026-02-25' }),
        'today',
        'PEN',
      ),
    ).toMatchInlineSnapshot(`
      "📊 Hoy (25 feb)
      Total: S/0.00

      Sin gastos registrados."
    `);
  });

  it('snapshot: month summary with single category', () => {
    expect(
      formatSummary(
        makeSummary({
          total: 250,
          byCategory: [{ slug: 'food_dining', name: 'Food & Dining', icon: '🍽', total: 250 }],
          startDate: '2026-02-01',
          endDate: '2026-02-25',
        }),
        'month',
        'PEN',
      ),
    ).toMatchInlineSnapshot(`
      "📊 Este mes (1 feb–25 feb)
      Total: S/250.00

      🍽 Food & Dining  S/250.00"
    `);
  });
});

// ── formatReceiptConfirmation ────────────────────────────────────────

describe('formatReceiptConfirmation', () => {
  it('shows receipt details with merchant', () => {
    const result = formatReceiptConfirmation(
      makePendingExpense({ amount: 127.5, merchant: 'Plaza Vea', source: 'image' }),
      makeCategory({ name: 'Groceries', icon: '🛒', slug: 'groceries' }),
    );
    expect(result).toContain('🧾');
    expect(result).toContain('Plaza Vea');
    expect(result).toContain('S/127.50');
    expect(result).toContain('Groceries');
    expect(result).toContain('¿Está bien?');
  });

  it('shows "Recibo" when merchant is null', () => {
    const result = formatReceiptConfirmation(
      makePendingExpense({ amount: 50, merchant: null, source: 'image' }),
      makeCategory(),
    );
    expect(result).toContain('Recibo');
    expect(result).toContain('S/50.00');
  });

  it('includes date', () => {
    const result = formatReceiptConfirmation(
      makePendingExpense({ amount: 35, merchant: 'Wong', date: '2026-02-25' }),
      makeCategory(),
    );
    expect(result).toContain('25 feb');
  });

  it('snapshot: receipt with merchant', () => {
    expect(
      formatReceiptConfirmation(
        makePendingExpense({ amount: 127.5, merchant: 'Plaza Vea', source: 'image' }),
        makeCategory({ name: 'Groceries', icon: '🛒' }),
      ),
    ).toMatchInlineSnapshot(`
      "🧾 Plaza Vea — S/127.50
      Categoría: 🛒 Groceries · 25 feb
      ¿Está bien?"
    `);
  });

  it('snapshot: receipt without merchant', () => {
    expect(
      formatReceiptConfirmation(
        makePendingExpense({ amount: 45, merchant: null, source: 'image' }),
        makeCategory(),
      ),
    ).toMatchInlineSnapshot(`
      "🧾 Recibo — S/45.00
      Categoría: 🍽 Food & Dining · 25 feb
      ¿Está bien?"
    `);
  });
});

// ── formatReceiptConfirmation with items ──────────────────────────────

function makeReceiptItems(): ReceiptItemParsed[] {
  return [
    { description: 'Leche Gloria', quantity: 2, unit_price: 6.5, total: 13.0, subcategory: 'lácteos' },
    { description: 'Queso fresco', quantity: 1, unit_price: 8.0, total: 8.0, subcategory: 'lácteos' },
    { description: 'Detergente Ace', quantity: 1, unit_price: 15.0, total: 15.0, subcategory: 'limpieza' },
    { description: 'Lejía Clorox', quantity: 2, unit_price: 4.5, total: 9.0, subcategory: 'limpieza' },
    { description: 'Pollo entero', quantity: 1, unit_price: 25.5, total: 25.5, subcategory: 'proteína' },
    { description: 'Papas', quantity: 1, unit_price: 5.0, total: 5.0, subcategory: 'verdura' },
    { description: 'Coca-Cola', quantity: 3, unit_price: 3.5, total: 10.5, subcategory: 'bebidas' },
  ];
}

describe('formatReceiptConfirmation with items', () => {
  it('shows item groups when items are present', () => {
    const items = makeReceiptItems();
    const result = formatReceiptConfirmation(
      makePendingExpense({ amount: 86, merchant: 'Plaza Vea', source: 'image', items }),
      makeCategory({ name: 'Groceries', icon: '🛒' }),
    );
    expect(result).toContain('proteína');
    expect(result).toContain('limpieza');
    expect(result).toContain('lácteos');
    expect(result).toContain('¿Está bien?');
  });

  it('groups items by subcategory with count and total', () => {
    const items = makeReceiptItems();
    const result = formatReceiptConfirmation(
      makePendingExpense({ amount: 86, merchant: 'Plaza Vea', source: 'image', items }),
      makeCategory({ name: 'Groceries', icon: '🛒' }),
    );
    // lácteos: 2 items, S/21.00
    expect(result).toContain('lácteos (2)');
    expect(result).toContain('S/21.00');
    // limpieza: 2 items, S/24.00
    expect(result).toContain('limpieza (2)');
    expect(result).toContain('S/24.00');
  });

  it('sorts groups by total descending', () => {
    const items = makeReceiptItems();
    const result = formatReceiptConfirmation(
      makePendingExpense({ amount: 86, merchant: 'Plaza Vea', source: 'image', items }),
      makeCategory({ name: 'Groceries', icon: '🛒' }),
    );
    const proteinaIdx = result.indexOf('proteína');
    const limIndex = result.indexOf('limpieza');
    const lacteosIdx = result.indexOf('lácteos');
    // proteína (25.50) > limpieza (24.00) > lácteos (21.00)
    expect(proteinaIdx).toBeLessThan(limIndex);
    expect(limIndex).toBeLessThan(lacteosIdx);
  });

  it('limits to top 5 groups', () => {
    const items: ReceiptItemParsed[] = [
      { description: 'a', quantity: 1, unit_price: 10, total: 10, subcategory: 'grupo1' },
      { description: 'b', quantity: 1, unit_price: 9, total: 9, subcategory: 'grupo2' },
      { description: 'c', quantity: 1, unit_price: 8, total: 8, subcategory: 'grupo3' },
      { description: 'd', quantity: 1, unit_price: 7, total: 7, subcategory: 'grupo4' },
      { description: 'e', quantity: 1, unit_price: 6, total: 6, subcategory: 'grupo5' },
      { description: 'f', quantity: 1, unit_price: 5, total: 5, subcategory: 'grupo6' },
      { description: 'g', quantity: 1, unit_price: 4, total: 4, subcategory: 'grupo7' },
    ];
    const result = formatReceiptConfirmation(
      makePendingExpense({ amount: 49, merchant: 'Tienda', source: 'image', items }),
      makeCategory({ name: 'Groceries', icon: '🛒' }),
    );
    expect(result).toContain('grupo1');
    expect(result).toContain('grupo5');
    expect(result).not.toContain('grupo6');
    expect(result).not.toContain('grupo7');
  });

  it('groups null subcategory as "otros"', () => {
    const items: ReceiptItemParsed[] = [
      { description: 'Item misterioso', quantity: 1, unit_price: 12, total: 12, subcategory: null },
      { description: 'Otro item', quantity: 1, unit_price: 8, total: 8, subcategory: null },
    ];
    const result = formatReceiptConfirmation(
      makePendingExpense({ amount: 20, merchant: 'Tienda', source: 'image', items }),
      makeCategory({ name: 'Groceries', icon: '🛒' }),
    );
    expect(result).toContain('otros (2)');
    expect(result).toContain('S/20.00');
  });

  it('backward compatible: no items shows existing format', () => {
    const result = formatReceiptConfirmation(
      makePendingExpense({ amount: 50, merchant: 'Wong', source: 'image', items: [] }),
      makeCategory(),
    );
    expect(result).not.toContain('otros');
    expect(result).toContain('🧾 Wong — S/50.00');
    expect(result).toContain('¿Está bien?');
  });

  it('snapshot: receipt with item groups', () => {
    expect(
      formatReceiptConfirmation(
        makePendingExpense({ amount: 86, merchant: 'Plaza Vea', source: 'image', items: makeReceiptItems() }),
        makeCategory({ name: 'Groceries', icon: '🛒' }),
      ),
    ).toMatchInlineSnapshot(`
      "🧾 Plaza Vea — S/86.00
      Categoría: 🛒 Groceries · 25 feb

        proteína (1)  S/25.50
        limpieza (2)  S/24.00
        lácteos (2)  S/21.00
        bebidas (1)  S/10.50
        verdura (1)  S/5.00

      ¿Está bien?"
    `);
  });

  it('snapshot: receipt with null subcategories', () => {
    const items: ReceiptItemParsed[] = [
      { description: 'Producto A', quantity: 1, unit_price: 15, total: 15, subcategory: null },
      { description: 'Producto B', quantity: 2, unit_price: 5, total: 10, subcategory: 'snacks' },
    ];
    expect(
      formatReceiptConfirmation(
        makePendingExpense({ amount: 25, merchant: 'Bodega', source: 'image', items }),
        makeCategory({ name: 'Groceries', icon: '🛒' }),
      ),
    ).toMatchInlineSnapshot(`
      "🧾 Bodega — S/25.00
      Categoría: 🛒 Groceries · 25 feb

        otros (1)  S/15.00
        snacks (1)  S/10.00

      ¿Está bien?"
    `);
  });

  it('snapshot: receipt without items (backward compatible)', () => {
    expect(
      formatReceiptConfirmation(
        makePendingExpense({ amount: 45, merchant: null, source: 'image', items: [] }),
        makeCategory(),
      ),
    ).toMatchInlineSnapshot(`
      "🧾 Recibo — S/45.00
      Categoría: 🍽 Food & Dining · 25 feb
      ¿Está bien?"
    `);
  });
});

// ── formatReceiptUnclear ────────────────────────────────────────────

describe('formatReceiptUnclear', () => {
  it('returns a helpful message', () => {
    const result = formatReceiptUnclear();
    expect(result).toBeTruthy();
    expect(result).toContain('?');
  });

  it('snapshot', () => {
    expect(formatReceiptUnclear()).toMatchInlineSnapshot(
      `"No pude leer eso bien. ¿Cuál fue el total y de dónde fue?"`,
    );
  });
});

// ── formatUnknownUser ────────────────────────────────────────────────

describe('formatUnknownUser', () => {
  it('returns personal bot message', () => {
    expect(formatUnknownUser()).toBe('Este es un bot personal.');
  });
});

// ── formatUnsupportedMedia ──────────────────────────────────────────

describe('formatUnsupportedMedia', () => {
  it('returns unsupported media message', () => {
    expect(formatUnsupportedMedia()).toBe(
      'Solo puedo procesar texto y fotos por ahora.',
    );
  });
});

// ── formatMerchantCorrection ──────────────────────────────────────

describe('formatMerchantCorrection', () => {
  it('shows updated merchant with old merchant', () => {
    const expense = makeExpense({ amount: 95.6, merchant: 'Wong' });
    const cat = makeCategory({ name: 'Other', icon: '📦', slug: 'other' });
    const result = formatMerchantCorrection(expense, cat, 'CENCOSUD');
    expect(result).toContain('Actualizado');
    expect(result).toContain('Wong');
    expect(result).toContain('era: CENCOSUD');
  });

  it('shows "ninguno" when old merchant was null', () => {
    const expense = makeExpense({ merchant: 'Wong' });
    const cat = makeCategory();
    const result = formatMerchantCorrection(expense, cat, null);
    expect(result).toContain('era: ninguno');
  });

  it('snapshot: merchant correction', () => {
    const expense = makeExpense({ amount: 95.6, merchant: 'Wong' });
    const cat = makeCategory({ name: 'Other', icon: '📦' });
    expect(formatMerchantCorrection(expense, cat, 'CENCOSUD')).toMatchInlineSnapshot(
      `"✅ Actualizado: S/95.60 — 📦 Other · Wong (era: CENCOSUD)"`,
    );
  });
});

// ── formatCorrectionGeneric ────────────────────────────────────────

describe('formatCorrectionGeneric', () => {
  it('shows multiple changed fields', () => {
    const updated = makeExpense({ amount: 95.6, merchant: 'Wong', category_id: 'cat-groceries' });
    const original = { amount: 95.6, merchant: 'CENCOSUD', category_id: 'cat-other' };
    const oldCat = makeCategory({ id: 'cat-other', name: 'Other', icon: '📦', slug: 'other' });
    const newCat = makeCategory({ id: 'cat-groceries', name: 'Groceries', icon: '🛒', slug: 'groceries' });
    const result = formatCorrectionGeneric(updated, original, oldCat, newCat);
    expect(result).toContain('Actualizado');
    expect(result).toContain('Groceries');
    expect(result).toContain('Other');
    expect(result).toContain('CENCOSUD');
    expect(result).toContain('Wong');
  });

  it('snapshot: category + merchant change', () => {
    const updated = makeExpense({ amount: 95.6, merchant: 'Wong', category_id: 'cat-groceries' });
    const original = { amount: 95.6, merchant: 'CENCOSUD', category_id: 'cat-other' };
    const oldCat = makeCategory({ id: 'cat-other', name: 'Other', icon: '📦', slug: 'other' });
    const newCat = makeCategory({ id: 'cat-groceries', name: 'Groceries', icon: '🛒', slug: 'groceries' });
    expect(formatCorrectionGeneric(updated, original, oldCat, newCat)).toMatchInlineSnapshot(
      `"✅ Actualizado: S/95.60 — 🛒 Groceries (era: 📦 Other → 🛒 Groceries, CENCOSUD → Wong)"`,
    );
  });
});

// ── formatExpenseConfirmation with payment ──────────────────────────

describe('formatExpenseConfirmation with payment', () => {
  it('shows payment method name when present', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ payment_type: 'digital_wallet', payment_method_name: 'Yape' }),
      makeCategory(),
    );
    expect(result).toContain('Yape');
  });

  it('shows payment type label when no method name', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ payment_type: 'cash', payment_method_name: null }),
      makeCategory(),
    );
    expect(result).toContain('efectivo');
  });

  it('does not show payment info when payment_type is null', () => {
    const result = formatExpenseConfirmation(
      makeExpense({ payment_type: null, payment_method_name: null }),
      makeCategory(),
    );
    expect(result).not.toContain('con ');
  });

  it('snapshot: expense with Yape payment', () => {
    expect(
      formatExpenseConfirmation(
        makeExpense({ payment_type: 'digital_wallet', payment_method_name: 'Yape' }),
        makeCategory(),
      ),
    ).toMatchInlineSnapshot(`
      "✅ S/35.00 — 🍽 Food & Dining
      "almuerzo" · 25 feb · con Yape"
    `);
  });

  it('snapshot: expense with cash payment', () => {
    expect(
      formatExpenseConfirmation(
        makeExpense({ payment_type: 'cash' }),
        makeCategory(),
      ),
    ).toMatchInlineSnapshot(`
      "✅ S/35.00 — 🍽 Food & Dining
      "almuerzo" · 25 feb · con efectivo"
    `);
  });

  it('snapshot: expense with credit card payment', () => {
    expect(
      formatExpenseConfirmation(
        makeExpense({ payment_type: 'credit_card' }),
        makeCategory(),
      ),
    ).toMatchInlineSnapshot(`
      "✅ S/35.00 — 🍽 Food & Dining
      "almuerzo" · 25 feb · con tarjeta de crédito"
    `);
  });
});

// ── formatNewCategoryConfirmation ──────────────────────────────────

describe('formatNewCategoryConfirmation', () => {
  it('shows amount and suggested category name', () => {
    const pending = makePendingExpense({ amount: 120, suggested_category_name: 'Mascotas' });
    const result = formatNewCategoryConfirmation(pending, 'Mascotas');
    expect(result).toContain('S/120.00');
    expect(result).toContain('Mascotas');
    expect(result).toContain('?');
  });

  it('includes description when present', () => {
    const pending = makePendingExpense({
      amount: 120,
      description: 'veterinario',
      suggested_category_name: 'Mascotas',
    });
    const result = formatNewCategoryConfirmation(pending, 'Mascotas');
    expect(result).toContain('veterinario');
  });

  it('works with USD currency', () => {
    const pending = makePendingExpense({
      amount: 50,
      currency: 'USD',
      suggested_category_name: 'Gym',
    });
    const result = formatNewCategoryConfirmation(pending, 'Gym');
    expect(result).toContain('$50.00');
  });

  it('snapshot: basic new category confirmation', () => {
    expect(
      formatNewCategoryConfirmation(
        makePendingExpense({ amount: 120, description: 'veterinario' }),
        'Mascotas',
      ),
    ).toMatchInlineSnapshot(`
      "S/120.00 — "veterinario"
      No tengo la categoría 'Mascotas'. ¿La creo?"
    `);
  });

  it('snapshot: without description', () => {
    expect(
      formatNewCategoryConfirmation(
        makePendingExpense({ amount: 80 }),
        'Gym & Fitness',
      ),
    ).toMatchInlineSnapshot(`
      "S/80.00
      No tengo la categoría 'Gym & Fitness'. ¿La creo?"
    `);
  });
});

// ── formatCategoryCreated ──────────────────────────────────────────

describe('formatCategoryCreated', () => {
  it('shows icon and name', () => {
    const result = formatCategoryCreated(makeCategory({ name: 'Mascotas', icon: '🐾' }));
    expect(result).toContain('🐾');
    expect(result).toContain('Mascotas');
  });

  it('snapshot: category created', () => {
    expect(
      formatCategoryCreated(makeCategory({ name: 'Mascotas', icon: '🐾' })),
    ).toMatchInlineSnapshot(`"Categoría creada: 🐾 Mascotas"`);
  });
});

// ── formatCategoryList ─────────────────────────────────────────────

describe('formatCategoryList', () => {
  it('lists all categories with icons', () => {
    const categories = [
      makeCategory({ name: 'Food & Dining', icon: '🍽', slug: 'food_dining' }),
      makeCategory({ name: 'Transport', icon: '🚗', slug: 'transport' }),
      makeCategory({ name: 'Mascotas', icon: '🐾', slug: 'mascotas' }),
    ];
    const result = formatCategoryList(categories);
    expect(result).toContain('🍽 Food & Dining');
    expect(result).toContain('🚗 Transport');
    expect(result).toContain('🐾 Mascotas');
  });

  it('shows message for empty categories', () => {
    const result = formatCategoryList([]);
    expect(result).toContain('No hay categorías');
  });

  it('snapshot: multiple categories', () => {
    expect(
      formatCategoryList([
        makeCategory({ name: 'Food & Dining', icon: '🍽' }),
        makeCategory({ name: 'Transport', icon: '🚗' }),
        makeCategory({ name: 'Groceries', icon: '🛒' }),
        makeCategory({ name: 'Mascotas', icon: '🐾' }),
      ]),
    ).toMatchInlineSnapshot(`
      "📋 Tus categorías:

      🍽 Food & Dining
      🚗 Transport
      🛒 Groceries
      🐾 Mascotas"
    `);
  });

  it('snapshot: empty list', () => {
    expect(formatCategoryList([])).toMatchInlineSnapshot(
      `"No hay categorías registradas."`,
    );
  });
});

// ── formatBudgetAlert ──────────────────────────────────────────────

describe('formatBudgetAlert', () => {
  it('returns null when usage is below 80%', () => {
    const result = formatBudgetAlert(makeCategory(), 632, 800, 'PEN');
    expect(result).toBeNull();
  });

  it('returns null at exactly 79%', () => {
    const result = formatBudgetAlert(makeCategory(), 632, 800, 'PEN');
    expect(result).toBeNull();
  });

  it('returns warning at exactly 80%', () => {
    const result = formatBudgetAlert(makeCategory(), 640, 800, 'PEN');
    expect(result).not.toBeNull();
    expect(result).toContain('⚠️');
    expect(result).toContain('Llevas');
    expect(result).toContain('S/640.00');
    expect(result).toContain('S/800.00');
    expect(result).toContain('Food & Dining');
    expect(result).toContain('80%');
  });

  it('returns warning at 85%', () => {
    const result = formatBudgetAlert(makeCategory(), 680, 800, 'PEN');
    expect(result).toContain('⚠️');
    expect(result).toContain('85%');
  });

  it('returns exceeded alert when over 100%', () => {
    const result = formatBudgetAlert(makeCategory(), 850, 800, 'PEN');
    expect(result).not.toBeNull();
    expect(result).toContain('🚨');
    expect(result).toContain('excedido');
    expect(result).toContain('S/850.00');
    expect(result).toContain('S/800.00');
  });

  it('returns exceeded at exactly budget + 0.01', () => {
    const result = formatBudgetAlert(makeCategory(), 800.01, 800, 'PEN');
    expect(result).toContain('🚨');
  });

  it('uses "general" for null category in warning', () => {
    const result = formatBudgetAlert(null, 1600, 2000, 'PEN');
    expect(result).toContain('general');
    expect(result).toContain('80%');
  });

  it('uses "general" for null category in exceeded', () => {
    const result = formatBudgetAlert(null, 2100, 2000, 'PEN');
    expect(result).toContain('general');
    expect(result).toContain('excedido');
  });

  it('returns null for zero budget amount', () => {
    const result = formatBudgetAlert(makeCategory(), 0, 0, 'PEN');
    expect(result).toBeNull();
  });

  it('snapshot: category warning at 80%', () => {
    expect(formatBudgetAlert(makeCategory(), 640, 800, 'PEN'))
      .toMatchInlineSnapshot(`"⚠️ Llevas S/640.00 de S/800.00 en Food & Dining (80%)"`);
  });

  it('snapshot: category exceeded', () => {
    expect(formatBudgetAlert(makeCategory(), 850, 800, 'PEN'))
      .toMatchInlineSnapshot(`"🚨 Presupuesto de Food & Dining excedido: S/850.00 / S/800.00"`);
  });

  it('snapshot: overall warning', () => {
    expect(formatBudgetAlert(null, 1600, 2000, 'PEN'))
      .toMatchInlineSnapshot(`"⚠️ Llevas S/1,600.00 de S/2,000.00 en general (80%)"`);
  });

  it('snapshot: overall exceeded', () => {
    expect(formatBudgetAlert(null, 2100, 2000, 'PEN'))
      .toMatchInlineSnapshot(`"🚨 Presupuesto general excedido: S/2,100.00 / S/2,000.00"`);
  });
});

// ── formatMonthlyClosing ────────────────────────────────────────────

function makeMonthlyClosingData(overrides: Partial<MonthlyClosingData> = {}): MonthlyClosingData {
  return {
    year: 2026,
    month: 2,
    total: 1850,
    byCategory: [
      { slug: 'food_dining', name: 'Food & Dining', icon: '🍽', total: 850 },
      { slug: 'transport', name: 'Transport', icon: '🚗', total: 450 },
      { slug: 'groceries', name: 'Groceries', icon: '🛒', total: 350 },
      { slug: 'entertainment', name: 'Entertainment', icon: '🎬', total: 200 },
    ],
    previousMonthTotal: 1500,
    budgets: [
      makeBudget({ category_id: 'cat-1', amount: 800, period: 'monthly' }),
    ],
    ...overrides,
  };
}

describe('formatMonthlyClosing', () => {
  it('includes month name and year in header', () => {
    const result = formatMonthlyClosing(makeMonthlyClosingData(), 'PEN');
    expect(result).toContain('Cierre Febrero 2026');
  });

  it('includes total amount', () => {
    const result = formatMonthlyClosing(makeMonthlyClosingData(), 'PEN');
    expect(result).toContain('S/1,850.00');
  });

  it('shows comparison with previous month when available', () => {
    const result = formatMonthlyClosing(makeMonthlyClosingData(), 'PEN');
    expect(result).toContain('vs mes anterior');
    expect(result).toContain('+23%');
    expect(result).toContain('📈');
  });

  it('shows decrease when spending went down', () => {
    const result = formatMonthlyClosing(
      makeMonthlyClosingData({ total: 1200, previousMonthTotal: 1500 }),
      'PEN',
    );
    expect(result).toContain('📉');
    expect(result).toContain('-20%');
  });

  it('does not show comparison when previous month is 0', () => {
    const result = formatMonthlyClosing(
      makeMonthlyClosingData({ previousMonthTotal: 0 }),
      'PEN',
    );
    expect(result).not.toContain('vs mes anterior');
  });

  it('lists categories with percentages', () => {
    const result = formatMonthlyClosing(makeMonthlyClosingData(), 'PEN');
    expect(result).toContain('🍽 Food & Dining');
    expect(result).toContain('46%');
    expect(result).toContain('🚗 Transport');
    expect(result).toContain('24%');
  });

  it('shows empty message when no expenses', () => {
    const result = formatMonthlyClosing(
      makeMonthlyClosingData({ total: 0, byCategory: [] }),
      'PEN',
    );
    expect(result).toContain('Sin gastos registrados.');
  });

  it('formats USD currency', () => {
    const result = formatMonthlyClosing(makeMonthlyClosingData({ total: 500, byCategory: [
      { slug: 'food', name: 'Food', icon: '🍽', total: 500 },
    ], previousMonthTotal: 0 }), 'USD');
    expect(result).toContain('$500.00');
  });

  it('snapshot: full monthly closing', () => {
    expect(formatMonthlyClosing(makeMonthlyClosingData(), 'PEN')).toMatchInlineSnapshot(`
      "📊 Cierre Febrero 2026
      Total: S/1,850.00
      📈 +23% vs mes anterior

      🍽 Food & Dining  S/850.00 (46%)
      🚗 Transport  S/450.00 (24%)
      🛒 Groceries  S/350.00 (19%)
      🎬 Entertainment  S/200.00 (11%)"
    `);
  });

  it('snapshot: monthly closing with decrease', () => {
    expect(formatMonthlyClosing(
      makeMonthlyClosingData({ total: 1200, previousMonthTotal: 1500 }),
      'PEN',
    )).toMatchInlineSnapshot(`
      "📊 Cierre Febrero 2026
      Total: S/1,200.00
      📉 -20% vs mes anterior

      🍽 Food & Dining  S/850.00 (71%)
      🚗 Transport  S/450.00 (38%)
      🛒 Groceries  S/350.00 (29%)
      🎬 Entertainment  S/200.00 (17%)"
    `);
  });

  it('snapshot: empty month', () => {
    expect(formatMonthlyClosing(
      makeMonthlyClosingData({ total: 0, byCategory: [], previousMonthTotal: 0 }),
      'PEN',
    )).toMatchInlineSnapshot(`
      "📊 Cierre Febrero 2026
      Total: S/0.00

      Sin gastos registrados."
    `);
  });

  it('snapshot: no previous month data', () => {
    expect(formatMonthlyClosing(
      makeMonthlyClosingData({ previousMonthTotal: 0 }),
      'PEN',
    )).toMatchInlineSnapshot(`
      "📊 Cierre Febrero 2026
      Total: S/1,850.00

      🍽 Food & Dining  S/850.00 (46%)
      🚗 Transport  S/450.00 (24%)
      🛒 Groceries  S/350.00 (19%)
      🎬 Entertainment  S/200.00 (11%)"
    `);
  });
});

// ── Financial Rules Helpers ─────────────────────────────────────────

function makeRule(overrides: Partial<FinancialRule> = {}): FinancialRule {
  return {
    id: 'rule-1',
    user_id: 'user-1',
    name: 'Límite comida semanal',
    rule_type: 'spending_limit',
    category_id: 'cat-1',
    threshold: 200,
    period: 'weekly',
    action_value: null,
    is_active: true,
    created_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// ── formatRuleCreated ─────────────────────────────────────────────

describe('formatRuleCreated', () => {
  it('shows type label and rule name', () => {
    const result = formatRuleCreated(makeRule(), makeCategory());
    expect(result).toContain('Regla creada');
    expect(result).toContain('Límite comida semanal');
    expect(result).toContain('Límite de gasto');
  });

  it('shows threshold and period when present', () => {
    const result = formatRuleCreated(makeRule(), makeCategory());
    expect(result).toContain('S/200.00');
    expect(result).toContain('semanal');
  });

  it('shows category when present', () => {
    const result = formatRuleCreated(makeRule(), makeCategory());
    expect(result).toContain('🍽 Food & Dining');
  });

  it('omits category line when null', () => {
    const result = formatRuleCreated(makeRule({ category_id: null }), null);
    expect(result).not.toContain('Categoría');
  });

  it('shows action_value for payment_default rules', () => {
    const rule = makeRule({
      rule_type: 'payment_default',
      name: 'Siempre con Yape',
      threshold: null,
      period: null,
      action_value: 'Yape',
    });
    const result = formatRuleCreated(rule, makeCategory());
    expect(result).toContain('Yape');
    expect(result).toContain('Método de pago');
  });

  it('snapshot: spending limit with category', () => {
    expect(
      formatRuleCreated(makeRule(), makeCategory()),
    ).toMatchInlineSnapshot(`
      "✅ Regla creada: 💸 Límite de gasto
      "Límite comida semanal"
      Límite: S/200.00 semanal
      Categoría: 🍽 Food & Dining"
    `);
  });

  it('snapshot: prohibition without threshold', () => {
    expect(
      formatRuleCreated(
        makeRule({
          rule_type: 'prohibition',
          name: 'No gastar en entretenimiento',
          threshold: null,
          period: null,
        }),
        makeCategory({ name: 'Entertainment', icon: '🎬' }),
      ),
    ).toMatchInlineSnapshot(`
      "✅ Regla creada: 🚫 Prohibición
      "No gastar en entretenimiento"
      Categoría: 🎬 Entertainment"
    `);
  });

  it('snapshot: payment default rule', () => {
    expect(
      formatRuleCreated(
        makeRule({
          rule_type: 'payment_default',
          name: 'Siempre con Yape',
          threshold: null,
          period: null,
          action_value: 'Yape',
        }),
        null,
      ),
    ).toMatchInlineSnapshot(`
      "✅ Regla creada: 💳 Método de pago
      "Siempre con Yape"
      Valor: Yape"
    `);
  });

  it('snapshot: habit rule', () => {
    expect(
      formatRuleCreated(
        makeRule({
          rule_type: 'habit',
          name: 'Máximo 50 diarios en comida',
          threshold: 50,
          period: 'daily',
        }),
        makeCategory(),
      ),
    ).toMatchInlineSnapshot(`
      "✅ Regla creada: 🎯 Hábito
      "Máximo 50 diarios en comida"
      Límite: S/50.00 diario
      Categoría: 🍽 Food & Dining"
    `);
  });
});

// ── formatRuleDeleted ─────────────────────────────────────────────

describe('formatRuleDeleted', () => {
  it('shows rule name', () => {
    const result = formatRuleDeleted(makeRule());
    expect(result).toContain('Límite comida semanal');
    expect(result).toContain('🗑️');
  });

  it('snapshot', () => {
    expect(formatRuleDeleted(makeRule())).toMatchInlineSnapshot(
      `"🗑️ Regla eliminada: "Límite comida semanal""`,
    );
  });
});

// ── formatRuleList ────────────────────────────────────────────────

describe('formatRuleList', () => {
  it('shows empty state message', () => {
    const result = formatRuleList([], []);
    expect(result).toContain('No tienes reglas activas');
  });

  it('lists rules with type labels', () => {
    const rules = [
      makeRule(),
      makeRule({ id: 'rule-2', name: 'No entretenimiento', rule_type: 'prohibition', category_id: 'cat-2', threshold: null, period: null }),
    ];
    const categories = [
      makeCategory(),
      makeCategory({ id: 'cat-2', name: 'Entertainment', icon: '🎬' }),
    ];
    const result = formatRuleList(rules, categories);
    expect(result).toContain('Límite de gasto');
    expect(result).toContain('Prohibición');
    expect(result).toContain('Food & Dining');
    expect(result).toContain('Entertainment');
  });

  it('shows threshold and period for spending_limit', () => {
    const result = formatRuleList([makeRule()], [makeCategory()]);
    expect(result).toContain('S/200.00');
    expect(result).toContain('semanal');
  });

  it('shows action_value for payment_default', () => {
    const rule = makeRule({
      rule_type: 'payment_default',
      name: 'Siempre Yape',
      threshold: null,
      period: null,
      action_value: 'Yape',
      category_id: null,
    });
    const result = formatRuleList([rule], []);
    expect(result).toContain('Yape');
  });

  it('snapshot: empty list', () => {
    expect(formatRuleList([], [])).toMatchInlineSnapshot(
      `"No tienes reglas activas. Prueba "avisa si gasto más de 100 en comida"."`,
    );
  });

  it('snapshot: multiple rules', () => {
    const rules = [
      makeRule(),
      makeRule({
        id: 'rule-2',
        name: 'No entretenimiento',
        rule_type: 'prohibition',
        category_id: 'cat-2',
        threshold: null,
        period: null,
      }),
      makeRule({
        id: 'rule-3',
        name: 'Siempre con Yape',
        rule_type: 'payment_default',
        category_id: null,
        threshold: null,
        period: null,
        action_value: 'Yape',
      }),
    ];
    const categories = [
      makeCategory(),
      makeCategory({ id: 'cat-2', name: 'Entertainment', icon: '🎬' }),
    ];
    expect(formatRuleList(rules, categories)).toMatchInlineSnapshot(`
      "📋 Tus reglas:

      💸 Límite de gasto: "Límite comida semanal" (S/200.00 semanal) — 🍽 Food & Dining
      🚫 Prohibición: "No entretenimiento" — 🎬 Entertainment
      💳 Método de pago: "Siempre con Yape" (Yape)"
    `);
  });
});

// ── formatRuleViolation ───────────────────────────────────────────

describe('formatRuleViolation', () => {
  it('shows spending limit violation with amounts', () => {
    const violation: RuleViolation = { rule: makeRule(), spent: 250 };
    const result = formatRuleViolation(violation, makeCategory());
    expect(result).toContain('💸');
    expect(result).toContain('S/250.00');
    expect(result).toContain('S/200.00');
    expect(result).toContain('Food & Dining');
  });

  it('shows prohibition violation', () => {
    const violation: RuleViolation = {
      rule: makeRule({ rule_type: 'prohibition', name: 'No entretenimiento', threshold: null, period: null }),
      spent: null,
    };
    const result = formatRuleViolation(violation, makeCategory({ name: 'Entertainment', icon: '🎬' }));
    expect(result).toContain('🚫');
    expect(result).toContain('no permitido');
    expect(result).toContain('Entertainment');
  });

  it('shows payment default violation', () => {
    const violation: RuleViolation = {
      rule: makeRule({ rule_type: 'payment_default', name: 'Siempre Yape', action_value: 'Yape', threshold: null, period: null }),
      spent: null,
    };
    const result = formatRuleViolation(violation, null);
    expect(result).toContain('💳');
    expect(result).toContain('Yape');
  });

  it('shows habit violation with amounts', () => {
    const violation: RuleViolation = {
      rule: makeRule({ rule_type: 'habit', name: 'Máximo 50 diarios', threshold: 50, period: 'daily' }),
      spent: 65,
    };
    const result = formatRuleViolation(violation, makeCategory());
    expect(result).toContain('🎯');
    expect(result).toContain('S/65.00');
    expect(result).toContain('S/50.00');
  });

  it('uses "general" when category is null', () => {
    const violation: RuleViolation = { rule: makeRule({ category_id: null }), spent: 250 };
    const result = formatRuleViolation(violation, null);
    expect(result).toContain('general');
  });

  it('snapshot: spending limit violation', () => {
    expect(
      formatRuleViolation({ rule: makeRule(), spent: 250 }, makeCategory()),
    ).toMatchInlineSnapshot(
      `"💸 "Límite comida semanal": llevas S/250.00 de S/200.00 en Food & Dining"`,
    );
  });

  it('snapshot: prohibition violation', () => {
    expect(
      formatRuleViolation(
        { rule: makeRule({ rule_type: 'prohibition', name: 'No entretenimiento', threshold: null, period: null }), spent: null },
        makeCategory({ name: 'Entertainment', icon: '🎬' }),
      ),
    ).toMatchInlineSnapshot(
      `"🚫 "No entretenimiento": gasto en Entertainment no permitido"`,
    );
  });

  it('snapshot: payment default violation', () => {
    expect(
      formatRuleViolation(
        { rule: makeRule({ rule_type: 'payment_default', name: 'Siempre Yape', action_value: 'Yape', threshold: null, period: null }), spent: null },
        null,
      ),
    ).toMatchInlineSnapshot(
      `"💳 "Siempre Yape": método esperado era Yape"`,
    );
  });

  it('snapshot: habit violation', () => {
    expect(
      formatRuleViolation(
        { rule: makeRule({ rule_type: 'habit', name: 'Máximo 50 diarios', threshold: 50, period: 'daily' }), spent: 65 },
        makeCategory(),
      ),
    ).toMatchInlineSnapshot(
      `"🎯 "Máximo 50 diarios": llevas S/65.00 de S/50.00 en Food & Dining"`,
    );
  });
});

// ── formatNoRuleFound ─────────────────────────────────────────────

describe('formatNoRuleFound', () => {
  it('returns a helpful message', () => {
    expect(formatNoRuleFound()).toContain('No encontré');
  });

  it('snapshot', () => {
    expect(formatNoRuleFound()).toMatchInlineSnapshot(
      `"No encontré una regla que coincida."`,
    );
  });
});

describe('confirmation buttons', () => {
  it('expenseConfirmButtons returns Guardar / Cancelar', () => {
    expect(expenseConfirmButtons()).toEqual([
      { id: BUTTON_IDS.expenseConfirm, title: '✅ Guardar' },
      { id: BUTTON_IDS.expenseCancel, title: '❌ Cancelar' },
    ]);
  });

  it('newCategoryButtons returns Crear / Usar Otros', () => {
    expect(newCategoryButtons()).toEqual([
      { id: BUTTON_IDS.categoryCreate, title: '✅ Crear' },
      { id: BUTTON_IDS.categoryOther, title: '📁 Usar Otros' },
    ]);
  });

  it('button ids are distinct and titles fit WhatsApp\'s 20-char limit', () => {
    const buttons = [...expenseConfirmButtons(), ...newCategoryButtons()];
    expect(new Set(buttons.map((b) => b.id)).size).toBe(buttons.length);
    for (const b of buttons) {
      expect([...b.title].length).toBeLessThanOrEqual(20);
    }
  });

  it('formatButtonExpired', () => {
    expect(formatButtonExpired()).toMatchInlineSnapshot(
      `"Ese botón ya no está activo. Si querías registrar un gasto, envíamelo de nuevo."`,
    );
  });
});
