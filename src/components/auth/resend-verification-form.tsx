'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { getPathname } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { forgotPasswordSchema } from '@/validations/auth';
import type { ForgotPasswordInput } from '@/validations/auth';

export function ResendVerificationForm() {
  const t = useTranslations('auth.verify');
  const locale = useLocale();
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    defaultValues: { email: '' },
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit({ email }: ForgotPasswordInput) {
    await authClient.sendVerificationEmail({
      callbackURL: getPathname({ href: '/verify-email', locale }),
      email,
    });
    // identical outcome for unknown addresses
    setSent(true);
  }

  if (sent) {
    return <output className="text-accent text-sm">{t('resendSent')}</output>;
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <SubmitButton className="w-full">{t('resendSubmit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
