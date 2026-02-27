import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { receiptParserPrompt } from '../../src/prompts/receipt-parser.js';
import { RECEIPT_FIXTURES, type ReceiptFixture } from '../fixtures/receipts.js';
import type { ReceiptResult } from '../../src/types.js';

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
    system: receiptParserPrompt(TODAY),
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
      allResults.push({ label: fixture.label, filename: fixture.filename, checks });

      const failures = checks.filter((c) => !c.passed);
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

    console.log('══════════════════════════════════════════════\n');

    expect(
      accuracy,
      `Receipt parse accuracy ${(accuracy * 100).toFixed(1)}% is below the 70% gate threshold`,
    ).toBeGreaterThanOrEqual(0.7);
  });
});
