'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { buttonVariants } from '@/components/ui/button';
import { Link, getPathname } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { forgotPasswordSchema } from '@/validations/auth';
import type { ForgotPasswordInput } from '@/validations/auth';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const locale = useLocale();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<ForgotPasswordInput>({
    defaultValues: { email: '' },
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit({ email }: ForgotPasswordInput) {
    // 🔍 Older versions call this `authClient.forgetPassword`
    await authClient.requestPasswordReset({
      email,
      redirectTo: getPathname({ href: '/reset-password', locale }),
    });
    // ALWAYS the same confirmation → no account enumeration
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <output className="block space-y-4 text-center">
        <h1 className="text-xl font-semibold">{t('sentTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('sentDescription', { email: sentTo })}</p>
        <Link href="/sign-in" className={buttonVariants({ variant: 'outline' })}>
          {t('back')}
        </Link>
      </output>
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
