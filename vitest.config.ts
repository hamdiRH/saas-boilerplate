import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
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
    ],
  },
});
