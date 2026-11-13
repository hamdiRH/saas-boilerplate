import { expect, test } from '@playwright/test';

test('home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SaaS Boilerplate/u);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ship your SaaS faster');
});

test('language switcher moves to French and keeps the page', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('link', { name: 'Français' }).click();

  await expect(page).toHaveURL(/\/fr\/contact$/u);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nous contacter');
});

test('theme choice persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/u);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/u);
});

test('unknown routes show a localized 404', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  await page.goto('/fr/nimporte-quoi');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
});

test('contact form validates input', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Send message' }).click();

  await expect(page.getByText('Name must be at least 2 characters')).toBeVisible();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
});
