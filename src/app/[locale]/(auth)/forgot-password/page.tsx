import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { Skeleton } from '@/components/ui/skeleton';
import { requireGuest } from '@/data/session';
import { Link } from '@/i18n/navigation';

interface ForgotPasswordPageProps {
  params: Promise<{ locale: string }>;
}

async function ForgotPasswordContent({ params }: ForgotPasswordPageProps) {
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

function ForgotPasswordFallback() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <header className="space-y-2">
        <Skeleton className="mx-auto h-7 w-40" />
        <Skeleton className="mx-auto h-4 w-56" />
      </header>
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="mx-auto h-4 w-32" />
    </div>
  );
}

export default function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  return (
    <Suspense fallback={<ForgotPasswordFallback />}>
      <ForgotPasswordContent params={params} />
    </Suspense>
  );
}
