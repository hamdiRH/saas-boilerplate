'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { authErrorKey } from '@/libs/auth-error-keys';
import { updateProfileSchema } from '@/validations/account';
import type { UpdateProfileInput } from '@/validations/account';

export function ProfileForm({ name }: { name: string }) {
  const t = useTranslations('account.profile');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpdateProfileInput>({
    defaultValues: { name },
    resolver: zodResolver(updateProfileSchema),
  });

  async function onSubmit(values: UpdateProfileInput) {
    setFormError(null);
    const { error } = await authClient.updateUser({ name: values.name });
    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    toast.success(t('saved'));
    // header + dashboard show the new name
    router.refresh();
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="name" label={t('name')} autoComplete="name" />
        <SubmitButton>{t('save')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
