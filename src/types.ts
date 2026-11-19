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

export type ExpenseSource = 'text' | 'image' | 'email';

export interface Expense {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  currency: string;
  description: string | null;
  merchant: string | null;
  date: string;
  source: ExpenseSource;
  raw_input: string;
  image_url: string | null;
  ai_confidence: number;
  payment_type: PaymentType | null;
  payment_method_name: string | null;
  bank_reference: string | null;
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

export type RuleType = 'spending_limit' | 'payment_default' | 'prohibition' | 'habit';

export interface FinancialRule {
  id: string;
  user_id: string;
  name: string;
  rule_type: RuleType;
  category_id: string | null;
  threshold: number | null;
  period: 'daily' | 'weekly' | 'monthly' | null;
  action_value: string | null;
  is_active: boolean;
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
  | 'list_categories'
  | 'monthly_closing'
  | 'set_rule'
  | 'list_rules'
  | 'delete_rule'
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
  rule_type: RuleType | null;
  rule_name: string | null;
  rule_period: 'daily' | 'weekly' | 'monthly' | null;
  error_message: string | null;
}

export interface ReceiptItemParsed {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  subcategory: string | null;
}

export interface ReceiptResult {
  merchant: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  confidence: number;
  items: ReceiptItemParsed[];
  category_slug: string | null;
}

export interface ReceiptItem {
  id: string;
  expense_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  subcategory: string | null;
  created_at: string;
}

// ── Parse Context ────────────────────────────────────────────────

export interface ParseContext {
  pendingConfirmation?: {
    amount: number;
    currency: string;
    merchant: string | null;
    category_slug: string | null;
  };
  pendingCategoryConfirmation?: {
    amount: number;
    currency: string;
    description: string | null;
    suggested_category_name: string;
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
  source: ExpenseSource;
  raw_input: string;
  image_url: string | null;
  ai_confidence: number;
  payment_type: PaymentType | null;
  payment_method_name: string | null;
  items: ReceiptItemParsed[];
}

export interface ConversationState {
  lastAction: LastAction;
  pendingExpense: PendingExpense | null;
  lastExpenseId: string | null;
  updatedAt: number;
}

// ── Handler ──────────────────────────────────────────────────────

/** Quick-reply button (WhatsApp: max 3 per message, title ≤ 20 chars). */
export interface ReplyButton {
  id: string;
  title: string;
}

/** What the handler sends back. With `buttons`, it goes out as an interactive message. */
export interface BotReply {
  text: string;
  buttons?: ReplyButton[];
}

/** 'button' = a tapped reply button; content is the button id. */
export type InboundMessageType = 'text' | 'image' | 'button';

export type MessageHandler = (
  phone: string,
  type: InboundMessageType,
  content: string,
) => Promise<BotReply>;

// ── Webhook ──────────────────────────────────────────────────────

export interface KapsoWebhookPayload {
  message: {
    id: string;
    type: string;
    timestamp: string;
    from?: string;
    text?: { body?: string };
    image?: { id?: string; link?: string; caption?: string };
    interactive?: {
      type?: string;
      button_reply?: { id?: string; title?: string };
    };
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

// ── Keep-alive ────────────────────────────────────────────────────

export type ProbeStatus = 'ok' | { error: string };

export interface KeepAliveResult {
  database: ProbeStatus;
  timestamp: string;
  ok: boolean;
}

// ── Bank-email ingestion ─────────────────────────────────────────

/** A card purchase extracted from a bank notification email. */
export interface BankTransaction {
  bank: 'bcp';
  amount: number;
  currency: string;
  merchant: string;
  /** YYYY-MM-DD, Lima local. */
  date: string;
  /** HH:mm (24h), Lima local. */
  time: string;
  card_last4: string;
  /** Bank operation number — idempotency key (`expenses.bank_reference`). */
  operation_number: string;
  raw_text: string;
}

/** Email as POSTed by the Cloudflare Email Worker. */
export interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  /** ISO 8601 timestamp. */
  receivedAt: string;
}
