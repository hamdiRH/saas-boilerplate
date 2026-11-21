/// <reference lib="webworker" />
import { isOurCache } from '@/libs/pwa/cache-policy';

declare const self: ServiceWorkerGlobalScope;

/**
 * Kill-switch worker (built when NEXT_PUBLIC_PWA_ENABLED=false). Browsers fetch /sw.js on every
 * navigation, so an installed worker picks this up, wipes our caches and unregisters itself.
 */
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter(isOurCache).map((name) => caches.delete(name)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map((client) => client.navigate(client.url)));
    })(),
  );
});
