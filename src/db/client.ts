import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { Env } from '@/libs/env';
import { getLogger } from '@/libs/logger';

import { buildPoolConfig } from './pool-config';
import * as schema from './schema';

// Next.js hot-reload re-evaluates modules; keep ONE pool on globalThis in dev.
const globalForDb = globalThis as unknown as { __dbPool?: Pool };

function createPool() {
  const created = new Pool(buildPoolConfig(Env.DATABASE_URL, Env.DB_SERVER_PORT));
  created.on('error', (error) => {
    getLogger('db').error('Unexpected database pool error', { error });
  });
  return created;
}

const pool = globalForDb.__dbPool ?? createPool();

if (Env.NODE_ENV !== 'production') {
  globalForDb.__dbPool = pool;
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;
