import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Ensure config.ts doesn't throw on missing KAPSO_WEBHOOK_SECRET
process.env.KAPSO_WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET || 'test-secret';

const {
  getUserByPhone,
  getCategories,
  getCategoryBySlug,
  insertCategory,
  deleteCategory,
  insertExpense,
  getExpenseById,
  getLastExpense,
  updateExpense,
  softDeleteExpense,
  getMonthlyClosingData,
  insertReceiptItems,
  getReceiptItems,
  insertRule,
  getActiveRules,
  deleteRule,
} = await import('../../src/db.js');

// Direct client for test cleanup only
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
);

let userId: string;
let foodCategoryId: string;
let transportCategoryId: string;
const testExpenseIds: string[] = [];
const testCategoryIds: string[] = [];
const testRuleIds: string[] = [];

describe('db queries', () => {
  beforeAll(async () => {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('phone', '+51999888777')
      .single();
    userId = user!.id;

    const { data: categories } = await supabase
      .from('categories')
      .select('id, slug')
      .eq('user_id', userId);

    foodCategoryId = categories!.find((c) => c.slug === 'food_dining')!.id;
    transportCategoryId = categories!.find((c) => c.slug === 'transport')!.id;
  });

  afterAll(async () => {
    // Hard-delete financial rules
    if (testRuleIds.length > 0) {
      await supabase.from('financial_rules').delete().in('id', testRuleIds);
    }
    // Hard-delete receipt items first (FK on expense_id)
    if (testExpenseIds.length > 0) {
      await supabase.from('receipt_items').delete().in('expense_id', testExpenseIds);
    }
    // Hard-delete all test expenses (FK on category_id)
    if (testExpenseIds.length > 0) {
      await supabase.from('expenses').delete().in('id', testExpenseIds);
    }
    // Hard-delete all test categories
    if (testCategoryIds.length > 0) {
      await supabase.from('categories').delete().in('id', testCategoryIds);
    }
  });

  describe('getUserByPhone', () => {
    it('returns user for known phone', async () => {
      const user = await getUserByPhone('+51999888777');
      expect(user).not.toBeNull();
      expect(user!.phone).toBe('+51999888777');
      expect(user!.currency).toBe('PEN');
      expect(user!.timezone).toBe('America/Lima');
    });

    it('returns null for unknown phone', async () => {
      const user = await getUserByPhone('+0000000000');
      expect(user).toBeNull();
    });
  });

  describe('getCategories', () => {
    it('returns all 9 categories for user', async () => {
      const categories = await getCategories(userId);
      expect(categories).toHaveLength(9);
      const slugs = categories.map((c) => c.slug).sort();
      expect(slugs).toContain('food_dining');
      expect(slugs).toContain('transport');
      expect(slugs).toContain('other');
    });
  });

  describe('getCategoryBySlug', () => {
    it('returns matching category', async () => {
      const cat = await getCategoryBySlug(userId, 'food_dining');
      expect(cat).not.toBeNull();
      expect(cat!.slug).toBe('food_dining');
      expect(cat!.name).toBe('Food & Dining');
    });

    it('returns null for unknown slug', async () => {
      const cat = await getCategoryBySlug(userId, 'nonexistent');
      expect(cat).toBeNull();
    });
  });

  describe('category lifecycle: insert → verify → delete', () => {
    let categoryId: string;

    it('insertCategory creates a non-default category', async () => {
      const cat = await insertCategory(userId, 'Mascotas', 'mascotas', '🐾');
      expect(cat).toHaveProperty('id');
      expect(cat.name).toBe('Mascotas');
      expect(cat.slug).toBe('mascotas');
      expect(cat.icon).toBe('🐾');
      expect(cat.is_default).toBe(false);
      expect(cat.user_id).toBe(userId);

      categoryId = cat.id;
      testCategoryIds.push(categoryId);
    });

    it('getCategoryBySlug finds the new category', async () => {
      const cat = await getCategoryBySlug(userId, 'mascotas');
      expect(cat).not.toBeNull();
      expect(cat!.id).toBe(categoryId);
    });

    it('getCategories includes the new category', async () => {
      const categories = await getCategories(userId);
      expect(categories.length).toBeGreaterThanOrEqual(10);
      expect(categories.find((c) => c.slug === 'mascotas')).toBeDefined();
    });

    it('deleteCategory removes the non-default category', async () => {
      await deleteCategory(userId, categoryId);
      const cat = await getCategoryBySlug(userId, 'mascotas');
      expect(cat).toBeNull();
      // Remove from cleanup array since it's already deleted
      const idx = testCategoryIds.indexOf(categoryId);
      if (idx >= 0) testCategoryIds.splice(idx, 1);
    });

    it('deleteCategory does not remove default categories', async () => {
      // Attempt to delete a default category — should be a no-op
      await deleteCategory(userId, foodCategoryId);
      const cat = await getCategoryBySlug(userId, 'food_dining');
      expect(cat).not.toBeNull();
    });
  });

  describe('insertExpense with payment fields', () => {
    it('stores payment_type and payment_method_name', async () => {
      const expense = await insertExpense({
        user_id: userId,
        category_id: foodCategoryId,
        amount: 25,
        currency: 'PEN',
        description: 'almuerzo con yape',
        merchant: null,
        date: '2026-03-05',
        source: 'text',
        raw_input: 'almuerzo 25 con yape',
        image_url: null,
        ai_confidence: 0.92,
        payment_type: 'digital_wallet',
        payment_method_name: 'Yape',
      });

      expect(expense.payment_type).toBe('digital_wallet');
      expect(expense.payment_method_name).toBe('Yape');
      testExpenseIds.push(expense.id);
    });

    it('allows null payment fields', async () => {
      const expense = await insertExpense({
        user_id: userId,
        category_id: foodCategoryId,
        amount: 15,
        currency: 'PEN',
        description: 'cafe',
        merchant: null,
        date: '2026-03-05',
        source: 'text',
        raw_input: 'cafe 15',
        image_url: null,
        ai_confidence: 0.90,
        payment_type: null,
        payment_method_name: null,
      });

      expect(expense.payment_type).toBeNull();
      expect(expense.payment_method_name).toBeNull();
      testExpenseIds.push(expense.id);
    });
  });

  describe('expense lifecycle: insert → read → update → soft-delete → verify filtered', () => {
    let expenseId: string;

    it('insertExpense creates and returns expense', async () => {
      const expense = await insertExpense({
        user_id: userId,
        category_id: foodCategoryId,
        amount: 35.5,
        currency: 'PEN',
        description: 'almuerzo test',
        merchant: 'Test Restaurant',
        date: '2026-02-26',
        source: 'text',
        raw_input: 'almuerzo 35.50 test restaurant',
        image_url: null,
        ai_confidence: 0.95,
      });

      expect(expense).toHaveProperty('id');
      expect(Number(expense.amount)).toBe(35.5);
      expect(expense.description).toBe('almuerzo test');
      expect(expense.merchant).toBe('Test Restaurant');
      expect(expense.deleted_at).toBeNull();

      expenseId = expense.id;
      testExpenseIds.push(expenseId);
    });

    it('getExpenseById returns the inserted expense', async () => {
      const expense = await getExpenseById(expenseId);
      expect(expense).not.toBeNull();
      expect(expense!.id).toBe(expenseId);
      expect(Number(expense!.amount)).toBe(35.5);
    });

    it('getLastExpense returns the most recent expense', async () => {
      const expense = await getLastExpense(userId);
      expect(expense).not.toBeNull();
      expect(expense!.id).toBe(expenseId);
    });

    it('updateExpense modifies fields and returns updated row', async () => {
      const updated = await updateExpense(expenseId, {
        amount: 42,
        category_id: transportCategoryId,
      });

      expect(Number(updated.amount)).toBe(42);
      expect(updated.category_id).toBe(transportCategoryId);
      expect(updated.description).toBe('almuerzo test'); // unchanged
    });

    it('softDeleteExpense sets deleted_at', async () => {
      const deleted = await softDeleteExpense(expenseId);
      expect(deleted.deleted_at).not.toBeNull();
    });

    it('getExpenseById returns null for soft-deleted expense', async () => {
      const expense = await getExpenseById(expenseId);
      expect(expense).toBeNull();
    });

    it('getLastExpense skips soft-deleted expenses', async () => {
      const last = await getLastExpense(userId);
      // If there are no other active expenses, last is null
      // If there are, it must not be our soft-deleted one
      if (last) {
        expect(last.id).not.toBe(expenseId);
        expect(last.deleted_at).toBeNull();
      } else {
        expect(last).toBeNull();
      }
    });
  });

  describe('getMonthlyClosingData', () => {
    let closingExpenseIds: string[] = [];

    beforeAll(async () => {
      // Insert test expenses for a known month (2025-01) and previous month (2024-12)
      const jan1 = await insertExpense({
        user_id: userId,
        category_id: foodCategoryId,
        amount: 100,
        currency: 'PEN',
        description: 'closing test jan food',
        merchant: null,
        date: '2025-01-10',
        source: 'text',
        raw_input: 'test',
        image_url: null,
        ai_confidence: 0.9,
        payment_type: null,
        payment_method_name: null,
      });
      const jan2 = await insertExpense({
        user_id: userId,
        category_id: transportCategoryId,
        amount: 50,
        currency: 'PEN',
        description: 'closing test jan transport',
        merchant: null,
        date: '2025-01-20',
        source: 'text',
        raw_input: 'test',
        image_url: null,
        ai_confidence: 0.9,
        payment_type: null,
        payment_method_name: null,
      });
      const dec1 = await insertExpense({
        user_id: userId,
        category_id: foodCategoryId,
        amount: 200,
        currency: 'PEN',
        description: 'closing test dec food',
        merchant: null,
        date: '2024-12-15',
        source: 'text',
        raw_input: 'test',
        image_url: null,
        ai_confidence: 0.9,
        payment_type: null,
        payment_method_name: null,
      });
      closingExpenseIds = [jan1.id, jan2.id, dec1.id];
      testExpenseIds.push(...closingExpenseIds);
    });

    it('returns correct totals and category breakdown for target month', async () => {
      const data = await getMonthlyClosingData(userId, 2025, 1);

      expect(data.year).toBe(2025);
      expect(data.month).toBe(1);
      // At least our 150 from test expenses (there may be others)
      expect(data.total).toBeGreaterThanOrEqual(150);
      // Category breakdown should include food and transport
      const food = data.byCategory.find((c) => c.slug === 'food_dining');
      const transport = data.byCategory.find((c) => c.slug === 'transport');
      expect(food).toBeDefined();
      expect(food!.total).toBeGreaterThanOrEqual(100);
      expect(transport).toBeDefined();
      expect(transport!.total).toBeGreaterThanOrEqual(50);
      // Sorted descending by total
      for (let i = 1; i < data.byCategory.length; i++) {
        expect(data.byCategory[i - 1].total).toBeGreaterThanOrEqual(data.byCategory[i].total);
      }
    });

    it('returns previous month total', async () => {
      const data = await getMonthlyClosingData(userId, 2025, 1);
      // December 2024 has at least our 200 test expense
      expect(data.previousMonthTotal).toBeGreaterThanOrEqual(200);
    });

    it('returns budgets array', async () => {
      const data = await getMonthlyClosingData(userId, 2025, 1);
      expect(Array.isArray(data.budgets)).toBe(true);
    });

    it('handles month with no expenses', async () => {
      const data = await getMonthlyClosingData(userId, 2020, 6);
      expect(data.total).toBe(0);
      expect(data.byCategory).toHaveLength(0);
      expect(data.previousMonthTotal).toBe(0);
    });

    it('handles year boundary correctly (January → previous December)', async () => {
      const data = await getMonthlyClosingData(userId, 2025, 1);
      // Previous month of Jan 2025 = Dec 2024
      expect(data.previousMonthTotal).toBeGreaterThanOrEqual(200);
    });
  });

  describe('financial rules: insert → getActive → delete', () => {
    let ruleId: string;

    it('insertRule creates a spending_limit rule', async () => {
      const rule = await insertRule(
        userId,
        'Limite comida diario',
        'spending_limit',
        foodCategoryId,
        100,
        'daily',
        null,
      );

      expect(rule).toHaveProperty('id');
      expect(rule.user_id).toBe(userId);
      expect(rule.name).toBe('Limite comida diario');
      expect(rule.rule_type).toBe('spending_limit');
      expect(rule.category_id).toBe(foodCategoryId);
      expect(Number(rule.threshold)).toBe(100);
      expect(rule.period).toBe('daily');
      expect(rule.action_value).toBeNull();
      expect(rule.is_active).toBe(true);

      ruleId = rule.id;
      testRuleIds.push(ruleId);
    });

    it('insertRule creates a prohibition rule with no category', async () => {
      const rule = await insertRule(
        userId,
        'No gastar fines de semana',
        'prohibition',
        null,
        null,
        null,
        'No gastes los fines de semana',
      );

      expect(rule.rule_type).toBe('prohibition');
      expect(rule.category_id).toBeNull();
      expect(rule.threshold).toBeNull();
      expect(rule.period).toBeNull();
      expect(rule.action_value).toBe('No gastes los fines de semana');
      expect(rule.is_active).toBe(true);

      testRuleIds.push(rule.id);
    });

    it('insertRule creates a payment_default rule', async () => {
      const rule = await insertRule(
        userId,
        'Comida siempre con Yape',
        'payment_default',
        foodCategoryId,
        null,
        null,
        'digital_wallet:Yape',
      );

      expect(rule.rule_type).toBe('payment_default');
      expect(rule.action_value).toBe('digital_wallet:Yape');

      testRuleIds.push(rule.id);
    });

    it('getActiveRules returns all active rules for user', async () => {
      const rules = await getActiveRules(userId);
      expect(rules.length).toBeGreaterThanOrEqual(3);

      const names = rules.map((r) => r.name);
      expect(names).toContain('Limite comida diario');
      expect(names).toContain('No gastar fines de semana');
      expect(names).toContain('Comida siempre con Yape');

      // Sorted by created_at ascending
      for (let i = 1; i < rules.length; i++) {
        expect(rules[i - 1].created_at <= rules[i].created_at).toBe(true);
      }
    });

    it('getActiveRules returns empty array for user with no rules', async () => {
      // Use a fake UUID that won't match any user
      const rules = await getActiveRules('00000000-0000-0000-0000-000000000000');
      expect(rules).toEqual([]);
    });

    it('deleteRule removes the rule', async () => {
      await deleteRule(userId, ruleId);

      const rules = await getActiveRules(userId);
      const found = rules.find((r) => r.id === ruleId);
      expect(found).toBeUndefined();

      // Remove from cleanup array
      const idx = testRuleIds.indexOf(ruleId);
      if (idx >= 0) testRuleIds.splice(idx, 1);
    });

    it('deleteRule is a no-op for non-existent rule', async () => {
      // Should not throw
      await deleteRule(userId, '00000000-0000-0000-0000-000000000000');
    });

    it('deleteRule scoped to user — cannot delete another user rule', async () => {
      const rule = await insertRule(
        userId,
        'Rule to test scope',
        'habit',
        null,
        null,
        'weekly',
        'Revisa tus gastos',
      );
      testRuleIds.push(rule.id);

      // Try to delete with a different user_id — should be no-op
      await deleteRule('00000000-0000-0000-0000-000000000000', rule.id);

      const rules = await getActiveRules(userId);
      const found = rules.find((r) => r.id === rule.id);
      expect(found).toBeDefined();
    });
  });

  describe('receipt items: insert → get → empty', () => {
    let receiptExpenseId: string;

    beforeAll(async () => {
      const expense = await insertExpense({
        user_id: userId,
        category_id: foodCategoryId,
        amount: 85.5,
        currency: 'PEN',
        description: 'supermercado receipt',
        merchant: 'Plaza Vea',
        date: '2026-03-05',
        source: 'image',
        raw_input: 'receipt image',
        image_url: null,
        ai_confidence: 0.88,
        payment_type: null,
        payment_method_name: null,
      });
      receiptExpenseId = expense.id;
      testExpenseIds.push(receiptExpenseId);
    });

    it('insertReceiptItems stores items and returns them', async () => {
      const items = await insertReceiptItems(receiptExpenseId, [
        { description: 'Leche Gloria 1L', quantity: 2, unit_price: 5.5, total: 11, subcategory: 'lacteos' },
        { description: 'Pan integral', quantity: 1, unit_price: 4.5, total: 4.5, subcategory: 'panaderia' },
        { description: 'Detergente Ace', quantity: 1, unit_price: 12, total: 12, subcategory: 'limpieza' },
      ]);

      expect(items).toHaveLength(3);
      expect(items[0]).toHaveProperty('id');
      expect(items[0]).toHaveProperty('created_at');
      expect(items[0].expense_id).toBe(receiptExpenseId);
      expect(items[0].description).toBe('Leche Gloria 1L');
      expect(Number(items[0].quantity)).toBe(2);
      expect(Number(items[0].unit_price)).toBe(5.5);
      expect(Number(items[0].total)).toBe(11);
      expect(items[0].subcategory).toBe('lacteos');
    });

    it('getReceiptItems returns all items for an expense', async () => {
      const items = await getReceiptItems(receiptExpenseId);
      expect(items).toHaveLength(3);
      const descriptions = items.map((i) => i.description);
      expect(descriptions).toContain('Leche Gloria 1L');
      expect(descriptions).toContain('Pan integral');
      expect(descriptions).toContain('Detergente Ace');
    });

    it('getReceiptItems returns empty array for expense with no items', async () => {
      // Use a different expense that has no receipt items
      const expense = await insertExpense({
        user_id: userId,
        category_id: foodCategoryId,
        amount: 10,
        currency: 'PEN',
        description: 'no items expense',
        merchant: null,
        date: '2026-03-05',
        source: 'text',
        raw_input: 'test',
        image_url: null,
        ai_confidence: 0.9,
        payment_type: null,
        payment_method_name: null,
      });
      testExpenseIds.push(expense.id);

      const items = await getReceiptItems(expense.id);
      expect(items).toEqual([]);
    });

    it('insertReceiptItems with empty array returns empty array', async () => {
      const items = await insertReceiptItems(receiptExpenseId, []);
      expect(items).toEqual([]);
    });

    it('insertReceiptItems handles null subcategory', async () => {
      const items = await insertReceiptItems(receiptExpenseId, [
        { description: 'Bolsa plastica', quantity: 1, unit_price: 0.3, total: 0.3, subcategory: null },
      ]);
      expect(items).toHaveLength(1);
      expect(items[0].subcategory).toBeNull();
    });
  });
});
