'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { getPathname } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { authErrorKey } from '@/libs/auth-error-keys';
import { changeEmailSchema } from '@/validations/account';
import type { ChangeEmailInput } from '@/validations/account';

export function ChangeEmailForm() {
  const t = useTranslations('account.email');
  const locale = useLocale();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ChangeEmailInput>({
    defaultValues: { newEmail: '' },
    resolver: zodResolver(changeEmailSchema),
  });

  async function onSubmit({ newEmail }: ChangeEmailInput) {
    setFormError(null);
    // 🔍 Flow depends on the version: confirmation to the CURRENT address first, then a
    // verification link to the NEW one. Test it end to end and adapt the copy if needed.
    const { error } = await authClient.changeEmail({
      callbackURL: getPathname({ href: '/dashboard/account/profile', locale }),
      newEmail,
    });

    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    toast.success(t('sent'));
    form.reset();
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="newEmail" label={t('newEmail')} type="email" autoComplete="email" />
        <SubmitButton>{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
