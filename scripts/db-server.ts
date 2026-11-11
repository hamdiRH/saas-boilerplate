import './_env';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { Env } from '../src/libs/env';

const port = Env.DB_SERVER_PORT;
const dataDir = './local.db';

const main = async (): Promise<void> => {
  // Persisted on disk, so local data survives restarts.
  const client = await PGlite.create(dataDir);

  // Apply pending migrations on every start so a fresh clone "just works"
  await migrate(drizzle(client), { migrationsFolder: 'drizzle' });

  const server = new PGLiteSocketServer({ db: client, host: '127.0.0.1', port });

  try {
    await server.start();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EADDRINUSE'
    ) {
      console.error(
        `❌ Port ${port} is already in use. Another db server (or a local Postgres) is running.\n` +
          `   Change DB_SERVER_PORT in .env.local, or stop the other process.`,
      );
      process.exit(1);
    }
    throw error;
  }

  console.log(`🐘 PGlite listening on postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
  console.log(`   data: ${dataDir}`);

  const shutdown = async () => {
    console.log('\n🛑 Shutting down database…');
    await server.stop();
    await client.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Windows Ctrl+Break
  process.on('SIGBREAK', shutdown);
};

const run = async (): Promise<void> => {
  try {
    await main();
  } catch (error) {
    console.error('❌ Failed to start the database server:', error);
    process.exit(1);
  }
};

void run();
