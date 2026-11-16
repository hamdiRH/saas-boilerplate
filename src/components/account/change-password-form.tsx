'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { changePassword } from '@/actions/account';
import { PasswordStrength } from '@/components/auth/password-strength';
import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { applyActionError } from '@/utils/form-errors';
import { changePasswordSchema } from '@/validations/account';
import type { ChangePasswordInput } from '@/validations/account';

export function ChangePasswordForm() {
  const t = useTranslations('account.password');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ChangePasswordInput>({
    defaultValues: {
      confirmPassword: '',
      currentPassword: '',
      newPassword: '',
      revokeOtherSessions: true,
    },
    resolver: zodResolver(changePasswordSchema),
  });

  async function onSubmit(values: ChangePasswordInput) {
    setFormError(null);
    const result = await changePassword(values);

    if (result.ok) {
      toast.success(t('changed'));
      form.reset();
      return;
    }
    setFormError(applyActionError(form, result.error));
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <PasswordField
          name="currentPassword"
          label={t('current')}
          autoComplete="current-password"
        />
        <div className="space-y-2">
          <PasswordField name="newPassword" label={t('new')} autoComplete="new-password" />
          <PasswordStrength name="newPassword" />
        </div>
        <PasswordField name="confirmPassword" label={t('confirm')} autoComplete="new-password" />
        <Controller
          control={form.control}
          name="revokeOtherSessions"
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <Checkbox
                id="revoke-other-sessions"
                name={field.name}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                aria-invalid={fieldState.invalid}
              />
              <FieldLabel htmlFor="revoke-other-sessions">{t('revokeOthers')}</FieldLabel>
            </Field>
          )}
        />
        <SubmitButton>{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
