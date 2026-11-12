import type { KnipConfig } from 'knip';

process.env.SKIP_ENV_VALIDATION ??= '1';

const config: KnipConfig = {
  // Knip's Next.js plugin already treats app-router files (page, layout, route, …) as entries.
  entry: [
    // 'src/proxy.ts',
    'scripts/**/*.{ts,mjs}',
    // 'e2e/**/*.ts',
    // 'src/**/*.stories.{ts,tsx}',
    // 'src/**/*.test.{ts,tsx}',
    // 'tests/**/*.ts',
  ],
  // shadcn primitives intentionally export more than we use
  ignore: ['src/components/ui/**', 'src/db/**'],
  ignoreDependencies: ['lucide-react', '@faker-js/faker'],
  project: ['src/**/*.{ts,tsx,css}', 'scripts/**/*.{ts,mjs}'],
};

export default config;
