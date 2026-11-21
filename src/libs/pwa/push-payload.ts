/**
 * Push payload contract, shared by the server (which builds it) and the service worker
 * (which must never trust it). No dependencies, so it is safe to bundle into the worker.
 */
export interface PushPayload {
  body: string;
  /** Path (same origin) opened when the notification is clicked. */
  url: string;
  title: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
}

/** Push services cap payloads around 4 KB; stay below. */
export const MAX_PUSH_PAYLOAD_BYTES = 3500;

/**
 * Turns whatever the push carried into a same-origin path. Anything else (other origin,
 * `javascript:`, protocol-relative, garbage) falls back to the home page.
 */
export function safeNotificationUrl(value: unknown, origin: string): string {
  if (typeof value !== 'string' || value === '' || value.startsWith('//')) {
    return '/';
  }
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) {
      return '/';
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

/** Defensive parse of an incoming push. Returns null when it is not a usable notification. */
export function parsePushPayload(raw: unknown, origin: string): PushPayload | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { body, tag, title, url } = raw as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') {
    return null;
  }
  return {
    body: typeof body === 'string' ? body : '',
    title: title.slice(0, 120),
    url: safeNotificationUrl(url, origin),
    ...(typeof tag === 'string' && tag !== '' ? { tag: tag.slice(0, 64) } : {}),
  };
}

/** Server side: serialize and refuse payloads the push service would reject. */
export function serializePushPayload(payload: PushPayload): string {
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).length > MAX_PUSH_PAYLOAD_BYTES) {
    throw new RangeError('Push payload is too large');
  }
  return json;
}
