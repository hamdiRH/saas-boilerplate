import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { firstLink, waitForEmail } from './helpers/inbox';
import { createUser, PASSWORD, randomIp, uniqueEmail } from './helpers/users';

async function signInViaUi(page: Page, email: string, password: string) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('sign up → verify → dashboard → sign out → sign in', async ({ page }) => {
  const email = uniqueEmail();
  const since = Date.now();

  await page.goto('/sign-up');
  await page.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const mail = await waitForEmail(email, { since });
  await page.goto(firstLink(mail));

  await expect(page).toHaveURL(/\/verify-email/u);
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();

  await page.getByRole('link', { name: 'Continue to dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Welcome back, Ada Lovelace')).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard/u);

  await signInViaUi(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/u);
});

test('wrong password shows a generic error', async ({ page, request, baseURL }) => {
  const user = await createUser(request, baseURL);

  await page.goto('/sign-in');
  await signInViaUi(page, user.email, 'Wrong-Passw0rd-123');

  await expect(page.locator('form [data-slot="alert"]')).toHaveText('Invalid email or password.');
  await expect(page).toHaveURL(/\/sign-in/u);
});

test('an unverified user cannot sign in and gets a new link', async ({
  page,
  request,
  baseURL,
}) => {
  const user = await createUser(request, baseURL, { verify: false });
  const since = Date.now();

  await page.goto('/sign-in');
  await signInViaUi(page, user.email, user.password);

  await expect(page.locator('form [data-slot="alert"]')).toContainText('verify your email');
  const mail = await waitForEmail(user.email, { since });
  expect(mail.subject).toBe('Verify your email address');
});

test('forgot → reset → old password dead, new password works', async ({
  page,
  request,
  baseURL,
}) => {
  const user = await createUser(request, baseURL);
  const since = Date.now();

  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  const mail = await waitForEmail(user.email, { since });
  expect(mail.subject).toBe('Reset your password');
  await page.goto(firstLink(mail));

  await expect(page).toHaveURL(/\/reset-password\?token=/u);
  const newPassword = 'Brand-New-Passw0rd-E2E!';
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page).toHaveURL(/\/sign-in/u, { timeout: 10_000 });

  await signInViaUi(page, user.email, user.password);
  await expect(page.locator('form [data-slot="alert"]')).toHaveText('Invalid email or password.');

  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
});

test('the proxy redirects anonymous visitors and remembers the destination', async ({
  page,
  request,
  baseURL,
}) => {
  const user = await createUser(request, baseURL);

  await page.goto('/dashboard/account/security');
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard%2Faccount%2Fsecurity/u);

  await signInViaUi(page, user.email, user.password);
  await expect(page).toHaveURL(/\/dashboard\/account\/security$/u);
});

test('callbackUrl pointing to another site is ignored', async ({ page, request, baseURL }) => {
  const user = await createUser(request, baseURL);

  await page.goto('/sign-in?callbackUrl=https%3A%2F%2Fevil.example%2Fphish');
  await signInViaUi(page, user.email, user.password);

  await expect(page).toHaveURL(/localhost:3000\/dashboard$/u);
});

test('the French experience: page and email', async ({ page }) => {
  const email = uniqueEmail();
  const since = Date.now();

  await page.goto('/fr/sign-up');
  await expect(page.getByRole('heading', { name: 'Créez votre compte' })).toBeVisible();

  await page.getByLabel('Nom', { exact: true }).fill('Ada Lovelace');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer le compte' }).click();

  await expect(page.getByRole('heading', { name: 'Vérifiez votre e-mail' })).toBeVisible();
  const mail = await waitForEmail(email, { since });
  expect(mail.subject).toBe('Vérifiez votre adresse e-mail');
});

test('repeated failed sign-ins are rate limited', async ({ request, baseURL }) => {
  test.skip(
    !process.env.CI,
    'Rate limiting is off in local dev. Run against a production build with: CI=1 pnpm e2e',
  );

  if (!baseURL) {
    throw new Error('Playwright baseURL must be configured');
  }
  const headers = { origin: baseURL, 'x-forwarded-for': randomIp() };
  const statuses: number[] = [];

  for (let attempt = 0; attempt < 7; attempt += 1) {
    // Sequential requests are required to test the rate-limit threshold.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const response = await request.post('/api/auth/sign-in/email', {
      data: { email: 'nobody@example.com', password: 'Wrong-Passw0rd-123' },
      headers,
    });
    statuses.push(response.status());
  }

  const [firstStatus] = statuses;
  if (firstStatus === undefined) {
    throw new Error('Rate-limit test did not send any requests');
  }
  expect(firstStatus).not.toBe(429);
  expect(statuses).toContain(429);
});
