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
  created_at: string;
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
  payment_type: PaymentType | null;
  payment_method_name: string | null;
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

export type PaymentType = 'cash' | 'credit_card' | 'debit_card' | 'digital_wallet' | 'bank_transfer' | 'other';

// ── AI Parsing ────────────────────────────────────────────────────

export type Intent =
  | 'log_expense'
  | 'query_summary'
  | 'set_budget'
  | 'query_budget'
  | 'correct_expense'
  | 'delete_expense'
  | 'list_categories'
  | 'monthly_closing'
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
  correction_field: 'category' | 'amount' | 'merchant' | null;
  suggested_category_name: string | null;
  payment_type: PaymentType | null;
  payment_method_name: string | null;
  target_month: number | null;
  target_year: number | null;
  error_message: string | null;
}

export interface ReceiptResult {
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  confidence: number;
}

// ── Parse Context ────────────────────────────────────────────────

export interface ParseContext {
  pendingConfirmation?: {
    amount: number;
    currency: string;
    merchant: string | null;
    category_slug: string | null;
  };
}

// ── Conversation State ────────────────────────────────────────────

export type LastAction =
  | 'awaiting_description'
  | 'awaiting_confirmation'
  | 'awaiting_category_confirmation'
  | 'expense_logged'
  | 'none';

export interface PendingExpense {
  amount: number;
  currency: string;
  category_slug: string | null;
  suggested_category_name: string | null;
  description: string | null;
  merchant: string | null;
  date: string;
  source: 'text' | 'image';
  raw_input: string;
  image_url: string | null;
  ai_confidence: number;
  payment_type: PaymentType | null;
  payment_method_name: string | null;
}

export interface ConversationState {
  lastAction: LastAction;
  pendingExpense: PendingExpense | null;
  lastExpenseId: string | null;
  updatedAt: number;
}

// ── Handler ──────────────────────────────────────────────────────

export type MessageHandler = (
  phone: string,
  type: 'text' | 'image',
  content: string,
) => Promise<string>;

// ── Webhook ──────────────────────────────────────────────────────

export interface KapsoWebhookPayload {
  message: {
    id: string;
    type: string;
    timestamp: string;
    from?: string;
    text?: { body?: string };
    image?: { id?: string; link?: string; caption?: string };
    kapso?: {
      direction?: string;
      hasMedia?: boolean;
      mediaData?: { url?: string };
      mediaUrl?: string;
    };
  };
  conversation: {
    id: string;
    phone_number: string;
    status: string;
  };
  is_new_conversation: boolean;
  phone_number_id: string;
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

export interface MonthlyClosingData {
  year: number;
  month: number;
  total: number;
  byCategory: CategoryTotal[];
  previousMonthTotal: number;
  budgets: Budget[];
}
