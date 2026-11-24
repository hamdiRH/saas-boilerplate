/// <reference lib="webworker" />
import './push';
import {
  cacheName,
  classifyRequest,
  isCacheableResponse,
  isOurCache,
  staleCaches,
} from '@/libs/pwa/cache-policy';
import { isSwMessage } from '@/libs/pwa/messages';
import type { SwReply } from '@/libs/pwa/messages';

declare const self: ServiceWorkerGlobalScope;

const BUILD_ID = __BUILD_ID__;
const PRECACHE = __PRECACHE__;
const OFFLINE_URL = '/offline.html';
const MAX_STATIC_ENTRIES = 200;
const MAX_PUBLIC_ENTRIES = 50;

const precacheName = cacheName('precache', BUILD_ID);
const staticName = cacheName('static', BUILD_ID);
const publicName = cacheName('public', BUILD_ID);

async function trim(cache: Cache, max: number): Promise<void> {
  const keys = await cache.keys();
  const excess = keys.slice(0, Math.max(0, keys.length - max));
  await Promise.all(excess.map((key) => cache.delete(key)));
}

/** A failing cache write (quota, private mode) must never break the response. */
async function store(cache: Cache, request: Request, response: Response, max: number) {
  try {
    await cache.put(request, response);
    await trim(cache, max);
  } catch {
    // ignore: the network response is still returned to the page
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(staticName);
  const hit = await cache.match(request);
  if (hit) {
    return hit;
  }
  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await store(cache, request, response.clone(), MAX_STATIC_ENTRIES);
  }
  return response;
}

async function staleWhileRevalidate(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const cache = await caches.open(publicName);
  const hit = await cache.match(request);

  const refresh = fetch(request).then(async (response) => {
    if (isCacheableResponse(response)) {
      await store(cache, request, response.clone(), MAX_PUBLIC_ENTRIES);
    }
    return response;
  });

  if (hit) {
    event.waitUntil(refresh.catch(() => null));
    return hit;
  }
  return refresh;
}

/**
 * Chrome can replay navigations with cache: 'only-if-cached', which fetch() rejects unless
 * mode is 'same-origin'. Rebuild those as a normal request so a live server is not treated
 * as offline.
 */
const toNetworkRequest = (request: Request): Request => {
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return new Request(request, { cache: 'reload' });
  }
  return request;
};

/** Pages always come from the network. The offline page is only a fallback, never a copy of a page */
async function networkWithOfflineFallback(request: Request): Promise<Response> {
  try {
    return await fetch(toNetworkRequest(request));
  } catch {
    const cache = await caches.open(precacheName);
    const fallback = await cache.match(OFFLINE_URL);
    return fallback ?? Response.error();
  }
}

async function clearUserVisibleCaches(): Promise<void> {
  const names = await caches.keys();
  // Keep the (public) offline page; everything else we created goes.
  await Promise.all(
    names
      .filter((name) => isOurCache(name) && name !== precacheName)
      .map((name) => caches.delete(name)),
  );
}

async function reply(event: ExtendableMessageEvent, message: SwReply): Promise<void> {
  const { source } = event;
  if (source) {
    // Client.postMessage has no targetOrigin argument (that is a window.postMessage rule).
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    source.postMessage(message);
  }
  await Promise.resolve();
}

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page asks for it after the user agrees to reload (decision D10).
  event.waitUntil(caches.open(precacheName).then((cache) => cache.addAll([...PRECACHE])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(staleCaches(names, BUILD_ID).map((name: string) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const kind = classifyRequest(event.request, self.location.origin);

  switch (kind) {
    case 'static-immutable': {
      event.respondWith(cacheFirst(event.request));
      break;
    }
    case 'public-asset': {
      event.respondWith(staleWhileRevalidate(event));
      break;
    }
    case 'navigation': {
      event.respondWith(networkWithOfflineFallback(event.request));
      break;
    }
    default: {
      // network-only: do not intercept, the browser does its normal thing.
      break;
    }
  }
});

self.addEventListener('message', (event) => {
  const data: unknown = event.data;
  if (!isSwMessage(data)) {
    return;
  }

  switch (data.type) {
    case 'SKIP_WAITING': {
      void self.skipWaiting();
      break;
    }
    case 'GET_VERSION': {
      event.waitUntil(reply(event, { type: 'VERSION', version: BUILD_ID }));
      break;
    }
    case 'CLEAR_CACHES': {
      event.waitUntil(
        clearUserVisibleCaches().then(() => reply(event, { type: 'CACHES_CLEARED' })),
      );
      break;
    }
    default: {
      break;
    }
  }
});
