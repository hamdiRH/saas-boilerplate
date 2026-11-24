import { describe, expect, it } from 'vitest';

import { resolveListenHostname } from '../scripts/listen-hostname.mjs';

describe('resolveListenHostname', () => {
  it('defaults to all interfaces', () => {
    expect(resolveListenHostname(undefined)).toBe('0.0.0.0');
    expect(resolveListenHostname('')).toBe('0.0.0.0');
  });

  it('keeps explicit listen addresses', () => {
    expect(resolveListenHostname('0.0.0.0')).toBe('0.0.0.0');
    expect(resolveListenHostname('127.0.0.1')).toBe('127.0.0.1');
    expect(resolveListenHostname('localhost')).toBe('localhost');
    expect(resolveListenHostname('::1')).toBe('::1');
  });

  it('ignores Windows Git Bash computer names', () => {
    expect(resolveListenHostname('DESKTOP-ABC123')).toBe('0.0.0.0');
    expect(resolveListenHostname('My-PC')).toBe('0.0.0.0');
  });
});
