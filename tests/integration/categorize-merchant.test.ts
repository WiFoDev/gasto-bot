import { describe, it, expect } from 'vitest';
import { MERCHANT_FIXTURES, USER_CATEGORY_SEED } from '../fixtures/merchants.js';
import type { Category } from '../../src/types.js';

// Real Claude calls through the production code path (one call per merchant).
const { categorizeMerchant } = await import('../../src/categorize-merchant.js');

const CATEGORIES: Category[] = USER_CATEGORY_SEED.map((c, i) => ({
  id: String(i + 1),
  user_id: 'u1',
  name: c.name,
  slug: c.slug,
  icon: c.icon,
  is_default: i < 9,
  created_at: '2026-01-01T00:00:00Z',
}));

const GATE_THRESHOLD = 0.8;

describe('merchant categorizer accuracy (GATE #5)', () => {
  it(`categorizes ≥ ${GATE_THRESHOLD * 100}% of real BCP merchants correctly`, async () => {
    const results = await Promise.all(
      MERCHANT_FIXTURES.map(async (f) => {
        const r = await categorizeMerchant(f.merchant, f.amount, f.currency, CATEGORIES);
        return { ...f, actual: r.category_slug, suggested: r.suggested_category_name, description: r.description, confidence: r.confidence };
      }),
    );

    const failures = results.filter((r) => r.actual !== r.expected_slug);
    const accuracy = (results.length - failures.length) / results.length;

    for (const r of results) {
      console.log(JSON.stringify({
        merchant: r.merchant,
        expected: r.expected_slug,
        actual: r.actual,
        suggested: r.suggested,
        description: r.description,
        confidence: r.confidence,
        pass: r.actual === r.expected_slug,
      }));
    }
    console.log(JSON.stringify({
      event: 'gate_5_result',
      total: results.length,
      passed: results.length - failures.length,
      accuracy: Math.round(accuracy * 1000) / 10,
    }));

    // Every result must at least carry a clean description.
    expect(results.every((r) => typeof r.description === 'string' && r.description.length > 0)).toBe(true);
    expect(accuracy).toBeGreaterThanOrEqual(GATE_THRESHOLD);
  }, 120_000);
});
