'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { usePwa } from '@/hooks/use-pwa';

const TOAST_ID = 'pwa-update';

/** Offers the reload instead of forcing it, so nobody loses a half-filled form (decision D10). */
export function UpdateToast() {
  const t = useTranslations('pwa.update');
  const { applyUpdate, updateAvailable } = usePwa();

  useEffect(() => {
    if (!updateAvailable) {
      return;
    }
    toast(t('message'), {
      action: { label: t('action'), onClick: applyUpdate },
      duration: Infinity,
      id: TOAST_ID,
    });
    return () => {
      toast.dismiss(TOAST_ID);
    };
  }, [applyUpdate, t, updateAvailable]);

  return null;
}
