'use client';

import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { usePwa } from '@/hooks/use-pwa';

const DISMISSED_KEY = 'pwa-install-dismissed-at';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Per-viewer convenience only: storage can throw or be empty, and the UI must still work.
 * Read through useSyncExternalStore so the server render and hydration both see `false`.
 */
function readCoolingDown(): boolean {
  try {
    const dismissedAt = Number(globalThis.localStorage.getItem(DISMISSED_KEY) ?? 0);
    return Date.now() - dismissedAt < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function writeDismissedAt(value: number): void {
  try {
    globalThis.localStorage.setItem(DISMISSED_KEY, String(value));
  } catch {
    // ignore: the prompt simply comes back next visit
  }
}

function subscribeToNothing() {
  return () => {
    // nothing to clean up
  };
}

export function InstallPrompt() {
  const t = useTranslations('pwa.install');
  const { canInstall, isInstalled, isIos, promptInstall } = usePwa();
  const coolingDown = useSyncExternalStore(subscribeToNothing, readCoolingDown, () => false);
  const [dismissedNow, setDismissedNow] = useState(false);

  if (isInstalled || dismissedNow || coolingDown) {
    return null;
  }
  // Chromium offers a native prompt; iOS Safari has none, so we explain the manual steps.
  if (!canInstall && !isIos) {
    return null;
  }

  const dismiss = () => {
    writeDismissedAt(Date.now());
    setDismissedNow(true);
  };

  return (
    <aside
      aria-label={t('title')}
      className="bg-card text-card-foreground fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border p-4 shadow-lg"
    >
      <p className="font-medium">{t('title')}</p>
      <p className="text-muted-foreground mt-1 text-sm">
        {canInstall ? t('description') : t('iosHint')}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={dismiss}>
          {t('dismiss')}
        </Button>
        {canInstall ? (
          <Button
            onClick={async () => {
              await promptInstall();
            }}
          >
            {t('action')}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
