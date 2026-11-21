import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { PwaStatus } from '@/components/pwa/pwa-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requireSession } from '@/data/session';

interface PwaPageProps {
  params: Promise<{ locale: string }>;
}

async function PwaContent({ params }: PwaPageProps) {
  const { locale } = await params;
  setRequestLocale(locale as 'fr' | 'en');
  await requireSession();
  const t = await getTranslations('pwa.status');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <PwaStatus />
      </CardContent>
    </Card>
  );
}

export default function PwaPage({ params }: PwaPageProps) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" aria-hidden="true" />}>
      <PwaContent params={params} />
    </Suspense>
  );
}
