import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  forbidOnly: isCI,
  fullyParallel: true,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: isCI ? [['html', { open: 'never' }], ['github']] : 'list',
  retries: isCI ? 1 : 0,
  testDir: 'e2e',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    // CI tests the PRODUCTION build; locally we reuse your running dev server (or start one)
    command: isCI ? 'pnpm build && pnpm start' : 'pnpm dev',
    reuseExistingServer: !isCI,
    timeout: 180_000,
    url: 'http://localhost:3000',
  },
});
