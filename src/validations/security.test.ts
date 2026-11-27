import { expect, it } from 'vitest';

import { passkeyNameSchema } from './security';

it('accepts 1–40 characters after trimming', () => {
  expect(passkeyNameSchema.safeParse({ name: '  Work laptop ' }).success).toBe(true);
  expect(passkeyNameSchema.safeParse({ name: '   ' }).success).toBe(false);
  expect(passkeyNameSchema.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
});
