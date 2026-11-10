import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { Button } from '@/components/ui/button';

test('renders an accessible button and handles clicks', async () => {
  const onClick = vi.fn();
  const screen = await render(<Button onClick={onClick}>Save</Button>);

  const button = screen.getByRole('button', { name: 'Save' });
  await expect.element(button).toBeVisible();

  await button.click();
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('does not fire onClick when disabled', async () => {
  const onClick = vi.fn();
  const screen = await render(
    <Button disabled onClick={onClick}>
      Save
    </Button>,
  );

  await screen.getByRole('button', { name: 'Save' }).click({ force: true });
  expect(onClick).not.toHaveBeenCalled();
});
