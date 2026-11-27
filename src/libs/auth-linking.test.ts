import { expect, it } from 'vitest';

import { ACCOUNT_LINKING, TRUSTED_PROVIDERS } from './auth-linking';

it('only email-verifying providers are trusted for automatic linking', () => {
  expect([...TRUSTED_PROVIDERS].toSorted()).toEqual(['github', 'google']);
  for (const risky of ['facebook', 'twitter', 'apple', 'credential']) {
    expect(ACCOUNT_LINKING.trustedProviders).not.toContain(risky);
  }
});

it('never allows linking different emails or removing the last account', () => {
  expect(ACCOUNT_LINKING.allowDifferentEmails).toBe(false);
  expect(ACCOUNT_LINKING.allowUnlinkingAll).toBe(false);
});
