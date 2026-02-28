import type { Expense, Category, PendingExpense, Budget, SummaryResult } from './types.js';

const MAX_DESCRIPTION_LENGTH = 50;

/**
 * Format a currency amount for display.
 * PEN → "S/35.00", USD → "$23.50", other → "100.00 EUR"
 */
export function formatCurrency(amount: number, currency: string): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  switch (currency) {
    case 'PEN':
      return `S/${formatted}`;
    case 'USD':
      return `$${formatted}`;
    default:
      return `${formatted} ${currency}`;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

export function formatExpenseConfirmation(
  expense: Expense,
  category: Category,
): string {
  const amount = formatCurrency(expense.amount, expense.currency);
  const date = formatDate(expense.date);

  let line1 = `✅ ${amount} — ${category.icon} ${category.name}`;

  const detail: string[] = [];
  if (expense.description) {
    let desc = `"${truncate(expense.description, MAX_DESCRIPTION_LENGTH)}"`;
    if (expense.merchant) desc += ` at ${expense.merchant}`;
    detail.push(desc);
  } else if (expense.merchant) {
    detail.push(expense.merchant);
  }
  detail.push(date);

  const line2 = detail.join(' · ');

  return `${line1}\n${line2}`;
}

export function formatClarification(pending: PendingExpense): string {
  const amount = formatCurrency(pending.amount, pending.currency);
  return `Got it — ${amount}. What was it for?`;
}

export function formatError(): string {
  return 'Something went wrong, try again.';
}

export function formatCorrection(
  expense: Expense,
  oldCategory: Category,
  newCategory: Category,
): string {
  const amount = formatCurrency(expense.amount, expense.currency);
  return `✅ Updated: ${amount} — ${newCategory.icon} ${newCategory.name} (was: ${oldCategory.icon} ${oldCategory.name})`;
}

export function formatAmountCorrection(
  expense: Expense,
  category: Category,
  oldAmount: number,
): string {
  const newAmount = formatCurrency(expense.amount, expense.currency);
  const old = formatCurrency(oldAmount, expense.currency);
  return `✅ Updated: ${newAmount} — ${category.icon} ${category.name} (was: ${old})`;
}

export function formatDeletion(expense: Expense, category: Category): string {
  const amount = formatCurrency(expense.amount, expense.currency);
  const date = formatDate(expense.date);
  return `🗑️ Deleted: ${amount} — ${category.icon} ${category.name} · ${date}`;
}

export function formatNoExpenseToModify(): string {
  return 'No recent expense to modify.';
}

export function formatHelp(): string {
  return `Here's what I can do:

📝 Log expense — "almuerzo 35 soles"
📊 Summary — "how much this week?"
💰 Set budget — "set food budget 800 monthly"
✏️ Correct — "wrong, it's transport"
🗑️ Delete — "delete that"
🧾 Receipt — send a photo

Just type naturally, I'll figure it out!`;
}

export function formatBudgetConfirmation(
  category: Category | null,
  amount: number,
  currency: string,
  period: 'weekly' | 'monthly',
): string {
  const amountStr = formatCurrency(amount, currency);
  const label = category ? `${category.icon} ${category.name}` : 'Overall';
  return `💰 ${label} budget set to ${amountStr} ${period}`;
}

export function formatBudgetStatus(
  category: Category | null,
  budget: Budget,
  spent: number,
  daysRemaining: number,
): string {
  const label = category ? `${category.icon} ${category.name}` : '📊 Overall';
  const budgetAmount = formatCurrency(budget.amount, budget.currency);
  const spentAmount = formatCurrency(spent, budget.currency);
  const remaining = budget.amount - spent;
  const remainingAmount = formatCurrency(Math.max(remaining, 0), budget.currency);
  const percentage = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;
  const periodLabel = budget.period === 'weekly' ? 'week' : 'month';

  let msg = `${label}\nSpent: ${spentAmount} / ${budgetAmount} (${percentage}%)\nRemaining: ${remainingAmount}`;

  if (remaining < 0) {
    const overAmount = formatCurrency(Math.abs(remaining), budget.currency);
    msg += `\n🚨 Over budget by ${overAmount}!`;
  } else if (percentage >= 80) {
    msg += `\n⚠️ ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left in ${periodLabel}`;
  }
  return msg;
}

function formatPeriodHeader(
  period: 'today' | 'week' | 'month',
  startDate: string,
  endDate: string,
): string {
  const start = formatDate(startDate);
  const end = formatDate(endDate);

  switch (period) {
    case 'today':
      return `Today (${start})`;
    case 'week':
      return startDate === endDate ? `This Week (${start})` : `This Week (${start}–${end})`;
    case 'month':
      return startDate === endDate ? `This Month (${start})` : `This Month (${start}–${end})`;
  }
}

export function formatSummary(
  summary: SummaryResult,
  period: 'today' | 'week' | 'month',
  currency: string,
): string {
  const header = formatPeriodHeader(period, summary.startDate, summary.endDate);
  const total = formatCurrency(summary.total, currency);

  let msg = `📊 ${header}\nTotal: ${total}`;

  if (summary.byCategory.length === 0) {
    msg += '\n\nNo expenses recorded.';
    return msg;
  }

  msg += '\n';
  for (const cat of summary.byCategory) {
    const amount = formatCurrency(cat.total, currency);
    msg += `\n${cat.icon} ${cat.name}  ${amount}`;
  }

  return msg;
}

export function formatReceiptConfirmation(
  pending: PendingExpense,
  category: Category,
): string {
  const amount = formatCurrency(pending.amount, pending.currency);
  let msg = `🧾 ${pending.merchant ?? 'Receipt'} — ${amount}`;
  msg += `\nCategory: ${category.icon} ${category.name} · ${formatDate(pending.date)}`;
  msg += '\nLook right?';
  return msg;
}

export function formatReceiptUnclear(): string {
  return "Couldn't read that clearly. What was the total and where was it from?";
}

export function formatNoBudget(category: Category | null): string {
  const label = category ? `${category.icon} ${category.name}` : 'overall';
  return `No budget set for ${label}. Try "set ${category?.slug ?? ''} budget 500 monthly"`;
}

export function formatUnknownUser(): string {
  return 'This is a personal bot.';
}

export function formatUnsupportedMedia(): string {
  return 'I can only process text and photos right now.';
}
