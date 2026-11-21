/** One place for everything the manifest, icons and browser chrome need (rebrand here). */
export const PWA_BRAND = {
  /** Splash-screen background (matches the dark brand background). */
  backgroundColor: '#0F172A',
  description: 'The Next.js boilerplate for modern SaaS. Build, launch and scale.',
  lang: 'en',
  startUrl: '/?source=pwa',
  /** Browser UI color when installed. */
  themeColor: '#635BFF',
  themeColorDark: '#0F172A',
  themeColorLight: '#FFFFFF',
} as const;

export interface PwaIcon {
  purpose?: 'any' | 'maskable';
  sizes: string;
  src: string;
  type: 'image/png';
}

/** Files produced by `pnpm pwa:icons` (see scripts/generate-pwa-icons.mjs). */
export const PWA_ICONS: readonly PwaIcon[] = [
  { purpose: 'any', sizes: '192x192', src: '/icons/icon-192.png', type: 'image/png' },
  { purpose: 'any', sizes: '512x512', src: '/icons/icon-512.png', type: 'image/png' },
  { purpose: 'maskable', sizes: '512x512', src: '/icons/icon-maskable-512.png', type: 'image/png' },
];

export const APPLE_TOUCH_ICON = '/icons/apple-touch-icon.png';
