import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appMeta } from '@/db/schema';

import type { TestDb } from './test-db';
import { createTestDb, withRollback } from './test-db';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  const started = performance.now();
  ({ db, destroy } = await createTestDb());
  console.info(`createTestDb took ${Math.round(performance.now() - started)} ms`);
}, 30_000);

afterAll(async () => {
  await destroy();
});

describe('test database', () => {
  it('applies migrations to an empty database', async () => {
    const rows = await db.select().from(appMeta);
    expect(rows).toEqual([]);
  });

  it('rolls back everything written inside withRollback', async () => {
    await withRollback(db, async (tx) => {
      await tx.insert(appMeta).values({ key: 'k', value: 'v' });
      const inside = await tx.select().from(appMeta).where(eq(appMeta.key, 'k'));
      expect(inside).toHaveLength(1);
    });

    const after = await db.select().from(appMeta);
    expect(after).toHaveLength(0);
  });
});
