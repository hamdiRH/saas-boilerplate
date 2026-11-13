import { hasLocale } from 'next-intl';
import type { Locale } from 'next-intl';

import { routing } from './routing';

/** next-intl's proxy stores the visitor's language in the NEXT_LOCALE cookie. */
export function localeFromRequest(request?: Request): Locale {
  const cookie = request?.headers.get('cookie') ?? '';
  const cookieValue = /(?:^|;\s*)NEXT_LOCALE=[^;]+/u.exec(cookie)?.[0];
  const raw = cookieValue?.slice(cookieValue.indexOf('=') + 1);
  const value = raw ? decodeURIComponent(raw) : undefined;
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
