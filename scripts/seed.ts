import './_env';
import { hashPassword } from 'better-auth/crypto';

import { Env } from '../src/libs/env';

const main = async (): Promise<void> => {
  const { isSeedAllowed, seed } = await import('../src/db/seed');

  // 🔒 The demo user has a public password: never seed anything that is not a local database.
  if (
    !isSeedAllowed({
      databaseUrl: Env.DATABASE_URL,
      nodeEnv: Env.NODE_ENV,
      port: Env.DB_SERVER_PORT,
    })
  ) {
    console.error('❌ Refusing to seed: db:seed only runs against a LOCAL database.');
    process.exit(1);
  }

  const { db } = await import('../src/db/client');

  await seed(db, { hashPassword });
  process.exit(0);
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Seed failed:', message);
    process.exitCode = 1;
  }
};

void run();
