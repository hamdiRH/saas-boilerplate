/// <reference lib="webworker" />
import { parsePushPayload, safeNotificationUrl } from '@/libs/pwa/push-payload';

declare const self: ServiceWorkerGlobalScope;

const ICON = '/icons/icon-192.png';

self.addEventListener('push', (event) => {
  let raw: unknown = null;
  try {
    raw = event.data?.json();
  } catch {
    raw = null;
  }

  const payload = parsePushPayload(raw, self.location.origin);
  // Browsers require a visible notification for every push (userVisibleOnly), so an
  // unusable payload still shows a neutral one instead of being silently dropped.
  const title = payload?.title ?? 'Notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      badge: ICON,
      body: payload?.body ?? '',
      data: { url: payload?.url ?? '/' },
      icon: ICON,
      ...(payload?.tag ? { tag: payload.tag } : {}),
    }),
  );
});

async function openOrFocus(path: string): Promise<void> {
  const target = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  const existing = windows.find((client) => client.url === target);
  if (existing) {
    await existing.focus();
    return;
  }
  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const url = safeNotificationUrl(
    typeof data === 'object' && data !== null && 'url' in data ? data.url : undefined,
    self.location.origin,
  );
  event.waitUntil(openOrFocus(url));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // The browser rotated the subscription: ask an open page to subscribe again and save it.
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((windows) =>
      Promise.all(
        windows.map((client) =>
          // Client.postMessage has no targetOrigin argument (that is a window.postMessage rule).
          // oxlint-disable-next-line unicorn/require-post-message-target-origin
          client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }),
        ),
      ),
    ),
  );
});
