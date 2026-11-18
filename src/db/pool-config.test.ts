import { describe, expect, it } from 'vitest';

import { buildPoolConfig, isLocalUrl, localDatabaseUrl } from './pool-config';

describe('buildPoolConfig', () => {
  it('falls back to the local PGlite server when no URL is given', () => {
    const config = buildPoolConfig(undefined, 5555);
    expect(config.connectionString).toBe(localDatabaseUrl(5555));
    expect(config.max).toBe(1);
    expect(config.ssl).toBe(false);
  });

  it('uses a single short-lived connection for local URLs', () => {
    const config = buildPoolConfig('postgres://u:p@localhost:5432/db');
    expect(config.max).toBe(1);
    expect(config.idleTimeoutMillis).toBeLessThan(1000);
  });

  it.each(['prefer', 'require', 'verify-ca'])(
    'normalizes legacy sslmode=%s to verify-full for remote hosts',
    (sslmode) => {
      const url = `postgres://u:p%40ss@ep-cool-123-pooler.eu-central-1.aws.neon.tech/db?sslmode=${sslmode}&application_name=saas`;
      const config = buildPoolConfig(url);
      expect(config.connectionString).toBe(
        'postgres://u:p%40ss@ep-cool-123-pooler.eu-central-1.aws.neon.tech/db?sslmode=verify-full&application_name=saas',
      );
      expect(config.max).toBeGreaterThan(1);
      expect(config.ssl).toBeUndefined();
    },
  );

  it('preserves explicit libpq compatibility mode', () => {
    const url =
      'postgres://u:p@ep-cool-123-pooler.eu-central-1.aws.neon.tech/db?uselibpqcompat=true&sslmode=require';
    const config = buildPoolConfig(url);
    expect(config.connectionString).toBe(url);
  });
});

describe('isLocalUrl', () => {
  it('detects local hosts and tolerates garbage', () => {
    expect(isLocalUrl('postgres://x@127.0.0.1:5433/db')).toBe(true);
    expect(isLocalUrl('postgres://x@db.example.com/db')).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });
});
