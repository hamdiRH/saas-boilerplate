'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { SignInForm } from '@/components/auth/sign-in-form';
import { FormError } from '@/components/forms/form-error';
import { Button } from '@/components/ui/button';

interface Props {
  callbackUrl: string;
  /** i18n key of an error that came back through a redirect (?error=…) */
  initialErrorKey: string | null;
  magicLinkEnabled: boolean;
}

export function SignInPanel({ callbackUrl, initialErrorKey, magicLinkEnabled }: Props) {
  const t = useTranslations('auth.signIn');
  const tMagic = useTranslations('auth.magicLink');
  const [mode, setMode] = useState<'password' | 'magic'>('password');

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
    </div>
  );
}
