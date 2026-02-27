import { STATE_TTL_MS } from './config.js';
import type { ConversationState } from './types.js';

const store = new Map<string, ConversationState>();

export function getState(phone: string): ConversationState | null {
  const state = store.get(phone);
  if (!state) return null;
  if (isExpired(state)) {
    store.delete(phone);
    return null;
  }
  return state;
}

export function setState(phone: string, state: ConversationState): void {
  store.set(phone, state);
}

export function clearState(phone: string): void {
  store.delete(phone);
}

export function isExpired(state: ConversationState): boolean {
  return Date.now() - state.updatedAt > STATE_TTL_MS;
}
