/**
 * What the service worker may cache. Pure functions, no browser APIs, fully unit-tested.
 *
 * The rule is an ALLOW-LIST: anything not explicitly allowed is `network-only`, so a new
 * route can never be cached by accident. Authenticated pages, RSC payloads, API calls and
 * Server Actions are never cacheable.
 */
export type RequestClass = 'navigation' | 'network-only' | 'public-asset' | 'static-immutable';

export interface RequestLike {
  headers: { get: (name: string) => string | null };
  method: string;
  mode: string;
  url: string;
}

export interface ResponseLike {
  headers: { get: (name: string) => string | null };
  status: number;
  type: string;
}

/** Headers that mean "framework data or private traffic": never cached. */
const FORBIDDEN_REQUEST_HEADERS = [
  'authorization',
  'next-action',
  'next-router-prefetch',
  'next-router-state-tree',
  'rsc',
] as const;

const PUBLIC_ASSET_PREFIXES = ['/icons/'] as const;
const PUBLIC_ASSET_FILES = new Set(['/manifest.webmanifest', '/offline.html']);

export function classifyRequest(request: RequestLike, origin: string): RequestClass {
  if (request.method !== 'GET') {
    return 'network-only';
  }

  const url = new URL(request.url);
  if (url.origin !== origin) {
    return 'network-only';
  }

  if (FORBIDDEN_REQUEST_HEADERS.some((name) => request.headers.get(name) !== null)) {
    return 'network-only';
  }
  if (url.searchParams.has('_rsc')) {
    return 'network-only';
  }

  const { pathname } = url;
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return 'network-only';
  }
  if (pathname.startsWith('/_next/static/')) {
    return 'static-immutable';
  }
  if (
    PUBLIC_ASSET_FILES.has(pathname) ||
    PUBLIC_ASSET_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return 'public-asset';
  }

  // Page loads are always fetched from the network. The offline page is only a fallback,
  // the response itself is never stored (so a protected page can never be replayed).
  if (request.mode === 'navigate') {
    return 'navigation';
  }

  return 'network-only';
}

/** Only successful, same-origin, non-private, cookie-free responses may be stored. */
export function isCacheableResponse(response: ResponseLike): boolean {
  if (response.status !== 200 || response.type !== 'basic') {
    return false;
  }
  if (response.headers.get('set-cookie') !== null) {
    return false;
  }
  const cacheControl = (response.headers.get('cache-control') ?? '').toLowerCase();
  if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
    return false;
  }
  return response.headers.get('vary')?.trim() !== '*';
}

const CACHE_PREFIX = 'pwa-';

export type CacheKind = 'precache' | 'public' | 'static';

export function cacheName(kind: CacheKind, buildId: string): string {
  return `${CACHE_PREFIX}${kind}-${buildId}`;
}

export function isOurCache(name: string): boolean {
  return name.startsWith(CACHE_PREFIX);
}

/** The precache holds only public files (the offline page), so sign-out can keep it. */
export function isPrecacheName(name: string): boolean {
  return name.startsWith(`${CACHE_PREFIX}precache-`);
}

/** Caches created by an older build (or by nothing we know about under our prefix). */
export function staleCaches(names: readonly string[], buildId: string): string[] {
  return names.filter((name) => isOurCache(name) && !name.endsWith(`-${buildId}`));
}
