import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { SignInForm } from '@/components/auth/sign-in-form';
import { Skeleton } from '@/components/ui/skeleton';
import { requireGuest } from '@/data/session';
import { Link, getPathname } from '@/i18n/navigation';
import { sanitizeCallbackUrl } from '@/utils/safe-redirect';

interface SignInPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
}

async function SignInContent({ params, searchParams }: SignInPageProps) {
  const { locale } = await params;
  setRequestLocale(locale as 'en' | 'fr');
  await requireGuest();

  const { callbackUrl } = await searchParams;
  const destination = sanitizeCallbackUrl(
    callbackUrl,
    getPathname({ href: '/dashboard', locale: locale as 'en' | 'fr' }),
  );
  const t = await getTranslations('auth.signIn');

  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <SignInForm callbackUrl={destination} />
      <p className="text-muted-foreground text-center text-sm">
        {t('noAccount')}{' '}
        <Link href="/sign-up" className="text-foreground underline">
          {t('signUpLink')}
        </Link>
      </p>
    </>
  );
}

function SignInFallback() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <header className="space-y-2">
        <Skeleton className="mx-auto h-7 w-36" />
        <Skeleton className="mx-auto h-4 w-56" />
      </header>
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="mx-auto h-4 w-48" />
    </div>
  );
}

export default function SignInPage(props: SignInPageProps) {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInContent {...props} />
    </Suspense>
  );
}
