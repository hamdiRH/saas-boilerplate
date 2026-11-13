'use client';

import { useTranslations } from 'next-intl';

import { Alert, AlertDescription } from '@/components/ui/alert';

/** Form-level error. `messageKey` is a full key such as "errors.internal". */
export function FormError({ messageKey }: { messageKey?: string | null }) {
  const t = useTranslations();
  if (!messageKey) {
    return null;
  }

  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>
        {t.has(messageKey as never) ? t(messageKey as never) : t('errors.internal')}
      </AlertDescription>
    </Alert>
  );
}
