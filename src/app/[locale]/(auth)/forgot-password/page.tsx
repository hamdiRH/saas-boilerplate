import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { requireGuest } from '@/data/session';
import { Link } from '@/i18n/navigation';

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as 'en' | 'fr');
  await requireGuest();
  const t = await getTranslations('auth.forgot');

  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <ForgotPasswordForm />
      <p className="text-center text-sm">
        <Link href="/sign-in" className="text-muted-foreground hover:text-foreground underline">
          {t('back')}
        </Link>
      </p>
    </>
  );
}
