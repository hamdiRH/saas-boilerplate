import { NextIntlClientProvider } from 'next-intl';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { UserMenu } from '@/components/layout/user-menu';
import messages from '@/locales/en.json';

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

test('opens the user menu with its group label and sign-out action', async () => {
  const screen = await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <UserMenu user={{ email: 'ada@example.com', name: 'Ada Lovelace' }} />
    </NextIntlClientProvider>,
  );

  await screen.getByRole('button', { name: 'Account menu' }).click();

  await expect.element(screen.getByText('Signed in as')).toBeVisible();
  await expect.element(screen.getByText('ada@example.com')).toBeVisible();
  await expect.element(screen.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: 'Account' }).query()).toBeNull();
});
