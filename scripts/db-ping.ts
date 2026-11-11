import './_env';
import { Pool } from 'pg';

import { buildPoolConfig } from '../src/db/pool-config';
import { Env } from '../src/libs/env';

const main = async (): Promise<void> => {
  const pool = new Pool(buildPoolConfig(Env.DATABASE_URL, Env.DB_SERVER_PORT));

  try {
    const { rows } = await pool.query<{ now: Date }>('select now() as now');
    console.log('✅ Database reachable. Server time:', rows[0]?.now);
  } finally {
    await pool.end();
  }
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Cannot reach the database:', message);
    process.exitCode = 1;
  }
};

void run();
