import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as 'en' | 'fr');
  const { token, error } = await searchParams;
  const t = await getTranslations('auth.reset');

  // Better Auth redirects here with ?token=… on success, or ?error=INVALID_TOKEN
  if (!token || error) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">{t('invalidTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('invalidDescription')}</p>
        <Button>
          <Link href="/forgot-password">{t('requestNew')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <ResetPasswordForm token={token} />
    </>
  );
}
