'use client';

import { useTranslations } from 'next-intl';

import { usePwa } from '@/hooks/use-pwa';

export function OfflineBanner() {
  const t = useTranslations('pwa.offline');
  const { isOffline } = usePwa();

  if (!isOffline) {
    return null;
  }

  return (
    <output className="bg-foreground text-background block px-4 py-2 text-center text-sm">
      {t('banner')}
    </output>
  );
}
