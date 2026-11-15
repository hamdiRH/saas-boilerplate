import { expect, it } from 'vitest';

import { authErrorKey } from './auth-error-keys';

it('maps known codes, rate limits and unknown errors', () => {
  expect(authErrorKey({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 })).toBe(
    'auth.errors.invalidCredentials',
  );
  expect(authErrorKey({ code: 'EMAIL_NOT_VERIFIED', status: 403 })).toBe(
    'auth.errors.emailNotVerified',
  );
  expect(authErrorKey({ status: 429 })).toBe('errors.rateLimited');
  expect(authErrorKey({ code: 'SOMETHING_NEW', status: 500 })).toBe('errors.internal');
  expect(authErrorKey(null)).toBe('errors.internal');
});
