import type { Intent, PaymentType, RuleType } from '../../src/types.js';

export interface MessageFixture {
  input: string;
  label: string;
  expected: {
    intent: Intent;
    amount?: number;
    currency?: string;
    category_slug?: string;
    /** null means expect no existing category (new category suggestion) */
    category_slug_null?: true;
    suggested_category_name?: string;
    period?: 'today' | 'week' | 'month';
    correction_field?: 'category' | 'amount' | 'merchant';
    payment_type?: PaymentType;
    payment_method_name?: string;
    target_month?: number;
    target_year?: number;
    rule_type?: RuleType;
    rule_name?: string;
    rule_period?: 'daily' | 'weekly' | 'monthly';
  };
}

export const MESSAGE_FIXTURES: MessageFixture[] = [
  // ── Simple Spanish expenses ──────────────────────────────────────
  {
    input: 'almuerzo 35 soles',
    label: 'simple Spanish meal',
    expected: { intent: 'log_expense', amount: 35, category_slug: 'food_dining' },
  },
  {
    input: 'cena 42',
    label: 'dinner no currency',
    expected: { intent: 'log_expense', amount: 42, category_slug: 'food_dining' },
  },
  {
    input: 'cafe 12.50',
    label: 'coffee decimal',
    expected: { intent: 'log_expense', amount: 12.5, category_slug: 'food_dining' },
  },
  {
    input: 'taxi 15',
    label: 'taxi short',
    expected: { intent: 'log_expense', amount: 15, category_slug: 'transport' },
  },
  {
    input: 'desayuno 18',
    label: 'breakfast',
    expected: { intent: 'log_expense', amount: 18, category_slug: 'food_dining' },
  },
  {
    input: 'estacionamiento 8',
    label: 'parking',
    expected: { intent: 'log_expense', amount: 8, category_slug: 'transport' },
  },

  // ── With merchants ───────────────────────────────────────────────
  {
    input: 'uber 23.5',
    label: 'uber ride',
    expected: { intent: 'log_expense', amount: 23.5, category_slug: 'transport' },
  },
  {
    input: 'wong 127.50',
    label: 'wong supermarket',
    expected: { intent: 'log_expense', amount: 127.5, category_slug: 'groceries' },
  },
  {
    input: 'plaza vea 89',
    label: 'plaza vea',
    expected: { intent: 'log_expense', amount: 89, category_slug: 'groceries' },
  },
  {
    input: 'netflix 45',
    label: 'netflix subscription',
    expected: { intent: 'log_expense', amount: 45, category_slug: 'entertainment' },
  },
  {
    input: 'spotify 17.90',
    label: 'spotify subscription',
    expected: { intent: 'log_expense', amount: 17.9, category_slug: 'entertainment' },
  },

  // ── English messages ─────────────────────────────────────────────
  {
    input: 'lunch 80',
    label: 'english lunch',
    expected: { intent: 'log_expense', amount: 80, category_slug: 'food_dining' },
  },
  {
    input: 'groceries 200',
    label: 'english groceries',
    expected: { intent: 'log_expense', amount: 200, category_slug: 'groceries' },
  },
  {
    input: 'gas 60',
    label: 'english gas/fuel',
    expected: { intent: 'log_expense', amount: 60, category_slug: 'transport' },
  },

  // ── Mixed language ───────────────────────────────────────────────
  {
    input: 'groceries en wong 127.50',
    label: 'mixed groceries wong',
    expected: { intent: 'log_expense', amount: 127.5, category_slug: 'groceries' },
  },
  {
    input: 'uber al trabajo 18',
    label: 'mixed uber to work',
    expected: { intent: 'log_expense', amount: 18, category_slug: 'transport' },
  },
  {
    input: 'pizza hut 65',
    label: 'pizza hut delivery',
    expected: { intent: 'log_expense', amount: 65, category_slug: 'food_dining' },
  },

  // ── Category inference ───────────────────────────────────────────
  {
    input: 'farmacia 35.50',
    label: 'pharmacy → health',
    expected: { intent: 'log_expense', amount: 35.5, category_slug: 'health' },
  },
  {
    input: 'luz 180',
    label: 'electricity → bills',
    expected: { intent: 'log_expense', amount: 180, category_slug: 'bills_utilities' },
  },
  {
    input: 'internet 99',
    label: 'internet → bills',
    expected: { intent: 'log_expense', amount: 99, category_slug: 'bills_utilities' },
  },
  {
    input: 'udemy course 45 dollars',
    label: 'udemy USD → education',
    expected: { intent: 'log_expense', amount: 45, category_slug: 'education', currency: 'USD' },
  },
  {
    input: 'ropa en falabella 250',
    label: 'clothes falabella → shopping',
    expected: { intent: 'log_expense', amount: 250, category_slug: 'shopping' },
  },

  // ── Summary queries ──────────────────────────────────────────────
  {
    input: 'how much this week?',
    label: 'english weekly summary',
    expected: { intent: 'query_summary', period: 'week' },
  },
  {
    input: 'cuanto gaste hoy?',
    label: 'spanish today summary',
    expected: { intent: 'query_summary', period: 'today' },
  },
  {
    input: 'resumen del mes',
    label: 'spanish monthly summary',
    expected: { intent: 'query_summary', period: 'month' },
  },

  // ── Budget commands ──────────────────────────────────────────────
  {
    input: 'set food budget 800',
    label: 'english set budget',
    expected: { intent: 'set_budget', amount: 800, category_slug: 'food_dining' },
  },
  {
    input: 'presupuesto transporte 200 mensual',
    label: 'spanish set budget',
    expected: { intent: 'set_budget', amount: 200, category_slug: 'transport' },
  },

  // ── Corrections ──────────────────────────────────────────────────
  {
    input: 'wrong, it was transport',
    label: 'correct category english',
    expected: { intent: 'correct_expense', correction_field: 'category', category_slug: 'transport' },
  },
  {
    input: 'no era 40',
    label: 'correct amount spanish',
    expected: { intent: 'correct_expense', correction_field: 'amount', amount: 40 },
  },

  // ── Deletions ────────────────────────────────────────────────────
  {
    input: 'delete that',
    label: 'english delete',
    expected: { intent: 'delete_expense' },
  },
  {
    input: 'borra eso',
    label: 'spanish delete',
    expected: { intent: 'delete_expense' },
  },

  // ── Help ─────────────────────────────────────────────────────────
  {
    input: 'help',
    label: 'english help',
    expected: { intent: 'help' },
  },
  {
    input: 'ayuda',
    label: 'spanish help',
    expected: { intent: 'help' },
  },

  // ── Ambiguous ────────────────────────────────────────────────────
  {
    input: '50',
    label: 'bare number',
    expected: { intent: 'log_expense', amount: 50 },
  },
  {
    input: 'spent 50',
    label: 'spent with number',
    expected: { intent: 'log_expense', amount: 50 },
  },

  // ── Unknown / gibberish ──────────────────────────────────────────
  {
    input: 'asdfghjk',
    label: 'gibberish → unknown',
    expected: { intent: 'unknown' },
  },
  {
    input: 'jajaja que risa',
    label: 'casual chat → unknown',
    expected: { intent: 'unknown' },
  },

  // ── Payment methods ────────────────────────────────────────────
  {
    input: 'almuerzo 35 con yape',
    label: 'meal paid with Yape',
    expected: { intent: 'log_expense', amount: 35, category_slug: 'food_dining', payment_type: 'digital_wallet', payment_method_name: 'Yape' },
  },
  {
    input: 'taxi 20 con plin',
    label: 'taxi paid with Plin',
    expected: { intent: 'log_expense', amount: 20, category_slug: 'transport', payment_type: 'digital_wallet', payment_method_name: 'Plin' },
  },
  {
    input: 'supermercado 150 tarjeta',
    label: 'groceries with card',
    expected: { intent: 'log_expense', amount: 150, category_slug: 'groceries', payment_type: 'credit_card' },
  },
  {
    input: 'cena 80 efectivo',
    label: 'dinner cash',
    expected: { intent: 'log_expense', amount: 80, category_slug: 'food_dining', payment_type: 'cash' },
  },
  {
    input: 'uber 25 tarjeta de debito',
    label: 'uber debit card',
    expected: { intent: 'log_expense', amount: 25, category_slug: 'transport', payment_type: 'debit_card' },
  },
  {
    input: 'netflix 45 tarjeta de credito',
    label: 'netflix credit card',
    expected: { intent: 'log_expense', amount: 45, category_slug: 'entertainment', payment_type: 'credit_card' },
  },
  {
    input: 'transferencia 200 al gym',
    label: 'bank transfer to gym',
    expected: { intent: 'log_expense', amount: 200, payment_type: 'bank_transfer' },
  },

  // ── New category suggestions ───────────────────────────────────
  {
    input: 'veterinario 120',
    label: 'vet → suggest new category',
    expected: { intent: 'log_expense', amount: 120, category_slug_null: true },
  },
  {
    input: 'peluqueria 60',
    label: 'haircut → suggest new category',
    expected: { intent: 'log_expense', amount: 60, category_slug_null: true },
  },
  {
    input: 'lavanderia 25',
    label: 'laundry → suggest new category',
    expected: { intent: 'log_expense', amount: 25, category_slug_null: true },
  },
  {
    input: 'comida para el perro 85',
    label: 'dog food → suggest new category',
    expected: { intent: 'log_expense', amount: 85, category_slug_null: true },
  },

  // ── List categories ────────────────────────────────────────────
  {
    input: 'mis categorias',
    label: 'list categories Spanish',
    expected: { intent: 'list_categories' },
  },
  {
    input: 'que categorias tengo?',
    label: 'list categories question',
    expected: { intent: 'list_categories' },
  },
  {
    input: 'categorias',
    label: 'list categories single word',
    expected: { intent: 'list_categories' },
  },
  {
    input: 'list categories',
    label: 'list categories English',
    expected: { intent: 'list_categories' },
  },

  // ── Monthly closing ──────────────────────────────────────────────
  {
    input: 'cierra febrero',
    label: 'monthly closing February',
    expected: { intent: 'monthly_closing', target_month: 2, target_year: 2026 },
  },
  {
    input: 'cierre del mes',
    label: 'monthly closing current month (prompt says: use previous month)',
    expected: { intent: 'monthly_closing', target_month: 2, target_year: 2026 },
  },
  {
    input: 'resumen mensual enero',
    label: 'monthly closing January',
    expected: { intent: 'monthly_closing', target_month: 1, target_year: 2026 },
  },
  {
    input: 'cierre marzo 2026',
    label: 'monthly closing with year',
    expected: { intent: 'monthly_closing', target_month: 3, target_year: 2026 },
  },
  {
    input: 'monthly closing february',
    label: 'monthly closing English',
    expected: { intent: 'monthly_closing', target_month: 2, target_year: 2026 },
  },

  // ── Set rule ──────────────────────────────────────────────────────
  {
    input: 'avisa si gasto mas de 100 en comida',
    label: 'spending limit on food',
    expected: { intent: 'set_rule', rule_type: 'spending_limit', amount: 100, category_slug: 'food_dining', rule_period: 'monthly' },
  },
  {
    input: 'no gastar mas de 50 diarios en comida rapida',
    label: 'daily spending limit',
    expected: { intent: 'set_rule', rule_type: 'spending_limit', amount: 50, rule_period: 'daily' },
  },
  {
    input: 'limite de 500 mensual en entretenimiento',
    label: 'monthly entertainment limit',
    expected: { intent: 'set_rule', rule_type: 'spending_limit', amount: 500, category_slug: 'entertainment', rule_period: 'monthly' },
  },
  {
    input: 'siempre pagar uber con yape',
    label: 'payment default Uber with Yape',
    expected: { intent: 'set_rule', rule_type: 'payment_default', payment_type: 'digital_wallet', payment_method_name: 'Yape' },
  },
  {
    input: 'no comprar ropa este mes',
    label: 'prohibition on shopping',
    expected: { intent: 'set_rule', rule_type: 'prohibition', category_slug: 'shopping' },
  },
  {
    input: 'limite semanal de 200 en transporte',
    label: 'weekly transport limit',
    expected: { intent: 'set_rule', rule_type: 'spending_limit', amount: 200, category_slug: 'transport', rule_period: 'weekly' },
  },

  // ── List rules ────────────────────────────────────────────────────
  {
    input: 'mis reglas',
    label: 'list rules Spanish',
    expected: { intent: 'list_rules' },
  },
  {
    input: 'que reglas tengo?',
    label: 'list rules question',
    expected: { intent: 'list_rules' },
  },
  {
    input: 'reglas',
    label: 'list rules single word',
    expected: { intent: 'list_rules' },
  },

  // ── Delete rule ───────────────────────────────────────────────────
  {
    input: 'borra la regla de comida',
    label: 'delete food rule',
    expected: { intent: 'delete_rule', category_slug: 'food_dining' },
  },
  {
    input: 'elimina la regla de transporte',
    label: 'delete transport rule',
    expected: { intent: 'delete_rule', category_slug: 'transport' },
  },
];
