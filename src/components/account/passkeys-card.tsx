'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { deletePasskey } from '@/actions/security';
import { ReauthNotice } from '@/components/account/reauth-notice';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PasskeySummary } from '@/data/security';
import { usePasskeySupport } from '@/hooks/use-passkey-support';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { authErrorKey } from '@/libs/auth-error-keys';
import { passkeyNameSchema } from '@/validations/security';
import type { PasskeyNameInput } from '@/validations/security';

export function PasskeysCard({ passkeys }: { passkeys: PasskeySummary[] }) {
  const t = useTranslations('security.passkeys');
  const format = useFormatter();
  const router = useRouter();
  const supported = usePasskeySupport();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<PasskeyNameInput>({
    resolver: zodResolver(passkeyNameSchema),
    defaultValues: { name: '' },
  });

  async function add({ name }: PasskeyNameInput) {
    setFormError(null);
    // Opens the browser/OS passkey prompt
    const { error } = await authClient.passkey.addPasskey({ name });
    if (error) {
      setFormError(authErrorKey(error, 'auth.errors.passkeyFailed'));
      return;
    }
    toast.success(t('added'));
    form.reset();
    router.refresh();
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deletePasskey({ id });
      if (result.ok) {
        toast.success(t('removed'));
        router.refresh();
      } else if (result.error.code === 'REAUTH_REQUIRED') {
        setNeedsReauth(true);
      } else {
        setFormError(result.error.messageKey);
      }
    });
  }

  function saveName() {
    if (!editing) {
      return;
    }
    const parsed = passkeyNameSchema.safeParse({ name: editing.name });
    if (!parsed.success) {
      return;
    }

    startTransition(async () => {
      const { error } = await authClient.passkey.updatePasskey({
        id: editing.id,
        name: parsed.data.name,
      });
      if (error) {
        setFormError(authErrorKey(error));
        return;
      }
      toast.success(t('renamed'));
      setEditing(null);
      router.refresh();
    });
  }

  if (supported === false) {
    return <p className="text-muted-foreground text-sm">{t('unsupported')}</p>;
  }

  return (
    <div className="space-y-4">
      {needsReauth ? <ReauthNotice /> : null}
      <FormError messageKey={formError} />

      {passkeys.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {passkeys.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3">
              {editing?.id === item.id ? (
                <div className="flex flex-1 gap-2">
                  <Input
                    aria-label={t('name')}
                    value={editing.name}
                    maxLength={40}
                    onChange={(event) => setEditing({ id: item.id, name: event.target.value })}
                  />
                  <Button size="sm" disabled={pending} onClick={saveName}>
                    {t('save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {t('cancel')}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {item.name}
                      {item.backedUp ? <Badge variant="secondary">{t('synced')}</Badge> : null}
                    </p>
                    {item.createdAt ? (
                      <p className="text-muted-foreground text-xs">
                        {t('created', {
                          date: format.dateTime(new Date(item.createdAt), { dateStyle: 'medium' }),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing({ id: item.id, name: item.name })}
                    >
                      {t('rename')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => remove(item.id)}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(add)} noValidate className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              name="name"
              label={t('name')}
              placeholder={t('namePlaceholder')}
              autoComplete="off"
              maxLength={40}
            />
          </div>
          <SubmitButton>{t('add')}</SubmitButton>
        </form>
      </FormProvider>
    </div>
  );
}
