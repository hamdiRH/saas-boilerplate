import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { ChangePasswordForm } from '@/components/account/change-password-form';
import { ConnectedAccounts } from '@/components/account/connected-accounts';
import { DeleteAccountForm } from '@/components/account/delete-account-form';
import { SessionsList } from '@/components/account/sessions-list';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getSecuritySnapshot } from '@/data/security';
import { requireSession } from '@/data/session';
import { listUserSessions } from '@/data/sessions';

interface SecurityPageProps {
  params: Promise<{ locale: string }>;
}

async function SecurityContent({ params }: SecurityPageProps) {
  const { locale } = await params;
  setRequestLocale(locale as 'fr' | 'en');
  await requireSession();
  const t = await getTranslations('account.password');
  const sessions = await listUserSessions();
  const tSessions = await getTranslations('account.sessions');
  const tDanger = await getTranslations('account.danger');
  const snapshot = await getSecuritySnapshot();
  const tConnected = await getTranslations('security.connected');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{tConnected('title')}</CardTitle>
          <CardDescription>{tConnected('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectedAccounts
            providers={snapshot.providers}
            linkedAccounts={snapshot.linkedAccounts}
            accountCount={snapshot.accountCount}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{tSessions('title')}</CardTitle>
          <CardDescription>{tSessions('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsList sessions={sessions} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="text-destructive">{tDanger('title')}</span>
          </CardTitle>
          <CardDescription>{tDanger('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountForm />
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityFallback() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function SecurityPage({ params }: SecurityPageProps) {
  return (
    <Suspense fallback={<SecurityFallback />}>
      <SecurityContent params={params} />
    </Suspense>
  );
}
