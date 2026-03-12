import type { FinancialRule, PaymentType } from './types.js';

export interface ExpenseForRuleCheck {
  amount: number;
  category_id: string;
  payment_type: PaymentType | null;
  payment_method_name: string | null;
}

export interface RuleViolation {
  rule: FinancialRule;
  spent: number | null;
}

/** Key format: `${categoryId}_${period}` or `all_${period}` for global rules */
export type PeriodSpending = Record<string, number>;

function getSpendingKey(categoryId: string | null, period: string): string {
  return `${categoryId ?? 'all'}_${period}`;
}

/**
 * Check an expense against active financial rules.
 * Pure function — no side effects, no DB calls.
 *
 * @param expense  The expense being checked
 * @param rules    All rules for the user (active filtering done here)
 * @param periodSpending  Pre-fetched period spending totals keyed by `${categoryId}_${period}`
 */
export function checkRules(
  expense: ExpenseForRuleCheck,
  rules: FinancialRule[],
  periodSpending: PeriodSpending,
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const rule of rules) {
    if (!rule.is_active) continue;

    switch (rule.rule_type) {
      case 'spending_limit': {
        if (rule.threshold == null || rule.period == null) break;
        if (rule.category_id != null && rule.category_id !== expense.category_id) break;

        const key = getSpendingKey(rule.category_id, rule.period);
        const spent = periodSpending[key] ?? 0;

        if (spent >= rule.threshold) {
          violations.push({ rule, spent });
        }
        break;
      }

      case 'prohibition': {
        if (rule.category_id != null && rule.category_id === expense.category_id) {
          violations.push({ rule, spent: null });
        }
        break;
      }

      case 'payment_default': {
        if (rule.action_value == null) break;
        if (rule.category_id != null && rule.category_id !== expense.category_id) break;

        const actualPayment = expense.payment_method_name ?? expense.payment_type ?? null;

        if (actualPayment != null && actualPayment.toLowerCase() !== rule.action_value.toLowerCase()) {
          violations.push({ rule, spent: null });
        }
        break;
      }

      case 'habit': {
        if (rule.threshold == null || rule.period == null) break;
        if (rule.category_id != null && rule.category_id !== expense.category_id) break;

        const key = getSpendingKey(rule.category_id, rule.period);
        const spent = periodSpending[key] ?? 0;

        if (spent >= rule.threshold) {
          violations.push({ rule, spent });
        }
        break;
      }
    }
  }

  return violations;
}
