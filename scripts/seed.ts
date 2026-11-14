import './_env';
import { hashPassword } from 'better-auth/crypto';

import { Env } from '../src/libs/env';

const main = async (): Promise<void> => {
  if (Env.NODE_ENV === 'production') {
    console.error('❌ Refusing to seed in production.');
    process.exit(1);
  }

  const { db } = await import('../src/db/client');
  const { seed, DEMO_USER } = await import('../src/db/seed');

  await seed(db, { hashPassword });
  console.log(`🌱 Seed complete — sign in with ${DEMO_USER.email} / ${DEMO_USER.password}`);

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
