'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { submitContact } from '@/actions/contact';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { TextareaField } from '@/components/forms/textarea-field';
import { contactSchema } from '@/validations/contact';
import type { ContactInput } from '@/validations/contact';

export function ContactForm() {
  const t = useTranslations('contact');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ContactInput>({
    defaultValues: { email: '', message: '', name: '' },
    resolver: zodResolver(contactSchema),
  });

  async function onSubmit(values: ContactInput) {
    setFormError(null);
    const result = await submitContact(values);

    if (result.ok) {
      toast.success(t('success'));
      form.reset();
      return;
    }

    // Server-side validation errors → show them under the matching fields
    if (result.error.fieldErrors) {
      for (const [name, keys] of Object.entries(result.error.fieldErrors)) {
        const [key] = keys;
        if (key) {
          form.setError(name as keyof ContactInput, { message: key });
        }
      }
      return;
    }

    setFormError(result.error.messageKey);
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="name" label={t('name')} autoComplete="name" />
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <TextareaField name="message" label={t('message')} rows={5} />
        <SubmitButton>{t('send')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
