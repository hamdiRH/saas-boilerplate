import { NextIntlClientProvider } from 'next-intl';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import messages from '@/locales/en.json';

const { setTheme } = vi.hoisted(() => ({
  setTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme }),
}));

test('selecting a theme applies it', async () => {
  const screen = await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeToggle />
    </NextIntlClientProvider>,
  );

  await screen.getByRole('button', { name: 'Toggle theme' }).click();
  await screen.getByRole('menuitem', { name: 'Light' }).click();

  expect(setTheme).toHaveBeenCalledWith('light');
});
