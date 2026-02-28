import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted before imports) ──────────────────────────────────

vi.mock('../../src/config.js', () => ({
  CONFIDENCE_AUTO_LOG: 0.85,
  CONFIDENCE_CONFIRM: 0.6,
  STATE_TTL_MS: 300_000,
  DEFAULT_CURRENCY: 'PEN',
  DEFAULT_TIMEZONE: 'America/Lima',
}));

vi.mock('../../src/parse.js', () => ({
  parseMessage: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({
  getUserByPhone: vi.fn(),
  getCategories: vi.fn(),
  getCategoryBySlug: vi.fn(),
  insertExpense: vi.fn(),
  getExpenseById: vi.fn(),
  getLastExpense: vi.fn(),
  updateExpense: vi.fn(),
  softDeleteExpense: vi.fn(),
}));

import { handleMessage } from '../../src/handler.js';
import { parseMessage } from '../../src/parse.js';
import {
  getUserByPhone,
  getCategories,
  getCategoryBySlug,
  insertExpense,
  getExpenseById,
  getLastExpense,
  updateExpense,
  softDeleteExpense,
} from '../../src/db.js';
import { getState, setState, clearState } from '../../src/state.js';
import { formatHelp, formatError, formatNoExpenseToModify } from '../../src/formatter.js';
import type {
  User,
  Category,
  Expense,
  ParseResult,
  PendingExpense,
} from '../../src/types.js';

// ── Test Helpers ────────────────────────────────────────────────────

const PHONE = '+51999888777';

const mockUser: User = {
  id: 'user-1',
  phone: PHONE,
  name: 'Test User',
  currency: 'PEN',
  timezone: 'America/Lima',
  created_at: '2026-01-01T00:00:00Z',
};

const mockCategories: Category[] = [
  {
    id: 'cat-food',
    user_id: 'user-1',
    name: 'Food & Dining',
    slug: 'food_dining',
    icon: '🍽',
    is_default: true,
  },
  {
    id: 'cat-transport',
    user_id: 'user-1',
    name: 'Transport',
    slug: 'transport',
    icon: '🚗',
    is_default: true,
  },
  {
    id: 'cat-other',
    user_id: 'user-1',
    name: 'Other',
    slug: 'other',
    icon: '📦',
    is_default: true,
  },
];

function makeParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    intent: 'log_expense',
    confidence: 0.95,
    amount: 35,
    currency: 'PEN',
    category_slug: 'food_dining',
    description: 'almuerzo',
    merchant: null,
    date: '2026-02-27',
    period: null,
    correction_field: null,
    error_message: null,
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-new',
    user_id: 'user-1',
    category_id: 'cat-food',
    amount: 35,
    currency: 'PEN',
    description: 'almuerzo',
    merchant: null,
    date: '2026-02-27',
    source: 'text',
    raw_input: 'almuerzo 35 soles',
    image_url: null,
    ai_confidence: 0.95,
    deleted_at: null,
    created_at: '2026-02-27T12:00:00Z',
    ...overrides,
  };
}

function makePendingExpense(
  overrides: Partial<PendingExpense> = {},
): PendingExpense {
  return {
    amount: 35,
    currency: 'PEN',
    category_slug: 'food_dining',
    description: 'almuerzo',
    merchant: null,
    date: '2026-02-27',
    source: 'text',
    raw_input: 'almuerzo 35 soles',
    image_url: null,
    ai_confidence: 0.9,
    ...overrides,
  };
}

// ── Setup ───────────────────────────────────────────────────────────

const mockedGetUserByPhone = getUserByPhone as ReturnType<typeof vi.fn>;
const mockedGetCategories = getCategories as ReturnType<typeof vi.fn>;
const mockedGetCategoryBySlug = getCategoryBySlug as ReturnType<typeof vi.fn>;
const mockedInsertExpense = insertExpense as ReturnType<typeof vi.fn>;
const mockedGetExpenseById = getExpenseById as ReturnType<typeof vi.fn>;
const mockedGetLastExpense = getLastExpense as ReturnType<typeof vi.fn>;
const mockedUpdateExpense = updateExpense as ReturnType<typeof vi.fn>;
const mockedSoftDeleteExpense = softDeleteExpense as ReturnType<typeof vi.fn>;
const mockedParseMessage = parseMessage as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  clearState(PHONE);

  // Default mocks: known user with categories
  mockedGetUserByPhone.mockResolvedValue(mockUser);
  mockedGetCategories.mockResolvedValue(mockCategories);
  mockedGetCategoryBySlug.mockImplementation(
    async (_userId: string, slug: string) =>
      mockCategories.find((c) => c.slug === slug) ?? null,
  );
  mockedInsertExpense.mockImplementation(async (data: Omit<Expense, 'id' | 'deleted_at' | 'created_at'>) =>
    makeExpense({
      ...data,
      id: 'exp-new',
      deleted_at: null,
      created_at: '2026-02-27T12:00:00Z',
    }),
  );
  mockedGetExpenseById.mockResolvedValue(null);
  mockedGetLastExpense.mockResolvedValue(null);
  mockedUpdateExpense.mockImplementation(async (id: string, fields: Partial<Expense>) =>
    makeExpense({ id, ...fields }),
  );
  mockedSoftDeleteExpense.mockImplementation(async (id: string) =>
    makeExpense({ id, deleted_at: new Date().toISOString() }),
  );
});

// ── Tests ───────────────────────────────────────────────────────────

describe('handleMessage', () => {
  describe('user lookup', () => {
    it('returns error for unknown phone number', async () => {
      mockedGetUserByPhone.mockResolvedValue(null);

      const result = await handleMessage(PHONE, 'text', 'hello');

      expect(result).toBe(formatError());
      expect(mockedParseMessage).not.toHaveBeenCalled();
    });
  });

  describe('unsupported message type', () => {
    it('returns error for image messages', async () => {
      const result = await handleMessage(PHONE, 'image', 'https://example.com/photo.jpg');

      expect(result).toBeTruthy();
      expect(mockedParseMessage).not.toHaveBeenCalled();
    });
  });

  describe('log_expense — high confidence (auto-log)', () => {
    it('auto-logs expense when confidence >= 0.85', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95 }),
      );

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35 soles');

      expect(result).toContain('✅');
      expect(result).toContain('S/35.00');
      expect(result).toContain('Food & Dining');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });

    it('sets state to expense_logged with lastExpenseId', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95 }),
      );

      await handleMessage(PHONE, 'text', 'almuerzo 35 soles');

      const state = getState(PHONE);
      expect(state).not.toBeNull();
      expect(state!.lastAction).toBe('expense_logged');
      expect(state!.lastExpenseId).toBe('exp-new');
      expect(state!.pendingExpense).toBeNull();
    });

    it('resolves category from slug', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.9,
          category_slug: 'transport',
          description: 'uber',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'uber 23.5');

      expect(result).toContain('Transport');
      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: 'cat-transport' }),
      );
    });

    it('asks for clarification when category slug is null even at high confidence', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.9,
          category_slug: null,
          description: 'something',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'something 50');

      expect(mockedInsertExpense).not.toHaveBeenCalled();
      expect(result).toContain('What was it for?');
    });

    it('defaults to "other" when slug is not found', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.9,
          category_slug: 'nonexistent_category',
        }),
      );
      mockedGetCategoryBySlug.mockResolvedValue(null);

      await handleMessage(PHONE, 'text', 'random 35');

      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: 'cat-other' }),
      );
    });

    it('uses user currency when parse result currency is null', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.9, currency: null }),
      );

      await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'PEN' }),
      );
    });

    it('passes raw_input to insertExpense', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.9 }),
      );

      await handleMessage(PHONE, 'text', 'almuerzo 35 soles');

      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ raw_input: 'almuerzo 35 soles' }),
      );
    });

    it('sets source to text', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.9 }),
      );

      await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'text' }),
      );
    });
  });

  describe('log_expense — mid confidence (confirmation)', () => {
    it('asks for confirmation when 0.6 <= confidence < 0.85', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.7 }),
      );

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35 soles');

      expect(result).toContain('S/35.00');
      expect(result).toContain('Food & Dining');
      expect(result).toMatch(/log it\?/i);
      expect(mockedInsertExpense).not.toHaveBeenCalled();
    });

    it('sets state to awaiting_confirmation with pending expense', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.7 }),
      );

      await handleMessage(PHONE, 'text', 'almuerzo 35 soles');

      const state = getState(PHONE);
      expect(state).not.toBeNull();
      expect(state!.lastAction).toBe('awaiting_confirmation');
      expect(state!.pendingExpense).not.toBeNull();
      expect(state!.pendingExpense!.amount).toBe(35);
      expect(state!.pendingExpense!.category_slug).toBe('food_dining');
    });

    it('includes description in confirmation message when present', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.7, description: 'almuerzo', merchant: 'Wong' }),
      );

      const result = await handleMessage(PHONE, 'text', 'almuerzo at wong 35');

      expect(result).toContain('almuerzo');
      expect(result).toContain('Wong');
    });

    it('asks confirmation at exactly 0.6 confidence', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.6 }),
      );

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toMatch(/log it\?/i);
      expect(mockedInsertExpense).not.toHaveBeenCalled();
    });
  });

  describe('log_expense — low confidence (clarification)', () => {
    it('asks for clarification when confidence < 0.6', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.4, amount: 50, description: null }),
      );

      const result = await handleMessage(PHONE, 'text', 'spent 50');

      expect(result).toContain('S/50.00');
      expect(result).toContain('?');
      expect(mockedInsertExpense).not.toHaveBeenCalled();
    });

    it('sets state to awaiting_description', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.4, amount: 50 }),
      );

      await handleMessage(PHONE, 'text', 'spent 50');

      const state = getState(PHONE);
      expect(state).not.toBeNull();
      expect(state!.lastAction).toBe('awaiting_description');
      expect(state!.pendingExpense).not.toBeNull();
      expect(state!.pendingExpense!.amount).toBe(50);
    });
  });

  describe('awaiting_confirmation flow', () => {
    beforeEach(() => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense(),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });
    });

    it('logs expense when user confirms with "yes"', async () => {
      const result = await handleMessage(PHONE, 'text', 'yes');

      expect(result).toContain('✅');
      expect(result).toContain('S/35.00');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });

    it('logs expense when user confirms with "si"', async () => {
      const result = await handleMessage(PHONE, 'text', 'si');

      expect(result).toContain('✅');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });

    it('logs expense when user confirms with "sí" (accented)', async () => {
      const result = await handleMessage(PHONE, 'text', 'sí');

      expect(result).toContain('✅');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });

    it('logs expense when user confirms with "ok"', async () => {
      const result = await handleMessage(PHONE, 'text', 'ok');

      expect(result).toContain('✅');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });

    it('sets state to expense_logged after confirmation', async () => {
      await handleMessage(PHONE, 'text', 'yes');

      const state = getState(PHONE);
      expect(state).not.toBeNull();
      expect(state!.lastAction).toBe('expense_logged');
      expect(state!.lastExpenseId).toBe('exp-new');
      expect(state!.pendingExpense).toBeNull();
    });

    it('clears state and re-parses when user does not confirm', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.95,
          description: 'uber',
          category_slug: 'transport',
          amount: 23.5,
        }),
      );

      const result = await handleMessage(
        PHONE,
        'text',
        'no, uber 23.5',
      );

      // Should have re-parsed and auto-logged the new expense
      expect(mockedParseMessage).toHaveBeenCalledOnce();
      expect(result).toContain('✅');
      expect(result).toContain('Transport');
    });

    it('handles confirmation with whitespace', async () => {
      const result = await handleMessage(PHONE, 'text', '  yes  ');

      expect(result).toContain('✅');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });

    it('handles case-insensitive confirmation', async () => {
      const result = await handleMessage(PHONE, 'text', 'YES');

      expect(result).toContain('✅');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });
  });

  describe('awaiting_description flow', () => {
    beforeEach(() => {
      setState(PHONE, {
        lastAction: 'awaiting_description',
        pendingExpense: makePendingExpense({
          amount: 50,
          description: null,
          category_slug: null,
        }),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });
    });

    it('completes expense with user reply as description', async () => {
      const result = await handleMessage(PHONE, 'text', 'groceries');

      expect(result).toContain('✅');
      expect(result).toContain('S/50.00');
      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'groceries' }),
      );
    });

    it('sets state to expense_logged after completing', async () => {
      await handleMessage(PHONE, 'text', 'groceries');

      const state = getState(PHONE);
      expect(state).not.toBeNull();
      expect(state!.lastAction).toBe('expense_logged');
      expect(state!.lastExpenseId).toBe('exp-new');
    });

    it('defaults to "other" category when pending has no slug', async () => {
      await handleMessage(PHONE, 'text', 'something random');

      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: 'cat-other' }),
      );
    });
  });

  describe('help intent', () => {
    it('returns help text', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'help', confidence: 0.99 }),
      );

      const result = await handleMessage(PHONE, 'text', 'help');

      expect(result).toBe(formatHelp());
    });
  });

  describe('unknown / error intents', () => {
    it('returns error for unknown intent', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'unknown', confidence: 0 }),
      );

      const result = await handleMessage(PHONE, 'text', 'asdfghjk');

      expect(result).toBe(formatError());
    });

    it('returns error for error intent', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'error',
          confidence: 0,
          error_message: 'parse failed',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'bad input');

      expect(result).toBe(formatError());
    });
  });

  describe('correct_expense flow', () => {
    it('corrects category when lastExpenseId is in state', async () => {
      // Set state as if expense was just logged
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-food' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          confidence: 0.9,
          correction_field: 'category',
          category_slug: 'transport',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'wrong, it was transport');

      expect(result).toContain('Updated');
      expect(result).toContain('Transport');
      expect(result).toContain('was:');
      expect(result).toContain('Food & Dining');
      expect(mockedUpdateExpense).toHaveBeenCalledWith('exp-1', { category_id: 'cat-transport' });
    });

    it('corrects amount when lastExpenseId is in state', async () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', amount: 35, category_id: 'cat-food' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          confidence: 0.9,
          correction_field: 'amount',
          amount: 40,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'no era 40');

      expect(result).toContain('Updated');
      expect(result).toContain('S/40.00');
      expect(result).toContain('was:');
      expect(result).toContain('S/35.00');
      expect(mockedUpdateExpense).toHaveBeenCalledWith('exp-1', { amount: 40 });
    });

    it('falls back to getLastExpense when no state exists', async () => {
      mockedGetLastExpense.mockResolvedValue(
        makeExpense({ id: 'exp-last', category_id: 'cat-food' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          confidence: 0.9,
          correction_field: 'category',
          category_slug: 'transport',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'wrong, it was transport');

      expect(result).toContain('Updated');
      expect(mockedGetLastExpense).toHaveBeenCalledWith('user-1');
      expect(mockedUpdateExpense).toHaveBeenCalledWith('exp-last', { category_id: 'cat-transport' });
    });

    it('returns error when no prior expense exists', async () => {
      mockedGetExpenseById.mockResolvedValue(null);
      mockedGetLastExpense.mockResolvedValue(null);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          confidence: 0.9,
          correction_field: 'category',
          category_slug: 'transport',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'wrong, it was transport');

      expect(result).toBe(formatNoExpenseToModify());
      expect(mockedUpdateExpense).not.toHaveBeenCalled();
    });

    it('updates state with corrected expense id', async () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-food' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          confidence: 0.9,
          correction_field: 'category',
          category_slug: 'transport',
        }),
      );

      await handleMessage(PHONE, 'text', 'wrong, it was transport');

      const state = getState(PHONE);
      expect(state).not.toBeNull();
      expect(state!.lastAction).toBe('expense_logged');
      expect(state!.lastExpenseId).toBe('exp-1');
    });
  });

  describe('delete_expense flow', () => {
    it('soft-deletes expense when lastExpenseId is in state', async () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-food' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'delete_expense', confidence: 0.9 }),
      );

      const result = await handleMessage(PHONE, 'text', 'delete that');

      expect(result).toContain('Deleted');
      expect(result).toContain('S/35.00');
      expect(result).toContain('Food & Dining');
      expect(mockedSoftDeleteExpense).toHaveBeenCalledWith('exp-1');
    });

    it('clears lastExpenseId from state after deletion', async () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-food' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'delete_expense', confidence: 0.9 }),
      );

      await handleMessage(PHONE, 'text', 'delete that');

      const state = getState(PHONE);
      expect(state).not.toBeNull();
      expect(state!.lastExpenseId).toBeNull();
    });

    it('returns error when no prior expense exists', async () => {
      mockedGetExpenseById.mockResolvedValue(null);
      mockedGetLastExpense.mockResolvedValue(null);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'delete_expense', confidence: 0.9 }),
      );

      const result = await handleMessage(PHONE, 'text', 'delete that');

      expect(result).toBe(formatNoExpenseToModify());
      expect(mockedSoftDeleteExpense).not.toHaveBeenCalled();
    });

    it('cannot delete the same expense twice', async () => {
      // First deletion
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-food' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'delete_expense', confidence: 0.9 }),
      );
      await handleMessage(PHONE, 'text', 'delete that');

      // State now has lastExpenseId: null
      // Second deletion — no expense to delete
      mockedGetExpenseById.mockResolvedValue(null);
      mockedGetLastExpense.mockResolvedValue(null);
      const result = await handleMessage(PHONE, 'text', 'delete that');

      expect(result).toBe(formatNoExpenseToModify());
      expect(mockedSoftDeleteExpense).toHaveBeenCalledTimes(1);
    });

    it('falls back to getLastExpense when no state exists', async () => {
      mockedGetLastExpense.mockResolvedValue(
        makeExpense({ id: 'exp-last', category_id: 'cat-food' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'delete_expense', confidence: 0.9 }),
      );

      const result = await handleMessage(PHONE, 'text', 'borra eso');

      expect(result).toContain('Deleted');
      expect(mockedGetLastExpense).toHaveBeenCalledWith('user-1');
      expect(mockedSoftDeleteExpense).toHaveBeenCalledWith('exp-last');
    });
  });

  describe('unimplemented intents (Phase 4)', () => {
    it('returns error for query_summary intent', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'query_summary', confidence: 0.9 }),
      );

      const result = await handleMessage(PHONE, 'text', 'how much this week?');

      expect(result).toBe(formatError());
    });

    it('returns error for set_budget intent', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'set_budget', confidence: 0.9 }),
      );

      const result = await handleMessage(PHONE, 'text', 'set food budget 800');

      expect(result).toBe(formatError());
    });
  });
});
