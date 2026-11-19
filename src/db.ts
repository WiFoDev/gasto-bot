import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import type { User, Category, Expense, CategoryTotal, SummaryResult, Budget, MonthlyClosingData, ReceiptItem, ReceiptItemParsed, FinancialRule, RuleType } from './types.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Health probe ────────────────────────────────────────────────────

/**
 * Cheapest possible round-trip to Postgres. Used by the keep-alive cron to
 * register activity on the Supabase project so the free tier doesn't pause it.
 */
export async function pingDatabase(): Promise<void> {
  const { error } = await supabase.from('users').select('id').limit(1);
  if (error) throw error;
}

// ── User & category queries ─────────────────────────────────────────

export async function getUserByPhone(phone: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getCategories(userId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return data ?? [];
}

export async function getCategoryBySlug(
  userId: string,
  slug: string,
): Promise<Category | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertCategory(
  userId: string,
  name: string,
  slug: string,
  icon: string,
): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name, slug, icon, is_default: false })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCategory(
  userId: string,
  categoryId: string,
): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('user_id', userId)
    .eq('is_default', false);

  if (error) throw error;
}

export async function insertExpense(
  data: Omit<Expense, 'id' | 'deleted_at' | 'created_at'>,
): Promise<Expense> {
  const { data: expense, error } = await supabase
    .from('expenses')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return expense;
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getExpenseByBankReference(
  userId: string,
  bankReference: string,
): Promise<Expense | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .eq('bank_reference', bankReference)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getLastExpense(userId: string): Promise<Expense | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateExpense(
  id: string,
  fields: Partial<
    Pick<Expense, 'category_id' | 'amount' | 'currency' | 'description' | 'merchant'>
  >,
): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .update(fields)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function softDeleteExpense(id: string): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── Budget queries ──────────────────────────────────────────────────

export async function getBudget(
  userId: string,
  categoryId: string | null,
  period: 'weekly' | 'monthly',
): Promise<Budget | null> {
  let query = supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('period', period);

  query = categoryId === null
    ? query.is('category_id', null)
    : query.eq('category_id', categoryId);

  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data;
}

export async function getBudgets(userId: string): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return data ?? [];
}

export async function upsertBudget(
  userId: string,
  categoryId: string | null,
  amount: number,
  currency: string,
  period: 'weekly' | 'monthly',
  startDate: string,
): Promise<Budget> {
  const existing = await getBudget(userId, categoryId, period);

  if (existing) {
    const { data, error } = await supabase
      .from('budgets')
      .update({ amount, currency, start_date: startDate })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      user_id: userId,
      category_id: categoryId,
      amount,
      currency,
      period,
      start_date: startDate,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getExpensesTotal(
  userId: string,
  categoryId: string | null,
  startDate: string,
  endDate: string,
): Promise<number> {
  let query = supabase
    .from('expenses')
    .select('amount')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .is('deleted_at', null);

  if (categoryId !== null) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []).reduce((sum, e) => sum + Number(e.amount), 0);
}

export function getDateRange(
  period: 'today' | 'week' | 'month',
  timezone: string,
): { start: string; end: string } {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);

  if (period === 'today') {
    return { start: todayStr, end: todayStr };
  }

  if (period === 'month') {
    const monthStart = todayStr.slice(0, 8) + '01';
    return { start: monthStart, end: todayStr };
  }

  // period === 'week' — Monday-based
  const [year, month, day] = todayStr.split('-').map(Number);
  const todayDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = todayDate.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(todayDate);
  monday.setUTCDate(todayDate.getUTCDate() - daysToMonday);
  const mondayStr = monday.toISOString().split('T')[0];
  return { start: mondayStr, end: todayStr };
}

export async function getMonthlyClosingData(
  userId: string,
  year: number,
  month: number,
): Promise<MonthlyClosingData> {
  const mm = String(month).padStart(2, '0');
  const startDate = `${year}-${mm}-01`;
  // Last day of month: day 0 of next month = last day of current month
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  // Previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMm = String(prevMonth).padStart(2, '0');
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const prevStartDate = `${prevYear}-${prevMm}-01`;
  const prevEndDate = `${prevYear}-${prevMm}-${String(prevLastDay).padStart(2, '0')}`;

  // Fetch current month expenses with category join, previous month total, and budgets in parallel
  const [currentRes, prevRes, budgetRes] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount, categories(slug, name, icon)')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .is('deleted_at', null),
    supabase
      .from('expenses')
      .select('amount')
      .eq('user_id', userId)
      .gte('date', prevStartDate)
      .lte('date', prevEndDate)
      .is('deleted_at', null),
    supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId),
  ]);

  if (currentRes.error) throw currentRes.error;
  if (prevRes.error) throw prevRes.error;
  if (budgetRes.error) throw budgetRes.error;

  const categoryTotals = new Map<string, CategoryTotal>();
  let total = 0;

  for (const exp of currentRes.data ?? []) {
    const amount = Number(exp.amount);
    total += amount;

    const cat = exp.categories as unknown as { slug: string; name: string; icon: string } | null;
    if (!cat) continue;

    const existing = categoryTotals.get(cat.slug);
    if (existing) {
      existing.total += amount;
    } else {
      categoryTotals.set(cat.slug, {
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        total: amount,
      });
    }
  }

  const byCategory = Array.from(categoryTotals.values()).sort((a, b) => b.total - a.total);

  const previousMonthTotal = (prevRes.data ?? []).reduce(
    (sum, e) => sum + Number(e.amount),
    0,
  );

  return {
    year,
    month,
    total,
    byCategory,
    previousMonthTotal,
    budgets: budgetRes.data ?? [],
  };
}

// ── Receipt Items ──────────────────────────────────────────────────

export async function insertReceiptItems(
  expenseId: string,
  items: ReceiptItemParsed[],
): Promise<ReceiptItem[]> {
  if (items.length === 0) return [];

  const rows = items.map((item) => ({
    expense_id: expenseId,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.total,
    subcategory: item.subcategory,
  }));

  const { data, error } = await supabase
    .from('receipt_items')
    .insert(rows)
    .select();

  if (error) throw error;
  return data;
}

export async function getReceiptItems(expenseId: string): Promise<ReceiptItem[]> {
  const { data, error } = await supabase
    .from('receipt_items')
    .select('*')
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// ── Financial Rules ───────────────────────────────────────────────

export async function insertRule(
  userId: string,
  name: string,
  ruleType: RuleType,
  categoryId: string | null,
  threshold: number | null,
  period: 'daily' | 'weekly' | 'monthly' | null,
  actionValue: string | null,
): Promise<FinancialRule> {
  const { data, error } = await supabase
    .from('financial_rules')
    .insert({
      user_id: userId,
      name,
      rule_type: ruleType,
      category_id: categoryId,
      threshold,
      period,
      action_value: actionValue,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getActiveRules(userId: string): Promise<FinancialRule[]> {
  const { data, error } = await supabase
    .from('financial_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function deleteRule(
  userId: string,
  ruleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('financial_rules')
    .delete()
    .eq('id', ruleId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function getExpensesSummary(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<SummaryResult> {
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('amount, categories(slug, name, icon)')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .is('deleted_at', null);

  if (error) throw error;

  const categoryTotals = new Map<string, CategoryTotal>();
  let total = 0;

  for (const exp of expenses ?? []) {
    const amount = Number(exp.amount);
    total += amount;

    const cat = exp.categories as unknown as { slug: string; name: string; icon: string } | null;
    if (!cat) continue;

    const existing = categoryTotals.get(cat.slug);
    if (existing) {
      existing.total += amount;
    } else {
      categoryTotals.set(cat.slug, {
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        total: amount,
      });
    }
  }

  const byCategory = Array.from(categoryTotals.values()).sort((a, b) => b.total - a.total);

  return { total, byCategory, startDate, endDate };
}
