'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';

/** Shown when an action fails with REAUTH_REQUIRED: signs out and returns here after sign-in. */
export function ReauthNotice() {
  const t = useTranslations('security.reauth');
  const router = useRouter();

  async function signInAgain() {
    await authClient.signOut();
    router.replace({ pathname: '/sign-in', query: { callbackUrl: '/dashboard/account/security' } });
  }

  return (
    <div role="alert" className="border-destructive/40 space-y-2 rounded-md border p-3 text-sm">
      <p className="font-medium">{t('title')}</p>
      <p className="text-muted-foreground">{t('description')}</p>
      <Button size="sm" variant="outline" onClick={signInAgain}>
        {t('action')}
      </Button>
    </div>
  );
}
