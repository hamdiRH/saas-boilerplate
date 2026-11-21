import { isOurCache, isPrecacheName } from './cache-policy';
import type { SwMessage } from './messages';

const SERVICE_WORKER_URL = '/sw.js';

export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Production only: a worker in `next dev` would cache stale chunks and confuse hot reload. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return Promise.resolve(null);
  }
  // updateViaCache: 'none' makes the browser always revalidate sw.js, so updates are never delayed.
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, {
    scope: '/',
    updateViaCache: 'none',
  });
}

export function postToWorker(worker: ServiceWorker | null | undefined, message: SwMessage): void {
  // ServiceWorker.postMessage has no targetOrigin argument (that is a window.postMessage rule).
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  worker?.postMessage(message);
}

/**
 * Removes everything the app stored for offline use (runtime caches). The public precache,
 * which holds only the offline page, stays so the offline fallback keeps working.
 * Call on sign-out, session expiry and from the "clear offline data" button.
 */
export async function clearPwaData(): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => isOurCache(name) && !isPrecacheName(name))
      .map((name) => caches.delete(name)),
  );
}
