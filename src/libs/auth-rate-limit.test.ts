import { expect, it } from 'vitest';

import { AUTH_RATE_LIMIT_DEFAULT, AUTH_RATE_LIMIT_RULES } from './auth-rate-limit';

it('sensitive endpoints are much stricter than the default', () => {
  for (const rule of Object.values(AUTH_RATE_LIMIT_RULES)) {
    expect(rule.max).toBeLessThanOrEqual(5);
    expect(rule.max).toBeLessThan(AUTH_RATE_LIMIT_DEFAULT.max);
  }
  expect(AUTH_RATE_LIMIT_RULES['/sign-in/email'].max).toBe(5);
});
