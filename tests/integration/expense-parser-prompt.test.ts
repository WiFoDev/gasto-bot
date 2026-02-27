import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { expenseParserPrompt } from '../../src/prompts/expense-parser.js';
import type { Category, ParseResult } from '../../src/types.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const VALID_INTENTS = [
  'log_expense',
  'query_summary',
  'set_budget',
  'query_budget',
  'correct_expense',
  'delete_expense',
  'help',
  'unknown',
  'error',
];

const VALID_SLUGS = [
  'food_dining',
  'transport',
  'groceries',
  'entertainment',
  'health',
  'shopping',
  'bills_utilities',
  'education',
  'other',
];

const CATEGORIES: Category[] = [
  { id: '1', user_id: 'u1', name: 'Food & Dining', slug: 'food_dining', icon: '🍽', is_default: true },
  { id: '2', user_id: 'u1', name: 'Transport', slug: 'transport', icon: '🚗', is_default: true },
  { id: '3', user_id: 'u1', name: 'Groceries', slug: 'groceries', icon: '🛒', is_default: true },
  { id: '4', user_id: 'u1', name: 'Entertainment', slug: 'entertainment', icon: '🎬', is_default: true },
  { id: '5', user_id: 'u1', name: 'Health', slug: 'health', icon: '💊', is_default: true },
  { id: '6', user_id: 'u1', name: 'Shopping', slug: 'shopping', icon: '🛍', is_default: true },
  { id: '7', user_id: 'u1', name: 'Bills & Utilities', slug: 'bills_utilities', icon: '💡', is_default: true },
  { id: '8', user_id: 'u1', name: 'Education', slug: 'education', icon: '📚', is_default: true },
  { id: '9', user_id: 'u1', name: 'Other', slug: 'other', icon: '📌', is_default: true },
];

const TODAY = '2026-02-26';

async function parse(message: string): Promise<ParseResult> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    temperature: 0,
    system: expenseParserPrompt(CATEGORIES, TODAY),
    messages: [{ role: 'user', content: message }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text);
}

function assertValidShape(result: ParseResult) {
  expect(VALID_INTENTS).toContain(result.intent);
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  expect(result).toHaveProperty('amount');
  expect(result).toHaveProperty('currency');
  expect(result).toHaveProperty('category_slug');
  expect(result).toHaveProperty('description');
  expect(result).toHaveProperty('merchant');
  expect(result).toHaveProperty('date');
  expect(result).toHaveProperty('period');
  expect(result).toHaveProperty('correction_field');
  expect(result).toHaveProperty('error_message');
}

describe('expense parser prompt smoke test', () => {
  it('parses a simple Spanish expense', async () => {
    const result = await parse('almuerzo 35 soles');
    assertValidShape(result);
    expect(result.intent).toBe('log_expense');
    expect(result.amount).toBe(35);
    expect(result.currency).toBe('PEN');
    expect(result.category_slug).toBe('food_dining');
    expect(result.date).toBe(TODAY);
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  }, 15000);

  it('parses an expense with merchant', async () => {
    const result = await parse('uber 23.5');
    assertValidShape(result);
    expect(result.intent).toBe('log_expense');
    expect(result.amount).toBe(23.5);
    expect(result.category_slug).toBe('transport');
  }, 15000);

  it('parses a summary query', async () => {
    const result = await parse('how much this week?');
    assertValidShape(result);
    expect(result.intent).toBe('query_summary');
    expect(result.period).toBe('week');
  }, 15000);

  it('parses a delete intent', async () => {
    const result = await parse('borra eso');
    assertValidShape(result);
    expect(result.intent).toBe('delete_expense');
  }, 15000);

  it('parses a help request', async () => {
    const result = await parse('ayuda');
    assertValidShape(result);
    expect(result.intent).toBe('help');
  }, 15000);

  it('returns valid JSON with all required fields for ambiguous input', async () => {
    const result = await parse('50');
    assertValidShape(result);
    expect(result.intent).toBe('log_expense');
    expect(result.amount).toBe(50);
    if (result.category_slug !== null) {
      expect(VALID_SLUGS).toContain(result.category_slug);
    }
  }, 15000);

  it('parses a correction intent', async () => {
    const result = await parse('wrong, it was transport');
    assertValidShape(result);
    expect(result.intent).toBe('correct_expense');
    expect(result.category_slug).toBe('transport');
    expect(result.correction_field).toBe('category');
  }, 15000);

  it('handles grocery store expense', async () => {
    const result = await parse('wong 127.50');
    assertValidShape(result);
    expect(result.intent).toBe('log_expense');
    expect(result.amount).toBe(127.5);
    expect(result.category_slug).toBe('groceries');
    expect(result.merchant).toBe('Wong');
  }, 15000);
});
