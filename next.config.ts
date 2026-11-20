import bundleAnalyzer from '@next/bundle-analyzer';
import { createJiti } from 'jiti';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

import type { getSecurityHeaders as getSecurityHeadersType } from './src/libs/security-headers';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

const jiti = createJiti(import.meta.url);
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    agentFeedback: true,
  },
  async headers() {
    const { getSecurityHeaders } = await jiti.import<{
      getSecurityHeaders: typeof getSecurityHeadersType;
    }>('./src/libs/security-headers');

    return [
      {
        headers: getSecurityHeaders({ isProduction: process.env.NODE_ENV === 'production' }),
        source: '/:path*',
      },
    ];
  },
  output: 'standalone',
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    rules: {
      '*.css': {
        as: '*.css',
        loaders: ['@tailwindcss/turbopack'],
      },
    },
  },
  typedRoutes: true,
};

// Validate environment variables without top-level await.
const validateEnvironment = async (): Promise<void> => {
  try {
    await jiti.import('./src/libs/env');
  } catch (error) {
    console.error('Environment validation failed:', error);
    process.exit(1);
  }
};

void validateEnvironment();

export default withBundleAnalyzer(withNextIntl(nextConfig));
