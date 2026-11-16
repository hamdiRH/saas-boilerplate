import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { firstLink, waitForEmail } from './inbox';

export const PASSWORD = 'Str0ng-Passw0rd-E2E!';

export const randomIp = () =>
  `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;

export const uniqueEmail = () =>
  `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Creates a user through the API (fast). Optionally verifies the email. */
export async function createUser(
  request: APIRequestContext,
  baseURL: string | undefined,
  { verify = true } = {},
) {
  if (!baseURL) {
    throw new Error('Playwright baseURL must be configured');
  }

  const email = uniqueEmail();
  const ip = randomIp();
  const headers = { origin: baseURL, 'x-forwarded-for': ip };
  const since = Date.now();

  const response = await request.post('/api/auth/sign-up/email', {
    data: { email, name: 'E2E User', password: PASSWORD },
    headers,
  });
  expect(response.ok()).toBeTruthy();

  const mail = await waitForEmail(email, { since });
  if (verify) {
    await request.get(firstLink(mail), { headers: { 'x-forwarded-for': ip } });
  }

  return { email, password: PASSWORD };
}
