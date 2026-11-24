import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = 'http://localhost:3000';

// The console transport writes .emails/*.json for E2E verification.
const appEnv = {
  ALLOW_LOCAL_SERVICES: 'true',
  AUTH_RATE_LIMIT: 'on',
  EMAIL_TRANSPORT: 'console',
  // Git Bash sets HOSTNAME to the PC name; Next standalone would bind to that, not localhost.
  HOSTNAME: '0.0.0.0',
  NEXT_PUBLIC_APP_NAME: 'Nexora',
  PORT: '3000',
};

export default defineConfig({
  forbidOnly: isCI,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: isCI ? [['html', { open: 'never' }], ['github']] : 'list',
  retries: isCI ? 1 : 0,
  testDir: 'e2e',
  timeout: 60_000,
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
