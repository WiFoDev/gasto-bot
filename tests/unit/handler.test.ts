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

vi.mock('../../src/parse-image.js', () => ({
  parseReceipt: vi.fn(),
}));

vi.mock('../../src/storage.js', () => ({
  downloadImage: vi.fn(),
  uploadImage: vi.fn(),
}));

vi.mock('../../src/db.js', () => ({
  getUserByPhone: vi.fn(),
  getCategories: vi.fn(),
  getCategoryBySlug: vi.fn(),
  insertCategory: vi.fn(),
  deleteCategory: vi.fn(),
  insertExpense: vi.fn(),
  getExpenseById: vi.fn(),
  getLastExpense: vi.fn(),
  updateExpense: vi.fn(),
  softDeleteExpense: vi.fn(),
  upsertBudget: vi.fn(),
  getBudget: vi.fn(),
  getExpensesTotal: vi.fn(),
  getDateRange: vi.fn(),
  getExpensesSummary: vi.fn(),
}));

import { handleMessage } from '../../src/handler.js';
import { parseMessage } from '../../src/parse.js';
import { parseReceipt } from '../../src/parse-image.js';
import { downloadImage, uploadImage } from '../../src/storage.js';
import {
  getUserByPhone,
  getCategories,
  getCategoryBySlug,
  insertCategory,
  insertExpense,
  getExpenseById,
  getLastExpense,
  updateExpense,
  softDeleteExpense,
  upsertBudget,
  getBudget,
  getExpensesTotal,
  getDateRange,
  getExpensesSummary,
} from '../../src/db.js';
import { getState, setState, clearState } from '../../src/state.js';
import { formatHelp, formatError, formatUnknown, formatParseError, formatDatabaseError, formatNoExpenseToModify, formatReceiptUnclear, formatUnknownUser, formatExpenseCancelled, formatMerchantCorrection, formatCorrectionGeneric } from '../../src/formatter.js';
import type {
  User,
  Category,
  Expense,
  Budget,
  ParseResult,
  PendingExpense,
  ReceiptResult,
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
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cat-transport',
    user_id: 'user-1',
    name: 'Transport',
    slug: 'transport',
    icon: '🚗',
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cat-groceries',
    user_id: 'user-1',
    name: 'Groceries',
    slug: 'groceries',
    icon: '🛒',
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cat-other',
    user_id: 'user-1',
    name: 'Other',
    slug: 'other',
    icon: '📦',
    is_default: true,
    created_at: '2026-01-01T00:00:00Z',
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
    suggested_category_name: null,
    payment_type: null,
    payment_method_name: null,
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
    payment_type: null,
    payment_method_name: null,
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
    suggested_category_name: null,
    description: 'almuerzo',
    merchant: null,
    date: '2026-02-27',
    source: 'text',
    raw_input: 'almuerzo 35 soles',
    image_url: null,
    ai_confidence: 0.9,
    payment_type: null,
    payment_method_name: null,
    ...overrides,
  };
}

// ── Setup ───────────────────────────────────────────────────────────

const mockedGetUserByPhone = getUserByPhone as ReturnType<typeof vi.fn>;
const mockedGetCategories = getCategories as ReturnType<typeof vi.fn>;
const mockedGetCategoryBySlug = getCategoryBySlug as ReturnType<typeof vi.fn>;
const mockedInsertCategory = insertCategory as ReturnType<typeof vi.fn>;
const mockedInsertExpense = insertExpense as ReturnType<typeof vi.fn>;
const mockedGetExpenseById = getExpenseById as ReturnType<typeof vi.fn>;
const mockedGetLastExpense = getLastExpense as ReturnType<typeof vi.fn>;
const mockedUpdateExpense = updateExpense as ReturnType<typeof vi.fn>;
const mockedSoftDeleteExpense = softDeleteExpense as ReturnType<typeof vi.fn>;
const mockedGetDateRange = getDateRange as ReturnType<typeof vi.fn>;
const mockedGetExpensesSummary = getExpensesSummary as ReturnType<typeof vi.fn>;
const mockedParseMessage = parseMessage as ReturnType<typeof vi.fn>;
const mockedUpsertBudget = upsertBudget as ReturnType<typeof vi.fn>;
const mockedGetBudget = getBudget as ReturnType<typeof vi.fn>;
const mockedGetExpensesTotal = getExpensesTotal as ReturnType<typeof vi.fn>;
const mockedParseReceipt = parseReceipt as ReturnType<typeof vi.fn>;
const mockedDownloadImage = downloadImage as ReturnType<typeof vi.fn>;
const mockedUploadImage = uploadImage as ReturnType<typeof vi.fn>;

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1',
    user_id: 'user-1',
    category_id: 'cat-food',
    amount: 800,
    currency: 'PEN',
    period: 'monthly',
    start_date: '2026-02-01',
    created_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

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
  mockedUpsertBudget.mockResolvedValue(makeBudget());
  mockedGetBudget.mockResolvedValue(null);
  mockedGetExpensesTotal.mockResolvedValue(0);
  mockedDownloadImage.mockResolvedValue({
    buffer: Buffer.from('fake-image'),
    contentType: 'image/jpeg',
  });
  mockedUploadImage.mockResolvedValue('https://storage.example.com/receipts/test.jpg');
  mockedParseReceipt.mockResolvedValue({
    merchant: 'Plaza Vea',
    amount: 127.5,
    currency: 'PEN',
    date: '2026-02-27',
    confidence: 0.85,
  } satisfies ReceiptResult);
  mockedGetDateRange.mockReturnValue({ start: '2026-02-24', end: '2026-02-27' });
  mockedGetExpensesSummary.mockResolvedValue({
    total: 342.5,
    byCategory: [
      { slug: 'food_dining', name: 'Food & Dining', icon: '🍽', total: 185 },
      { slug: 'transport', name: 'Transport', icon: '🚗', total: 87.5 },
      { slug: 'groceries', name: 'Groceries', icon: '🛒', total: 70 },
    ],
    startDate: '2026-02-24',
    endDate: '2026-02-27',
  });
});

// ── Tests ───────────────────────────────────────────────────────────

describe('handleMessage', () => {
  describe('user lookup', () => {
    it('returns personal bot message for unknown phone number', async () => {
      mockedGetUserByPhone.mockResolvedValue(null);

      const result = await handleMessage(PHONE, 'text', 'hello');

      expect(result).toBe(formatUnknownUser());
      expect(result).toBe('Este es un bot personal.');
      expect(mockedParseMessage).not.toHaveBeenCalled();
    });
  });

  describe('image message — receipt flow', () => {
    const IMAGE_URL = 'https://media.kapso.ai/image123.jpg';

    it('downloads image, parses receipt, and asks for confirmation when confidence >= 0.7', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Plaza Vea',
        amount: 127.5,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.85,
      });

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(mockedDownloadImage).toHaveBeenCalledWith(IMAGE_URL);
      expect(mockedParseReceipt).toHaveBeenCalled();
      expect(mockedUploadImage).toHaveBeenCalled();
      expect(result).toContain('🧾');
      expect(result).toContain('Plaza Vea');
      expect(result).toContain('S/127.50');
      expect(result).toContain('¿Está bien?');
      expect(mockedInsertExpense).not.toHaveBeenCalled();
    });

    it('sets state to awaiting_confirmation for high-confidence receipt', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Wong',
        amount: 85,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.8,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);

      const state = getState(PHONE);
      expect(state).not.toBeNull();
      expect(state!.lastAction).toBe('awaiting_confirmation');
      expect(state!.pendingExpense).not.toBeNull();
      expect(state!.pendingExpense!.amount).toBe(85);
      expect(state!.pendingExpense!.source).toBe('image');
      expect(state!.pendingExpense!.merchant).toBe('Wong');
      expect(state!.pendingExpense!.image_url).toBe('https://storage.example.com/receipts/test.jpg');
    });

    it('asks for details when receipt confidence < 0.7', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: null,
        amount: null,
        currency: null,
        date: null,
        confidence: 0.3,
      });

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(result).toBe(formatReceiptUnclear());
    });

    it('sets state to awaiting_description for low-confidence receipt', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: null,
        amount: 50,
        currency: 'PEN',
        date: null,
        confidence: 0.5,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);

      const state = getState(PHONE);
      expect(state).not.toBeNull();
      expect(state!.lastAction).toBe('awaiting_description');
      expect(state!.pendingExpense).not.toBeNull();
      expect(state!.pendingExpense!.source).toBe('image');
    });

    it('asks for details when amount is null even with high confidence', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Plaza Vea',
        amount: null,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.9,
      });

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(result).toBe(formatReceiptUnclear());
    });

    it('asks for details when amount is zero with high confidence', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Plaza Vea',
        amount: 0,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.9,
      });

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(result).toBe(formatReceiptUnclear());
    });

    it('returns error when image download fails', async () => {
      mockedDownloadImage.mockRejectedValue(new Error('Download failed'));

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(result).toBe(formatError());
      expect(mockedParseReceipt).not.toHaveBeenCalled();
    });

    it('continues without image_url when upload fails', async () => {
      mockedUploadImage.mockRejectedValue(new Error('Upload failed'));
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Wong',
        amount: 100,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.8,
      });

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(result).toContain('🧾');
      expect(result).toContain('Wong');
      const state = getState(PHONE);
      expect(state!.pendingExpense!.image_url).toBeNull();
    });

    it('logs structured error when storage upload fails', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockedUploadImage.mockRejectedValue(new Error('Bucket not found'));
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Metro',
        amount: 55,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.9,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);

      const logCalls = consoleSpy.mock.calls.map(([arg]) => {
        try { return JSON.parse(arg as string); } catch { return null; }
      }).filter(Boolean);
      const storageLog = logCalls.find((l: Record<string, unknown>) => l.event === 'storage_upload_error');
      expect(storageLog).toBeDefined();
      expect(storageLog.error).toBe('Bucket not found');
      expect(storageLog.phone).toBe(PHONE);

      consoleSpy.mockRestore();
    });

    it('does not call parseMessage for image messages', async () => {
      await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(mockedParseMessage).not.toHaveBeenCalled();
    });

    it('confirms receipt and inserts expense with source image', async () => {
      // Step 1: Send image — gets receipt confirmation
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Plaza Vea',
        amount: 127.5,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.85,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);

      // Step 2: Confirm with "yes"
      const result = await handleMessage(PHONE, 'text', 'yes');

      expect(result).toContain('✅');
      expect(result).toContain('S/127.50');
      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'image',
          image_url: 'https://storage.example.com/receipts/test.jpg',
          amount: 127.5,
        }),
      );
    });

    it('sets expense_logged state after receipt confirmation', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Wong',
        amount: 85,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.8,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);
      await handleMessage(PHONE, 'text', 'si');

      const state = getState(PHONE);
      expect(state!.lastAction).toBe('expense_logged');
      expect(state!.lastExpenseId).toBe('exp-new');
    });

    it('handles low-confidence receipt followed by user description', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: null,
        amount: 50,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.4,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);

      // User provides description
      const result = await handleMessage(PHONE, 'text', 'groceries');

      expect(result).toContain('✅');
      expect(result).toContain('S/50.00');
      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'image',
          description: 'groceries',
        }),
      );
    });

    it('uses "other" category by default for receipts', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Random Store',
        amount: 50,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.8,
      });

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(result).toContain('Other');
    });

    it('uses user currency when receipt currency is null', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Store',
        amount: 100,
        currency: null,
        date: '2026-02-27',
        confidence: 0.8,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);

      const state = getState(PHONE);
      expect(state!.pendingExpense!.currency).toBe('PEN');
    });

    it('asks confirmation at exactly 0.7 confidence', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Wong',
        amount: 75,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.7,
      });

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(result).toContain('🧾');
      expect(result).toContain('¿Está bien?');
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
      expect(result).toContain('¿En qué fue?');
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
      expect(result).toContain('¿Lo registro?');
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

      expect(result).toContain('¿Lo registro?');
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

    it('logs expense when user confirms with "sip" (casual Spanish)', async () => {
      const result = await handleMessage(PHONE, 'text', 'sip');

      expect(result).toContain('✅');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });

    it('logs expense when user confirms with "dale"', async () => {
      const result = await handleMessage(PHONE, 'text', 'dale');

      expect(result).toContain('✅');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });

    it('logs expense when user confirms with "claro"', async () => {
      const result = await handleMessage(PHONE, 'text', 'claro');

      expect(result).toContain('✅');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });

    it('cancels expense when user denies with "no"', async () => {
      const result = await handleMessage(PHONE, 'text', 'no');

      expect(result).toBe(formatExpenseCancelled());
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      const state = getState(PHONE);
      expect(state).toBeNull();
    });

    it('cancels expense when user denies with "nope"', async () => {
      const result = await handleMessage(PHONE, 'text', 'nope');

      expect(result).toBe(formatExpenseCancelled());
      expect(mockedInsertExpense).not.toHaveBeenCalled();
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

    it('corrects pending merchant during confirmation and re-shows confirmation', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense({
          amount: 95.6,
          merchant: 'CENCOSUD',
          category_slug: 'other',
        }),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          correction_field: 'merchant',
          merchant: 'Wong',
          category_slug: 'groceries',
          amount: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'Es de Wong');

      expect(result).toContain('S/95.60');
      expect(result).toContain('Groceries');
      expect(result).toContain('¿Lo registro?');
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('awaiting_confirmation');
      expect(state!.pendingExpense!.merchant).toBe('Wong');
      expect(state!.pendingExpense!.category_slug).toBe('groceries');
    });

    it('corrects pending category during confirmation and re-shows confirmation', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense({
          amount: 35,
          category_slug: 'other',
        }),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          correction_field: 'category',
          category_slug: 'food_dining',
          amount: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'es comida');

      expect(result).toContain('Food & Dining');
      expect(result).toContain('¿Lo registro?');
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      const state = getState(PHONE);
      expect(state!.pendingExpense!.category_slug).toBe('food_dining');
    });

    it('corrects multiple fields during confirmation', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense({
          amount: 100,
          merchant: null,
          category_slug: 'other',
        }),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          correction_field: 'merchant',
          merchant: 'Wong',
          category_slug: 'groceries',
          amount: 95.6,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'no, it was Wong groceries 95.60');

      expect(result).toContain('S/95.60');
      expect(result).toContain('Groceries');
      expect(result).toContain('¿Lo registro?');
      const state = getState(PHONE);
      expect(state!.pendingExpense!.amount).toBe(95.6);
      expect(state!.pendingExpense!.merchant).toBe('Wong');
      expect(state!.pendingExpense!.category_slug).toBe('groceries');
    });

    it('passes confirmation context to parseMessage during confirmation', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense({
          amount: 100,
          currency: 'PEN',
          merchant: 'Yape',
          category_slug: 'other',
        }),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          correction_field: 'merchant',
          merchant: 'Faustina Limpieza',
        }),
      );

      await handleMessage(PHONE, 'text', 'Faustina Limpieza');

      expect(mockedParseMessage).toHaveBeenCalledWith(
        'Faustina Limpieza',
        expect.any(Array),
        {
          pendingConfirmation: {
            amount: 100,
            currency: 'PEN',
            merchant: 'Yape',
            category_slug: 'other',
          },
        },
      );
    });

    it('treats amountless log_expense as correction during confirmation (fallback)', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense({
          amount: 100,
          merchant: 'Yape',
          category_slug: 'other',
        }),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'log_expense',
          confidence: 0.5,
          amount: null,
          description: 'Faustina Limpieza',
          merchant: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'Faustina Limpieza');

      // Should stay in confirmation with corrected merchant
      expect(result).toContain('S/100.00');
      expect(result).toContain('¿Lo registro?');
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('awaiting_confirmation');
      expect(state!.pendingExpense!.merchant).toBe('Faustina Limpieza');
      expect(state!.pendingExpense!.amount).toBe(100);
    });

    it('treats unknown intent as correction during confirmation (fallback)', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense({
          amount: 50,
          merchant: null,
          category_slug: 'other',
        }),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'unknown',
          confidence: 0,
          amount: null,
          currency: null,
          category_slug: null,
          description: null,
          merchant: null,
          date: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'Wong');

      expect(result).toContain('S/50.00');
      expect(result).toContain('¿Lo registro?');
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('awaiting_confirmation');
      expect(state!.pendingExpense!.merchant).toBe('Wong');
    });

    it('still falls through for log_expense WITH amount during confirmation', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'log_expense',
          confidence: 0.95,
          amount: 23.5,
          category_slug: 'transport',
          description: 'uber',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'uber 23.5');

      // Should clear state and process as new expense
      expect(result).toContain('✅');
      expect(result).toContain('Transport');
      expect(mockedParseMessage).toHaveBeenCalledOnce();
    });

    it('does not double-parse when falling through with non-correction intent', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'help',
          confidence: 0.95,
          amount: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'help');

      expect(mockedParseMessage).toHaveBeenCalledOnce();
      expect(result).toContain('puedo hacer');
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
    it('returns friendly message for unknown intent', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'unknown', confidence: 0 }),
      );

      const result = await handleMessage(PHONE, 'text', 'asdfghjk');

      expect(result).toBe(formatUnknown());
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

      expect(result).toContain('Actualizado');
      expect(result).toContain('Transport');
      expect(result).toContain('era:');
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

      expect(result).toContain('Actualizado');
      expect(result).toContain('S/40.00');
      expect(result).toContain('era:');
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

      expect(result).toContain('Actualizado');
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

    it('corrects merchant on saved expense', async () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-other', merchant: 'CENCOSUD' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          confidence: 0.9,
          correction_field: 'merchant',
          merchant: 'Wong',
          category_slug: null,
          amount: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'es de Wong');

      expect(result).toContain('Actualizado');
      expect(result).toContain('Wong');
      expect(result).toContain('era: CENCOSUD');
      expect(mockedUpdateExpense).toHaveBeenCalledWith('exp-1', { merchant: 'Wong' });
    });

    it('corrects multiple fields on saved expense', async () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-other', merchant: 'CENCOSUD', amount: 95.6 }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          confidence: 0.9,
          correction_field: 'merchant',
          merchant: 'Wong',
          category_slug: 'groceries',
          amount: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'no, it was Wong, groceries');

      expect(result).toContain('Actualizado');
      expect(result).toContain('Groceries');
      expect(mockedUpdateExpense).toHaveBeenCalledWith('exp-1', {
        merchant: 'Wong',
        category_id: 'cat-groceries',
      });
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

      expect(result).toContain('Eliminado');
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

      expect(result).toContain('Eliminado');
      expect(mockedGetLastExpense).toHaveBeenCalledWith('user-1');
      expect(mockedSoftDeleteExpense).toHaveBeenCalledWith('exp-last');
    });
  });

  describe('query_summary intent', () => {
    it('returns formatted summary for week query', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'query_summary', confidence: 0.9, period: 'week' }),
      );

      const result = await handleMessage(PHONE, 'text', 'how much this week?');

      expect(result).toContain('📊');
      expect(result).toContain('S/342.50');
      expect(result).toContain('Food & Dining');
      expect(mockedGetDateRange).toHaveBeenCalledWith('week', 'America/Lima');
      expect(mockedGetExpensesSummary).toHaveBeenCalledWith('user-1', '2026-02-24', '2026-02-27');
    });

    it('defaults to month when period is null', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'query_summary', confidence: 0.9, period: null }),
      );

      await handleMessage(PHONE, 'text', 'how much have I spent?');

      expect(mockedGetDateRange).toHaveBeenCalledWith('month', 'America/Lima');
    });

    it('returns empty summary message when no expenses', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'query_summary', confidence: 0.9, period: 'today' }),
      );
      mockedGetExpensesSummary.mockResolvedValue({
        total: 0,
        byCategory: [],
        startDate: '2026-02-27',
        endDate: '2026-02-27',
      });

      const result = await handleMessage(PHONE, 'text', 'what did I spend today?');

      expect(result).toContain('Sin gastos registrados.');
    });
  });

  describe('set_budget intent', () => {
    it('sets a monthly budget for a category', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_budget',
          confidence: 0.95,
          amount: 800,
          currency: 'PEN',
          category_slug: 'food_dining',
          period: 'month',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'set food budget 800 monthly');

      expect(result).toContain('💰');
      expect(result).toContain('Food & Dining');
      expect(result).toContain('S/800.00');
      expect(result).toContain('mensual');
      expect(mockedUpsertBudget).toHaveBeenCalledWith(
        'user-1',
        'cat-food',
        800,
        'PEN',
        'monthly',
        expect.any(String),
      );
    });
    it('sets a weekly budget', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_budget',
          confidence: 0.95,
          amount: 200,
          currency: 'PEN',
          category_slug: 'transport',
          period: 'week',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'transport budget 200 weekly');

      expect(result).toContain('semanal');
      expect(mockedUpsertBudget).toHaveBeenCalledWith(
        'user-1',
        'cat-transport',
        200,
        'PEN',
        'weekly',
        expect.any(String),
      );
    });

    it('defaults to monthly when period is null', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_budget',
          confidence: 0.95,
          amount: 500,
          category_slug: 'food_dining',
          period: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'budget comida 500');

      expect(result).toContain('mensual');
      expect(mockedUpsertBudget).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        500,
        'PEN',
        'monthly',
        expect.any(String),
      );
    });

    it('uses user currency when parse currency is null', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_budget',
          confidence: 0.95,
          amount: 800,
          currency: null,
          category_slug: 'food_dining',
          period: 'month',
        }),
      );

      await handleMessage(PHONE, 'text', 'set food budget 800');

      expect(mockedUpsertBudget).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        800,
        'PEN',
        expect.any(String),
        expect.any(String),
      );
    });

    it('returns error when amount is missing', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_budget',
          confidence: 0.9,
          amount: null,
          category_slug: 'food_dining',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'set food budget');

      expect(result).toBe(formatError());
      expect(mockedUpsertBudget).not.toHaveBeenCalled();
    });

    it('returns error when amount is zero', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_budget',
          confidence: 0.9,
          amount: 0,
          category_slug: 'food_dining',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'set food budget 0');

      expect(result).toBe(formatError());
      expect(mockedUpsertBudget).not.toHaveBeenCalled();
    });

    it('sets budget without category (overall)', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_budget',
          confidence: 0.95,
          amount: 2000,
          category_slug: null,
          period: 'month',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'set budget 2000');

      expect(result).toContain('General');
      expect(mockedUpsertBudget).toHaveBeenCalledWith(
        'user-1',
        null,
        2000,
        'PEN',
        'monthly',
        expect.any(String),
      );
    });
  });

  describe('query_budget intent', () => {
    it('returns budget status with spending', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'query_budget',
          confidence: 0.9,
          category_slug: 'food_dining',
        }),
      );
      mockedGetBudget.mockResolvedValue(makeBudget());
      mockedGetExpensesTotal.mockResolvedValue(520);

      const result = await handleMessage(PHONE, 'text', "how's my food budget?");

      expect(result).toContain('Food & Dining');
      expect(result).toContain('S/520.00');
      expect(result).toContain('S/800.00');
      expect(result).toContain('65%');
    });

    it('returns no-budget message when no budget is set', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'query_budget',
          confidence: 0.9,
          category_slug: 'food_dining',
        }),
      );
      mockedGetBudget.mockResolvedValue(null);

      const result = await handleMessage(PHONE, 'text', "how's my food budget?");

      expect(result).toContain('No hay presupuesto');
      expect(result).toContain('Food & Dining');
    });

    it('shows warning at high usage', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'query_budget',
          confidence: 0.9,
          category_slug: 'food_dining',
        }),
      );
      mockedGetBudget.mockResolvedValue(makeBudget());
      mockedGetExpensesTotal.mockResolvedValue(700);

      const result = await handleMessage(PHONE, 'text', 'budget status food');

      expect(result).toContain('⚠️');
    });

    it('shows over-budget alert', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'query_budget',
          confidence: 0.9,
          category_slug: 'food_dining',
        }),
      );
      mockedGetBudget.mockResolvedValue(makeBudget());
      mockedGetExpensesTotal.mockResolvedValue(900);

      const result = await handleMessage(PHONE, 'text', 'food budget');

      expect(result).toContain('🚨');
      expect(result).toContain('Excediste por');
    });

    it('queries without category (overall)', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'query_budget',
          confidence: 0.9,
          category_slug: null,
        }),
      );
      mockedGetBudget.mockResolvedValue(null);

      const result = await handleMessage(PHONE, 'text', 'budget status');

      expect(result).toContain('No hay presupuesto');
      expect(result).toContain('general');
    });

    it('tries weekly budget when monthly not found', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'query_budget',
          confidence: 0.9,
          category_slug: 'food_dining',
        }),
      );
      mockedGetBudget
        .mockResolvedValueOnce(null) // monthly not found
        .mockResolvedValueOnce(makeBudget({ period: 'weekly', amount: 200 })); // weekly found
      mockedGetExpensesTotal.mockResolvedValue(100);

      const result = await handleMessage(PHONE, 'text', 'food budget?');

      expect(result).toContain('S/200.00');
      expect(mockedGetBudget).toHaveBeenCalledTimes(2);
    });
  });

  // ── Edge cases (TASK-28) ─────────────────────────────────────────

  describe('edge cases', () => {
    it('truncates messages longer than 500 characters before parsing', async () => {
      const longMessage = 'a'.repeat(600);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'unknown', confidence: 0.1 }),
      );

      await handleMessage(PHONE, 'text', longMessage);

      // parseMessage should receive truncated content (500 chars)
      expect(mockedParseMessage).toHaveBeenCalledWith(
        'a'.repeat(500),
        mockCategories,
      );
    });

    it('passes messages <= 500 characters without truncation', async () => {
      const normalMessage = 'almuerzo 35 soles';
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'unknown', confidence: 0.1 }),
      );

      await handleMessage(PHONE, 'text', normalMessage);

      expect(mockedParseMessage).toHaveBeenCalledWith(
        normalMessage,
        mockCategories,
      );
    });

    it('returns personal bot message for unknown user on image message', async () => {
      mockedGetUserByPhone.mockResolvedValue(null);

      const result = await handleMessage(PHONE, 'image', 'https://media.kapso.ai/img.jpg');

      expect(result).toBe(formatUnknownUser());
    });
  });

  // ── Error handling hardening ──────────────────────────────────────

  describe('error handling', () => {
    it('returns database error when getUserByPhone throws', async () => {
      const dbError = Object.assign(new Error('connection refused'), {
        code: 'PGRST301',
        details: 'connection refused',
        hint: null,
      });
      mockedGetUserByPhone.mockRejectedValue(dbError);

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toBe(formatDatabaseError());
    });

    it('returns database error when getCategories throws', async () => {
      const dbError = Object.assign(new Error('timeout'), {
        code: '57014',
        details: 'query timed out',
        hint: null,
      });
      mockedGetCategories.mockRejectedValue(dbError);

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toBe(formatDatabaseError());
    });

    it('returns database error when insertExpense throws', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95, category_slug: 'food_dining' }),
      );
      const dbError = Object.assign(new Error('insert failed'), {
        code: '23505',
        details: 'duplicate key',
        hint: null,
      });
      mockedInsertExpense.mockRejectedValue(dbError);

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toBe(formatDatabaseError());
    });

    it('returns database error when updateExpense throws during correction', async () => {
      // Set up a previous expense
      const existing = makeExpense({ id: 'exp-1', category_id: 'cat-food' });
      mockedGetLastExpense.mockResolvedValue(existing);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          confidence: 0.9,
          correction_field: 'category',
          category_slug: 'transport',
        }),
      );
      const dbError = Object.assign(new Error('update failed'), {
        code: 'PGRST204',
        details: 'row not found',
        hint: null,
      });
      mockedUpdateExpense.mockRejectedValue(dbError);

      const result = await handleMessage(PHONE, 'text', "wrong, it's transport");

      expect(result).toBe(formatDatabaseError());
    });

    it('returns database error when softDeleteExpense throws', async () => {
      const existing = makeExpense({ id: 'exp-1' });
      mockedGetLastExpense.mockResolvedValue(existing);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'delete_expense', confidence: 0.9 }),
      );
      const dbError = Object.assign(new Error('delete failed'), {
        code: 'PGRST204',
        details: 'row not found',
        hint: null,
      });
      mockedSoftDeleteExpense.mockRejectedValue(dbError);

      const result = await handleMessage(PHONE, 'text', 'delete that');

      expect(result).toBe(formatDatabaseError());
    });

    it('returns database error when getExpensesSummary throws', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'query_summary', confidence: 0.9, period: 'week' }),
      );
      const dbError = Object.assign(new Error('query failed'), {
        code: 'PGRST301',
        details: 'connection lost',
        hint: null,
      });
      mockedGetExpensesSummary.mockRejectedValue(dbError);

      const result = await handleMessage(PHONE, 'text', 'how much this week?');

      expect(result).toBe(formatDatabaseError());
    });

    it('returns database error when upsertBudget throws', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_budget',
          confidence: 0.9,
          amount: 800,
          category_slug: 'food_dining',
          period: 'month',
        }),
      );
      const dbError = Object.assign(new Error('upsert failed'), {
        code: '23503',
        details: 'foreign key violation',
        hint: null,
      });
      mockedUpsertBudget.mockRejectedValue(dbError);

      const result = await handleMessage(PHONE, 'text', 'set food budget 800');

      expect(result).toBe(formatDatabaseError());
    });

    it('returns AI error when an Anthropic-like error bubbles up', async () => {
      // Simulate an Anthropic SDK error (class name contains "API")
      class APIConnectionTimeoutError extends Error {
        constructor() {
          super('Request timed out');
          this.name = 'APIConnectionTimeoutError';
        }
      }
      mockedParseMessage.mockRejectedValue(new APIConnectionTimeoutError());

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toBe(formatParseError());
    });

    it('returns generic error for unknown error types', async () => {
      mockedGetUserByPhone.mockRejectedValue(new Error('something unexpected'));

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toBe(formatError());
    });

    it('never exposes raw error messages to the user', async () => {
      const sensitiveError = Object.assign(
        new Error('FATAL: password authentication failed for user "postgres"'),
        { code: '28P01', details: 'auth failed', hint: null },
      );
      mockedGetUserByPhone.mockRejectedValue(sensitiveError);

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).not.toContain('FATAL');
      expect(result).not.toContain('password');
      expect(result).not.toContain('postgres');
      expect(result).not.toContain('28P01');
    });

    it('does not throw — always returns a string', async () => {
      mockedGetUserByPhone.mockRejectedValue(new Error('catastrophe'));

      // Should NOT throw, should return a string
      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('list_categories intent', () => {
    it('returns the category list', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'list_categories', amount: null, category_slug: null, description: null }),
      );

      const result = await handleMessage(PHONE, 'text', 'mis categorias');

      expect(result).toContain('📋');
      expect(result).toContain('Food & Dining');
      expect(result).toContain('Transport');
      expect(result).toContain('Groceries');
    });
  });

  describe('awaiting_category_confirmation flow', () => {
    const suggestedPending = makePendingExpense({
      amount: 120,
      category_slug: null,
      suggested_category_name: 'Mascotas',
      description: 'veterinario',
    });

    it('enters awaiting_category_confirmation when AI suggests a new category', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.95,
          amount: 120,
          category_slug: null,
          suggested_category_name: 'Mascotas',
          description: 'veterinario',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'veterinario 120');

      expect(result).toContain('S/120.00');
      expect(result).toContain('Mascotas');
      expect(result).toContain('?');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('awaiting_category_confirmation');
      expect(state!.pendingExpense!.suggested_category_name).toBe('Mascotas');
    });

    it('creates category and logs expense on confirm', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: suggestedPending,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const newCategory: Category = {
        id: 'cat-mascotas',
        user_id: 'user-1',
        name: 'Mascotas',
        slug: 'mascotas',
        icon: '📁',
        is_default: false,
        created_at: '2026-03-05T00:00:00Z',
      };
      mockedInsertCategory.mockResolvedValue(newCategory);
      // getCategoryBySlug should now find the new category
      mockedGetCategoryBySlug.mockImplementation(
        async (_userId: string, slug: string) => {
          if (slug === 'mascotas') return newCategory;
          return mockCategories.find((c) => c.slug === slug) ?? null;
        },
      );

      const result = await handleMessage(PHONE, 'text', 'si');

      expect(mockedInsertCategory).toHaveBeenCalledWith('user-1', 'Mascotas', 'mascotas', '📁');
      expect(mockedInsertExpense).toHaveBeenCalled();
      expect(result).toContain('Categoría creada');
      expect(result).toContain('Mascotas');
      expect(result).toContain('✅');
      expect(result).toContain('S/120.00');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('expense_logged');
    });

    it('logs with "other" category on deny', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: suggestedPending,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const result = await handleMessage(PHONE, 'text', 'no');

      expect(mockedInsertCategory).not.toHaveBeenCalled();
      expect(mockedInsertExpense).toHaveBeenCalled();
      const insertCall = mockedInsertExpense.mock.calls[0][0];
      expect(insertCall.category_id).toBe('cat-other');
      expect(result).toContain('✅');
      expect(result).toContain('S/120.00');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('expense_logged');
    });

    it('falls through to normal parsing on unrecognized reply', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: suggestedPending,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'help', amount: null, category_slug: null, description: null }),
      );

      const result = await handleMessage(PHONE, 'text', 'ayuda');

      expect(result).toBe(formatHelp());
      expect(mockedInsertCategory).not.toHaveBeenCalled();
      expect(mockedInsertExpense).not.toHaveBeenCalled();
    });

    it('preserves payment fields through category confirmation', async () => {
      const pendingWithPayment = makePendingExpense({
        amount: 120,
        category_slug: null,
        suggested_category_name: 'Mascotas',
        description: 'veterinario',
        payment_type: 'digital_wallet',
        payment_method_name: 'Yape',
      });
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: pendingWithPayment,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const newCategory: Category = {
        id: 'cat-mascotas',
        user_id: 'user-1',
        name: 'Mascotas',
        slug: 'mascotas',
        icon: '📁',
        is_default: false,
        created_at: '2026-03-05T00:00:00Z',
      };
      mockedInsertCategory.mockResolvedValue(newCategory);
      mockedGetCategoryBySlug.mockImplementation(
        async (_userId: string, slug: string) => {
          if (slug === 'mascotas') return newCategory;
          return mockCategories.find((c) => c.slug === slug) ?? null;
        },
      );

      await handleMessage(PHONE, 'text', 'si');

      const insertCall = mockedInsertExpense.mock.calls[0][0];
      expect(insertCall.payment_type).toBe('digital_wallet');
      expect(insertCall.payment_method_name).toBe('Yape');
    });
  });

  describe('payment passthrough in normal flow', () => {
    it('passes payment fields to insertExpense on auto-log', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.95,
          amount: 35,
          category_slug: 'food_dining',
          description: 'almuerzo',
          payment_type: 'digital_wallet',
          payment_method_name: 'Yape',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35 con yape');

      expect(mockedInsertExpense).toHaveBeenCalled();
      const insertCall = mockedInsertExpense.mock.calls[0][0];
      expect(insertCall.payment_type).toBe('digital_wallet');
      expect(insertCall.payment_method_name).toBe('Yape');
      expect(result).toContain('✅');
      expect(result).toContain('Yape');
    });

    it('passes payment fields through confirmation flow', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.7,
          amount: 35,
          category_slug: 'food_dining',
          description: 'almuerzo',
          payment_type: 'cash',
          payment_method_name: null,
        }),
      );

      await handleMessage(PHONE, 'text', 'almuerzo 35 efectivo');

      const state = getState(PHONE);
      expect(state!.pendingExpense!.payment_type).toBe('cash');
      expect(state!.pendingExpense!.payment_method_name).toBeNull();

      // Now confirm
      const result = await handleMessage(PHONE, 'text', 'si');

      expect(mockedInsertExpense).toHaveBeenCalled();
      const insertCall = mockedInsertExpense.mock.calls[0][0];
      expect(insertCall.payment_type).toBe('cash');
    });
  });
});
