'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { authErrorKey } from '@/libs/auth-error-keys';
import { createDeleteAccountSchema } from '@/validations/account';
import type { DeleteAccountInput } from '@/validations/account';

export function DeleteAccountForm() {
  const t = useTranslations('account.danger');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const phrase = t('phrase');
  const schema = useMemo(() => createDeleteAccountSchema(phrase), [phrase]);

  const form = useForm<DeleteAccountInput>({
    defaultValues: { confirm: '', password: '' },
    resolver: zodResolver(schema),
  });

  async function onSubmit({ password }: DeleteAccountInput) {
    setFormError(null);
    const { error } = await authClient.deleteUser({ password });

    if (error) {
      // includes "please sign in again" for stale sessions
      setFormError(authErrorKey(error));
      return;
    }

    toast.success(t('deleted'));
    router.replace('/');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>{t('button')}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
          <DialogDescription>{t('confirmDescription', { phrase })}</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormError messageKey={formError} />
            <TextField name="confirm" label={t('phraseLabel')} autoComplete="off" />
            <PasswordField name="password" label={t('password')} autoComplete="current-password" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <SubmitButton variant="destructive">{t('submit')}</SubmitButton>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
