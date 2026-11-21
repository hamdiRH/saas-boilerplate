import type { MetadataRoute } from 'next';

import { Env } from '@/libs/env';
import { PWA_BRAND, PWA_ICONS } from '@/libs/pwa/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: PWA_BRAND.backgroundColor,
    description: PWA_BRAND.description,
    display: 'standalone',
    icons: PWA_ICONS.map((icon) => ({ ...icon })),
    id: '/',
    lang: PWA_BRAND.lang,
    name: Env.NEXT_PUBLIC_APP_NAME,
    scope: '/',
    short_name: Env.NEXT_PUBLIC_APP_NAME.slice(0, 12),
    start_url: PWA_BRAND.startUrl,
    theme_color: PWA_BRAND.themeColor,
  };
}
