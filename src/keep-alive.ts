import crypto from 'node:crypto';
import type { KeepAliveResult, ProbeStatus } from './types.js';

export interface KeepAliveDeps {
  pingDatabase: () => Promise<void>;
}

/**
 * Runs a cheap query against Supabase so the project is never considered idle.
 * The free tier pauses a project after 7 days without activity; any successful
 * query resets that clock. Never throws — a failing probe is reported in the
 * result so the caller can return 200 and let the cron log stay clean.
 */
export async function runKeepAlive(
  deps: KeepAliveDeps,
): Promise<KeepAliveResult> {
  const timestamp = new Date().toISOString();
  const database = await probe('database', deps.pingDatabase);

  return { database, timestamp, ok: database === 'ok' };
}

async function probe(
  name: string,
  run: () => Promise<void>,
): Promise<ProbeStatus> {
  try {
    await run();
    return 'ok';
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.log(
      JSON.stringify({
        event: 'keep_alive_probe_failed',
        probe: name,
        error,
        timestamp: new Date().toISOString(),
      }),
    );
    return { error };
  }
}

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header.
 * Returns false when the secret is unset, so a misconfigured deploy rejects
 * every request rather than leaving the endpoint open.
 */
export function isBearerAuthorized(
  authHeader: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  if (!authHeader?.startsWith('Bearer ')) return false;

  const provided = authHeader.slice('Bearer '.length);
  if (provided.length !== expected.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(expected),
  );
}
