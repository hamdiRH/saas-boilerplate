import './_env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { cleanupExpired } from '../src/db/cleanup';
import { buildPoolConfig } from '../src/db/pool-config';
import * as schema from '../src/db/schema';

const main = async (): Promise<void> => {
  const pool = new Pool(
    buildPoolConfig(process.env.DATABASE_URL, Number(process.env.DB_SERVER_PORT ?? 5433)),
  );
  try {
    const result = await cleanupExpired(drizzle(pool, { schema }));
    console.log(
      `🧹 Removed ${result.sessions} sessions, ${result.verifications} verifications, ${result.rateLimits} rate-limit rows`,
    );
  } finally {
    await pool.end();
  }
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    console.error('❌ Cleanup failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

void run();
