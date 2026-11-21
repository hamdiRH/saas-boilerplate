'use client';

import { useOffline } from 'next/offline';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { PwaContext } from '@/hooks/use-pwa';
import type { PwaState } from '@/hooks/use-pwa';
import { Env, IS_PRODUCTION } from '@/libs/env';
import { isInstalledDisplay, isIosDevice } from '@/libs/pwa/install';
import type { SwReply } from '@/libs/pwa/messages';
import {
  clearPwaData,
  isServiceWorkerSupported,
  postToWorker,
  registerServiceWorker,
} from '@/libs/pwa/register';

/** The event Chromium fires when the app is installable. Not in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaProviderProps {
  children: ReactNode;
}

function noUnsubscribe() {
  // nothing to clean up
}

/** For values that never change after load: there is nothing to subscribe to. */
function neverChanges() {
  return noUnsubscribe;
}

function subscribeToConnectivity(onChange: () => void) {
  globalThis.addEventListener('online', onChange);
  globalThis.addEventListener('offline', onChange);
  return () => {
    globalThis.removeEventListener('online', onChange);
    globalThis.removeEventListener('offline', onChange);
  };
}

function subscribeToDisplayMode(onChange: () => void) {
  const query = globalThis.matchMedia('(display-mode: standalone)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readOffline = () => !navigator.onLine;
const readSupported = () => isServiceWorkerSupported();
const readIos = () => isIosDevice(navigator.userAgent, navigator.maxTouchPoints);
const readInstalled = () =>
  isInstalledDisplay(
    globalThis.matchMedia('(display-mode: standalone)').matches,
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );
const serverFalse = () => false;

export function PwaProvider({ children }: PwaProviderProps) {
  const frameworkOffline = useOffline();
  // Browser-only facts are read with useSyncExternalStore: false on the server and during
  // hydration (no mismatch), the real value right after.
  const browserOffline = useSyncExternalStore(subscribeToConnectivity, readOffline, serverFalse);
  const isSupported = useSyncExternalStore(neverChanges, readSupported, serverFalse);
  const isIos = useSyncExternalStore(neverChanges, readIos, serverFalse);
  const installedByDisplay = useSyncExternalStore(
    subscribeToDisplayMode,
    readInstalled,
    serverFalse,
  );
  const [installedNow, setInstalledNow] = useState(false);
  const isInstalled = installedByDisplay || installedNow;
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setInstalledNow(true);
    };

    globalThis.addEventListener('beforeinstallprompt', onPrompt);
    globalThis.addEventListener('appinstalled', onInstalled);
    return () => {
      globalThis.removeEventListener('beforeinstallprompt', onPrompt);
      globalThis.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Register the worker (production only) and watch for updates.
  useEffect(() => {
    if (!IS_PRODUCTION || !Env.NEXT_PUBLIC_PWA_ENABLED) {
      return;
    }

    let cancelled = false;
    const cleanups: (() => void)[] = [];

    const trackInstalling = (registration: ServiceWorkerRegistration) => {
      const { installing } = registration;
      if (!installing) {
        return;
      }
      const onChange = () => {
        // "installed" with an active controller means a NEW version is waiting.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }
      };
      installing.addEventListener('statechange', onChange);
      cleanups.push(() => installing.removeEventListener('statechange', onChange));
    };

    const onMessage = (event: MessageEvent<SwReply>) => {
      if (event.data.type === 'VERSION') {
        setVersion(event.data.version);
      }
    };

    const onControllerChange = () => {
      if (reloading.current) {
        globalThis.location.reload();
      }
    };

    const register = async () => {
      const registration = await registerServiceWorker();
      if (cancelled || !registration) {
        return;
      }
      if (registration.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
      }
      registration.addEventListener('updatefound', () => trackInstalling(registration));
      postToWorker(registration.active, { type: 'GET_VERSION' });
    };
    void register();

    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, []);

  const applyUpdate = useCallback(() => {
    reloading.current = true;
    postToWorker(waiting, { type: 'SKIP_WAITING' });
  }, [waiting]);

  const promptInstall = useCallback(async () => {
    if (!installEvent) {
      return false;
    }
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    // The event can only be used once.
    setInstallEvent(null);
    return outcome === 'accepted';
  }, [installEvent]);

  const value = useMemo<PwaState>(
    () => ({
      applyUpdate,
      canInstall: installEvent !== null && !isInstalled,
      clearOfflineData: clearPwaData,
      isInstalled,
      isIos,
      isOffline: frameworkOffline || browserOffline,
      isSupported,
      promptInstall,
      updateAvailable: waiting !== null,
      version,
    }),
    [
      applyUpdate,
      browserOffline,
      frameworkOffline,
      installEvent,
      isInstalled,
      isIos,
      isSupported,
      promptInstall,
      version,
      waiting,
    ],
  );

  return <PwaContext value={value}>{children}</PwaContext>;
}
