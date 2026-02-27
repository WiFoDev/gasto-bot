import type { Intent } from '../../src/types.js';

export interface MessageFixture {
  input: string;
  label: string;
  expected: {
    intent: Intent;
    amount?: number;
    currency?: string;
    category_slug?: string;
    period?: 'today' | 'week' | 'month';
    correction_field?: 'category' | 'amount';
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
];
