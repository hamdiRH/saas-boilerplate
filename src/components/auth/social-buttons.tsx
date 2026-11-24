'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/libs/auth-client';
import type { ProviderSummary } from '@/libs/auth-providers';

interface Props {
  providers: ProviderSummary[];
  callbackUrl: string;
  errorCallbackUrl: string;
  newUserCallbackUrl?: string;
}

export function SocialButtons({
  providers,
  callbackUrl,
  errorCallbackUrl,
  newUserCallbackUrl,
}: Props) {
  const t = useTranslations('auth.signIn');
  const [pending, setPending] = useState<string | null>(null);

  // nothing configured → nothing rendered
  if (providers.length === 0) {
    return null;
  }

  async function start(id: string) {
    setPending(id);
    // Redirects the browser to the provider. On return, Better Auth sets the session cookie.
    await authClient.signIn.social({
      provider: id as 'google' | 'github' | 'facebook' | 'twitter' | 'apple',
      callbackURL: callbackUrl,
      errorCallbackURL: errorCallbackUrl,
      newUserCallbackURL: newUserCallbackUrl ?? callbackUrl,
    });
    // only reached if the redirect didn't happen (error)
    setPending(null);
  }

  return (
    <div className="grid gap-2">
      {providers.map((provider) => (
        <Button
          key={provider.id}
          type="button"
          variant="outline"
          disabled={pending !== null}
          aria-busy={pending === provider.id}
          onClick={() => start(provider.id)}
        >
          {t('social', { provider: provider.label })}
        </Button>
      ))}
    </div>
  );
}
