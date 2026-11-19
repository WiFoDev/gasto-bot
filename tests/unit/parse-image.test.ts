import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Category, ReceiptResult } from '../../src/types.js';

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

import { parseReceipt, detectMediaType } from '../../src/parse-image.js';

const categories: Category[] = [
  { id: 'cat-groceries', user_id: 'user-1', name: 'Groceries', slug: 'groceries', icon: '🛒', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-health', user_id: 'user-1', name: 'Health', slug: 'health', icon: '💊', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-other', user_id: 'user-1', name: 'Other', slug: 'other', icon: '📦', is_default: true, created_at: '2026-01-01T00:00:00Z' },
];

describe('parseReceipt', () => {
  beforeEach(() => {
    mockCreate = vi.fn();
  });

  it('parses a valid receipt response', async () => {
    const apiResponse: ReceiptResult = {
      merchant: 'Plaza Vea',
      amount: 127.5,
      currency: 'PEN',
      date: '2026-02-25',
      confidence: 0.92,
      items: [],
      category_slug: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    // Minimal JPEG buffer (starts with 0xFF 0xD8)
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = await parseReceipt(fakeJpeg, categories);

    expect(result).toEqual(apiResponse);
    expect(result.merchant).toBe('Plaza Vea');
    expect(result.amount).toBe(127.5);
    expect(result.currency).toBe('PEN');
    expect(result.confidence).toBe(0.92);
  });

  it('handles markdown-wrapped JSON response', async () => {
    const apiResponse: ReceiptResult = {
      merchant: 'Wong',
      amount: 89.9,
      currency: 'PEN',
      date: '2026-02-24',
      confidence: 0.85,
      items: [],
      category_slug: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: '```json\n' + JSON.stringify(apiResponse) + '\n```',
        },
      ],
    });

    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await parseReceipt(fakeJpeg, categories);

    expect(result.merchant).toBe('Wong');
    expect(result.amount).toBe(89.9);
  });

  it('returns error result on malformed JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'This is not valid JSON' }],
    });

    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await parseReceipt(fakeJpeg, categories);

    expect(result.merchant).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns error result on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await parseReceipt(fakeJpeg, categories);

    expect(result.merchant).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns error result on empty content array', async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });

    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await parseReceipt(fakeJpeg, categories);

    expect(result.merchant).toBeNull();
    expect(result.amount).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns error result on non-text content', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 't1', name: 'test', input: {} }],
    });

    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await parseReceipt(fakeJpeg, categories);

    expect(result.confidence).toBe(0);
  });

  it('parses a receipt response with line items', async () => {
    const apiResponse: ReceiptResult = {
      merchant: 'Metro',
      amount: 85.40,
      currency: 'PEN',
      date: '2026-03-01',
      confidence: 0.95,
      items: [
        { description: 'Leche Evaporada', quantity: 2, unit_price: 4.50, total: 9.00, subcategory: 'lacteos' },
        { description: 'Pechuga de Pollo', quantity: 1, unit_price: 18.90, total: 18.90, subcategory: 'proteina' },
        { description: 'Detergente Bolivar', quantity: 1, unit_price: 12.50, total: 12.50, subcategory: 'limpieza' },
      ],
      category_slug: 'groceries',
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await parseReceipt(fakeJpeg, categories);

    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toEqual({
      description: 'Leche Evaporada',
      quantity: 2,
      unit_price: 4.50,
      total: 9.00,
      subcategory: 'lacteos',
    });
    expect(result.items[2].subcategory).toBe('limpieza');
  });

  it('defaults items to empty array when not in response', async () => {
    // Simulates a response from before TASK-52 (no items field)
    const apiResponse = {
      merchant: 'Wong',
      amount: 50.00,
      currency: 'PEN',
      date: '2026-03-01',
      confidence: 0.88,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await parseReceipt(fakeJpeg, categories);

    expect(result.items).toEqual([]);
  });

  it('handles null fields in receipt result', async () => {
    const apiResponse: ReceiptResult = {
      merchant: null,
      amount: 50.0,
      currency: 'PEN',
      date: null,
      confidence: 0.45,
      items: [],
      category_slug: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const result = await parseReceipt(fakeJpeg, categories);

    expect(result.merchant).toBeNull();
    expect(result.amount).toBe(50.0);
    expect(result.date).toBeNull();
    expect(result.confidence).toBe(0.45);
  });

  it('sends image as base64 with correct media type', async () => {
    const apiResponse: ReceiptResult = {
      merchant: 'Metro',
      amount: 26.5,
      currency: 'PEN',
      date: '2026-02-25',
      confidence: 0.9,
      items: [],
      category_slug: null,
    };

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    // PNG magic bytes (must be >= 12 bytes for detectMediaType)
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    await parseReceipt(fakePng, categories);

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];

    expect(callArgs.model).toMatch(/claude.*sonnet/);
    expect(callArgs.max_tokens).toBe(4096);
    expect(callArgs.temperature).toBe(0);
    expect(callArgs.system).toContain('receipt');

    const imageContent = callArgs.messages[0].content[0];
    expect(imageContent.type).toBe('image');
    expect(imageContent.source.type).toBe('base64');
    expect(imageContent.source.media_type).toBe('image/png');
    expect(imageContent.source.data).toBe(fakePng.toString('base64'));

    const textContent = callArgs.messages[0].content[1];
    expect(textContent.type).toBe('text');
    expect(textContent.text).toContain('Extract');
  });

  it('returns the category_slug chosen by the model', async () => {
    const apiResponse: ReceiptResult = {
      merchant: 'InkaFarma',
      amount: 32.9,
      currency: 'PEN',
      date: '2026-03-01',
      confidence: 0.93,
      items: [],
      category_slug: 'health',
    };
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(apiResponse) }],
    });

    const result = await parseReceipt(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), categories);

    expect(result.category_slug).toBe('health');
  });

  it('defaults category_slug to null when missing from response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ merchant: 'Wong', amount: 50, currency: 'PEN', date: '2026-03-01', confidence: 0.9, items: [] }) }],
    });

    const result = await parseReceipt(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), categories);

    expect(result.category_slug).toBeNull();
  });

  it('returns category_slug null in the error result', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'));

    const result = await parseReceipt(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), categories);

    expect(result.category_slug).toBeNull();
  });

  it('passes the user categories to the system prompt in a single call', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ merchant: 'Wong', amount: 50, currency: 'PEN', date: '2026-03-01', confidence: 0.9, items: [], category_slug: 'groceries' }) }],
    });

    await parseReceipt(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), categories);

    expect(mockCreate).toHaveBeenCalledOnce();
    const system = mockCreate.mock.calls[0][0].system as string;
    expect(system).toContain('"groceries"');
    expect(system).toContain('Groceries');
    expect(system).toContain('"health"');
    expect(system).toContain('category_slug');
  });
});

describe('detectMediaType', () => {
  it('detects JPEG from magic bytes', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectMediaType(jpeg)).toBe('image/jpeg');
  });

  it('detects PNG from magic bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
    expect(detectMediaType(png)).toBe('image/png');
  });

  it('detects WebP from magic bytes', () => {
    // RIFF....WEBP
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // file size
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(detectMediaType(webp)).toBe('image/webp');
  });

  it('detects GIF from magic bytes', () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectMediaType(gif)).toBe('image/gif');
  });

  it('defaults to JPEG for unknown formats', () => {
    const unknown = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    expect(detectMediaType(unknown)).toBe('image/jpeg');
  });

  it('defaults to JPEG for very small buffers', () => {
    const tiny = Buffer.from([0x00, 0x01]);
    expect(detectMediaType(tiny)).toBe('image/jpeg');
  });
});
