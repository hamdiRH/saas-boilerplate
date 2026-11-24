import { expect, it } from 'vitest';

import { callbackErrorKey } from './auth-callback-errors';

it('maps redirect error codes', () => {
  expect(callbackErrorKey(null)).toBeNull();
  expect(callbackErrorKey('INVALID_TOKEN')).toBe('auth.errors.invalidToken');
  expect(callbackErrorKey('account_not_linked')).toBe('auth.errors.accountNotLinked');
  expect(callbackErrorKey('anything_else')).toBe('auth.errors.oauthFailed');
});
