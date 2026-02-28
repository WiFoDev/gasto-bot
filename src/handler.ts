import crypto from 'node:crypto';
import {
  getUserByPhone,
  getCategories,
  getCategoryBySlug,
  insertExpense,
  getExpenseById,
  getLastExpense,
  updateExpense,
  softDeleteExpense,
  upsertBudget,
  getBudget,
  getExpensesTotal,
  getDateRange,
  getExpensesSummary,
} from './db.js';
import { parseMessage } from './parse.js';
import { parseReceipt } from './parse-image.js';
import { downloadImage, uploadImage } from './storage.js';
import { getState, setState, clearState } from './state.js';
import {
  formatExpenseConfirmation,
  formatClarification,
  formatCorrection,
  formatAmountCorrection,
  formatDeletion,
  formatNoExpenseToModify,
  formatError,
  formatParseError,
  formatDatabaseError,
  formatHelp,
  formatCurrency,
  formatBudgetConfirmation,
  formatBudgetStatus,
  formatNoBudget,
  formatSummary,
  formatReceiptConfirmation,
  formatReceiptUnclear,
  formatUnknownUser,
} from './formatter.js';
import { CONFIDENCE_AUTO_LOG, CONFIDENCE_CONFIRM } from './config.js';
import type { Category, Expense, ParseResult, PendingExpense, User } from './types.js';

function getTodayDate(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
}

function getLocalDateParts(timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());

  return {
    year: parseInt(parts.find((p) => p.type === 'year')!.value),
    month: parseInt(parts.find((p) => p.type === 'month')!.value),
    day: parseInt(parts.find((p) => p.type === 'day')!.value),
  };
}

function getPeriodDates(
  period: 'weekly' | 'monthly',
  timezone: string,
): { start: string; end: string } {
  const { year, month, day } = getLocalDateParts(timezone);

  if (period === 'monthly') {
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start: startStr, end: endStr };
  }

  // Weekly: Monday to Sunday
  const todayDate = new Date(year, month - 1, day);
  const dayOfWeek = todayDate.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(year, month - 1, day + mondayOffset);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return { start: fmt(monday), end: fmt(sunday) };
}

function getDaysRemaining(period: 'weekly' | 'monthly', timezone: string): number {
  const { year, month, day } = getLocalDateParts(timezone);

  if (period === 'monthly') {
    const lastDay = new Date(year, month, 0).getDate();
    return lastDay - day;
  }

  // Weekly: days until Sunday
  const todayDate = new Date(year, month - 1, day);
  const dayOfWeek = todayDate.getDay(); // 0=Sun
  return dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
}

function resolveBudgetPeriod(
  parsePeriod: 'today' | 'week' | 'month' | null,
): 'weekly' | 'monthly' {
  if (parsePeriod === 'week') return 'weekly';
  return 'monthly';
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

async function handleSetBudget(
  user: User,
  categories: Category[],
  result: ParseResult,
): Promise<string> {
  if (!result.amount || result.amount <= 0) {
    return formatError();
  }

  const period = resolveBudgetPeriod(result.period);
  const currency = result.currency ?? user.currency;

  let category: Category | null = null;
  if (result.category_slug) {
    category = await getCategoryBySlug(user.id, result.category_slug);
    if (!category) {
      category = categories.find((c) => c.slug === result.category_slug) ?? null;
    }
  }

  const { start } = getPeriodDates(period, user.timezone);

  await upsertBudget(
    user.id,
    category?.id ?? null,
    result.amount,
    currency,
    period,
    start,
  );

  return formatBudgetConfirmation(category, result.amount, currency, period);
}

async function handleQueryBudget(
  user: User,
  categories: Category[],
  result: ParseResult,
): Promise<string> {
  let category: Category | null = null;
  if (result.category_slug) {
    category = await getCategoryBySlug(user.id, result.category_slug);
    if (!category) {
      category = categories.find((c) => c.slug === result.category_slug) ?? null;
    }
  }

  // Try monthly first, then weekly
  let budget = await getBudget(user.id, category?.id ?? null, 'monthly');
  if (!budget) {
    budget = await getBudget(user.id, category?.id ?? null, 'weekly');
  }

  if (!budget) {
    return formatNoBudget(category);
  }

  const { start, end } = getPeriodDates(budget.period, user.timezone);

  const spent = category
    ? await getExpensesTotal(user.id, category.id, start, end)
    : 0;

  const days = getDaysRemaining(budget.period, user.timezone);

  return formatBudgetStatus(category, budget, spent, days);
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

async function resolveLastExpense(
  phone: string,
  user: User,
): Promise<Expense | null> {
  const state = getState(phone);
  if (state?.lastExpenseId) {
    return getExpenseById(state.lastExpenseId);
  }
  return getLastExpense(user.id);
}

async function handleCorrectExpense(
  phone: string,
  user: User,
  categories: Category[],
  result: ParseResult,
): Promise<string> {
  const expense = await resolveLastExpense(phone, user);
  if (!expense) {
    return formatNoExpenseToModify();
  }

  if (result.correction_field === 'category' && result.category_slug) {
    const newCategory = await getCategoryBySlug(user.id, result.category_slug);
    if (!newCategory) return formatError();

    const oldCategory = categories.find((c) => c.id === expense.category_id);
    if (!oldCategory) return formatError();

    const updated = await updateExpense(expense.id, { category_id: newCategory.id });
    setState(phone, {
      lastAction: 'expense_logged',
      pendingExpense: null,
      lastExpenseId: updated.id,
      updatedAt: Date.now(),
    });
    return formatCorrection(updated, oldCategory, newCategory);
  }

  if (result.correction_field === 'amount' && result.amount != null) {
    const oldAmount = expense.amount;
    const category = categories.find((c) => c.id === expense.category_id);
    if (!category) return formatError();

    const updated = await updateExpense(expense.id, { amount: result.amount });
    setState(phone, {
      lastAction: 'expense_logged',
      pendingExpense: null,
      lastExpenseId: updated.id,
      updatedAt: Date.now(),
    });
    return formatAmountCorrection(updated, category, oldAmount);
  }

  return formatError();
}

async function handleDeleteExpense(
  phone: string,
  user: User,
  categories: Category[],
): Promise<string> {
  const expense = await resolveLastExpense(phone, user);
  if (!expense) {
    return formatNoExpenseToModify();
  }

  const category = categories.find((c) => c.id === expense.category_id);
  if (!category) return formatError();

  const deleted = await softDeleteExpense(expense.id);
  setState(phone, {
    lastAction: 'expense_logged',
    pendingExpense: null,
    lastExpenseId: null,
    updatedAt: Date.now(),
  });
  return formatDeletion(deleted, category);
}

const RECEIPT_CONFIDENCE_THRESHOLD = 0.7;

async function handleImageMessage(
  phone: string,
  user: User,
  categories: Category[],
  mediaUrl: string,
): Promise<string> {
  // 1. Download image immediately (Kapso URLs expire quickly)
  let buffer: Buffer;
  let contentType: string;
  try {
    ({ buffer, contentType } = await downloadImage(mediaUrl));
  } catch {
    return formatError();
  }

  // 2. Parse receipt with vision
  const receipt = await parseReceipt(buffer);

  // 3. Upload to Supabase Storage
  const storageId = crypto.randomUUID();
  let imageUrl: string | null = null;
  try {
    imageUrl = await uploadImage(buffer, storageId, contentType);
  } catch {
    // Storage failure shouldn't block the flow
  }

  const today = getTodayDate(user.timezone);

  const pending: PendingExpense = {
    amount: receipt.amount ?? 0,
    currency: receipt.currency ?? user.currency,
    category_slug: null,
    description: null,
    merchant: receipt.merchant,
    date: receipt.date ?? today,
    source: 'image',
    raw_input: mediaUrl,
    image_url: imageUrl,
    ai_confidence: receipt.confidence,
  };

  // 4. High confidence with valid amount — ask for confirmation
  if (
    receipt.confidence >= RECEIPT_CONFIDENCE_THRESHOLD &&
    receipt.amount != null &&
    receipt.amount > 0
  ) {
    const category =
      categories.find((c) => c.slug === 'other') ?? categories[0];

    setState(phone, {
      lastAction: 'awaiting_confirmation',
      pendingExpense: pending,
      lastExpenseId: null,
      updatedAt: Date.now(),
    });

    return formatReceiptConfirmation(pending, category);
  }

  // 5. Low confidence — ask user for details
  setState(phone, {
    lastAction: 'awaiting_description',
    pendingExpense: pending,
    lastExpenseId: null,
    updatedAt: Date.now(),
  });

  return formatReceiptUnclear();
}

const MAX_MESSAGE_LENGTH = 500;
const CONFIRM_PATTERN = /^(yes|y|si|sí|ok|dale)$/i;

function classifyError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const name = (error as { constructor?: { name?: string } }).constructor?.name ?? '';
    // Anthropic SDK errors: APIError, APIConnectionError, APIConnectionTimeoutError, etc.
    if (name.includes('API') || name.includes('Anthropic')) return 'ai';
    // Supabase PostgrestError has 'code' and 'details'
    if ('code' in error && 'details' in error) return 'database';
  }
  return 'unknown';
}

export async function handleMessage(
  phone: string,
  type: 'text' | 'image',
  content: string,
): Promise<string> {
  try {
    return await handleMessageInner(phone, type, content);
  } catch (error) {
    console.log(JSON.stringify({
      event: 'handler_error',
      error: error instanceof Error ? error.message : String(error),
      phone,
      timestamp: new Date().toISOString(),
    }));

    const kind = classifyError(error);
    if (kind === 'ai') return formatParseError();
    if (kind === 'database') return formatDatabaseError();
    return formatError();
  }
}

async function handleMessageInner(
  phone: string,
  type: 'text' | 'image',
  content: string,
): Promise<string> {
  // 1. Get user — normalize phone to E.164 (+country format)
  const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
  const user = await getUserByPhone(normalizedPhone);
  if (!user) {
    return formatUnknownUser();
  }

  // 2. Load categories (needed for both image and text flows)
  const categories = await getCategories(user.id);

  // 3. Handle image messages
  if (type === 'image') {
    return handleImageMessage(phone, user, categories, content);
  }

  // 4. Check conversation state
  const state = getState(phone);

  // 5. Handle awaiting_description — treat reply as category or description
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

  // 6. Handle awaiting_confirmation
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

  // 7. Truncate long messages before parsing
  const truncatedContent =
    content.length > MAX_MESSAGE_LENGTH
      ? content.slice(0, MAX_MESSAGE_LENGTH)
      : content;

  // 8. Parse the message
  const result = await parseMessage(truncatedContent, categories);

  // 9. Route by intent
  switch (result.intent) {
    case 'log_expense':
      return handleLogExpense(phone, user, categories, result, content);
    case 'correct_expense':
      return handleCorrectExpense(phone, user, categories, result);
    case 'delete_expense':
      return handleDeleteExpense(phone, user, categories);
    case 'set_budget':
      return handleSetBudget(user, categories, result);
    case 'query_budget':
      return handleQueryBudget(user, categories, result);
    case 'query_summary': {
      const period = result.period ?? 'month';
      const { start, end } = getDateRange(period, user.timezone);
      const summary = await getExpensesSummary(user.id, start, end);
      return formatSummary(summary, period, user.currency);
    }
    case 'help':
      return formatHelp();
    case 'unknown':
    case 'error':
    default:
      return formatError();
  }
}
