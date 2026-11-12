import './_env';
import { Env } from '../src/libs/env';

const main = async (): Promise<void> => {
  // 🔒 Dev-only guard
  if (Env.NODE_ENV === 'production') {
    console.error('❌ Refusing to seed in production.');
    process.exit(1);
  }

  const { db } = await import('../src/db/client');
  const { seed } = await import('../src/db/seed');

  try {
    await seed(db);
  } finally {
    console.log('🌱 Seed complete');
    process.exit(0);
  }
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
