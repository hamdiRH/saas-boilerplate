import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { SignUpForm } from '@/components/auth/sign-up-form';
import { Skeleton } from '@/components/ui/skeleton';
import { requireGuest } from '@/data/session';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

interface SignUpPageProps {
  params: Promise<{ locale: string }>;
}

async function SignUpContent({ params }: SignUpPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  await requireGuest();
  const t = await getTranslations('auth.signUp');

  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <SignUpForm />
      <p className="text-muted-foreground text-center text-sm">
        {t('haveAccount')}{' '}
        <Link href="/sign-in" className="text-foreground underline">
          {t('signInLink')}
        </Link>
      </p>
    </>
  );
}

function SignUpFallback() {
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
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-1 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="mx-auto h-4 w-48" />
    </div>
  );
}

export default function SignUpPage({ params }: SignUpPageProps) {
  return (
    <Suspense fallback={<SignUpFallback />}>
      <SignUpContent params={params} />
    </Suspense>
  );
}
