import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { Env } from '@/libs/env';
import { getLogger } from '@/libs/logger';

import { buildPoolConfig } from './pool-config';
import * as schema from './schema';

// Keep ONE pool per process: hot reload (dev) and separate server bundles (prod) can both
// evaluate this module more than once, and every extra pool eats Postgres connections.
// For Neon/managed Postgres use sslmode=verify-full in DATABASE_URL.
const globalForDb = globalThis as unknown as { __dbPool?: Pool };

function createPool() {
  const created = new Pool(buildPoolConfig(Env.DATABASE_URL, Env.DB_SERVER_PORT));
  created.on('error', (error) => {
    getLogger('db').error('Unexpected database pool error', { error });
  });
  return created;
}

const pool = globalForDb.__dbPool ?? createPool();
globalForDb.__dbPool = pool;

export const db = drizzle(pool, { schema });
export type Database = typeof db;
