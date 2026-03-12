import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Category, ParseResult } from '../../src/types.js';

// Shared mock reference — set per test via beforeEach
let mockCreate: ReturnType<typeof vi.fn>;

// Mock the Anthropic SDK with a class constructor
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: (...args: unknown[]) => mockCreate(...args) };
    },
  };
});

// Mock config to avoid env var validation
vi.mock('../../src/config.js', () => ({
  ANTHROPIC_API_KEY: 'sk-ant-test',
  DEFAULT_TIMEZONE: 'America/Lima',
}));

import { parseMessage } from '../../src/parse.js';

const TEST_CATEGORIES: Category[] = [
  { id: '1', user_id: 'u1', name: 'Food & Dining', slug: 'food_dining', icon: '🍽', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '2', user_id: 'u1', name: 'Transport', slug: 'transport', icon: '🚗', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '3', user_id: 'u1', name: 'Groceries', slug: 'groceries', icon: '🛒', is_default: true, created_at: '2026-01-01T00:00:00Z' },
];

describe('parseMessage', () => {
  beforeEach(() => {
    mockCreate = vi.fn();
  });

  it('parses a valid log_expense response', async () => {
    const apiResponse: ParseResult = {
      intent: 'log_expense',
      confidence: 0.95,
      amount: 35,
      currency: 'PEN',
      category_slug: 'food_dining',
      description: 'almuerzo',
      merchant: null,
      date: '2026-02-26',
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
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('almuerzo 35 soles', TEST_CATEGORIES);

    expect(result).toEqual(apiResponse);
    expect(result.intent).toBe('log_expense');
    expect(result.amount).toBe(35);
    expect(result.category_slug).toBe('food_dining');
  });

  it('parses a valid help intent response', async () => {
    const apiResponse: ParseResult = {
      intent: 'help',
      confidence: 0.99,
      amount: null,
      currency: null,
      category_slug: null,
      description: null,
      merchant: null,
      date: null,
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
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('help', TEST_CATEGORIES);

    expect(result.intent).toBe('help');
    expect(result.confidence).toBe(0.99);
  });

  it('parses a query_summary response with period', async () => {
    const apiResponse: ParseResult = {
      intent: 'query_summary',
      confidence: 0.92,
      amount: null,
      currency: null,
      category_slug: null,
      description: null,
      merchant: null,
      date: null,
      period: 'week',
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
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('how much this week?', TEST_CATEGORIES);

    expect(result.intent).toBe('query_summary');
    expect(result.period).toBe('week');
  });

  it('returns error intent on malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'This is not valid JSON at all' }],
    });

    const result = await parseMessage('almuerzo 35', TEST_CATEGORIES);

    expect(result.intent).toBe('error');
    expect(result.error_message).toBeTruthy();
    expect(result.confidence).toBe(0);
  });

  it('returns error intent on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    const result = await parseMessage('almuerzo 35', TEST_CATEGORIES);

    expect(result.intent).toBe('error');
    expect(result.error_message).toBeTruthy();
    expect(result.confidence).toBe(0);
  });

  it('returns error intent on API timeout', async () => {
    const timeoutError = new Error('Request timed out');
    timeoutError.name = 'APIConnectionTimeoutError';
    mockCreate.mockRejectedValueOnce(timeoutError);

    const result = await parseMessage('almuerzo 35', TEST_CATEGORIES);

    expect(result.intent).toBe('error');
    expect(result.error_message).toBeTruthy();
  });

  it('handles response with markdown-wrapped JSON', async () => {
    const apiResponse: ParseResult = {
      intent: 'log_expense',
      confidence: 0.90,
      amount: 23.5,
      currency: 'PEN',
      category_slug: 'transport',
      description: 'uber',
      merchant: 'Uber',
      date: '2026-02-26',
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
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(apiResponse) + '\n```' }],
    });

    const result = await parseMessage('uber 23.5', TEST_CATEGORIES);

    expect(result.intent).toBe('log_expense');
    expect(result.amount).toBe(23.5);
    expect(result.merchant).toBe('Uber');
  });

  it('handles empty content array', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [],
    });

    const result = await parseMessage('almuerzo 35', TEST_CATEGORIES);

    expect(result.intent).toBe('error');
    expect(result.error_message).toBeTruthy();
  });

  it('passes system prompt and user message to the API', async () => {
    const apiResponse: ParseResult = {
      intent: 'unknown',
      confidence: 0.3,
      amount: null,
      currency: null,
      category_slug: null,
      description: null,
      merchant: null,
      date: null,
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
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    await parseMessage('hello world', TEST_CATEGORIES);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];

    expect(callArgs.model).toMatch(/claude.*sonnet/);
    expect(callArgs.max_tokens).toBe(1024);
    expect(callArgs.temperature).toBe(0);
    expect(callArgs.system).toContain('GastoBot');
    expect(callArgs.system).toContain('food_dining');
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'hello world' },
    ]);
  });

  it('maps payment_type and payment_method_name from AI response', async () => {
    const apiResponse: ParseResult = {
      intent: 'log_expense',
      confidence: 0.95,
      amount: 35,
      currency: 'PEN',
      category_slug: 'food_dining',
      description: 'almuerzo',
      merchant: null,
      date: '2026-02-26',
      period: null,
      correction_field: null,
      suggested_category_name: null,
      payment_type: 'digital_wallet',
      payment_method_name: 'Yape',
      target_month: null,
      target_year: null,
      rule_type: null,
      rule_name: null,
      rule_period: null,
      error_message: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('almuerzo 35 con yape', TEST_CATEGORIES);

    expect(result.payment_type).toBe('digital_wallet');
    expect(result.payment_method_name).toBe('Yape');
  });

  it('maps suggested_category_name when category_slug is null', async () => {
    const apiResponse: ParseResult = {
      intent: 'log_expense',
      confidence: 0.9,
      amount: 120,
      currency: 'PEN',
      category_slug: null,
      description: 'veterinario',
      merchant: null,
      date: '2026-02-26',
      period: null,
      correction_field: null,
      suggested_category_name: 'Mascotas',
      payment_type: null,
      payment_method_name: null,
      target_month: null,
      target_year: null,
      rule_type: null,
      rule_name: null,
      rule_period: null,
      error_message: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('veterinario 120', TEST_CATEGORIES);

    expect(result.category_slug).toBeNull();
    expect(result.suggested_category_name).toBe('Mascotas');
  });

  it('defaults new fields to null when AI omits them', async () => {
    // Simulate an AI response missing the new fields
    const partialResponse = {
      intent: 'log_expense',
      confidence: 0.9,
      amount: 50,
      currency: 'PEN',
      category_slug: 'food_dining',
      description: 'comida',
      merchant: null,
      date: '2026-02-26',
      period: null,
      correction_field: null,
      error_message: null,
      // Missing: suggested_category_name, payment_type, payment_method_name
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(partialResponse) }],
    });

    const result = await parseMessage('comida 50', TEST_CATEGORIES);

    expect(result.suggested_category_name).toBeNull();
    expect(result.payment_type).toBeNull();
    expect(result.payment_method_name).toBeNull();
  });

  it('maps expense with cash payment type and no method name', async () => {
    const apiResponse: ParseResult = {
      intent: 'log_expense',
      confidence: 0.95,
      amount: 20,
      currency: 'PEN',
      category_slug: 'transport',
      description: 'taxi',
      merchant: null,
      date: '2026-02-26',
      period: null,
      correction_field: null,
      suggested_category_name: null,
      payment_type: 'cash',
      payment_method_name: null,
      target_month: null,
      target_year: null,
      rule_type: null,
      rule_name: null,
      rule_period: null,
      error_message: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('taxi 20 efectivo', TEST_CATEGORIES);

    expect(result.payment_type).toBe('cash');
    expect(result.payment_method_name).toBeNull();
  });

  it('maps monthly_closing intent with target_month and target_year', async () => {
    const apiResponse: ParseResult = {
      intent: 'monthly_closing',
      confidence: 0.95,
      amount: null,
      currency: null,
      category_slug: null,
      description: null,
      merchant: null,
      date: null,
      period: null,
      correction_field: null,
      suggested_category_name: null,
      payment_type: null,
      payment_method_name: null,
      target_month: 2,
      target_year: 2026,
      rule_type: null,
      rule_name: null,
      rule_period: null,
      error_message: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('cierra febrero', TEST_CATEGORIES);

    expect(result.intent).toBe('monthly_closing');
    expect(result.target_month).toBe(2);
    expect(result.target_year).toBe(2026);
  });

  it('defaults target_month and target_year to null when AI omits them', async () => {
    const partialResponse = {
      intent: 'log_expense',
      confidence: 0.9,
      amount: 50,
      currency: 'PEN',
      category_slug: 'food_dining',
      description: 'comida',
      merchant: null,
      date: '2026-02-26',
      period: null,
      correction_field: null,
      suggested_category_name: null,
      payment_type: null,
      payment_method_name: null,
      error_message: null,
      // Missing: target_month, target_year
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(partialResponse) }],
    });

    const result = await parseMessage('comida 50', TEST_CATEGORIES);

    expect(result.target_month).toBeNull();
    expect(result.target_year).toBeNull();
  });

  it('maps list_categories intent', async () => {
    const apiResponse: ParseResult = {
      intent: 'list_categories',
      confidence: 0.95,
      amount: null,
      currency: null,
      category_slug: null,
      description: null,
      merchant: null,
      date: null,
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
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('mis categorias', TEST_CATEGORIES);

    expect(result.intent).toBe('list_categories');
  });

  it('maps set_rule intent with rule fields', async () => {
    const apiResponse: ParseResult = {
      intent: 'set_rule',
      confidence: 0.95,
      amount: 100,
      currency: null,
      category_slug: 'food_dining',
      description: null,
      merchant: null,
      date: null,
      period: null,
      correction_field: null,
      suggested_category_name: null,
      payment_type: null,
      payment_method_name: null,
      target_month: null,
      target_year: null,
      rule_type: 'spending_limit',
      rule_name: 'Limite comida 100',
      rule_period: 'monthly',
      error_message: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('avisa si gasto mas de 100 en comida', TEST_CATEGORIES);

    expect(result.intent).toBe('set_rule');
    expect(result.rule_type).toBe('spending_limit');
    expect(result.rule_name).toBe('Limite comida 100');
    expect(result.rule_period).toBe('monthly');
    expect(result.amount).toBe(100);
    expect(result.category_slug).toBe('food_dining');
  });

  it('maps list_rules intent', async () => {
    const apiResponse: ParseResult = {
      intent: 'list_rules',
      confidence: 0.95,
      amount: null,
      currency: null,
      category_slug: null,
      description: null,
      merchant: null,
      date: null,
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
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('mis reglas', TEST_CATEGORIES);

    expect(result.intent).toBe('list_rules');
  });

  it('maps delete_rule intent with category', async () => {
    const apiResponse: ParseResult = {
      intent: 'delete_rule',
      confidence: 0.9,
      amount: null,
      currency: null,
      category_slug: 'food_dining',
      description: null,
      merchant: null,
      date: null,
      period: null,
      correction_field: null,
      suggested_category_name: null,
      payment_type: null,
      payment_method_name: null,
      target_month: null,
      target_year: null,
      rule_type: null,
      rule_name: 'comida',
      rule_period: null,
      error_message: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseMessage('borra la regla de comida', TEST_CATEGORIES);

    expect(result.intent).toBe('delete_rule');
    expect(result.category_slug).toBe('food_dining');
    expect(result.rule_name).toBe('comida');
  });

  it('defaults rule fields to null when AI omits them', async () => {
    const partialResponse = {
      intent: 'log_expense',
      confidence: 0.9,
      amount: 50,
      currency: 'PEN',
      category_slug: 'food_dining',
      description: 'comida',
      merchant: null,
      date: '2026-02-26',
      period: null,
      correction_field: null,
      suggested_category_name: null,
      payment_type: null,
      payment_method_name: null,
      target_month: null,
      target_year: null,
      error_message: null,
      // Missing: rule_type, rule_name, rule_period
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(partialResponse) }],
    });

    const result = await parseMessage('comida 50', TEST_CATEGORIES);

    expect(result.rule_type).toBeNull();
    expect(result.rule_name).toBeNull();
    expect(result.rule_period).toBeNull();
  });
});
