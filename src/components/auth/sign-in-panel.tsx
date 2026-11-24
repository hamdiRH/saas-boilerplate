'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';

import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { SignInForm } from '@/components/auth/sign-in-form';
import { SocialButtons } from '@/components/auth/social-buttons';
import { FormError } from '@/components/forms/form-error';
import { Button } from '@/components/ui/button';
import { getPathname } from '@/i18n/navigation';
import type { ProviderSummary } from '@/libs/auth-providers';

interface Props {
  callbackUrl: string;
  /** i18n key of an error that came back through a redirect (?error=…) */
  initialErrorKey: string | null;
  magicLinkEnabled: boolean;
  providers: ProviderSummary[];
}

export function SignInPanel({ callbackUrl, initialErrorKey, magicLinkEnabled, providers }: Props) {
  const t = useTranslations('auth.signIn');
  const tMagic = useTranslations('auth.magicLink');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const locale = useLocale();
  return (
    <div className="space-y-4">
      <FormError messageKey={initialErrorKey} />

      {mode === 'password' ? (
        <SignInForm callbackUrl={callbackUrl} />
      ) : (
        <MagicLinkForm callbackUrl={callbackUrl} />
      )}

      {magicLinkEnabled ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
        >
          {mode === 'password' ? t('magicLink') : tMagic('back')}
        </Button>
      ) : null}
      {providers.length > 0 ? (
        <>
          <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase">
            <span className="bg-border h-px flex-1" />
            {t('or')}
            <span className="bg-border h-px flex-1" />
          </div>
          <SocialButtons
            providers={providers}
            callbackUrl={callbackUrl}
            errorCallbackUrl={getPathname({ href: '/sign-in', locale })}
          />
        </>
      ) : null}
    </div>
  );
}
