import { expect, it, vi } from 'vitest';

import { runInBackground } from './background';

const logError = vi.hoisted(() => vi.fn());
vi.mock('@/libs/logger', () => ({ getLogger: () => ({ error: logError }) }));

it('runs the task outside a request scope and swallows its errors', async () => {
  let ran = false;
  runInBackground(async () => {
    ran = true;
    await Promise.resolve();
    throw new Error('boom');
  });

  await vi.waitFor(() =>
    expect(logError).toHaveBeenCalledWith('Background task failed', {
      error: expect.any(Error),
    }),
  );
  expect(ran).toBe(true);
});
