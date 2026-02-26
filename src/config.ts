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

// ── Constants ─────────────────────────────────────────────────────

export const CONFIDENCE_AUTO_LOG = 0.85;
export const CONFIDENCE_CONFIRM = 0.6;
export const STATE_TTL_MS = 300_000; // 5 minutes
export const DEFAULT_TIMEZONE = 'America/Lima';
export const DEFAULT_CURRENCY = 'PEN';
