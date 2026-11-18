import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = 'http://localhost:3000';

// The console transport writes .emails/*.json for E2E verification.
const appEnv = {
  ALLOW_LOCAL_SERVICES: 'true',
  AUTH_RATE_LIMIT: 'on',
  EMAIL_TRANSPORT: 'console',
};

export default defineConfig({
  forbidOnly: isCI,
  fullyParallel: true,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: isCI ? [['html', { open: 'never' }], ['github']] : 'list',
  retries: isCI ? 1 : 0,
  testDir: 'e2e',
  use: { baseURL, trace: 'on-first-retry' },
  webServer: [
    { command: 'pnpm db:server', port: 5433, reuseExistingServer: false, timeout: 120_000 },
    {
      command: 'pnpm build && pnpm start',
      env: appEnv,
      reuseExistingServer: false,
      timeout: 300_000,
      url: baseURL,
    },
  ],
});
