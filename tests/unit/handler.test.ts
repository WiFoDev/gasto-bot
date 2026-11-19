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
  insertReceiptItems: vi.fn(),
  getExpenseById: vi.fn(),
  getLastExpense: vi.fn(),
  updateExpense: vi.fn(),
  softDeleteExpense: vi.fn(),
  upsertBudget: vi.fn(),
  getBudget: vi.fn(),
  getExpensesTotal: vi.fn(),
  getDateRange: vi.fn(),
  getExpensesSummary: vi.fn(),
  getMonthlyClosingData: vi.fn(),
  insertRule: vi.fn(),
  getActiveRules: vi.fn(),
  deleteRule: vi.fn(),
}));

import { handleMessage as handleMessageReply } from '../../src/handler.js';

// Most tests only care about the reply text; button tests use handleMessageReply.
const handleMessage = async (
  ...args: Parameters<typeof handleMessageReply>
): Promise<string> => (await handleMessageReply(...args)).text;
import { parseMessage } from '../../src/parse.js';
import { parseReceipt } from '../../src/parse-image.js';
import { downloadImage, uploadImage } from '../../src/storage.js';
import {
  getUserByPhone,
  getCategories,
  getCategoryBySlug,
  insertCategory,
  insertExpense,
  insertReceiptItems,
  getExpenseById,
  getLastExpense,
  updateExpense,
  softDeleteExpense,
  upsertBudget,
  getBudget,
  getExpensesTotal,
  getDateRange,
  getExpensesSummary,
  getMonthlyClosingData,
  insertRule,
  getActiveRules,
  deleteRule,
} from '../../src/db.js';
import { getState, setState, clearState } from '../../src/state.js';
import { formatHelp, formatError, formatUnknown, formatParseError, formatDatabaseError, formatNoExpenseToModify, formatReceiptUnclear, formatUnknownUser, formatExpenseCancelled, formatMerchantCorrection, formatCorrectionGeneric, formatButtonExpired, expenseConfirmButtons, newCategoryButtons, BUTTON_IDS } from '../../src/formatter.js';
import type {
  User,
  Category,
  Expense,
  Budget,
  ParseResult,
  PendingExpense,
  ReceiptItemParsed,
  ReceiptResult,
  MonthlyClosingData,
  FinancialRule,
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
    target_month: null,
    target_year: null,
    rule_type: null,
    rule_name: null,
    rule_period: null,
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
    items: [],
    ...overrides,
  };
}

// ── Setup ───────────────────────────────────────────────────────────

const mockedGetUserByPhone = getUserByPhone as ReturnType<typeof vi.fn>;
const mockedGetCategories = getCategories as ReturnType<typeof vi.fn>;
const mockedGetCategoryBySlug = getCategoryBySlug as ReturnType<typeof vi.fn>;
const mockedInsertCategory = insertCategory as ReturnType<typeof vi.fn>;
const mockedInsertExpense = insertExpense as ReturnType<typeof vi.fn>;
const mockedInsertReceiptItems = insertReceiptItems as ReturnType<typeof vi.fn>;
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
const mockedGetMonthlyClosingData = getMonthlyClosingData as ReturnType<typeof vi.fn>;
const mockedParseReceipt = parseReceipt as ReturnType<typeof vi.fn>;
const mockedDownloadImage = downloadImage as ReturnType<typeof vi.fn>;
const mockedUploadImage = uploadImage as ReturnType<typeof vi.fn>;
const mockedInsertRule = insertRule as ReturnType<typeof vi.fn>;
const mockedGetActiveRules = getActiveRules as ReturnType<typeof vi.fn>;
const mockedDeleteRule = deleteRule as ReturnType<typeof vi.fn>;

function makeRule(overrides: Partial<FinancialRule> = {}): FinancialRule {
  return {
    id: 'rule-1',
    user_id: 'user-1',
    name: 'Límite comida',
    rule_type: 'spending_limit',
    category_id: 'cat-food',
    threshold: 500,
    period: 'monthly',
    action_value: null,
    is_active: true,
    created_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

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
  mockedInsertReceiptItems.mockResolvedValue([]);
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
    items: [],
  } satisfies ReceiptResult);
  mockedGetActiveRules.mockResolvedValue([]);
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

    it('passes the user categories to parseReceipt', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Wong', amount: 50, currency: 'PEN', date: '2026-02-27', confidence: 0.9, items: [], category_slug: 'groceries',
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(mockedParseReceipt).toHaveBeenCalledWith(expect.any(Buffer), mockCategories);
    });

    it('uses the Vision category_slug when it matches a user category', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Plaza Vea', amount: 53.75, currency: 'PEN', date: '2026-02-27', confidence: 0.9, items: [], category_slug: 'groceries',
      });

      const reply = await handleMessageReply(PHONE, 'image', IMAGE_URL);

      expect(reply.text).toContain('Groceries');
      expect(reply.text).not.toContain('Other');
      expect(reply.buttons).toEqual(expenseConfirmButtons());
      expect(getState(PHONE)!.pendingExpense!.category_slug).toBe('groceries');

      await handleMessage(PHONE, 'text', 'si');

      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: 'cat-groceries', source: 'image', amount: 53.75 }),
      );
    });

    it('falls back to "other" when the Vision category_slug is unknown', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Pet Shop', amount: 40, currency: 'PEN', date: '2026-02-27', confidence: 0.9, items: [], category_slug: 'pets',
      });

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(result).toContain('Other');
      expect(getState(PHONE)!.pendingExpense!.category_slug).toBe('other');

      await handleMessage(PHONE, 'text', 'si');

      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: 'cat-other' }),
      );
    });

    it('falls back to "other" when the Vision category_slug is null', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Some Store', amount: 40, currency: 'PEN', date: '2026-02-27', confidence: 0.9, items: [], category_slug: null,
      });

      const result = await handleMessage(PHONE, 'image', IMAGE_URL);

      expect(result).toContain('Other');
      expect(getState(PHONE)!.pendingExpense!.category_slug).toBe('other');

      await handleMessage(PHONE, 'text', 'si');

      expect(mockedInsertExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: 'cat-other' }),
      );
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

    it('stores receipt items in pending expense', async () => {
      const items: ReceiptItemParsed[] = [
        { description: 'Leche Gloria', quantity: 2, unit_price: 5.5, total: 11, subcategory: 'lacteos' },
        { description: 'Pan integral', quantity: 1, unit_price: 4.2, total: 4.2, subcategory: 'panaderia' },
      ];
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Plaza Vea',
        amount: 15.2,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.85,
        items,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);

      const state = getState(PHONE);
      expect(state!.pendingExpense!.items).toEqual(items);
      expect(state!.pendingExpense!.items).toHaveLength(2);
    });

    it('inserts receipt items after confirming receipt with items', async () => {
      const items: ReceiptItemParsed[] = [
        { description: 'Leche Gloria', quantity: 2, unit_price: 5.5, total: 11, subcategory: 'lacteos' },
        { description: 'Pan integral', quantity: 1, unit_price: 4.2, total: 4.2, subcategory: 'panaderia' },
      ];
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Plaza Vea',
        amount: 15.2,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.85,
        items,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);
      const result = await handleMessage(PHONE, 'text', 'si');

      expect(result).toContain('✅');
      expect(mockedInsertReceiptItems).toHaveBeenCalledWith('exp-new', items);
    });

    it('does not call insertReceiptItems when receipt has no items', async () => {
      mockedParseReceipt.mockResolvedValue({
        merchant: 'Wong',
        amount: 85,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.8,
        items: [],
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);
      await handleMessage(PHONE, 'text', 'si');

      expect(mockedInsertReceiptItems).not.toHaveBeenCalled();
    });

    it('inserts receipt items after low-confidence receipt with user description', async () => {
      const items: ReceiptItemParsed[] = [
        { description: 'Pollo', quantity: 1, unit_price: 25, total: 25, subcategory: 'proteina' },
      ];
      mockedParseReceipt.mockResolvedValue({
        merchant: null,
        amount: 25,
        currency: 'PEN',
        date: '2026-02-27',
        confidence: 0.4,
        items,
      });

      await handleMessage(PHONE, 'image', IMAGE_URL);
      const result = await handleMessage(PHONE, 'text', 'groceries');

      expect(result).toContain('✅');
      expect(mockedInsertReceiptItems).toHaveBeenCalledWith('exp-new', items);
    });

    it('does not call insertReceiptItems for text expenses', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95 }),
      );

      await handleMessage(PHONE, 'text', 'almuerzo 35 soles');

      expect(mockedInsertReceiptItems).not.toHaveBeenCalled();
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

    it('enters awaiting_category_confirmation when correcting to non-existent category', async () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', amount: 35, category_id: 'cat-food', description: 'almuerzo' }),
      );
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          confidence: 0.9,
          correction_field: 'category',
          category_slug: null,
          suggested_category_name: 'Familia',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'cambiar categoría a familia');

      expect(result).toContain('Familia');
      expect(result).toContain('?');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('awaiting_category_confirmation');
      expect(state!.pendingExpense!.suggested_category_name).toBe('Familia');
      expect(state!.lastExpenseId).toBe('exp-1');
      expect(mockedUpdateExpense).not.toHaveBeenCalled();
    });

    it('uses existing category when correcting to suggested category that already exists', async () => {
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
          category_slug: null,
          suggested_category_name: 'Groceries',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'cambiar a groceries');

      expect(result).toContain('Actualizado');
      expect(result).toContain('Groceries');
      expect(mockedUpdateExpense).toHaveBeenCalledWith('exp-1', { category_id: 'cat-groceries' });
      expect(mockedInsertCategory).not.toHaveBeenCalled();
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

    it('uses existing category when AI suggests one that already exists', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.95,
          amount: 50,
          category_slug: null,
          suggested_category_name: 'Groceries',
          description: 'mercado',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'mercado 50');

      // Should auto-log with existing category, not ask to create
      expect(mockedInsertCategory).not.toHaveBeenCalled();
      expect(mockedInsertExpense).toHaveBeenCalled();
      const insertCall = mockedInsertExpense.mock.calls[0][0];
      expect(insertCall.category_id).toBe('cat-groceries');
      expect(result).toContain('✅');
      expect(result).toContain('S/50.00');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('expense_logged');
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
      // First getCategoryBySlug call (existence check) returns null — category doesn't exist yet
      // Second call (inside resolveAndInsertExpense after insert) finds it
      let mascotasCallCount = 0;
      mockedGetCategoryBySlug.mockImplementation(
        async (_userId: string, slug: string) => {
          if (slug === 'mascotas') {
            mascotasCallCount++;
            if (mascotasCallCount === 1) return null;
            return newCategory;
          }
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

    it('uses existing category instead of re-creating on duplicate confirm', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: suggestedPending,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const existingCategory: Category = {
        id: 'cat-mascotas',
        user_id: 'user-1',
        name: 'Mascotas',
        slug: 'mascotas',
        icon: '📁',
        is_default: false,
        created_at: '2026-03-05T00:00:00Z',
      };
      // Category already exists from a previous failed attempt
      mockedGetCategoryBySlug.mockImplementation(
        async (_userId: string, slug: string) => {
          if (slug === 'mascotas') return existingCategory;
          return mockCategories.find((c) => c.slug === slug) ?? null;
        },
      );

      const result = await handleMessage(PHONE, 'text', 'si');

      expect(mockedInsertCategory).not.toHaveBeenCalled();
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

    it('falls through to normal parsing when AI returns unrelated intent', async () => {
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

    it('uses existing category when AI returns log_expense with category_slug', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: suggestedPending,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'log_expense', category_slug: 'food_dining', suggested_category_name: null, amount: null }),
      );

      const result = await handleMessage(PHONE, 'text', 'ponlo en Food & Dining');

      expect(mockedInsertCategory).not.toHaveBeenCalled();
      expect(mockedInsertExpense).toHaveBeenCalled();
      const insertCall = mockedInsertExpense.mock.calls[0][0];
      expect(insertCall.category_id).toBe('cat-food');
      expect(result).toContain('✅');
      expect(result).toContain('S/120.00');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('expense_logged');
    });

    it('uses existing category from AI parse during correction flow', async () => {
      const correctionPending = makePendingExpense({
        amount: 35,
        category_slug: null,
        suggested_category_name: 'Familia',
        description: 'almuerzo',
      });
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: correctionPending,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-food' }),
      );

      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'log_expense', category_slug: 'groceries', suggested_category_name: null, amount: null }),
      );

      const result = await handleMessage(PHONE, 'text', 'mejor usa Groceries');

      expect(mockedInsertCategory).not.toHaveBeenCalled();
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      expect(mockedUpdateExpense).toHaveBeenCalledWith('exp-1', { category_id: 'cat-groceries' });
      expect(result).toContain('Actualizado');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('expense_logged');
      expect(state!.lastExpenseId).toBe('exp-1');
    });

    it('creates category when AI confirms via natural language like "crea la categoría"', async () => {
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
        created_at: '2026-03-11T00:00:00Z',
      };
      mockedInsertCategory.mockResolvedValue(newCategory);
      mockedGetCategoryBySlug.mockImplementation(
        async (_userId: string, slug: string) => {
          if (slug === 'mascotas') return null;
          return mockCategories.find((c) => c.slug === slug) ?? null;
        },
      );

      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'log_expense', category_slug: null, suggested_category_name: 'Mascotas', amount: null }),
      );

      const result = await handleMessage(PHONE, 'text', 'sí, crea la categoría');

      expect(mockedInsertCategory).toHaveBeenCalledWith('user-1', 'Mascotas', 'mascotas', '📁');
      expect(mockedInsertExpense).toHaveBeenCalled();
      expect(result).toContain('Categoría creada');
      expect(result).toContain('Mascotas');
      expect(result).toContain('✅');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('expense_logged');
    });

    it('creates alternative category when AI extracts a different name', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: suggestedPending,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const newCategory: Category = {
        id: 'cat-animales',
        user_id: 'user-1',
        name: 'Animales',
        slug: 'animales',
        icon: '📁',
        is_default: false,
        created_at: '2026-03-11T00:00:00Z',
      };
      mockedInsertCategory.mockResolvedValue(newCategory);
      mockedGetCategoryBySlug.mockImplementation(
        async (_userId: string, slug: string) => {
          if (slug === 'animales') return null;
          return mockCategories.find((c) => c.slug === slug) ?? null;
        },
      );

      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'log_expense', category_slug: null, suggested_category_name: 'Animales', amount: null }),
      );

      const result = await handleMessage(PHONE, 'text', 'mejor llámala Animales');

      expect(mockedInsertCategory).toHaveBeenCalledWith('user-1', 'Animales', 'animales', '📁');
      expect(mockedInsertExpense).toHaveBeenCalled();
      expect(result).toContain('Categoría creada');
      expect(result).toContain('Animales');
      expect(result).toContain('✅');
    });

    it('passes pendingCategoryConfirmation context to parseMessage', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: suggestedPending,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'unknown', amount: null, category_slug: null, description: null }),
      );

      await handleMessage(PHONE, 'text', 'crea la categoría');

      expect(mockedParseMessage).toHaveBeenCalledWith(
        'crea la categoría',
        mockCategories,
        {
          pendingCategoryConfirmation: {
            amount: 120,
            currency: 'PEN',
            description: 'veterinario',
            suggested_category_name: 'Mascotas',
          },
        },
      );
    });

    it('creates category and updates expense on confirm during correction flow', async () => {
      const correctionPending = makePendingExpense({
        amount: 35,
        category_slug: null,
        suggested_category_name: 'Familia',
        description: 'almuerzo',
      });
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: correctionPending,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });

      const newCategory: Category = {
        id: 'cat-familia',
        user_id: 'user-1',
        name: 'Familia',
        slug: 'familia',
        icon: '📁',
        is_default: false,
        created_at: '2026-03-11T00:00:00Z',
      };
      mockedInsertCategory.mockResolvedValue(newCategory);
      mockedGetCategoryBySlug.mockImplementation(
        async (_userId: string, slug: string) => {
          if (slug === 'familia') return null;
          return mockCategories.find((c) => c.slug === slug) ?? null;
        },
      );
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-food' }),
      );

      const result = await handleMessage(PHONE, 'text', 'si');

      expect(mockedInsertCategory).toHaveBeenCalledWith('user-1', 'Familia', 'familia', '📁');
      expect(mockedUpdateExpense).toHaveBeenCalledWith('exp-1', { category_id: 'cat-familia' });
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      expect(result).toContain('Categoría creada');
      expect(result).toContain('Familia');
      expect(result).toContain('Actualizado');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('expense_logged');
      expect(state!.lastExpenseId).toBe('exp-1');
    });

    it('updates to other category on deny during correction flow', async () => {
      const correctionPending = makePendingExpense({
        amount: 35,
        category_slug: null,
        suggested_category_name: 'Familia',
        description: 'almuerzo',
      });
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: correctionPending,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(
        makeExpense({ id: 'exp-1', category_id: 'cat-food' }),
      );

      const result = await handleMessage(PHONE, 'text', 'no');

      expect(mockedInsertCategory).not.toHaveBeenCalled();
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      expect(mockedUpdateExpense).toHaveBeenCalledWith('exp-1', { category_id: 'cat-other' });
      expect(result).toContain('Actualizado');
      const state = getState(PHONE);
      expect(state!.lastAction).toBe('expense_logged');
      expect(state!.lastExpenseId).toBe('exp-1');
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
      let mascotasCallCount = 0;
      mockedGetCategoryBySlug.mockImplementation(
        async (_userId: string, slug: string) => {
          if (slug === 'mascotas') {
            mascotasCallCount++;
            if (mascotasCallCount === 1) return null;
            return newCategory;
          }
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

  describe('reactive budget alerts after expense logging', () => {
    it('no alert when spending is below 80% of budget', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95, amount: 35, category_slug: 'food_dining' }),
      );
      // Category budget: 800, spent so far (including new expense): 632 = 79%
      mockedGetBudget
        .mockResolvedValueOnce(makeBudget({ category_id: 'cat-food', amount: 800 })) // category monthly
        .mockResolvedValueOnce(null) // overall monthly
        .mockResolvedValueOnce(null); // overall weekly
      mockedGetExpensesTotal.mockResolvedValue(632);

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toContain('✅');
      expect(result).not.toContain('⚠️');
      expect(result).not.toContain('🚨');
    });

    it('appends warning when category budget reaches 85%', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95, amount: 40, category_slug: 'food_dining' }),
      );
      // Category budget: 800, spent so far: 680 = 85%
      mockedGetBudget
        .mockResolvedValueOnce(makeBudget({ category_id: 'cat-food', amount: 800 })) // category monthly
        .mockResolvedValueOnce(null) // overall monthly
        .mockResolvedValueOnce(null); // overall weekly
      mockedGetExpensesTotal.mockResolvedValue(680);

      const result = await handleMessage(PHONE, 'text', 'almuerzo 40');

      expect(result).toContain('✅');
      expect(result).toContain('⚠️');
      expect(result).toContain('Llevas');
      expect(result).toContain('S/680.00');
      expect(result).toContain('S/800.00');
      expect(result).toContain('85%');
    });

    it('appends exceeded alert when over budget at 105%', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95, amount: 50, category_slug: 'food_dining' }),
      );
      // Category budget: 800, spent so far: 840 = 105%
      mockedGetBudget
        .mockResolvedValueOnce(makeBudget({ category_id: 'cat-food', amount: 800 })) // category monthly
        .mockResolvedValueOnce(null) // overall monthly
        .mockResolvedValueOnce(null); // overall weekly
      mockedGetExpensesTotal.mockResolvedValue(840);

      const result = await handleMessage(PHONE, 'text', 'almuerzo 50');

      expect(result).toContain('✅');
      expect(result).toContain('🚨');
      expect(result).toContain('excedido');
      expect(result).toContain('S/840.00');
    });

    it('appends overall budget alert alongside category alert', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95, amount: 50, category_slug: 'food_dining' }),
      );
      // Category budget: 800 at 85%, overall budget: 2000 at 90%
      mockedGetBudget
        .mockResolvedValueOnce(makeBudget({ category_id: 'cat-food', amount: 800 })) // category monthly
        .mockResolvedValueOnce(makeBudget({ category_id: null, amount: 2000 })) // overall monthly
      mockedGetExpensesTotal
        .mockResolvedValueOnce(680)  // category total
        .mockResolvedValueOnce(1800); // overall total

      const result = await handleMessage(PHONE, 'text', 'almuerzo 50');

      expect(result).toContain('⚠️');
      expect(result).toContain('Food & Dining');
      expect(result).toContain('general');
    });

    it('alerts work through confirmation flow', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.7, category_slug: 'food_dining' }),
      );

      await handleMessage(PHONE, 'text', 'almuerzo 35');

      // Set up budget for confirmation
      mockedGetBudget
        .mockResolvedValueOnce(makeBudget({ category_id: 'cat-food', amount: 800 })) // category monthly
        .mockResolvedValueOnce(null) // overall monthly
        .mockResolvedValueOnce(null); // overall weekly
      mockedGetExpensesTotal.mockResolvedValue(700);

      const result = await handleMessage(PHONE, 'text', 'si');

      expect(result).toContain('✅');
      expect(result).toContain('⚠️');
      expect(result).toContain('88%');
    });

    it('no alert when no budgets are set', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95, category_slug: 'food_dining' }),
      );
      // Default: mockedGetBudget returns null

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toContain('✅');
      expect(result).not.toContain('⚠️');
      expect(result).not.toContain('🚨');
    });

    it('checks weekly budget when no monthly budget exists', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ confidence: 0.95, amount: 50, category_slug: 'food_dining' }),
      );
      mockedGetBudget
        .mockResolvedValueOnce(null) // category monthly = null
        .mockResolvedValueOnce(makeBudget({ category_id: 'cat-food', amount: 200, period: 'weekly' })) // category weekly
        .mockResolvedValueOnce(null) // overall monthly
        .mockResolvedValueOnce(null); // overall weekly
      mockedGetExpensesTotal.mockResolvedValue(170);

      const result = await handleMessage(PHONE, 'text', 'almuerzo 50');

      expect(result).toContain('⚠️');
      expect(result).toContain('85%');
    });
  });

  // ── Monthly Closing ──────────────────────────────────────────────────

  describe('monthly_closing intent', () => {
    const mockClosingData: MonthlyClosingData = {
      year: 2026,
      month: 2,
      total: 1850,
      byCategory: [
        { slug: 'food_dining', name: 'Food & Dining', icon: '🍽', total: 850 },
        { slug: 'transport', name: 'Transport', icon: '🚗', total: 450 },
        { slug: 'groceries', name: 'Groceries', icon: '🛒', total: 350 },
      ],
      previousMonthTotal: 1500,
      budgets: [],
    };

    it('routes monthly_closing intent and returns formatted closing', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'monthly_closing', target_month: 2, target_year: 2026 }),
      );
      mockedGetMonthlyClosingData.mockResolvedValue(mockClosingData);

      const result = await handleMessage(PHONE, 'text', 'cierra febrero');

      expect(mockedGetMonthlyClosingData).toHaveBeenCalledWith('user-1', 2026, 2);
      expect(result).toContain('Cierre Febrero 2026');
      expect(result).toContain('S/1,850.00');
      expect(result).toContain('Food & Dining');
    });

    it('defaults to current month when target_month/year are null', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'monthly_closing', target_month: null, target_year: null }),
      );
      mockedGetMonthlyClosingData.mockResolvedValue({
        ...mockClosingData,
        month: 3,
        year: 2026,
      });

      const result = await handleMessage(PHONE, 'text', 'cierre del mes');

      // Should have been called — exact month depends on runtime date, but verify the call happened
      expect(mockedGetMonthlyClosingData).toHaveBeenCalledTimes(1);
      expect(result).toContain('Cierre');
    });

    it('shows previous month comparison with increase', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'monthly_closing', target_month: 2, target_year: 2026 }),
      );
      mockedGetMonthlyClosingData.mockResolvedValue(mockClosingData);

      const result = await handleMessage(PHONE, 'text', 'cierra febrero');

      expect(result).toContain('📈');
      expect(result).toContain('+23%');
      expect(result).toContain('vs mes anterior');
    });

    it('shows empty month message when no expenses', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'monthly_closing', target_month: 1, target_year: 2026 }),
      );
      mockedGetMonthlyClosingData.mockResolvedValue({
        ...mockClosingData,
        month: 1,
        total: 0,
        byCategory: [],
        previousMonthTotal: 0,
      });

      const result = await handleMessage(PHONE, 'text', 'cierra enero');

      expect(result).toContain('Sin gastos registrados.');
    });

    it('shows category percentages in closing', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'monthly_closing', target_month: 2, target_year: 2026 }),
      );
      mockedGetMonthlyClosingData.mockResolvedValue(mockClosingData);

      const result = await handleMessage(PHONE, 'text', 'cierra febrero');

      expect(result).toContain('46%');
      expect(result).toContain('24%');
      expect(result).toContain('19%');
    });
  });

  describe('set_rule intent', () => {
    it('creates a spending_limit rule with category', async () => {
      const rule = makeRule();
      mockedInsertRule.mockResolvedValue(rule);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_rule',
          rule_type: 'spending_limit',
          rule_name: 'Límite comida',
          amount: 500,
          category_slug: 'food_dining',
          rule_period: 'monthly',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'avisa si gasto mas de 500 en comida');

      expect(mockedInsertRule).toHaveBeenCalledWith(
        'user-1', 'Límite comida', 'spending_limit', 'cat-food', 500, 'monthly', null,
      );
      expect(result).toContain('Regla creada');
      expect(result).toContain('Límite comida');
    });

    it('creates a spending_limit rule without category (global)', async () => {
      const rule = makeRule({ category_id: null });
      mockedInsertRule.mockResolvedValue(rule);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_rule',
          rule_type: 'spending_limit',
          rule_name: 'Límite mensual',
          amount: 2000,
          category_slug: null,
          rule_period: 'monthly',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'avisa si gasto mas de 2000 al mes');

      expect(mockedInsertRule).toHaveBeenCalledWith(
        'user-1', 'Límite mensual', 'spending_limit', null, 2000, 'monthly', null,
      );
      expect(result).toContain('Regla creada');
    });

    it('creates a prohibition rule', async () => {
      const rule = makeRule({ rule_type: 'prohibition', threshold: null, period: null });
      mockedInsertRule.mockResolvedValue(rule);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_rule',
          rule_type: 'prohibition',
          rule_name: 'No entretenimiento',
          amount: null,
          category_slug: 'entertainment',
        }),
      );

      // Need entertainment category in our mocks — use getCategoryBySlug
      mockedGetCategoryBySlug.mockImplementation(
        async (_userId: string, slug: string) => {
          if (slug === 'entertainment') return { id: 'cat-ent', user_id: 'user-1', name: 'Entertainment', slug: 'entertainment', icon: '🎬', is_default: true, created_at: '2026-01-01T00:00:00Z' };
          return mockCategories.find((c) => c.slug === slug) ?? null;
        },
      );

      const result = await handleMessage(PHONE, 'text', 'prohibir entretenimiento');

      expect(mockedInsertRule).toHaveBeenCalledWith(
        'user-1', 'No entretenimiento', 'prohibition', 'cat-ent', null, null, null,
      );
      expect(result).toContain('Regla creada');
    });

    it('creates a payment_default rule', async () => {
      const rule = makeRule({
        rule_type: 'payment_default',
        threshold: null,
        period: null,
        action_value: 'Yape',
      });
      mockedInsertRule.mockResolvedValue(rule);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_rule',
          rule_type: 'payment_default',
          rule_name: 'Pagar con Yape',
          amount: null,
          category_slug: 'food_dining',
          payment_type: 'digital_wallet',
          payment_method_name: 'Yape',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'siempre pagar comida con yape');

      expect(mockedInsertRule).toHaveBeenCalledWith(
        'user-1', 'Pagar con Yape', 'payment_default', 'cat-food', null, null, 'Yape',
      );
      expect(result).toContain('Regla creada');
    });

    it('returns error when rule_type is missing', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_rule',
          rule_type: null,
          rule_name: 'algo',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'crea una regla');

      expect(mockedInsertRule).not.toHaveBeenCalled();
      expect(result).toContain('salió mal');
    });

    it('returns error when rule_name is missing', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_rule',
          rule_type: 'spending_limit',
          rule_name: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'limite gasto');

      expect(mockedInsertRule).not.toHaveBeenCalled();
      expect(result).toContain('salió mal');
    });

    it('defaults spending_limit period to monthly', async () => {
      const rule = makeRule();
      mockedInsertRule.mockResolvedValue(rule);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'set_rule',
          rule_type: 'spending_limit',
          rule_name: 'Límite comida',
          amount: 500,
          category_slug: 'food_dining',
          rule_period: null,
        }),
      );

      await handleMessage(PHONE, 'text', 'avisa si gasto mas de 500 en comida');

      expect(mockedInsertRule).toHaveBeenCalledWith(
        'user-1', 'Límite comida', 'spending_limit', 'cat-food', 500, 'monthly', null,
      );
    });
  });

  describe('list_rules intent', () => {
    it('lists active rules', async () => {
      const rules = [
        makeRule(),
        makeRule({ id: 'rule-2', name: 'No snacks', rule_type: 'prohibition', category_id: 'cat-groceries', threshold: null, period: null }),
      ];
      mockedGetActiveRules.mockResolvedValue(rules);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'list_rules' }),
      );

      const result = await handleMessage(PHONE, 'text', 'mis reglas');

      expect(mockedGetActiveRules).toHaveBeenCalledWith('user-1');
      expect(result).toContain('Tus reglas');
      expect(result).toContain('Límite comida');
      expect(result).toContain('No snacks');
    });

    it('shows empty state when no rules exist', async () => {
      mockedGetActiveRules.mockResolvedValue([]);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'list_rules' }),
      );

      const result = await handleMessage(PHONE, 'text', 'mis reglas');

      expect(result).toContain('No tienes reglas activas');
    });
  });

  describe('delete_rule intent', () => {
    it('deletes a rule matching by name', async () => {
      const rule = makeRule({ name: 'Límite comida' });
      mockedGetActiveRules.mockResolvedValue([rule]);
      mockedDeleteRule.mockResolvedValue(undefined);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'delete_rule',
          rule_name: 'comida',
          category_slug: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'borra la regla de comida');

      expect(mockedDeleteRule).toHaveBeenCalledWith('user-1', 'rule-1');
      expect(result).toContain('Regla eliminada');
      expect(result).toContain('Límite comida');
    });

    it('deletes a rule matching by category', async () => {
      const rule = makeRule({ name: 'Limite general', category_id: 'cat-food' });
      mockedGetActiveRules.mockResolvedValue([rule]);
      mockedDeleteRule.mockResolvedValue(undefined);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'delete_rule',
          rule_name: null,
          category_slug: 'food_dining',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'borra la regla de food');

      expect(mockedDeleteRule).toHaveBeenCalledWith('user-1', 'rule-1');
      expect(result).toContain('Regla eliminada');
    });

    it('returns not-found when no rule matches', async () => {
      mockedGetActiveRules.mockResolvedValue([makeRule({ name: 'Otra regla' })]);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'delete_rule',
          rule_name: 'entretenimiento',
          category_slug: null,
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'borra la regla de entretenimiento');

      expect(mockedDeleteRule).not.toHaveBeenCalled();
      expect(result).toContain('No encontré');
    });
  });

  describe('rule violation checks on expense logging', () => {
    it('appends rule violation alerts after expense is logged', async () => {
      const rule = makeRule({ name: 'Límite comida', threshold: 100, period: 'monthly' });
      mockedGetActiveRules.mockResolvedValue([rule]);
      mockedGetExpensesTotal.mockResolvedValue(150);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.95,
          amount: 35,
          category_slug: 'food_dining',
          description: 'almuerzo',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toContain('✅');
      expect(result).toContain('S/35.00');
      expect(result).toContain('Límite comida');
    });

    it('does not append alerts when no rules are violated', async () => {
      mockedGetActiveRules.mockResolvedValue([
        makeRule({ name: 'Límite comida', threshold: 1000, period: 'monthly' }),
      ]);
      mockedGetExpensesTotal.mockResolvedValue(50);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.95,
          amount: 35,
          category_slug: 'food_dining',
          description: 'almuerzo',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toContain('✅');
      expect(result).not.toContain('Límite comida');
    });

    it('appends prohibition violation after expense logging', async () => {
      const rule = makeRule({
        name: 'No comida fuera',
        rule_type: 'prohibition',
        category_id: 'cat-food',
        threshold: null,
        period: null,
      });
      mockedGetActiveRules.mockResolvedValue([rule]);
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.95,
          amount: 35,
          category_slug: 'food_dining',
          description: 'almuerzo',
        }),
      );

      const result = await handleMessage(PHONE, 'text', 'almuerzo 35');

      expect(result).toContain('✅');
      expect(result).toContain('No comida fuera');
      expect(result).toContain('no permitido');
    });
  });
});

// ── Interactive confirm buttons (TASK-77) ───────────────────────────

describe('interactive confirm buttons', () => {
  const mascotasPending = makePendingExpense({
    amount: 120,
    category_slug: null,
    suggested_category_name: 'Mascotas',
    description: 'veterinario',
  });

  describe('prompts carry buttons', () => {
    it('receipt confirmation has Guardar / Cancelar buttons', async () => {
      const reply = await handleMessageReply(PHONE, 'image', 'https://media.kapso.ai/img.jpg');

      expect(reply.text).toContain('¿Está bien?');
      expect(reply.buttons).toEqual(expenseConfirmButtons());
    });

    it('mid-confidence text confirmation has Guardar / Cancelar buttons', async () => {
      mockedParseMessage.mockResolvedValue(makeParseResult({ confidence: 0.7 }));

      const reply = await handleMessageReply(PHONE, 'text', 'almuerzo 35 soles');

      expect(reply.text).toContain('¿Lo registro?');
      expect(reply.buttons).toEqual(expenseConfirmButtons());
    });

    it('confirmation re-shown after a correction keeps the buttons', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense(),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });
      mockedParseMessage.mockResolvedValue(
        makeParseResult({ intent: 'correct_expense', correction_field: 'category', category_slug: 'transport' }),
      );

      const reply = await handleMessageReply(PHONE, 'text', 'era transporte');

      expect(reply.text).toContain('Transport');
      expect(reply.buttons).toEqual(expenseConfirmButtons());
    });

    it('new category confirmation has Crear / Usar Otros buttons', async () => {
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          confidence: 0.95,
          amount: 120,
          category_slug: null,
          suggested_category_name: 'Mascotas',
          description: 'veterinario',
        }),
      );

      const reply = await handleMessageReply(PHONE, 'text', 'veterinario 120');

      expect(reply.text).toContain('Mascotas');
      expect(reply.buttons).toEqual(newCategoryButtons());
    });

    it('new category suggested during a correction has Crear / Usar Otros buttons', async () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });
      mockedGetExpenseById.mockResolvedValue(makeExpense({ id: 'exp-1', category_id: 'cat-food' }));
      mockedParseMessage.mockResolvedValue(
        makeParseResult({
          intent: 'correct_expense',
          correction_field: 'category',
          category_slug: null,
          suggested_category_name: 'Familia',
        }),
      );

      const reply = await handleMessageReply(PHONE, 'text', 'eso fue familia');

      expect(reply.buttons).toEqual(newCategoryButtons());
    });

    it('auto-logged expense has no buttons', async () => {
      mockedParseMessage.mockResolvedValue(makeParseResult({ confidence: 0.95 }));

      const reply = await handleMessageReply(PHONE, 'text', 'almuerzo 35 soles');

      expect(reply.text).toContain('✅');
      expect(reply.buttons).toBeUndefined();
    });
  });

  describe('button taps', () => {
    it('Guardar logs the pending expense without calling the parser', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense(),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const reply = await handleMessageReply(PHONE, 'button', BUTTON_IDS.expenseConfirm);

      expect(reply.text).toContain('✅');
      expect(reply.text).toContain('S/35.00');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
      expect(mockedParseMessage).not.toHaveBeenCalled();
      expect(getState(PHONE)!.lastAction).toBe('expense_logged');
    });

    it('Cancelar cancels the pending expense', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense(),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const reply = await handleMessageReply(PHONE, 'button', BUTTON_IDS.expenseCancel);

      expect(reply.text).toBe(formatExpenseCancelled());
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      expect(getState(PHONE)).toBeNull();
    });

    it('Crear creates the suggested category and logs the expense', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: mascotasPending,
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
      let calls = 0;
      mockedGetCategoryBySlug.mockImplementation(async (_userId: string, slug: string) => {
        if (slug === 'mascotas') return ++calls === 1 ? null : newCategory;
        return mockCategories.find((c) => c.slug === slug) ?? null;
      });

      const reply = await handleMessageReply(PHONE, 'button', BUTTON_IDS.categoryCreate);

      expect(mockedInsertCategory).toHaveBeenCalledWith('user-1', 'Mascotas', 'mascotas', '📁');
      expect(reply.text).toContain('Categoría creada');
      expect(reply.text).toContain('✅');
      expect(mockedParseMessage).not.toHaveBeenCalled();
    });

    it('Usar Otros logs the expense under "other" without creating a category', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: mascotasPending,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const reply = await handleMessageReply(PHONE, 'button', BUTTON_IDS.categoryOther);

      expect(mockedInsertCategory).not.toHaveBeenCalled();
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
      expect(mockedInsertExpense.mock.calls[0][0].category_id).toBe('cat-other');
      expect(reply.text).toContain('✅');
      expect(mockedParseMessage).not.toHaveBeenCalled();
    });

    it('tap with no pending state (TTL expired) replies expired and does nothing', async () => {
      const reply = await handleMessageReply(PHONE, 'button', BUTTON_IDS.expenseConfirm);

      expect(reply.text).toBe(formatButtonExpired());
      expect(reply.buttons).toBeUndefined();
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      expect(mockedParseMessage).not.toHaveBeenCalled();
    });

    it('tap from an older prompt leaves the current pending state untouched', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_category_confirmation',
        pendingExpense: mascotasPending,
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const reply = await handleMessageReply(PHONE, 'button', BUTTON_IDS.expenseConfirm);

      expect(reply.text).toBe(formatButtonExpired());
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      expect(getState(PHONE)!.lastAction).toBe('awaiting_category_confirmation');
    });

    it('unknown button id replies expired', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense(),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const reply = await handleMessageReply(PHONE, 'button', 'something_else');

      expect(reply.text).toBe(formatButtonExpired());
      expect(mockedInsertExpense).not.toHaveBeenCalled();
      expect(getState(PHONE)!.lastAction).toBe('awaiting_confirmation');
    });

    it('typed "sí" still confirms (buttons are optional)', async () => {
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense(),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const reply = await handleMessageReply(PHONE, 'text', 'sí');

      expect(reply.text).toContain('✅');
      expect(mockedInsertExpense).toHaveBeenCalledOnce();
    });
  });
});
