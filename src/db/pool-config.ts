import type { PoolConfig } from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const localDatabaseUrl = (port = 5433): string =>
  `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;

export const isLocalUrl = (url: string): boolean => {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

/**
 * - No URL        → embedded PGlite socket server (local development).
 * - Local URL     → same, but explicit.
 * - Remote URL    → Neon/any Postgres. TLS comes from `?sslmode=require` in the URL.
 */
export const buildPoolConfig = (url: string | undefined, port = 5433): PoolConfig => {
  const connectionString = url ?? localDatabaseUrl(port);

  if (isLocalUrl(connectionString)) {
    return {
      connectionString,
      idleTimeoutMillis: 500,
      max: 1,
      // PGlite's socket server serves ONE connection at a time (risk R-02):
      // keep a single, short-lived connection so Studio/scripts can connect too.
      ssl: false,
    };
  }

  return { connectionString, idleTimeoutMillis: 10_000, max: 5 };
};
