import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import * as rootParams from 'next/root-params';

import { routing } from './routing';

export default getRequestConfig(async () => {
  const requested = await rootParams.locale();
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const localeMessages = await import(`../locales/${locale}.json`);

  return {
    locale,
    messages: localeMessages.default,
  };
});
