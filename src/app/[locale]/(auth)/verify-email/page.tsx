import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { ResendVerificationForm } from '@/components/auth/resend-verification-form';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getSession } from '@/data/session';
import { Link } from '@/i18n/navigation';

async function VerifyEmailContent({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as 'en' | 'fr');
  const { error } = await searchParams;
  const t = await getTranslations('auth.verify');

  if (error) {
    return (
      <>
        <header className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">{t('errorTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('errorDescription')}</p>
        </header>
        <ResendVerificationForm />
      </>
    );
  }

  // Verified. Auto sign-in normally gives us a session; if not, ask the user to sign in.
  const session = await getSession();

  return (
    <div className="space-y-4 text-center">
      <h1 className="text-xl font-semibold">{t('successTitle')}</h1>
      <p className="text-muted-foreground text-sm">
        {session ? t('successDescription') : t('signInDescription')}
      </p>
      <Button className="w-full">
        {session ? (
          <Link href="/dashboard">{t('continue')}</Link>
        ) : (
          <Link href="/sign-in">{t('signIn')}</Link>
        )}
      </Button>
    </div>
  );
}

function VerifyEmailFallback() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="mx-auto h-6 w-40" />
      <Skeleton className="mx-auto h-4 w-56" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}
