'use client';

import { createContext, useContext } from 'react';

export interface PwaState {
  /** Ask the waiting worker to take over, then reload when it does. */
  applyUpdate: () => void;
  /** Wipe runtime caches (sign-out, "clear offline data"). */
  clearOfflineData: () => Promise<void>;
  /** The browser offered installation and it has not been used or dismissed. */
  canInstall: boolean;
  /** Running as an installed app (standalone display). */
  isInstalled: boolean;
  isIos: boolean;
  isOffline: boolean;
  isSupported: boolean;
  /** Shows the native install dialog. Resolves true when the user accepted. */
  promptInstall: () => Promise<boolean>;
  updateAvailable: boolean;
  version: string | null;
}

export const PwaContext = createContext<PwaState | null>(null);

/** Install, update and connectivity state. Safe on the server: it renders nothing browser-specific. */
export function usePwa(): PwaState {
  const value = useContext(PwaContext);
  if (!value) {
    throw new Error('usePwa must be used inside <PwaProvider>');
  }
  return value;
}
