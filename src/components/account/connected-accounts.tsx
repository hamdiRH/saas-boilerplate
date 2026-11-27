'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPathname, useRouter } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { authErrorKey } from '@/libs/auth-error-keys';
import type { ProviderSummary } from '@/libs/auth-providers';

interface Props {
  providers: ProviderSummary[];
  linkedAccounts: { accountId: string; providerId: string }[];
  accountCount: number;
}

export function ConnectedAccounts({ providers, linkedAccounts, accountCount }: Props) {
  const t = useTranslations('security.connected');
  const tAll = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (providers.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('none')}</p>;
  }

  // never offer to remove the only sign-in method
  const canDisconnect = accountCount > 1;

  function connect(id: ProviderSummary['id']) {
    startTransition(async () => {
      await authClient.linkSocial({
        provider: id,
        callbackURL: getPathname({ href: '/dashboard/account/security', locale }),
      });
    });
  }

  function disconnect(accountId: string, providerLabel: string) {
    startTransition(async () => {
      const { error } = await authClient.unlinkAccount({ accountId });
      if (error) {
        const key = authErrorKey(error);
        toast.error(tAll.has(key as never) ? tAll(key as never) : t('lastMethod'));
        return;
      }
      toast.success(t('disconnected', { provider: providerLabel }));
      router.refresh();
    });
  }

  return (
    <ul className="divide-y rounded-md border">
      {providers.map((provider) => {
        const linkedAccount = linkedAccounts.find((account) => account.providerId === provider.id);
        return (
          <li key={provider.id} className="flex items-center justify-between gap-4 p-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              {provider.label}
              {linkedAccount ? <Badge variant="secondary">{t('linked')}</Badge> : null}
            </span>
            {linkedAccount ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending || !canDisconnect}
                title={canDisconnect ? undefined : t('lastMethod')}
                onClick={() => disconnect(linkedAccount.accountId, provider.label)}
              >
                {t('disconnect')}
              </Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => connect(provider.id)}>
                {t('connect')}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
