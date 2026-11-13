'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

export function ErrorView({ digest, onRetry }: { digest?: string; onRetry?: () => void }) {
  const t = useTranslations('errors');

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center"
    >
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      {digest ? (
        <p className="text-muted-foreground text-xs">
          {t('reference')}: {digest}
        </p>
      ) : null}
      {onRetry ? <Button onClick={onRetry}>{t('retry')}</Button> : null}
    </div>
  );
}
