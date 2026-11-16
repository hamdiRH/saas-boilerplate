import { test as base } from '@playwright/test';

import { randomIp } from './helpers/users';

export const test = base.extend<{ _clientIp: undefined }>({
  _clientIp: [
    async ({ context }, use) => {
      await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
