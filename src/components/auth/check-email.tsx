'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useCooldown } from '@/hooks/use-cooldown';
import { authClient } from '@/libs/auth-client';

interface Props {
  email: string;
  callbackURL: string;
  onChangeEmail?: () => void;
}

export function CheckEmail({ email, callbackURL, onChangeEmail }: Props) {
  const t = useTranslations('auth.checkEmail');
  // a mail was just sent
  const { remaining, start } = useCooldown(60, true);
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    // Same response whether or not the address exists — never reveal account state
    await authClient.sendVerificationEmail({ callbackURL, email });
    setMessage(t('resent'));
    start();
  }

  return (
    <output className="block space-y-4 text-center">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{t('description', { email })}</p>
      <Button variant="outline" onClick={resend} disabled={remaining > 0}>
        {remaining > 0 ? t('cooldown', { seconds: remaining }) : t('resend')}
      </Button>
      {message ? <p className="text-primary text-sm">{message}</p> : null}
      {onChangeEmail ? (
        <Button variant="link" size="sm" onClick={onChangeEmail}>
          {t('wrongEmail')}
        </Button>
      ) : null}
    </output>
  );
}
