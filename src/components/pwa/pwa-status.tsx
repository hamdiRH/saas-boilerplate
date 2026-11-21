'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { usePwa } from '@/hooks/use-pwa';

export function PwaStatus() {
  const t = useTranslations('pwa.status');
  const { clearOfflineData, isInstalled, isSupported, version } = usePwa();
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    try {
      await clearOfflineData();
      toast.success(t('cleared'));
    } catch {
      toast.error(t('clearFailed'));
    }
    setBusy(false);
  }

  if (!isSupported) {
    return <p className="text-muted-foreground text-sm">{t('unsupported')}</p>;
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">
          {isInstalled ? t('installed') : t('notInstalled')}
        </dt>
        <dd />
        <dt className="text-muted-foreground">{t('version')}</dt>
        <dd className="font-mono">{version ?? '–'}</dd>
      </dl>
      <Button variant="outline" onClick={clear} disabled={busy}>
        {t('clear')}
      </Button>
    </div>
  );
}
