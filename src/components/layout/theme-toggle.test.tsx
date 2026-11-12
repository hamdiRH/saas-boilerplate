import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ThemeToggle } from '@/components/layout/theme-toggle';

const { setTheme } = vi.hoisted(() => ({
  setTheme: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme }),
}));

test('selecting a theme applies it', async () => {
  const screen = await render(<ThemeToggle />);

  await screen.getByRole('button', { name: 'Change theme' }).click();
  await screen.getByRole('menuitem', { name: 'Light' }).click();

  expect(setTheme).toHaveBeenCalledWith('light');
});
