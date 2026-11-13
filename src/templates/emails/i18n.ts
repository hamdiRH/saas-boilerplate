import { createTranslator } from 'next-intl';
import type { Locale } from 'next-intl';

import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

const messages = { en, fr } as const;

/** Emails are rendered outside a React request (auth callbacks), so we build a standalone translator. */
export function getEmailTranslator(locale: Locale) {
  return createTranslator({ locale, messages: messages[locale], namespace: 'emails' });
}
