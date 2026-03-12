import { describe, it, expect } from 'vitest';
import { checkRules } from '../../src/rules.js';
import type { FinancialRule, PaymentType } from '../../src/types.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makeRule(overrides: Partial<FinancialRule> = {}): FinancialRule {
  return {
    id: 'rule-1',
    user_id: 'user-1',
    name: 'Test Rule',
    rule_type: 'spending_limit',
    category_id: null,
    threshold: null,
    period: null,
    action_value: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<{
  amount: number;
  category_id: string;
  payment_type: PaymentType | null;
  payment_method_name: string | null;
}> = {}) {
  return {
    amount: 50,
    category_id: 'cat-food',
    payment_type: null as PaymentType | null,
    payment_method_name: null as string | null,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('checkRules', () => {
  describe('empty/inactive rules', () => {
    it('returns no violations when rules array is empty', () => {
      const violations = checkRules(makeExpense(), [], {});
      expect(violations).toEqual([]);
    });

    it('skips inactive rules', () => {
      const rule = makeRule({
        rule_type: 'prohibition',
        category_id: 'cat-food',
        is_active: false,
      });
      const violations = checkRules(makeExpense(), [rule], {});
      expect(violations).toEqual([]);
    });
  });

  describe('spending_limit', () => {
    it('triggers when spending meets threshold', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: 'cat-food',
        threshold: 100,
        period: 'monthly',
      });
      const spending = { 'cat-food_monthly': 100 };
      const violations = checkRules(makeExpense(), [rule], spending);

      expect(violations).toHaveLength(1);
      expect(violations[0].rule.id).toBe('rule-1');
      expect(violations[0].spent).toBe(100);
    });

    it('triggers when spending exceeds threshold', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: 'cat-food',
        threshold: 100,
        period: 'monthly',
      });
      const spending = { 'cat-food_monthly': 150 };
      const violations = checkRules(makeExpense(), [rule], spending);

      expect(violations).toHaveLength(1);
      expect(violations[0].spent).toBe(150);
    });

    it('does not trigger when spending is below threshold', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: 'cat-food',
        threshold: 100,
        period: 'monthly',
      });
      const spending = { 'cat-food_monthly': 80 };
      const violations = checkRules(makeExpense(), [rule], spending);

      expect(violations).toEqual([]);
    });

    it('does not trigger for a different category', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: 'cat-transport',
        threshold: 50,
        period: 'monthly',
      });
      const spending = { 'cat-transport_monthly': 60 };
      const violations = checkRules(makeExpense({ category_id: 'cat-food' }), [rule], spending);

      expect(violations).toEqual([]);
    });

    it('triggers global rule (null category) for any expense', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: null,
        threshold: 500,
        period: 'monthly',
      });
      const spending = { 'all_monthly': 520 };
      const violations = checkRules(makeExpense(), [rule], spending);

      expect(violations).toHaveLength(1);
      expect(violations[0].spent).toBe(520);
    });

    it('handles weekly period', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: 'cat-food',
        threshold: 200,
        period: 'weekly',
      });
      const spending = { 'cat-food_weekly': 210 };
      const violations = checkRules(makeExpense(), [rule], spending);

      expect(violations).toHaveLength(1);
    });

    it('handles daily period', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: 'cat-food',
        threshold: 30,
        period: 'daily',
      });
      const spending = { 'cat-food_daily': 35 };
      const violations = checkRules(makeExpense(), [rule], spending);

      expect(violations).toHaveLength(1);
    });

    it('skips rule when threshold is null', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: 'cat-food',
        threshold: null,
        period: 'monthly',
      });
      const violations = checkRules(makeExpense(), [rule], {});

      expect(violations).toEqual([]);
    });

    it('skips rule when period is null', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: 'cat-food',
        threshold: 100,
        period: null,
      });
      const violations = checkRules(makeExpense(), [rule], {});

      expect(violations).toEqual([]);
    });

    it('defaults to 0 spending when key is missing from context', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: 'cat-food',
        threshold: 100,
        period: 'monthly',
      });
      // No spending data for cat-food_monthly
      const violations = checkRules(makeExpense(), [rule], {});

      expect(violations).toEqual([]);
    });
  });

  describe('prohibition', () => {
    it('triggers when expense is in prohibited category', () => {
      const rule = makeRule({
        id: 'rule-prohib',
        rule_type: 'prohibition',
        category_id: 'cat-entertainment',
        name: 'No entretenimiento',
      });
      const violations = checkRules(
        makeExpense({ category_id: 'cat-entertainment' }),
        [rule],
        {},
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].rule.id).toBe('rule-prohib');
      expect(violations[0].spent).toBeNull();
    });

    it('does not trigger for a different category', () => {
      const rule = makeRule({
        rule_type: 'prohibition',
        category_id: 'cat-entertainment',
      });
      const violations = checkRules(
        makeExpense({ category_id: 'cat-food' }),
        [rule],
        {},
      );

      expect(violations).toEqual([]);
    });

    it('does not trigger when rule has null category', () => {
      const rule = makeRule({
        rule_type: 'prohibition',
        category_id: null,
      });
      const violations = checkRules(makeExpense(), [rule], {});

      expect(violations).toEqual([]);
    });
  });

  describe('payment_default', () => {
    it('triggers when payment method differs from default', () => {
      const rule = makeRule({
        id: 'rule-pay',
        rule_type: 'payment_default',
        action_value: 'Yape',
        category_id: null,
      });
      const violations = checkRules(
        makeExpense({ payment_method_name: 'Efectivo' }),
        [rule],
        {},
      );

      expect(violations).toHaveLength(1);
      expect(violations[0].rule.id).toBe('rule-pay');
    });

    it('does not trigger when payment method matches (case insensitive)', () => {
      const rule = makeRule({
        rule_type: 'payment_default',
        action_value: 'Yape',
        category_id: null,
      });
      const violations = checkRules(
        makeExpense({ payment_method_name: 'yape' }),
        [rule],
        {},
      );

      expect(violations).toEqual([]);
    });

    it('does not trigger when expense has no payment method', () => {
      const rule = makeRule({
        rule_type: 'payment_default',
        action_value: 'Yape',
        category_id: null,
      });
      const violations = checkRules(
        makeExpense({ payment_type: null, payment_method_name: null }),
        [rule],
        {},
      );

      expect(violations).toEqual([]);
    });

    it('falls back to payment_type when payment_method_name is null', () => {
      const rule = makeRule({
        rule_type: 'payment_default',
        action_value: 'cash',
        category_id: null,
      });
      const violations = checkRules(
        makeExpense({ payment_type: 'credit_card', payment_method_name: null }),
        [rule],
        {},
      );

      expect(violations).toHaveLength(1);
    });

    it('does not trigger when payment_type matches action_value', () => {
      const rule = makeRule({
        rule_type: 'payment_default',
        action_value: 'cash',
        category_id: null,
      });
      const violations = checkRules(
        makeExpense({ payment_type: 'cash', payment_method_name: null }),
        [rule],
        {},
      );

      expect(violations).toEqual([]);
    });

    it('only applies to matching category when category_id is set', () => {
      const rule = makeRule({
        rule_type: 'payment_default',
        action_value: 'Yape',
        category_id: 'cat-food',
      });

      // Different category — should not trigger
      const violations1 = checkRules(
        makeExpense({ category_id: 'cat-transport', payment_method_name: 'Efectivo' }),
        [rule],
        {},
      );
      expect(violations1).toEqual([]);

      // Matching category — should trigger
      const violations2 = checkRules(
        makeExpense({ category_id: 'cat-food', payment_method_name: 'Efectivo' }),
        [rule],
        {},
      );
      expect(violations2).toHaveLength(1);
    });

    it('skips rule when action_value is null', () => {
      const rule = makeRule({
        rule_type: 'payment_default',
        action_value: null,
        category_id: null,
      });
      const violations = checkRules(
        makeExpense({ payment_method_name: 'Yape' }),
        [rule],
        {},
      );

      expect(violations).toEqual([]);
    });
  });

  describe('habit', () => {
    it('triggers when spending meets habit threshold', () => {
      const rule = makeRule({
        id: 'rule-habit',
        rule_type: 'habit',
        category_id: 'cat-food',
        threshold: 200,
        period: 'weekly',
      });
      const spending = { 'cat-food_weekly': 200 };
      const violations = checkRules(makeExpense(), [rule], spending);

      expect(violations).toHaveLength(1);
      expect(violations[0].spent).toBe(200);
    });

    it('does not trigger when below threshold', () => {
      const rule = makeRule({
        rule_type: 'habit',
        category_id: 'cat-food',
        threshold: 200,
        period: 'weekly',
      });
      const spending = { 'cat-food_weekly': 150 };
      const violations = checkRules(makeExpense(), [rule], spending);

      expect(violations).toEqual([]);
    });

    it('does not trigger for different category', () => {
      const rule = makeRule({
        rule_type: 'habit',
        category_id: 'cat-transport',
        threshold: 100,
        period: 'monthly',
      });
      const spending = { 'cat-transport_monthly': 120 };
      const violations = checkRules(
        makeExpense({ category_id: 'cat-food' }),
        [rule],
        spending,
      );

      expect(violations).toEqual([]);
    });

    it('skips when threshold or period is null', () => {
      const rule1 = makeRule({ rule_type: 'habit', threshold: null, period: 'monthly' });
      const rule2 = makeRule({ rule_type: 'habit', threshold: 100, period: null });
      const violations = checkRules(makeExpense(), [rule1, rule2], {});

      expect(violations).toEqual([]);
    });
  });

  describe('multiple rules', () => {
    it('returns violations from multiple matching rules', () => {
      const rules = [
        makeRule({
          id: 'rule-limit',
          rule_type: 'spending_limit',
          category_id: 'cat-food',
          threshold: 100,
          period: 'monthly',
        }),
        makeRule({
          id: 'rule-prohib',
          rule_type: 'prohibition',
          category_id: 'cat-food',
        }),
      ];
      const spending = { 'cat-food_monthly': 120 };
      const violations = checkRules(makeExpense(), rules, spending);

      expect(violations).toHaveLength(2);
      expect(violations.map((v) => v.rule.id)).toEqual(['rule-limit', 'rule-prohib']);
    });

    it('returns only matching violations when some rules do not apply', () => {
      const rules = [
        makeRule({
          id: 'rule-limit-food',
          rule_type: 'spending_limit',
          category_id: 'cat-food',
          threshold: 100,
          period: 'monthly',
        }),
        makeRule({
          id: 'rule-limit-transport',
          rule_type: 'spending_limit',
          category_id: 'cat-transport',
          threshold: 50,
          period: 'monthly',
        }),
        makeRule({
          id: 'rule-pay',
          rule_type: 'payment_default',
          action_value: 'Yape',
          category_id: null,
        }),
      ];
      const spending = { 'cat-food_monthly': 120, 'cat-transport_monthly': 30 };
      const violations = checkRules(
        makeExpense({ payment_method_name: 'Yape' }),
        rules,
        spending,
      );

      // Only the food spending_limit should trigger (transport is below, payment matches)
      expect(violations).toHaveLength(1);
      expect(violations[0].rule.id).toBe('rule-limit-food');
    });

    it('mixes active and inactive rules', () => {
      const rules = [
        makeRule({
          id: 'rule-active',
          rule_type: 'prohibition',
          category_id: 'cat-food',
          is_active: true,
        }),
        makeRule({
          id: 'rule-inactive',
          rule_type: 'prohibition',
          category_id: 'cat-food',
          is_active: false,
        }),
      ];
      const violations = checkRules(makeExpense(), rules, {});

      expect(violations).toHaveLength(1);
      expect(violations[0].rule.id).toBe('rule-active');
    });
  });

  describe('getSpendingKey', () => {
    it('uses "all" for null categoryId in global rules', () => {
      const rule = makeRule({
        rule_type: 'spending_limit',
        category_id: null,
        threshold: 1000,
        period: 'monthly',
      });
      // This key should match what checkRules looks up
      const spending = { 'all_monthly': 1200 };
      const violations = checkRules(makeExpense(), [rule], spending);

      expect(violations).toHaveLength(1);
    });
  });
});
