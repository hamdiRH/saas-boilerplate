import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { createUser } from './helpers/users';

// The worker is only registered by a production build (CI runs `pnpm build && pnpm start`).
// Locally, run `pnpm build && pnpm start` and set PWA_E2E=1 to include these tests.
test.skip(!process.env.CI && !process.env.PWA_E2E, 'needs a production build');

/** Waits until a worker is registered AND controls this page (reload once after first install). */
async function waitForControlledPage(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

/** Every URL stored in any Cache Storage cache. */
function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const lists = await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        return requests.map((request) => request.url);
      }),
    );
    return lists.flat();
  });
}

test('serves a valid manifest and icons', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('manifest+json');

  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/?source=pwa');

  const icons = manifest.icons as { src: string }[];
  const responses = await Promise.all(icons.map((icon) => request.get(icon.src)));
  for (const [index, iconResponse] of responses.entries()) {
    expect(iconResponse.status(), icons[index]?.src).toBe(200);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
  }
});

test('serves the worker uncached and registers it at scope /', async ({ page, request }) => {
  const worker = await request.get('/sw.js');
  expect(worker.status()).toBe(200);
  expect(worker.headers()['content-type']).toContain('javascript');
  expect(worker.headers()['cache-control']).toContain('no-cache');

  await page.goto('/');
  await waitForControlledPage(page);
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(new URL(scope).pathname).toBe('/');
});

test('shows the offline page when a navigation fails', async ({ context, page }) => {
  await page.goto('/');
  await waitForControlledPage(page);

  await context.setOffline(true);
  await page.goto('/contact').catch(() => null);
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
});

test('never stores API, RSC or protected-page responses, and signs out cleanly', async ({
  context,
  page,
  request,
  baseURL,
}) => {
  const user = await createUser(request, baseURL);

  await page.goto('/sign-in');
  await waitForControlledPage(page);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await page.goto('/dashboard/account/security');
  await expect(page.getByText('Active sessions', { exact: true })).toBeVisible();

  // While signed in, nothing private is in any cache.
  const whileSignedIn = await cachedUrls(page);
  for (const url of whileSignedIn) {
    const { pathname, search } = new URL(url);
    expect(pathname, url).not.toMatch(/^\/(?:api|dashboard|admin)(?:\/|$)/u);
    expect(search, url).not.toContain('_rsc');
  }

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');

  // Signed out and offline: a protected page is NOT replayed from any cache.
  await context.setOffline(true);
  await page.goto('/dashboard').catch(() => null);
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await expect(page.getByText('Welcome back')).toHaveCount(0);
  await context.setOffline(false);

  // Only public, immutable assets may be cached again after sign-out (the page reloads and re-fetches them).
  const afterSignOut = await cachedUrls(page);
  for (const url of afterSignOut) {
    const { pathname, search } = new URL(url);
    expect(pathname, url).toMatch(
      /^\/(?:_next\/static\/|icons\/|offline\.html$|manifest\.webmanifest$)/u,
    );
    expect(search, url).not.toContain('_rsc');
  }
});
