import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';

interface ResetPasswordPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}

async function ResetPasswordContent({ params, searchParams }: ResetPasswordPageProps) {
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

function ResetPasswordFallback() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <header className="space-y-2">
        <Skeleton className="mx-auto h-7 w-40" />
        <Skeleton className="mx-auto h-4 w-56" />
      </header>
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

export default function ResetPasswordPage(props: ResetPasswordPageProps) {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent {...props} />
    </Suspense>
  );
}
