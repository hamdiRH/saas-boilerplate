import './_env';
import { execSync } from 'node:child_process';

import { Pool } from 'pg';

import { buildPoolConfig, isLocalUrl, localDatabaseUrl } from '../src/db/pool-config';

const main = async (): Promise<void> => {
  const port = Number(process.env.DB_SERVER_PORT ?? 5433);
  const url = process.env.DATABASE_URL ?? localDatabaseUrl(port);

  // 🔒 Never wipe anything that is not a local development database
  if (process.env.NODE_ENV === 'production' || !isLocalUrl(url)) {
    console.error('❌ Refusing to reset: db:reset only runs against a LOCAL database.');
    process.exit(1);
  }

  const pool = new Pool(buildPoolConfig(url, port));
  console.log('🧹 Dropping schemas…');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.end();

  execSync('pnpm db:migrate', { stdio: 'inherit' });
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Reset failed:', message);
    process.exitCode = 1;
  }
};

void run();
