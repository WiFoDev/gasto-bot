import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/config.js', () => ({
  STATE_TTL_MS: 300_000,
}));

import { getState, setState, clearState, isExpired } from '../../src/state.js';
import type { ConversationState, PendingExpense } from '../../src/types.js';

const PHONE = '+51999888777';

const makePendingExpense = (overrides?: Partial<PendingExpense>): PendingExpense => ({
  amount: 35,
  currency: 'PEN',
  category_slug: 'food_dining',
  description: 'almuerzo',
  merchant: null,
  date: '2026-02-27',
  source: 'text',
  raw_input: 'almuerzo 35 soles',
  image_url: null,
  ai_confidence: 0.95,
  ...overrides,
});

describe('state', () => {
  beforeEach(() => {
    clearState(PHONE);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getState / setState', () => {
    it('returns null for unknown phone number', () => {
      expect(getState('+51000000000')).toBeNull();
    });

    it('returns state after setState', () => {
      const state: ConversationState = {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-123',
        updatedAt: Date.now(),
      };

      setState(PHONE, state);
      const result = getState(PHONE);

      expect(result).not.toBeNull();
      expect(result!.lastAction).toBe('expense_logged');
      expect(result!.lastExpenseId).toBe('exp-123');
    });

    it('returns null after TTL expires', () => {
      const state: ConversationState = {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-123',
        updatedAt: Date.now(),
      };

      setState(PHONE, state);
      expect(getState(PHONE)).not.toBeNull();

      // Advance past TTL (5 minutes + 1ms)
      vi.advanceTimersByTime(300_001);
      expect(getState(PHONE)).toBeNull();
    });

    it('does not expire state before TTL', () => {
      const state: ConversationState = {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-123',
        updatedAt: Date.now(),
      };

      setState(PHONE, state);

      // Advance to just under TTL
      vi.advanceTimersByTime(299_999);
      expect(getState(PHONE)).not.toBeNull();
    });

    it('overwrites previous state on setState', () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });

      setState(PHONE, {
        lastAction: 'awaiting_description',
        pendingExpense: makePendingExpense(),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const result = getState(PHONE);
      expect(result!.lastAction).toBe('awaiting_description');
      expect(result!.pendingExpense).not.toBeNull();
      expect(result!.lastExpenseId).toBeNull();
    });
  });

  describe('clearState', () => {
    it('removes state for a phone number', () => {
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-123',
        updatedAt: Date.now(),
      });

      expect(getState(PHONE)).not.toBeNull();
      clearState(PHONE);
      expect(getState(PHONE)).toBeNull();
    });

    it('does not throw when clearing unknown phone', () => {
      expect(() => clearState('+51000000000')).not.toThrow();
    });
  });

  describe('isExpired', () => {
    it('returns false for fresh state', () => {
      const state: ConversationState = {
        lastAction: 'none',
        pendingExpense: null,
        lastExpenseId: null,
        updatedAt: Date.now(),
      };

      expect(isExpired(state)).toBe(false);
    });

    it('returns true for state older than TTL', () => {
      const state: ConversationState = {
        lastAction: 'none',
        pendingExpense: null,
        lastExpenseId: null,
        updatedAt: Date.now(),
      };

      vi.advanceTimersByTime(300_001);
      expect(isExpired(state)).toBe(true);
    });

    it('returns false for state exactly at TTL boundary', () => {
      const state: ConversationState = {
        lastAction: 'none',
        pendingExpense: null,
        lastExpenseId: null,
        updatedAt: Date.now(),
      };

      vi.advanceTimersByTime(300_000);
      expect(isExpired(state)).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('transitions null → awaiting_description → null', () => {
      // Start with no state
      expect(getState(PHONE)).toBeNull();

      // Set to awaiting_description with pending expense
      setState(PHONE, {
        lastAction: 'awaiting_description',
        pendingExpense: makePendingExpense({ description: null }),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const mid = getState(PHONE);
      expect(mid!.lastAction).toBe('awaiting_description');
      expect(mid!.pendingExpense).not.toBeNull();

      // Clear state after completing the flow
      clearState(PHONE);
      expect(getState(PHONE)).toBeNull();
    });

    it('transitions null → awaiting_confirmation → expense_logged', () => {
      expect(getState(PHONE)).toBeNull();

      // User sends expense, awaiting confirmation
      setState(PHONE, {
        lastAction: 'awaiting_confirmation',
        pendingExpense: makePendingExpense(),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      const confirming = getState(PHONE);
      expect(confirming!.lastAction).toBe('awaiting_confirmation');

      // User confirms, expense is logged
      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-456',
        updatedAt: Date.now(),
      });

      const logged = getState(PHONE);
      expect(logged!.lastAction).toBe('expense_logged');
      expect(logged!.lastExpenseId).toBe('exp-456');
      expect(logged!.pendingExpense).toBeNull();
    });

    it('isolates state between different phone numbers', () => {
      const phone2 = '+51111222333';

      setState(PHONE, {
        lastAction: 'expense_logged',
        pendingExpense: null,
        lastExpenseId: 'exp-1',
        updatedAt: Date.now(),
      });

      setState(phone2, {
        lastAction: 'awaiting_description',
        pendingExpense: makePendingExpense(),
        lastExpenseId: null,
        updatedAt: Date.now(),
      });

      expect(getState(PHONE)!.lastAction).toBe('expense_logged');
      expect(getState(phone2)!.lastAction).toBe('awaiting_description');

      clearState(PHONE);
      expect(getState(PHONE)).toBeNull();
      expect(getState(phone2)).not.toBeNull();
    });
  });
});
