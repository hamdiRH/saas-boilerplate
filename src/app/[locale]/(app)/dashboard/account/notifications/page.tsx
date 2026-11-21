import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { PushToggle } from '@/components/pwa/push-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requireSession } from '@/data/session';
import { Env } from '@/libs/env';

interface NotificationsPageProps {
  params: Promise<{ locale: string }>;
}

async function NotificationsContent({ params }: NotificationsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale as 'fr' | 'en');
  await requireSession();
  const t = await getTranslations('push');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {Env.PUSH_ENABLED ? (
          <PushToggle />
        ) : (
          <p className="text-muted-foreground text-sm">{t('unavailable')}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function NotificationsPage({ params }: NotificationsPageProps) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" aria-hidden="true" />}>
      <NotificationsContent params={params} />
    </Suspense>
  );
}
