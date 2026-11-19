import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Category } from '../../src/types.js';

let mockCreate: ReturnType<typeof vi.fn>;

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockCreate(...args) };
  },
}));

vi.mock('../../src/config.js', () => ({
  ANTHROPIC_API_KEY: 'sk-ant-test',
  DEFAULT_TIMEZONE: 'America/Lima',
}));

import { categorizeMerchant } from '../../src/categorize-merchant.js';

const categories: Category[] = [
  { id: 'c1', user_id: 'u1', name: 'Transport', slug: 'transport', icon: '🚗', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'c2', user_id: 'u1', name: 'Deportes', slug: 'deportes', icon: '🎾', is_default: false, created_at: '2026-01-01T00:00:00Z' },
  { id: 'c3', user_id: 'u1', name: 'Other', slug: 'other', icon: '📌', is_default: true, created_at: '2026-01-01T00:00:00Z' },
];

function reply(body: unknown) {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }],
  });
}

const FALLBACK = {
  category_slug: null,
  suggested_category_name: null,
  description: null,
  confidence: 0,
};

describe('categorizeMerchant', () => {
  beforeEach(() => {
    mockCreate = vi.fn();
  });

  it('returns the model\'s categorization', async () => {
    reply({ category_slug: 'transport', suggested_category_name: null, description: 'Uber', confidence: 0.95 });

    const result = await categorizeMerchant('DLC*UBER RIDES', 22.9, 'PEN', categories);
    expect(result).toEqual({
      category_slug: 'transport',
      suggested_category_name: null,
      description: 'Uber',
      confidence: 0.95,
    });
  });

  it('makes exactly one call with the parse.ts model settings', async () => {
    reply({ category_slug: 'transport', suggested_category_name: null, description: 'Uber', confidence: 0.9 });
    await categorizeMerchant('DLC*UBER RIDES', 22.9, 'PEN', categories);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0];
    expect(args.model).toBe('claude-sonnet-4-5-20250929');
    expect(args.temperature).toBe(0);
    expect(args.max_tokens).toBe(1024);
  });

  it('sends the merchant, amount and currency, and lists the user\'s categories', async () => {
    reply({ category_slug: 'deportes', suggested_category_name: null, description: 'X3 Padel Club', confidence: 0.9 });
    await categorizeMerchant('IZI*X3 PADEL CLUB', 57.75, 'PEN', categories);

    const args = mockCreate.mock.calls[0][0];
    const userContent = JSON.stringify(args.messages);
    expect(userContent).toContain('IZI*X3 PADEL CLUB');
    expect(userContent).toContain('57.75');
    expect(userContent).toContain('PEN');
    expect(args.system).toContain('"deportes"');
    expect(args.system).toContain('Deportes');
  });

  it('accepts a fenced JSON response', async () => {
    reply('```json\n{"category_slug":"transport","suggested_category_name":null,"description":"Cabify","confidence":0.9}\n```');
    const result = await categorizeMerchant('PYU*Cabify PE', 18.9, 'PEN', categories);
    expect(result.category_slug).toBe('transport');
  });

  it('nulls a slug that is not one of the user\'s categories', async () => {
    reply({ category_slug: 'groceries', suggested_category_name: null, description: 'Wong', confidence: 0.9 });
    const result = await categorizeMerchant('E WONG BENAVIDES', 100, 'PEN', categories);
    expect(result.category_slug).toBeNull();
    expect(result.description).toBe('Wong');
  });

  it('passes through a suggested new category when nothing fits', async () => {
    reply({ category_slug: null, suggested_category_name: 'Suscripciones', description: 'Netflix', confidence: 0.85 });
    const result = await categorizeMerchant('NETFLIX.COM', 39.9, 'PEN', categories);
    expect(result).toMatchObject({ category_slug: null, suggested_category_name: 'Suscripciones' });
  });

  it('drops the suggestion when an existing slug was chosen', async () => {
    reply({ category_slug: 'transport', suggested_category_name: 'Taxis', description: 'Uber', confidence: 0.9 });
    const result = await categorizeMerchant('DLC*UBER RIDES', 10, 'PEN', categories);
    expect(result.suggested_category_name).toBeNull();
  });

  it('clamps confidence to 0..1 and defaults a missing one to 0', async () => {
    reply({ category_slug: 'transport', description: 'Uber', confidence: 7 });
    expect((await categorizeMerchant('DLC*UBER RIDES', 10, 'PEN', categories)).confidence).toBe(1);

    reply({ category_slug: 'transport', description: 'Uber' });
    expect((await categorizeMerchant('DLC*UBER RIDES', 10, 'PEN', categories)).confidence).toBe(0);
  });

  it('returns the zero-confidence fallback on invalid JSON', async () => {
    reply('sorry, I cannot help');
    expect(await categorizeMerchant('X', 1, 'PEN', categories)).toEqual(FALLBACK);
  });

  it('returns the zero-confidence fallback on an API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('overloaded'));
    expect(await categorizeMerchant('X', 1, 'PEN', categories)).toEqual(FALLBACK);
  });

  it('returns the zero-confidence fallback on a non-text response', async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });
    expect(await categorizeMerchant('X', 1, 'PEN', categories)).toEqual(FALLBACK);
  });
});
