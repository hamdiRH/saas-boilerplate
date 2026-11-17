import { describe, expect, it } from 'vitest';

import { getSecurityHeaders } from './security-headers';

const names = (isProduction: boolean) =>
  getSecurityHeaders({ isProduction }).map((header) => header.key);

describe('getSecurityHeaders', () => {
  it('always sends the baseline headers', () => {
    expect(names(false)).toEqual([
      'X-Content-Type-Options',
      'Referrer-Policy',
      'X-Frame-Options',
      'Permissions-Policy',
    ]);
  });

  it('adds HSTS only in production', () => {
    expect(names(false)).not.toContain('Strict-Transport-Security');
    expect(names(true)).toContain('Strict-Transport-Security');
  });
});
