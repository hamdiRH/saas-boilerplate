'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Button } from '@/components/ui/button';
import { useCooldown } from '@/hooks/use-cooldown';
import { getPathname } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { authErrorKey } from '@/libs/auth-error-keys';
import { forgotPasswordSchema } from '@/validations/auth';
import type { ForgotPasswordInput } from '@/validations/auth';

interface Props {
  callbackUrl: string;
}

export function MagicLinkForm({ callbackUrl }: Props) {
  const t = useTranslations('auth.magicLink');
  const locale = useLocale();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { remaining, start } = useCooldown(30);

  // Reuses { email } — no extra schema needed
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function send(email: string) {
    setFormError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: callbackUrl,
      newUserCallbackURL: callbackUrl,
      // Failures (expired/used link) land back on the sign-in page with ?error=…
      errorCallbackURL: getPathname({ href: '/sign-in', locale }),
    });

    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    // Keep the response screen identical for known and unknown addresses.
    setSentTo(email);
    start();
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold">{t('sentTitle')}</h2>
        <output className="text-muted-foreground block text-sm">
          {t('sentDescription', { email: sentTo })}
        </output>
        <Button variant="outline" disabled={remaining > 0} onClick={() => send(sentTo)}>
          {t('resend')}
          {remaining > 0 ? ` (${remaining})` : ''}
        </Button>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(({ email }) => send(email))}
        noValidate
        className="space-y-4"
      >
        <FormError messageKey={formError} />
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
