import './_env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { buildPoolConfig } from '../src/db/pool-config';

const main = async (): Promise<void> => {
  // Migrations need a DIRECT connection in production
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const pool = new Pool(buildPoolConfig(url, Number(process.env.DB_SERVER_PORT ?? 5433)));
  const db = drizzle(pool) as unknown as Parameters<typeof migrate>[0];
  try {
    console.log('⏳ Applying migrations…');
    await migrate(db, { migrationsFolder: 'drizzle' });
    console.log('✅ Migrations applied');
  } finally {
    await pool.end();
  }
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Migration failed:', message);
    process.exitCode = 1;
  }
};

void run();
