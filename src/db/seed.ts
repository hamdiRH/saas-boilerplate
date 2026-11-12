import { appMeta } from './schema';
import type { DbLike } from './types';

/** Idempotent: safe to run any number of times. Extended in later sprints. */
const seed = async (db: DbLike) => {
  await db
    .insert(appMeta)
    .values({ key: 'seeded_at', value: new Date().toISOString() })
    .onConflictDoNothing();
};

export { seed };
