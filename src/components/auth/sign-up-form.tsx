'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { CheckEmail } from '@/components/auth/check-email';
import { PasswordStrength } from '@/components/auth/password-strength';
import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { getPathname } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { authErrorKey } from '@/libs/auth-error-keys';
import { signUpSchema } from '@/validations/auth';
import type { SignUpInput } from '@/validations/auth';

export function SignUpForm() {
  const t = useTranslations('auth.signUp');
  const locale = useLocale();
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const form = useForm<SignUpInput>({
    defaultValues: { confirmPassword: '', email: '', name: '', password: '' },
    resolver: zodResolver(signUpSchema),
  });

  // After clicking the email link the user lands on our own /verify-email page
  const callbackURL = getPathname({ href: '/verify-email', locale });

  async function onSubmit(values: SignUpInput) {
    setFormError(null);
    const { error } = await authClient.signUp.email({
      callbackURL,
      email: values.email,
      name: values.name,
      password: values.password,
    });

    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    setSubmittedEmail(values.email);
  }

  if (submittedEmail) {
    return (
      <CheckEmail
        email={submittedEmail}
        callbackURL={callbackURL}
        onChangeEmail={() => setSubmittedEmail(null)}
      />
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="name" label={t('name')} autoComplete="name" />
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <div className="space-y-2">
          <PasswordField name="password" label={t('password')} autoComplete="new-password" />
          <PasswordStrength name="password" />
        </div>
        <PasswordField
          name="confirmPassword"
          label={t('confirmPassword')}
          autoComplete="new-password"
        />
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
