/** Typed protocol between the page and the service worker (shared by both sides). */
export type SwMessage =
  | { type: 'CLEAR_CACHES' }
  | { type: 'GET_VERSION' }
  | { type: 'SKIP_WAITING' };

export type SwReply =
  | { type: 'CACHES_CLEARED' }
  | { type: 'PUSH_SUBSCRIPTION_CHANGED' }
  | { type: 'VERSION'; version: string };

const MESSAGE_TYPES: ReadonlySet<string> = new Set(['CLEAR_CACHES', 'GET_VERSION', 'SKIP_WAITING']);

export function isSwMessage(value: unknown): value is SwMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }
  return typeof value.type === 'string' && MESSAGE_TYPES.has(value.type);
}
