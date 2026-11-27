'use client';

import { useSyncExternalStore } from 'react';

function subscribeToNothing() {
  return () => {
    // Passkey API availability doesn't change during the page lifetime.
  };
}

function readSupport(): boolean | null {
  return typeof window === 'undefined' ? null : 'PublicKeyCredential' in window;
}

function readServerSnapshot(): boolean | null {
  return null;
}

export function usePasskeySupport(): boolean | null {
  return useSyncExternalStore(subscribeToNothing, readSupport, readServerSnapshot);
}
