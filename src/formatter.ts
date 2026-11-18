import type { Expense, Category, PendingExpense, Budget, SummaryResult, MonthlyClosingData, PaymentType, FinancialRule, ReplyButton } from './types.js';
import type { RuleViolation } from './rules.js';

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
  return date.toLocaleDateString('es', { month: 'short', day: 'numeric' });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  cash: 'efectivo',
  credit_card: 'tarjeta de crédito',
  debit_card: 'tarjeta de débito',
  digital_wallet: 'billetera digital',
  bank_transfer: 'transferencia',
  other: 'otro',
};

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
    if (expense.merchant) desc += ` en ${expense.merchant}`;
    detail.push(desc);
  } else if (expense.merchant) {
    detail.push(expense.merchant);
  }
  detail.push(date);

  if (expense.payment_type) {
    const label = expense.payment_method_name ?? PAYMENT_TYPE_LABELS[expense.payment_type];
    detail.push(`con ${label}`);
  }

  const line2 = detail.join(' · ');

  return `${line1}\n${line2}`;
}

export function formatClarification(pending: PendingExpense): string {
  const amount = formatCurrency(pending.amount, pending.currency);
  return `Listo — ${amount}. ¿En qué fue?`;
}

export function formatError(): string {
  return 'Algo salió mal, intenta de nuevo.';
}

export function formatUnknown(): string {
  return 'No entendí eso. Prueba algo como "almuerzo 35 soles" o envía "ayuda".';
}

export function formatParseError(): string {
  return 'Me trabé pensando, intenta de nuevo.';
}

export function formatDatabaseError(): string {
  return 'No pude guardar eso, intenta de nuevo.';
}

export function formatCorrection(
  expense: Expense,
  oldCategory: Category,
  newCategory: Category,
): string {
  const amount = formatCurrency(expense.amount, expense.currency);
  return `✅ Actualizado: ${amount} — ${newCategory.icon} ${newCategory.name} (era: ${oldCategory.icon} ${oldCategory.name})`;
}

export function formatAmountCorrection(
  expense: Expense,
  category: Category,
  oldAmount: number,
): string {
  const newAmount = formatCurrency(expense.amount, expense.currency);
  const old = formatCurrency(oldAmount, expense.currency);
  return `✅ Actualizado: ${newAmount} — ${category.icon} ${category.name} (era: ${old})`;
}

export function formatMerchantCorrection(
  expense: Expense,
  category: Category,
  oldMerchant: string | null,
): string {
  const amount = formatCurrency(expense.amount, expense.currency);
  const oldLabel = oldMerchant ?? 'ninguno';
  return `✅ Actualizado: ${amount} — ${category.icon} ${category.name} · ${expense.merchant} (era: ${oldLabel})`;
}

export function formatCorrectionGeneric(
  updated: Expense,
  original: { amount: number; merchant: string | null; category_id: string },
  oldCategory: Category,
  newCategory: Category,
): string {
  const amount = formatCurrency(updated.amount, updated.currency);
  const changes: string[] = [];
  if (updated.category_id !== original.category_id) {
    changes.push(`${oldCategory.icon} ${oldCategory.name} → ${newCategory.icon} ${newCategory.name}`);
  }
  if (updated.amount !== original.amount) {
    changes.push(`${formatCurrency(original.amount, updated.currency)} → ${amount}`);
  }
  if (updated.merchant !== original.merchant) {
    changes.push(`${original.merchant ?? 'ninguno'} → ${updated.merchant ?? 'ninguno'}`);
  }
  return `✅ Actualizado: ${amount} — ${newCategory.icon} ${newCategory.name} (era: ${changes.join(', ')})`;
}

export function formatDeletion(expense: Expense, category: Category): string {
  const amount = formatCurrency(expense.amount, expense.currency);
  const date = formatDate(expense.date);
  return `🗑️ Eliminado: ${amount} — ${category.icon} ${category.name} · ${date}`;
}

export function formatNoExpenseToModify(): string {
  return 'No hay gasto reciente para modificar.';
}

export function formatHelp(): string {
  return `Esto es lo que puedo hacer:

📝 Registrar gasto — "almuerzo 35 soles"
📊 Resumen — "cuánto gasté esta semana?"
💰 Presupuesto — "presupuesto comida 800 mensual"
✏️ Corregir — "no, es transporte"
🗑️ Borrar — "borra eso"
🧾 Recibo — envía una foto

Escribe con naturalidad, yo me encargo.`;
}

export function formatBudgetConfirmation(
  category: Category | null,
  amount: number,
  currency: string,
  period: 'weekly' | 'monthly',
): string {
  const amountStr = formatCurrency(amount, currency);
  const label = category ? `${category.icon} ${category.name}` : 'General';
  const periodLabel = period === 'weekly' ? 'semanal' : 'mensual';
  return `💰 Presupuesto de ${label}: ${amountStr} ${periodLabel}`;
}

export function formatBudgetStatus(
  category: Category | null,
  budget: Budget,
  spent: number,
  daysRemaining: number,
): string {
  const label = category ? `${category.icon} ${category.name}` : '📊 General';
  const budgetAmount = formatCurrency(budget.amount, budget.currency);
  const spentAmount = formatCurrency(spent, budget.currency);
  const remaining = budget.amount - spent;
  const remainingAmount = formatCurrency(Math.max(remaining, 0), budget.currency);
  const percentage = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;
  const periodLabel = budget.period === 'weekly' ? 'semana' : 'mes';

  let msg = `${label}\nGastado: ${spentAmount} / ${budgetAmount} (${percentage}%)\nRestante: ${remainingAmount}`;

  if (remaining < 0) {
    const overAmount = formatCurrency(Math.abs(remaining), budget.currency);
    msg += `\n🚨 Excediste por ${overAmount}!`;
  } else if (percentage >= 80) {
    msg += `\n⚠️ ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''} restante${daysRemaining !== 1 ? 's' : ''} en el ${periodLabel}`;
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
      return `Hoy (${start})`;
    case 'week':
      return startDate === endDate ? `Esta semana (${start})` : `Esta semana (${start}–${end})`;
    case 'month':
      return startDate === endDate ? `Este mes (${start})` : `Este mes (${start}–${end})`;
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
    msg += '\n\nSin gastos registrados.';
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
  let msg = `🧾 ${pending.merchant ?? 'Recibo'} — ${amount}`;
  msg += `\nCategoría: ${category.icon} ${category.name} · ${formatDate(pending.date)}`;

  if (pending.items && pending.items.length > 0) {
    const groups = new Map<string, { count: number; total: number }>();
    for (const item of pending.items) {
      const key = item.subcategory ?? 'otros';
      const group = groups.get(key);
      if (group) {
        group.count += 1;
        group.total += item.total;
      } else {
        groups.set(key, { count: 1, total: item.total });
      }
    }

    const sorted = [...groups.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);

    msg += '\n';
    for (const [name, { count, total }] of sorted) {
      msg += `\n  ${name} (${count})  ${formatCurrency(total, pending.currency)}`;
    }
    msg += '\n';
  }

  msg += '\n¿Está bien?';
  return msg;
}

export function formatReceiptUnclear(): string {
  return 'No pude leer eso bien. ¿Cuál fue el total y de dónde fue?';
}

export function formatNoBudget(category: Category | null): string {
  const label = category ? `${category.icon} ${category.name}` : 'general';
  return `No hay presupuesto para ${label}. Prueba "presupuesto ${category?.slug ?? ''} 500 mensual"`;
}

// ── Confirmation buttons ────────────────────────────────────────

export const BUTTON_IDS = {
  expenseConfirm: 'expense_confirm',
  expenseCancel: 'expense_cancel',
  categoryCreate: 'category_create',
  categoryOther: 'category_other',
} as const;

export function expenseConfirmButtons(): ReplyButton[] {
  return [
    { id: BUTTON_IDS.expenseConfirm, title: '✅ Guardar' },
    { id: BUTTON_IDS.expenseCancel, title: '❌ Cancelar' },
  ];
}

export function newCategoryButtons(): ReplyButton[] {
  return [
    { id: BUTTON_IDS.categoryCreate, title: '✅ Crear' },
    { id: BUTTON_IDS.categoryOther, title: '📁 Usar Otros' },
  ];
}

export function formatButtonExpired(): string {
  return 'Ese botón ya no está activo. Si querías registrar un gasto, envíamelo de nuevo.';
}

export function formatExpenseCancelled(): string {
  return 'Listo, cancelado.';
}

export function formatUnknownUser(): string {
  return 'Este es un bot personal.';
}

export function formatUnsupportedMedia(): string {
  return 'Solo puedo procesar texto y fotos por ahora.';
}

export function formatNewCategoryConfirmation(
  pending: PendingExpense,
  suggestedName: string,
): string {
  const amount = formatCurrency(pending.amount, pending.currency);
  let line1 = amount;
  if (pending.description) {
    line1 += ` — "${truncate(pending.description, MAX_DESCRIPTION_LENGTH)}"`;
  }
  return `${line1}\nNo tengo la categoría '${suggestedName}'. ¿La creo?`;
}

export function formatCategoryCreated(category: Category): string {
  return `Categoría creada: ${category.icon} ${category.name}`;
}

export function formatBudgetAlert(
  category: Category | null,
  spent: number,
  budgetAmount: number,
  currency: string,
): string | null {
  const percentage = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 100) : 0;
  const spentStr = formatCurrency(spent, currency);
  const budgetStr = formatCurrency(budgetAmount, currency);

  if (spent > budgetAmount) {
    const label = category ? `de ${category.name} ` : 'general ';
    return `🚨 Presupuesto ${label}excedido: ${spentStr} / ${budgetStr}`;
  }

  if (percentage >= 80) {
    const label = category ? category.name : 'general';
    return `⚠️ Llevas ${spentStr} de ${budgetStr} en ${label} (${percentage}%)`;
  }

  return null;
}

export function formatCategoryList(categories: Category[]): string {
  if (categories.length === 0) {
    return 'No hay categorías registradas.';
  }
  let msg = '📋 Tus categorías:\n';
  for (const cat of categories) {
    msg += `\n${cat.icon} ${cat.name}`;
  }
  return msg;
}

const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function formatMonthlyClosing(data: MonthlyClosingData, currency: string): string {
  const monthName = MONTH_NAMES[data.month] ?? `Mes ${data.month}`;
  const total = formatCurrency(data.total, currency);

  let msg = `📊 Cierre ${monthName} ${data.year}\nTotal: ${total}`;

  // Previous month comparison
  if (data.previousMonthTotal > 0) {
    const diff = data.total - data.previousMonthTotal;
    const diffPercent = Math.round((diff / data.previousMonthTotal) * 100);
    const arrow = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
    const sign = diff > 0 ? '+' : '';
    msg += `\n${arrow} ${sign}${diffPercent}% vs mes anterior`;
  }

  if (data.byCategory.length === 0) {
    msg += '\n\nSin gastos registrados.';
    return msg;
  }

  // Build budget lookup: category_id → budget amount
  const budgetByCategory = new Map<string | null, number>();
  for (const b of data.budgets) {
    if (b.period === 'monthly') {
      budgetByCategory.set(b.category_id, b.amount);
    }
  }

  msg += '\n';
  for (const cat of data.byCategory) {
    const catTotal = formatCurrency(cat.total, currency);
    const pct = data.total > 0 ? Math.round((cat.total / data.total) * 100) : 0;
    let line = `\n${cat.icon} ${cat.name}  ${catTotal} (${pct}%)`;

    // Find matching budget by slug matching category totals
    // Budget lookup needs category_id — we match via the budgets array
    // Since MonthlyClosingData.budgets have category_id, we check all monthly budgets
    msg += line;
  }

  return msg;
}

// ── Financial Rules ─────────────────────────────────────────────

const RULE_TYPE_LABELS: Record<string, string> = {
  spending_limit: '💸 Límite de gasto',
  prohibition: '🚫 Prohibición',
  payment_default: '💳 Método de pago',
  habit: '🎯 Hábito',
};

const PERIOD_LABELS: Record<string, string> = {
  daily: 'diario',
  weekly: 'semanal',
  monthly: 'mensual',
};

export function formatRuleCreated(rule: FinancialRule, category: Category | null): string {
  const typeLabel = RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type;
  let msg = `✅ Regla creada: ${typeLabel}\n"${rule.name}"`;

  if (rule.threshold != null) {
    msg += `\nLímite: ${formatCurrency(rule.threshold, 'PEN')}`;
  }
  if (rule.period) {
    msg += ` ${PERIOD_LABELS[rule.period] ?? rule.period}`;
  }
  if (category) {
    msg += `\nCategoría: ${category.icon} ${category.name}`;
  }
  if (rule.action_value) {
    msg += `\nValor: ${rule.action_value}`;
  }
  return msg;
}

export function formatRuleDeleted(rule: FinancialRule): string {
  return `🗑️ Regla eliminada: "${rule.name}"`;
}

export function formatRuleList(rules: FinancialRule[], categories: Category[]): string {
  if (rules.length === 0) {
    return 'No tienes reglas activas. Prueba "avisa si gasto más de 100 en comida".';
  }

  const catMap = new Map(categories.map((c) => [c.id, c]));

  let msg = '📋 Tus reglas:\n';
  for (const rule of rules) {
    const typeLabel = RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type;
    const cat = rule.category_id ? catMap.get(rule.category_id) : null;
    const catLabel = cat ? ` — ${cat.icon} ${cat.name}` : '';

    let detail = '';
    if (rule.threshold != null && rule.period) {
      detail = ` (${formatCurrency(rule.threshold, 'PEN')} ${PERIOD_LABELS[rule.period] ?? rule.period})`;
    } else if (rule.action_value) {
      detail = ` (${rule.action_value})`;
    }

    msg += `\n${typeLabel}: "${rule.name}"${detail}${catLabel}`;
  }
  return msg;
}

export function formatRuleViolation(violation: RuleViolation, category: Category | null): string {
  const rule = violation.rule;
  const catLabel = category ? category.name : 'general';

  switch (rule.rule_type) {
    case 'spending_limit': {
      const spent = formatCurrency(violation.spent ?? 0, 'PEN');
      const limit = formatCurrency(rule.threshold ?? 0, 'PEN');
      return `💸 "${rule.name}": llevas ${spent} de ${limit} en ${catLabel}`;
    }
    case 'prohibition':
      return `🚫 "${rule.name}": gasto en ${catLabel} no permitido`;
    case 'payment_default':
      return `💳 "${rule.name}": método esperado era ${rule.action_value}`;
    case 'habit': {
      const spent = formatCurrency(violation.spent ?? 0, 'PEN');
      const limit = formatCurrency(rule.threshold ?? 0, 'PEN');
      return `🎯 "${rule.name}": llevas ${spent} de ${limit} en ${catLabel}`;
    }
    default:
      return `⚠️ Regla "${rule.name}" activada`;
  }
}

export function formatNoRuleFound(): string {
  return 'No encontré una regla que coincida.';
}
