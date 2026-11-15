'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Route } from 'next';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Link, getPathname } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { authErrorKey } from '@/libs/auth-error-keys';
import { signInSchema } from '@/validations/auth';
import type { SignInInput } from '@/validations/auth';

/** `callbackUrl` is already sanitised by the page and includes the locale prefix. */
export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations('auth.signIn');
  const locale = useLocale();
  // next/navigation: callbackUrl is a full path (with locale)
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SignInInput>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(signInSchema),
  });

  async function onSubmit({ email, password }: SignInInput) {
    setFormError(null);
    const { error } = await authClient.signIn.email({ email, password });

    if (error) {
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        // Send a fresh link whose callback is our verification page
        await authClient.sendVerificationEmail({
          callbackURL: getPathname({ href: '/verify-email', locale }),
          email,
        });
      }
      // generic for bad credentials — no user enumeration
      setFormError(authErrorKey(error));
      return;
    }

    router.push(callbackUrl as Route);
    // re-run server components with the new session
    router.refresh();
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <PasswordField name="password" label={t('password')} autoComplete="current-password" />
        <div className="text-end text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground underline"
          >
            {t('forgot')}
          </Link>
        </div>
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
