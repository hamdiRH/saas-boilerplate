'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { sendTestPush, subscribePush, unsubscribePush } from '@/actions/push';
import { Button } from '@/components/ui/button';
import { usePwa } from '@/hooks/use-pwa';
import { Env } from '@/libs/env';
import { urlBase64ToUint8Array } from '@/libs/pwa/vapid';

type Environment = 'checking' | 'denied' | 'iosInstallFirst' | 'ok' | 'unsupported';

function noUnsubscribe() {
  // nothing to clean up
}

/** Permission and support only change through our own button, which re-renders the component. */
function subscribeToNothing() {
  return noUnsubscribe;
}

function readEnvironment(isIos: boolean, isInstalled: boolean): Environment {
  if (isIos && !isInstalled) {
    return 'iosInstallFirst';
  }
  const supported =
    'serviceWorker' in navigator && 'PushManager' in globalThis && 'Notification' in globalThis;
  if (!supported) {
    return 'unsupported';
  }
  return Notification.permission === 'denied' ? 'denied' : 'ok';
}

export function PushToggle() {
  const t = useTranslations('push');
  const { isInstalled, isIos } = usePwa();
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  const environment = useSyncExternalStore<Environment>(
    subscribeToNothing,
    () => readEnvironment(isIos, isInstalled),
    () => 'checking',
  );

  useEffect(() => {
    if (environment !== 'ok') {
      return;
    }
    let cancelled = false;
    const load = async () => {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) {
        setSubscribed(existing !== null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [environment]);

  async function enable() {
    const publicKey = Env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      toast.error(t('unavailable'));
      return;
    }
    setBusy(true);
    try {
      // Asked only here, after a click: never on page load.
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToUint8Array(publicKey),
          userVisibleOnly: true,
        });
        const result = await subscribePush(subscription.toJSON());
        if (result.ok) {
          setSubscribed(true);
        } else {
          await subscription.unsubscribe();
          toast.error(t('error'));
        }
      }
    } catch {
      toast.error(t('error'));
    }
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      toast.error(t('error'));
    }
    setBusy(false);
  }

  async function sendTest() {
    setBusy(true);
    try {
      const result = await sendTestPush({});
      if (result.ok) {
        toast.success(t('testSent'));
      } else {
        toast.error(t('error'));
      }
    } catch {
      toast.error(t('error'));
    }
    setBusy(false);
  }

  const message = (() => {
    if (environment === 'denied') {
      return t('denied');
    }
    if (environment === 'iosInstallFirst') {
      return t('iosInstalledOnly');
    }
    if (environment === 'unsupported') {
      return t('unsupported');
    }
    if (environment === 'ok' && subscribed !== null) {
      return subscribed ? t('enabled') : t('disabled');
    }
    return '';
  })();
  const ready = environment === 'ok' && subscribed !== null;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        {ready && !subscribed ? (
          <Button onClick={enable} disabled={busy}>
            {t('enable')}
          </Button>
        ) : null}
        {ready && subscribed ? (
          <>
            <Button variant="outline" onClick={disable} disabled={busy}>
              {t('disable')}
            </Button>
            <Button variant="secondary" onClick={sendTest} disabled={busy}>
              {t('test')}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
