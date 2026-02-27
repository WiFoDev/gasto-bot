import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Ensure config.ts doesn't throw on missing KAPSO_WEBHOOK_SECRET
process.env.KAPSO_WEBHOOK_SECRET = process.env.KAPSO_WEBHOOK_SECRET || 'test-secret';

const {
  getUserByPhone,
  getCategories,
  getCategoryBySlug,
  insertExpense,
  getExpenseById,
  getLastExpense,
  updateExpense,
  softDeleteExpense,
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
    // Hard-delete all test expenses
    if (testExpenseIds.length > 0) {
      await supabase.from('expenses').delete().in('id', testExpenseIds);
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
});
