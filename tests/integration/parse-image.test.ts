import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { receiptParserPrompt } from '../../src/prompts/receipt-parser.js';
import { RECEIPT_FIXTURES, type ReceiptFixture } from '../fixtures/receipts.js';
import type { Category, ReceiptResult } from '../../src/types.js';

// Default categories (seed.sql) — same list the text-parse integration test uses
const CATEGORIES: Category[] = [
  { id: '1', user_id: 'u1', name: 'Food & Dining', slug: 'food_dining', icon: '🍽', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '2', user_id: 'u1', name: 'Transport', slug: 'transport', icon: '🚗', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '3', user_id: 'u1', name: 'Groceries', slug: 'groceries', icon: '🛒', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '4', user_id: 'u1', name: 'Entertainment', slug: 'entertainment', icon: '🎬', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '5', user_id: 'u1', name: 'Health', slug: 'health', icon: '💊', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '6', user_id: 'u1', name: 'Shopping', slug: 'shopping', icon: '🛍', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '7', user_id: 'u1', name: 'Bills & Utilities', slug: 'bills_utilities', icon: '💡', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '8', user_id: 'u1', name: 'Education', slug: 'education', icon: '📚', is_default: true, created_at: '2026-01-01T00:00:00Z' },
  { id: '9', user_id: 'u1', name: 'Other', slug: 'other', icon: '📌', is_default: true, created_at: '2026-01-01T00:00:00Z' },
];

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const RECEIPTS_DIR = join(import.meta.dirname, '../fixtures/receipts');

const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
}).format(new Date());

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_BASE64_BYTES = 5_242_880; // 5 MB — Anthropic Vision API limit

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

function getMediaType(filename: string): MediaType {
  const ext = extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

async function parseReceipt(imageBuffer: Buffer, mediaType: MediaType): Promise<ReceiptResult> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    temperature: 0,
    system: receiptParserPrompt(CATEGORIES, TODAY),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBuffer.toString('base64'),
            },
          },
          {
            type: 'text',
            text: 'Extract the receipt data.',
          },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(extractJson(text));
}

interface Check {
  field: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
}

interface FixtureResult {
  label: string;
  filename: string;
  checks: Check[];
  /** Separate from the GATE #2 checks — only present when the fixture sets category_slug */
  categoryCheck: Check | null;
}

function normalizeString(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function evaluateFixture(fixture: ReceiptFixture, result: ReceiptResult): Check[] {
  const checks: Check[] = [];
  const exp = fixture.expected;

  // Merchant check: case-insensitive, normalized comparison
  const merchantPassed =
    result.merchant !== null &&
    normalizeString(result.merchant).includes(normalizeString(exp.merchant));
  checks.push({
    field: 'merchant',
    passed: merchantPassed,
    expected: exp.merchant,
    actual: result.merchant,
  });

  // Amount check: exact match (numbers)
  checks.push({
    field: 'amount',
    passed: result.amount === exp.amount,
    expected: exp.amount,
    actual: result.amount,
  });

  // Currency check (optional — only if specified in fixture)
  if (exp.currency !== undefined) {
    checks.push({
      field: 'currency',
      passed: result.currency === exp.currency,
      expected: exp.currency,
      actual: result.currency,
    });
  }

  return checks;
}

describe('receipt parse accuracy validation (GATE #2)', () => {
  // Verify fixtures exist
  const imageFiles = readdirSync(RECEIPTS_DIR).filter((f) =>
    SUPPORTED_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  if (RECEIPT_FIXTURES.length === 0) {
    it.skip('no receipt fixtures defined — add entries to tests/fixtures/receipts.ts', () => {});
    return;
  }

  // Verify all fixture files exist
  for (const fixture of RECEIPT_FIXTURES) {
    if (!imageFiles.includes(fixture.filename)) {
      throw new Error(
        `Fixture references "${fixture.filename}" but file not found in ${RECEIPTS_DIR}. Available: ${imageFiles.join(', ') || '(none)'}`,
      );
    }
  }

  const allResults: FixtureResult[] = [];

  for (const fixture of RECEIPT_FIXTURES) {
    it(`"${fixture.filename}" — ${fixture.label}`, async () => {
      const imagePath = join(RECEIPTS_DIR, fixture.filename);
      const imageBuffer = readFileSync(imagePath);

      if (imageBuffer.length > MAX_BASE64_BYTES) {
        throw new Error(
          `"${fixture.filename}" is ${(imageBuffer.length / 1_048_576).toFixed(1)}MB — exceeds 5MB API limit. Resize it first.`,
        );
      }

      const mediaType = getMediaType(fixture.filename);
      const result = await parseReceipt(imageBuffer, mediaType);

      expect(result).toHaveProperty('merchant');
      expect(result).toHaveProperty('amount');
      expect(result).toHaveProperty('confidence');

      const checks = evaluateFixture(fixture, result);
      const categoryCheck: Check | null =
        fixture.expected.category_slug !== undefined
          ? {
              field: 'category_slug',
              passed: result.category_slug === fixture.expected.category_slug,
              expected: fixture.expected.category_slug,
              actual: result.category_slug,
            }
          : null;
      allResults.push({ label: fixture.label, filename: fixture.filename, checks, categoryCheck });

      const failures = [...checks, ...(categoryCheck ? [categoryCheck] : [])].filter((c) => !c.passed);
      if (failures.length) {
        console.log(
          `  ⚠ "${fixture.filename}" — failures: ${failures.map((f) => `${f.field}(expected=${f.expected}, got=${f.actual})`).join(', ')}`,
        );
      }
    }, 60_000);
  }

  afterAll(() => {
    if (allResults.length === 0) return;

    const allChecks = allResults.flatMap((r) => r.checks);
    const passed = allChecks.filter((c) => c.passed).length;
    const total = allChecks.length;
    const accuracy = passed / total;

    // Breakdown by field
    const byField = new Map<string, { passed: number; total: number }>();
    for (const check of allChecks) {
      const entry = byField.get(check.field) ?? { passed: 0, total: 0 };
      entry.total++;
      if (check.passed) entry.passed++;
      byField.set(check.field, entry);
    }

    console.log('\n══════════════════════════════════════════════');
    console.log('  RECEIPT PARSE ACCURACY REPORT');
    console.log('══════════════════════════════════════════════');
    console.log(`  Overall: ${passed}/${total} = ${(accuracy * 100).toFixed(1)}%`);
    console.log('');
    for (const [field, stats] of byField) {
      const pct = ((stats.passed / stats.total) * 100).toFixed(1);
      console.log(`  ${field}: ${stats.passed}/${stats.total} = ${pct}%`);
    }
    console.log('');

    const failures = allResults.filter((r) => r.checks.some((c) => !c.passed));
    if (failures.length) {
      console.log('  FAILURES:');
      for (const r of failures) {
        const failedChecks = r.checks.filter((c) => !c.passed);
        for (const c of failedChecks) {
          console.log(
            `    "${r.filename}" — ${c.field}: expected=${c.expected}, got=${c.actual}`,
          );
        }
      }
      console.log('');
    }

    const categoryChecks = allResults
      .map((r) => r.categoryCheck)
      .filter((c): c is Check => c !== null);
    const categoryPassed = categoryChecks.filter((c) => c.passed).length;
    const categoryAccuracy = categoryChecks.length ? categoryPassed / categoryChecks.length : 1;
    if (categoryChecks.length) {
      console.log(
        `  Category: ${categoryPassed}/${categoryChecks.length} = ${(categoryAccuracy * 100).toFixed(1)}%`,
      );
      for (const r of allResults) {
        if (r.categoryCheck && !r.categoryCheck.passed) {
          console.log(
            `    "${r.filename}" — category_slug: expected=${r.categoryCheck.expected}, got=${r.categoryCheck.actual}`,
          );
        }
      }
      console.log('');
    }

    console.log('══════════════════════════════════════════════\n');

    expect(
      categoryAccuracy,
      `Receipt category accuracy ${(categoryAccuracy * 100).toFixed(1)}% is below the 70% threshold`,
    ).toBeGreaterThanOrEqual(0.7);

    expect(
      accuracy,
      `Receipt parse accuracy ${(accuracy * 100).toFixed(1)}% is below the 70% gate threshold`,
    ).toBeGreaterThanOrEqual(0.7);
  });
});
