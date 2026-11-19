import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runKeepAlive, isBearerAuthorized } from '../../src/keep-alive.js';

// ── runKeepAlive ─────────────────────────────────────────────────

describe('runKeepAlive', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pings the database and reports ok', async () => {
    const pingDatabase = vi.fn().mockResolvedValue(undefined);

    const result = await runKeepAlive({ pingDatabase });

    expect(result.ok).toBe(true);
    expect(result.database).toBe('ok');
    expect(pingDatabase).toHaveBeenCalledTimes(1);
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
  });

  it('reports the database failure instead of throwing', async () => {
    const pingDatabase = vi
      .fn()
      .mockRejectedValue(new Error('connection refused'));

    const result = await runKeepAlive({ pingDatabase });

    expect(result.ok).toBe(false);
    expect(result.database).toEqual({ error: 'connection refused' });
  });

  it('logs a structured error line naming the failing probe', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const pingDatabase = vi.fn().mockRejectedValue(new Error('pg is down'));

    await runKeepAlive({ pingDatabase });

    expect(logSpy).toHaveBeenCalled();
    const logged = JSON.parse(logSpy.mock.calls.at(-1)?.[0] as string);
    expect(logged.event).toBe('keep_alive_probe_failed');
    expect(logged.probe).toBe('database');
    expect(logged.error).toBe('pg is down');
  });

  it('coerces a non-Error throw to a string message', async () => {
    const pingDatabase = vi.fn().mockRejectedValue('boom');

    const result = await runKeepAlive({ pingDatabase });

    expect(result.database).toEqual({ error: 'boom' });
  });
});

// ── isBearerAuthorized ─────────────────────────────────────────────

describe('isBearerAuthorized', () => {
  it('accepts a matching bearer token', () => {
    expect(isBearerAuthorized('Bearer s3cret', 's3cret')).toBe(true);
  });

  it('rejects a wrong token of the same length', () => {
    expect(isBearerAuthorized('Bearer s3cres', 's3cret')).toBe(false);
  });

  it('rejects a wrong token of a different length', () => {
    expect(isBearerAuthorized('Bearer nope', 's3cret')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isBearerAuthorized(undefined, 's3cret')).toBe(false);
    expect(isBearerAuthorized(null, 's3cret')).toBe(false);
  });

  it('rejects a header without the Bearer prefix', () => {
    expect(isBearerAuthorized('s3cret', 's3cret')).toBe(false);
    expect(isBearerAuthorized('Basic s3cret', 's3cret')).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(isBearerAuthorized('Bearer anything', undefined)).toBe(false);
    expect(isBearerAuthorized('Bearer ', '')).toBe(false);
  });
});
