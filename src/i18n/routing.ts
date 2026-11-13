import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  defaultLocale: 'en',
  // /about (en) · /fr/about (fr) — ADR-010
  localePrefix: 'as-needed',
  locales: ['en', 'fr'],
});
