import type { BankTransaction, InboundEmail } from './types.js';

/**
 * Deterministic parser for BCP credit-card purchase notifications.
 * No LLM: the email is a fixed label/value table. Anything that doesn't
 * match exactly returns null (debit cards, "operación" charges, Yapeo,
 * statements, truncated bodies).
 */

const SUBJECT_RE = /Realizaste un consumo con tu Tarjeta de Cr[ée]dito BCP/i;
const OPERATION_TYPE = 'Consumo Tarjeta de Crédito';

const LABELS = {
  operationType: 'Operación realizada',
  amount: 'Total del consumo',
  datetime: 'Fecha y hora',
  card: 'Número de Tarjeta de Crédito',
  merchant: 'Empresa',
  operation: 'Número de operación',
} as const;

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, setiembre: 9, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const CURRENCIES: Record<string, string> = { 'S/': 'PEN', '$': 'USD', 'US$': 'USD' };

const AMOUNT_RE = /^(S\/|US\$|\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)$/;
const DATETIME_RE = /^(\d{1,2}) de ([a-záéíóú]+) de (\d{4}) - (\d{1,2}):(\d{2}) ([AP]M)$/i;
const CARD_RE = /^\*+(\d{4})$/;
const OPERATION_RE = /^\d{6,12}$/;

export function parseBcpEmail(email: InboundEmail): BankTransaction | null {
  if (!SUBJECT_RE.test(email.subject)) return null;

  const lines = toLines(email);
  const field = (label: string) => findValue(lines, label);

  if (field(LABELS.operationType)?.value !== OPERATION_TYPE) return null;

  const amount = parseAmount(field(LABELS.amount)?.value);
  const datetime = parseDateTime(field(LABELS.datetime)?.value);
  const card = field(LABELS.card)?.value.match(CARD_RE);
  const merchant = field(LABELS.merchant)?.value;
  const operation = field(LABELS.operation);

  if (!amount || !datetime || !card || !merchant || !operation) return null;
  if (!OPERATION_RE.test(operation.value)) return null;

  const start = Math.max(0, lines.findIndex((l) => l.startsWith('Realizaste un consumo')));

  return {
    bank: 'bcp',
    amount: amount.amount,
    currency: amount.currency,
    merchant,
    date: datetime.date,
    time: datetime.time,
    card_last4: card[1],
    operation_number: operation.value,
    raw_text: lines.slice(start, operation.endIndex + 1).join('\n'),
  };
}

/** Idempotency key stored in `expenses.bank_reference`. */
export function bankReference(tx: BankTransaction): string {
  return `${tx.bank}:${tx.operation_number}`;
}

// ── Helpers ──────────────────────────────────────────────────────

function toLines(email: InboundEmail): string[] {
  const text = email.html ? htmlToText(email.html) : email.text;
  return text
    .replace(/[​-‍﻿]/g, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(head|style|script)\b[\s\S]*?<\/\1>/gi, '')
      // Block-level boundaries become line breaks; inline tags (<b>, <a>, <span>) vanish.
      .replace(/<\/?(p|div|td|th|tr|table|tbody|thead|br|li|ul|ol|h[1-6]|html|body)\b[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  );
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Value on the label's own line ("Label: value") or on the next line. */
function findValue(lines: string[], label: string): { value: string; endIndex: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === label) {
      return i + 1 < lines.length ? { value: lines[i + 1], endIndex: i + 1 } : null;
    }
    if (line.startsWith(`${label}:`)) {
      const value = line.slice(label.length + 1).trim();
      return value ? { value, endIndex: i } : null;
    }
  }
  return null;
}

function parseAmount(raw: string | undefined): { amount: number; currency: string } | null {
  const m = raw?.match(AMOUNT_RE);
  if (!m) return null;
  const amount = Number(m[2].replace(/,/g, ''));
  return amount > 0 ? { amount, currency: CURRENCIES[m[1]] } : null;
}

function parseDateTime(raw: string | undefined): { date: string; time: string } | null {
  const m = raw?.match(DATETIME_RE);
  if (!m) return null;

  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  const year = Number(m[3]);
  const hour12 = Number(m[4]);
  const minute = Number(m[5]);
  if (!month || hour12 < 1 || hour12 > 12 || minute > 59) return null;

  // Reject impossible dates (e.g. 31 de noviembre).
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  const hour = (hour12 % 12) + (m[6].toUpperCase() === 'PM' ? 12 : 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
  };
}
