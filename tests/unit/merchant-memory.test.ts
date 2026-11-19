import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_KEY: 'test-key',
}));

// Chainable query-builder mock: records every call, resolves to `result`.
const { calls, state } = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown[]]>,
  state: { result: { data: [] as unknown[] | null, error: null as unknown } },
}));

vi.mock('@supabase/supabase-js', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'eq', 'is', 'ilike', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(state.result);
  return { createClient: () => builder };
});

import { getLastExpenseByMerchant } from '../../src/db.js';

function expense(id: string, merchant: string | null) {
  return { id, merchant, category_id: `cat-${id}` };
}

function call(method: string) {
  return calls.find(([m]) => m === method)?.[1];
}

describe('getLastExpenseByMerchant', () => {
  beforeEach(() => {
    calls.length = 0;
    state.result = { data: [], error: null };
  });

  it('queries the user\'s non-deleted expenses, newest first', async () => {
    await getLastExpenseByMerchant('user-1', 'UBER RIDES');

    expect(call('from')).toEqual(['expenses']);
    expect(calls).toContainEqual(['eq', ['user_id', 'user-1']]);
    expect(calls).toContainEqual(['is', ['deleted_at', null]]);
    expect(call('ilike')).toEqual(['merchant', '%UBER RIDES%']);
    expect(call('order')).toEqual(['created_at', { ascending: false }]);
  });

  it('returns the newest expense whose normalized merchant matches exactly', async () => {
    state.result = {
      data: [
        expense('a', 'DLC*UBER RIDES EATS'), // substring hit, different merchant
        expense('b', 'DLC*UBER RIDES'),
        expense('c', 'PYU*UBER RIDES'), // older match
      ],
      error: null,
    };

    const result = await getLastExpenseByMerchant('user-1', 'UBER RIDES');
    expect(result?.id).toBe('b');
  });

  it('returns null when nothing matches', async () => {
    state.result = { data: [expense('a', 'DLC*UBER RIDES EATS'), expense('b', null)], error: null };
    expect(await getLastExpenseByMerchant('user-1', 'UBER RIDES')).toBeNull();
  });

  it('returns null when the query returns no rows', async () => {
    state.result = { data: null, error: null };
    expect(await getLastExpenseByMerchant('user-1', 'UBER RIDES')).toBeNull();
  });

  it('escapes LIKE wildcards in the merchant', async () => {
    await getLastExpenseByMerchant('user-1', '100% NATURAL_BAR');
    expect(call('ilike')).toEqual(['merchant', '%100\\% NATURAL\\_BAR%']);
  });

  it('throws on a database error', async () => {
    state.result = { data: null, error: new Error('boom') };
    await expect(getLastExpenseByMerchant('user-1', 'UBER RIDES')).rejects.toThrow('boom');
  });
});
