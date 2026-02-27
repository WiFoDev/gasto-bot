import { getUserByPhone, getCategories, getCategoryBySlug, insertExpense } from './db.js';
import { parseMessage } from './parse.js';
import { getState, setState, clearState } from './state.js';
import {
  formatExpenseConfirmation,
  formatClarification,
  formatError,
  formatHelp,
  formatCurrency,
} from './formatter.js';
import { CONFIDENCE_AUTO_LOG, CONFIDENCE_CONFIRM } from './config.js';
import type { Category, Expense, ParseResult, PendingExpense, User } from './types.js';

function getTodayDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

async function resolveAndInsertExpense(
  user: User,
  pending: PendingExpense,
  categories: Category[],
): Promise<{ expense: Expense; category: Category }> {
  const category = pending.category_slug
    ? await getCategoryBySlug(user.id, pending.category_slug)
    : null;

  const resolvedCategory =
    category ??
    categories.find((c) => c.slug === 'other') ??
    categories[0];

  const expense = await insertExpense({
    user_id: user.id,
    category_id: resolvedCategory.id,
    amount: pending.amount,
    currency: pending.currency,
    description: pending.description,
    merchant: pending.merchant,
    date: pending.date,
    source: pending.source,
    raw_input: pending.raw_input,
    image_url: pending.image_url,
    ai_confidence: pending.ai_confidence,
  });

  return { expense, category: resolvedCategory };
}

function buildConfirmationMessage(
  pending: PendingExpense,
  category: Category,
): string {
  const amount = formatCurrency(pending.amount, pending.currency);
  let msg = `${amount} — ${category.icon} ${category.name}`;

  if (pending.description) {
    msg += `\n"${pending.description}"`;
    if (pending.merchant) msg += ` at ${pending.merchant}`;
  } else if (pending.merchant) {
    msg += `\n${pending.merchant}`;
  }

  msg += '\nLog it?';
  return msg;
}

async function handleLogExpense(
  phone: string,
  user: User,
  categories: Category[],
  result: ParseResult,
  rawInput: string,
): Promise<string> {
  const today = getTodayDate(user.timezone);

  const pending: PendingExpense = {
    amount: result.amount ?? 0,
    currency: result.currency ?? user.currency,
    category_slug: result.category_slug,
    description: result.description,
    merchant: result.merchant,
    date: result.date ?? today,
    source: 'text',
    raw_input: rawInput,
    image_url: null,
    ai_confidence: result.confidence,
  };

  // If category is unknown/other, ask for clarification regardless of confidence
  const needsClarification =
    !result.category_slug || result.category_slug === 'other';

  // High confidence — auto-log (unless we need a description)
  if (result.confidence >= CONFIDENCE_AUTO_LOG && !needsClarification) {
    const { expense, category } = await resolveAndInsertExpense(user, pending, categories);
    setState(phone, {
      lastAction: 'expense_logged',
      pendingExpense: null,
      lastExpenseId: expense.id,
      updatedAt: Date.now(),
    });
    return formatExpenseConfirmation(expense, category);
  }

  // Mid confidence — ask for confirmation (unless we need a description)
  if (result.confidence >= CONFIDENCE_CONFIRM && !needsClarification) {
    setState(phone, {
      lastAction: 'awaiting_confirmation',
      pendingExpense: pending,
      lastExpenseId: null,
      updatedAt: Date.now(),
    });

    const category = pending.category_slug
      ? categories.find((c) => c.slug === pending.category_slug) ?? null
      : null;
    const resolvedCategory =
      category ??
      categories.find((c) => c.slug === 'other') ??
      categories[0];

    return buildConfirmationMessage(pending, resolvedCategory);
  }

  // Low confidence — ask for clarification
  setState(phone, {
    lastAction: 'awaiting_description',
    pendingExpense: pending,
    lastExpenseId: null,
    updatedAt: Date.now(),
  });
  return formatClarification(pending);
}

const CONFIRM_PATTERN = /^(yes|y|si|sí|ok|dale)$/i;

export async function handleMessage(
  phone: string,
  type: 'text' | 'image',
  content: string,
): Promise<string> {
  // 1. Get user — normalize phone to E.164 (+country format)
  const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
  const user = await getUserByPhone(normalizedPhone);
  if (!user) {
    return formatError();
  }

  // 2. Image handling not yet implemented
  if (type !== 'text') {
    return formatError();
  }

  // 3. Check conversation state
  const state = getState(phone);
  const categories = await getCategories(user.id);

  // 4. Handle awaiting_description — treat reply as category or description
  if (state?.lastAction === 'awaiting_description' && state.pendingExpense) {
    // Check if the reply matches a category name/slug
    const replyLower = content.trim().toLowerCase();
    const matchedCategory = categories.find(
      (c) => c.slug === replyLower || c.name.toLowerCase() === replyLower,
    );
    const pending = matchedCategory
      ? { ...state.pendingExpense, category_slug: matchedCategory.slug, description: content }
      : { ...state.pendingExpense, description: content };
    const { expense, category } = await resolveAndInsertExpense(user, pending, categories);
    setState(phone, {
      lastAction: 'expense_logged',
      pendingExpense: null,
      lastExpenseId: expense.id,
      updatedAt: Date.now(),
    });
    return formatExpenseConfirmation(expense, category);
  }

  // 5. Handle awaiting_confirmation
  if (state?.lastAction === 'awaiting_confirmation' && state.pendingExpense) {
    if (CONFIRM_PATTERN.test(content.trim())) {
      const { expense, category } = await resolveAndInsertExpense(
        user,
        state.pendingExpense,
        categories,
      );
      setState(phone, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: expense.id,
        updatedAt: Date.now(),
      });
      return formatExpenseConfirmation(expense, category);
    }
    // Not confirmed — clear state, fall through to re-parse
    clearState(phone);
  }

  // 6. Parse the message
  const result = await parseMessage(content, categories);

  // 7. Route by intent
  switch (result.intent) {
    case 'log_expense':
      return handleLogExpense(phone, user, categories, result, content);
    case 'help':
      return formatHelp();
    case 'unknown':
    case 'error':
    default:
      return formatError();
  }
}
