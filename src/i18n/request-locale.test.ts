import { expect, it } from 'vitest';

import { localeFromRequest } from './request-locale';

const req = (cookie?: string) =>
  new Request('http://localhost', { headers: cookie ? { cookie } : {} });

it('reads NEXT_LOCALE and falls back to the default', () => {
  expect(localeFromRequest(req('a=1; NEXT_LOCALE=fr'))).toBe('fr');
  // unsupported → default
  expect(localeFromRequest(req('NEXT_LOCALE=de'))).toBe('en');
  expect(localeFromRequest(req())).toBe('en');
  expect(localeFromRequest(undefined)).toBe('en');
});
