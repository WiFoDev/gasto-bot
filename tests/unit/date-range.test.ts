import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_KEY: 'test-key',
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({}),
}));

import { getDateRange } from '../../src/db.js';

describe('getDateRange', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns same start/end for today', () => {
    // Fix time to 2026-02-25 15:00:00 UTC (10:00 AM Lima = UTC-5)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-25T15:00:00Z'));

    const result = getDateRange('today', 'America/Lima');
    expect(result.start).toBe('2026-02-25');
    expect(result.end).toBe('2026-02-25');
  });

  it('returns first of month to today for month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-25T15:00:00Z'));

    const result = getDateRange('month', 'America/Lima');
    expect(result.start).toBe('2026-02-01');
    expect(result.end).toBe('2026-02-25');
  });

  it('returns Monday to today for week (Wednesday)', () => {
    // Feb 25, 2026 is a Wednesday
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-25T15:00:00Z'));

    const result = getDateRange('week', 'America/Lima');
    expect(result.start).toBe('2026-02-23'); // Monday
    expect(result.end).toBe('2026-02-25');
  });

  it('handles Sunday correctly (week starts previous Monday)', () => {
    // March 1, 2026 is a Sunday
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T15:00:00Z'));

    const result = getDateRange('week', 'America/Lima');
    expect(result.start).toBe('2026-02-23'); // Previous Monday
    expect(result.end).toBe('2026-03-01');
  });

  it('handles Monday correctly (start = today)', () => {
    // Feb 23, 2026 is a Monday
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-23T15:00:00Z'));

    const result = getDateRange('week', 'America/Lima');
    expect(result.start).toBe('2026-02-23');
    expect(result.end).toBe('2026-02-23');
  });

  it('respects timezone: 11pm Lima time is same day in Lima but next day UTC', () => {
    // 4:00 AM UTC Feb 26 = 11:00 PM Lima Feb 25
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-26T04:00:00Z'));

    const result = getDateRange('today', 'America/Lima');
    expect(result.start).toBe('2026-02-25'); // Lima date, not UTC date
  });

  it('returns first day of month for month period on day 1', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T15:00:00Z'));

    const result = getDateRange('month', 'America/Lima');
    expect(result.start).toBe('2026-03-01');
    expect(result.end).toBe('2026-03-01');
  });
});
