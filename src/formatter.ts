import type { Expense, Category, PendingExpense } from './types.js';

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
