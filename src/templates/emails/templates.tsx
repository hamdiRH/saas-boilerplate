import type { Locale } from 'next-intl';

import { Env } from '@/libs/env';

import { getEmailTranslator } from './i18n';
import { ActionEmail } from './layout';

interface Base {
  locale: Locale;
  name: string;
}

export function VerifyEmail({ locale, name, url }: Base & { url: string }) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('verify.heading')}
      greeting={t('verify.greeting', { name })}
      body={t('verify.body')}
      action={{ label: t('verify.button'), url }}
      ignore={t('verify.ignore')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}

export function ResetPasswordEmail({ locale, name, url }: Base & { url: string }) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('reset.heading')}
      greeting={t('reset.greeting', { name })}
      body={t('reset.body')}
      action={{ label: t('reset.button'), url }}
      ignore={t('reset.ignore')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}

export function PasswordChangedEmail({ locale, name }: Base) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('passwordChanged.heading')}
      greeting={t('passwordChanged.greeting', { name })}
      body={t('passwordChanged.body')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}

export function ChangeEmailEmail({
  locale,
  name,
  url,
  newEmail,
}: Base & { url: string; newEmail: string }) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('changeEmail.heading')}
      greeting={t('changeEmail.greeting', { name })}
      body={t('changeEmail.body', { newEmail })}
      action={{ label: t('changeEmail.button'), url }}
      ignore={t('changeEmail.ignore')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}
