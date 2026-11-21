import { describe, expect, it } from 'vitest';

import { isProtectedPath } from '../route-guard';
import {
  cacheName,
  classifyRequest,
  isCacheableResponse,
  isOurCache,
  isPrecacheName,
  staleCaches,
} from './cache-policy';
import type { RequestLike, ResponseLike } from './cache-policy';

const ORIGIN = 'https://app.example.com';

function request(
  path: string,
  init: { headers?: Record<string, string>; method?: string; mode?: string } = {},
) {
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    method: init.method ?? 'GET',
    mode: init.mode ?? 'cors',
    url: path.startsWith('http') ? path : `${ORIGIN}${path}`,
  } satisfies RequestLike;
}

function response(init: { status?: number; type?: string; headers?: Record<string, string> } = {}) {
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    status: init.status ?? 200,
    type: init.type ?? 'basic',
  } satisfies ResponseLike;
}

describe('classifyRequest — allowed', () => {
  it.each([
    ['/_next/static/chunks/app-123.js', 'static-immutable'],
    ['/_next/static/css/abc.css', 'static-immutable'],
    ['/icons/icon-192.png', 'public-asset'],
    ['/manifest.webmanifest', 'public-asset'],
    ['/offline.html', 'public-asset'],
  ])('%s → %s', (path, expected) => {
    expect(classifyRequest(request(path), ORIGIN)).toBe(expected);
  });

  it('treats page loads as navigations', () => {
    expect(classifyRequest(request('/', { mode: 'navigate' }), ORIGIN)).toBe('navigation');
    expect(classifyRequest(request('/fr/dashboard', { mode: 'navigate' }), ORIGIN)).toBe(
      'navigation',
    );
  });
});

describe('classifyRequest — never cached', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s', (method) => {
    expect(classifyRequest(request('/_next/static/a.js', { method }), ORIGIN)).toBe('network-only');
  });

  it.each(['/api/auth/get-session', '/api/auth/sign-in/email', '/api/health', '/api'])(
    'rejects API route %s',
    (path) => {
      expect(classifyRequest(request(path), ORIGIN)).toBe('network-only');
    },
  );

  it.each<Record<string, string>>([
    { rsc: '1' },
    { 'next-router-prefetch': '1' },
    { 'next-router-state-tree': '%5B%5D' },
    { 'next-action': 'abc' },
    { authorization: 'Bearer x' },
  ])('rejects framework/private header %o even for a cacheable path', (headers) => {
    expect(classifyRequest(request('/_next/static/a.js', { headers }), ORIGIN)).toBe(
      'network-only',
    );
  });

  it('rejects RSC payload URLs', () => {
    expect(classifyRequest(request('/dashboard?_rsc=abc'), ORIGIN)).toBe('network-only');
    expect(classifyRequest(request('/icons/icon-192.png?_rsc=abc'), ORIGIN)).toBe('network-only');
  });

  it('rejects other origins', () => {
    expect(classifyRequest(request('https://cdn.example.com/_next/static/a.js'), ORIGIN)).toBe(
      'network-only',
    );
  });

  it('rejects the worker file itself, image optimizer and unknown subresources', () => {
    expect(classifyRequest(request('/sw.js'), ORIGIN)).toBe('network-only');
    expect(classifyRequest(request('/_next/image?url=%2Fa.png&w=64&q=75'), ORIGIN)).toBe(
      'network-only',
    );
    expect(classifyRequest(request('/some/data.json'), ORIGIN)).toBe('network-only');
  });

  it('never allows a protected path to become cacheable', () => {
    for (const path of ['/dashboard', '/dashboard/account/security', '/admin']) {
      expect(isProtectedPath(path)).toBe(true);
      const cls = classifyRequest(request(path), ORIGIN);
      expect(cls).toBe('network-only');
      // as a navigation the response is still never stored (see isCacheableResponse usage in sw.ts)
      expect(classifyRequest(request(path, { mode: 'navigate' }), ORIGIN)).toBe('navigation');
    }
  });
});

describe('isCacheableResponse', () => {
  it('accepts a plain 200 same-origin response', () => {
    expect(isCacheableResponse(response())).toBe(true);
  });

  it.each([
    ['non-200', response({ status: 204 })],
    ['redirect', response({ status: 302 })],
    ['error', response({ status: 500 })],
    ['opaque', response({ type: 'opaque' })],
    ['cors', response({ type: 'cors' })],
    ['set-cookie', response({ headers: { 'set-cookie': 'a=b' } })],
    ['no-store', response({ headers: { 'cache-control': 'no-store' } })],
    ['private', response({ headers: { 'cache-control': 'private, max-age=60' } })],
    ['NO-STORE uppercase', response({ headers: { 'Cache-Control': 'No-Store' } })],
    ['vary *', response({ headers: { vary: '*' } })],
  ])('rejects %s', (_label, value) => {
    expect(isCacheableResponse(value)).toBe(false);
  });

  it('accepts public cacheable assets', () => {
    expect(
      isCacheableResponse(
        response({ headers: { 'cache-control': 'public, max-age=31536000, immutable' } }),
      ),
    ).toBe(true);
  });
});

describe('cache names', () => {
  it('namespaces and versions caches', () => {
    expect(cacheName('static', 'abc123')).toBe('pwa-static-abc123');
    expect(isOurCache('pwa-static-abc123')).toBe(true);
    expect(isOurCache('workbox-precache')).toBe(false);
  });

  it('recognises the public precache', () => {
    expect(isPrecacheName('pwa-precache-abc')).toBe(true);
    expect(isPrecacheName('pwa-static-abc')).toBe(false);
  });

  it('marks only OUR caches from other builds as stale', () => {
    const names = ['pwa-static-old', 'pwa-precache-old', 'pwa-static-new', 'other-app-cache'];
    expect(staleCaches(names, 'new')).toEqual(['pwa-static-old', 'pwa-precache-old']);
  });
});
