import { describe, expect, it } from 'vitest';

import {
  buildSocialProviders,
  buildTrustedOrigins,
  callbackUrlFor,
  getEnabledProviders,
  incompleteProviders,
} from './auth-providers';

const env = {
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
  // secret missing → NOT enabled
  GITHUB_CLIENT_ID: 'gh-id',
  FACEBOOK_CLIENT_ID: '',
  FACEBOOK_CLIENT_SECRET: '',
  NODE_ENV: 'test',
};

describe('provider registry', () => {
  it('enables only providers with both credentials', () => {
    expect(getEnabledProviders(env)).toEqual([{ id: 'google', label: 'Google' }]);
    expect(buildSocialProviders(env)).toEqual({
      google: { clientId: 'g-id', clientSecret: 'g-secret' },
    });
  });

  it('never leaks secrets into the summary sent to the browser', () => {
    expect(JSON.stringify(getEnabledProviders(env))).not.toContain('g-secret');
  });

  it('flags half-configured providers', () => {
    expect(incompleteProviders(env)).toEqual(['github']);
  });

  it('enables nothing for an empty environment', () => {
    expect(getEnabledProviders({})).toEqual([]);
    expect(buildSocialProviders({})).toEqual({});
  });

  it('trusts Apple’s origin only when Apple is enabled', () => {
    expect(buildTrustedOrigins('http://localhost:3000', ['google'])).toEqual([
      'http://localhost:3000',
    ]);
    expect(buildTrustedOrigins('http://localhost:3000', ['apple'])).toContain(
      'https://appleid.apple.com',
    );
  });

  it('builds the redirect URI', () => {
    expect(callbackUrlFor('https://app.test/', 'github')).toBe(
      'https://app.test/api/auth/callback/github',
    );
  });
});
