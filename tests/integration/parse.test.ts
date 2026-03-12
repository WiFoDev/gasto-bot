import { describe, it, expect, afterAll } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { expenseParserPrompt } from '../../src/prompts/expense-parser.js';
import { MESSAGE_FIXTURES, type MessageFixture } from '../fixtures/messages.js';
import type { Category, ParseResult } from '../../src/types.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

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

// Match parseMessage() — same model, params, date format
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
}).format(new Date());

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

async function parse(message: string): Promise<ParseResult> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    temperature: 0,
    system: expenseParserPrompt(CATEGORIES, TODAY),
    messages: [{ role: 'user', content: message }],
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
  input: string;
  checks: Check[];
}

function evaluateFixture(fixture: MessageFixture, result: ParseResult): Check[] {
  const checks: Check[] = [];
  const exp = fixture.expected;

  checks.push({
    field: 'intent',
    passed: result.intent === exp.intent,
    expected: exp.intent,
    actual: result.intent,
  });

  if (exp.amount !== undefined) {
    checks.push({
      field: 'amount',
      passed: result.amount === exp.amount,
      expected: exp.amount,
      actual: result.amount,
    });
  }

  if (exp.category_slug !== undefined) {
    checks.push({
      field: 'category_slug',
      passed: result.category_slug === exp.category_slug,
      expected: exp.category_slug,
      actual: result.category_slug,
    });
  }

  if (exp.currency !== undefined) {
    checks.push({
      field: 'currency',
      passed: result.currency === exp.currency,
      expected: exp.currency,
      actual: result.currency,
    });
  }

  if (exp.period !== undefined) {
    checks.push({
      field: 'period',
      passed: result.period === exp.period,
      expected: exp.period,
      actual: result.period,
    });
  }

  if (exp.correction_field !== undefined) {
    checks.push({
      field: 'correction_field',
      passed: result.correction_field === exp.correction_field,
      expected: exp.correction_field,
      actual: result.correction_field,
    });
  }

  if (exp.category_slug_null === true) {
    checks.push({
      field: 'category_slug_null',
      passed: result.category_slug === null,
      expected: null,
      actual: result.category_slug,
    });
  }

  if (exp.suggested_category_name !== undefined) {
    checks.push({
      field: 'suggested_category_name',
      passed: result.suggested_category_name === exp.suggested_category_name,
      expected: exp.suggested_category_name,
      actual: result.suggested_category_name,
    });
  }

  if (exp.payment_type !== undefined) {
    checks.push({
      field: 'payment_type',
      passed: result.payment_type === exp.payment_type,
      expected: exp.payment_type,
      actual: result.payment_type,
    });
  }

  if (exp.payment_method_name !== undefined) {
    checks.push({
      field: 'payment_method_name',
      passed: result.payment_method_name === exp.payment_method_name,
      expected: exp.payment_method_name,
      actual: result.payment_method_name,
    });
  }

  if (exp.target_month !== undefined) {
    checks.push({
      field: 'target_month',
      passed: result.target_month === exp.target_month,
      expected: exp.target_month,
      actual: result.target_month,
    });
  }

  if (exp.target_year !== undefined) {
    checks.push({
      field: 'target_year',
      passed: result.target_year === exp.target_year,
      expected: exp.target_year,
      actual: result.target_year,
    });
  }

  if (exp.rule_type !== undefined) {
    checks.push({
      field: 'rule_type',
      passed: result.rule_type === exp.rule_type,
      expected: exp.rule_type,
      actual: result.rule_type,
    });
  }

  if (exp.rule_period !== undefined) {
    checks.push({
      field: 'rule_period',
      passed: result.rule_period === exp.rule_period,
      expected: exp.rule_period,
      actual: result.rule_period,
    });
  }

  if (exp.rule_name !== undefined) {
    checks.push({
      field: 'rule_name',
      passed: result.rule_name === exp.rule_name,
      expected: exp.rule_name,
      actual: result.rule_name,
    });
  }

  return checks;
}

describe('parse accuracy validation (GATE #3)', () => {
  const allResults: FixtureResult[] = [];

  for (const fixture of MESSAGE_FIXTURES) {
    it(`"${fixture.input}" — ${fixture.label}`, async () => {
      const result = await parse(fixture.input);

      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');

      const checks = evaluateFixture(fixture, result);
      allResults.push({ label: fixture.label, input: fixture.input, checks });

      const failures = checks.filter((c) => !c.passed);
      if (failures.length) {
        console.log(
          `  ⚠ "${fixture.input}" — failures: ${failures.map((f) => `${f.field}(expected=${f.expected}, got=${f.actual})`).join(', ')}`,
        );
      }
    }, 30_000);
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
    console.log('  PARSE ACCURACY REPORT');
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
            `    "${r.input}" — ${c.field}: expected=${c.expected}, got=${c.actual}`,
          );
        }
      }
      console.log('');
    }

    console.log('══════════════════════════════════════════════\n');

    expect(
      accuracy,
      `Parse accuracy ${(accuracy * 100).toFixed(1)}% is below the 85% gate threshold`,
    ).toBeGreaterThanOrEqual(0.85);
  });
});
