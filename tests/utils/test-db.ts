import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '@/db/schema';

/** Fresh in-memory Postgres with all migrations applied. One per test file is plenty. */
export const createTestDb = async () => {
  // No path means the database is in memory.
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });

  return {
    db,
    destroy: () => client.close(),
  };
};

export type TestDb = Awaited<ReturnType<typeof createTestDb>>['db'];

class RollbackSignalError extends Error {
  override readonly name = 'RollbackSignalError';
}

type TestTransaction = Parameters<Parameters<TestDb['transaction']>[0]>[0];

/**
 * Runs `fn` inside a transaction that is ALWAYS rolled back → tests stay isolated
 * without recreating the database.
 */
export const withRollback = async <T>(
  db: TestDb,
  fn: (tx: TestTransaction) => Promise<T>,
): Promise<T> => {
  let outcome: { value: T } | undefined;
  const getOutcome = (): { value: T } | undefined => outcome;
  let rolledBack = false;

  try {
    await db.transaction(async (tx) => {
      outcome = { value: await fn(tx) };
      throw new RollbackSignalError();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignalError)) {
      throw error;
    }
    rolledBack = true;
  }

  if (!rolledBack) {
    throw new Error('Database transaction completed without being rolled back.');
  }

  const completedOutcome = getOutcome();
  if (!completedOutcome) {
    throw new Error('Database transaction did not return a result.');
  }

  return completedOutcome.value;
};
