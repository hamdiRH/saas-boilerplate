import path from 'node:path';

import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    coverage: {
      exclude: [
        'src/components/ui/**',
        'src/**/*.stories.*',
        'src/**/*.d.ts',
        'src/types/**',
        '**/*.test.*',
      ],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    env: {
      // Safe defaults so modules that import Env.ts can load in tests
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
      NEXT_PUBLIC_APP_NAME: 'Test App',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    },
    // 🔍 Vitest `projects` API — verify in docs for your version
    projects: [
      {
        extends: true,
        test: {
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          name: 'unit',
        },
      },

      {
        extends: true,
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [{ browser: 'chromium' }],
            provider: playwright() as never,
          },
          include: ['src/**/*.test.tsx'],
          name: 'browser',
          setupFiles: ['tests/browser-setup.ts'],
        },
      },
    ],
  },
});
