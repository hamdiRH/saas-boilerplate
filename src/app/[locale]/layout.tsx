import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import { GeistMono } from 'geist/font/mono';
import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/components/providers/theme-provider';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { OfflineBanner } from '@/components/pwa/offline-banner';
import { PwaProvider } from '@/components/pwa/pwa-provider';
import { UpdateToast } from '@/components/pwa/update-toast';
import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/i18n/routing';
import { Env } from '@/libs/env';
import { APPLE_TOUCH_ICON, PWA_BRAND } from '@/libs/pwa/brand';

import '@/styles/global.css';

export const metadata: Metadata = {
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SaaS Boilerplate' },
  description: 'Production-ready SaaS starter',
  icons: { apple: APPLE_TOUCH_ICON },
  title: Env.NEXT_PUBLIC_APP_NAME,
};

export const viewport: Viewport = {
  themeColor: [
    { color: PWA_BRAND.themeColorLight, media: '(prefers-color-scheme: light)' },
    { color: PWA_BRAND.themeColorDark, media: '(prefers-color-scheme: dark)' },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${GeistMono.variable} antialiased`}>
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <PwaProvider>
              <OfflineBanner />
              {children}
              <InstallPrompt />
              <UpdateToast />
            </PwaProvider>
            <Toaster richColors />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
