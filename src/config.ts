function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// ── Required env vars (validated at import time) ──────────────────

export const SUPABASE_URL = requireEnv('SUPABASE_URL');
export const SUPABASE_KEY = requireEnv('SUPABASE_KEY');
export const ANTHROPIC_API_KEY = requireEnv('ANTHROPIC_API_KEY');
export const KAPSO_API_KEY = requireEnv('KAPSO_API_KEY');
export const KAPSO_WEBHOOK_SECRET = requireEnv('KAPSO_WEBHOOK_SECRET');

// ── Optional env vars with defaults ───────────────────────────────

export const PORT = parseInt(process.env.PORT || '3000', 10);

// Shared secret for the keep-alive cron endpoint. Optional so the server still
// boots without it — the endpoint rejects every request while it is unset.
export const CRON_SECRET = process.env.CRON_SECRET;

// ── Bank-email ingestion (Phase 6) ────────────────────────────────
// All optional: the server boots without them and POST /inbound/bank-email
// rejects every request while INBOUND_EMAIL_SECRET is unset. Empty = unset.

function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const INBOUND_EMAIL_SECRET = optionalEnv('INBOUND_EMAIL_SECRET');
// Kapso phone number that sends bot-initiated messages (no inbound to reply to).
export const KAPSO_PHONE_NUMBER_ID = optionalEnv('KAPSO_PHONE_NUMBER_ID');
// Phone (E.164) of the user who receives auto-logged bank expenses.
export const BANK_EMAIL_USER_PHONE = optionalEnv('BANK_EMAIL_USER_PHONE');

// ── Constants ─────────────────────────────────────────────────────

export const CONFIDENCE_AUTO_LOG = 0.85;
export const CONFIDENCE_CONFIRM = 0.6;
export const STATE_TTL_MS = 300_000; // 5 minutes
export const DEFAULT_TIMEZONE = 'America/Lima';
export const DEFAULT_CURRENCY = 'PEN';
