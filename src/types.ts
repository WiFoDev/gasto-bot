// ── Database Entities ──────────────────────────────────────────────

export interface User {
  id: string;
  phone: string;
  name: string;
  currency: string;
  timezone: string;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  icon: string;
  is_default: boolean;
}

export interface Expense {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  currency: string;
  description: string | null;
  merchant: string | null;
  date: string;
  source: 'text' | 'image';
  raw_input: string;
  image_url: string | null;
  ai_confidence: number;
  deleted_at: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  amount: number;
  currency: string;
  period: 'weekly' | 'monthly';
  start_date: string;
  created_at: string;
}

// ── AI Parsing ────────────────────────────────────────────────────

export type Intent =
  | 'log_expense'
  | 'query_summary'
  | 'set_budget'
  | 'query_budget'
  | 'correct_expense'
  | 'delete_expense'
  | 'help'
  | 'unknown'
  | 'error';

export interface ParseResult {
  intent: Intent;
  confidence: number;
  amount: number | null;
  currency: string | null;
  category_slug: string | null;
  description: string | null;
  merchant: string | null;
  date: string | null;
  period: 'today' | 'week' | 'month' | null;
  correction_field: 'category' | 'amount' | null;
  error_message: string | null;
}

export interface ReceiptResult {
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  confidence: number;
}

// ── Conversation State ────────────────────────────────────────────

export type LastAction =
  | 'awaiting_description'
  | 'awaiting_confirmation'
  | 'expense_logged'
  | 'none';

export interface PendingExpense {
  amount: number;
  currency: string;
  category_slug: string | null;
  description: string | null;
  merchant: string | null;
  date: string;
  source: 'text' | 'image';
  raw_input: string;
  image_url: string | null;
  ai_confidence: number;
}

export interface ConversationState {
  lastAction: LastAction;
  pendingExpense: PendingExpense | null;
  lastExpenseId: string | null;
  updatedAt: number;
}

// ── Summaries ─────────────────────────────────────────────────────

export interface SummaryQuery {
  period: 'today' | 'week' | 'month';
  category_slug: string | null;
}

export interface CategoryTotal {
  slug: string;
  name: string;
  icon: string;
  total: number;
}

export interface SummaryResult {
  total: number;
  byCategory: CategoryTotal[];
  startDate: string;
  endDate: string;
}
