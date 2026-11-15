'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { PasswordStrength } from '@/components/auth/password-strength';
import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { authErrorKey } from '@/libs/auth-error-keys';
import { resetPasswordSchema } from '@/validations/auth';
import type { ResetPasswordInput } from '@/validations/auth';

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth.reset');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordInput>({
    defaultValues: { confirmPassword: '', password: '' },
    resolver: zodResolver(resetPasswordSchema),
  });

  async function onSubmit({ password }: ResetPasswordInput) {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });

    if (error) {
      setFormError(authErrorKey(error));
      return;
    }

    toast.success(t('success'));
    router.replace('/sign-in');
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <div className="space-y-2">
          <PasswordField name="password" label={t('newPassword')} autoComplete="new-password" />
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
