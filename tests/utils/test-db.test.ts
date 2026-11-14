import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { user } from '@/db/schema';

import { userFactory } from '../factories/user.factory';
import type { TestDb } from './test-db';
import { createTestDb, withRollback } from './test-db';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
}, 30_000);

afterAll(async () => {
  await destroy();
});

describe('test database', () => {
  it('applies migrations to an empty database', async () => {
    expect(await db.select().from(user)).toEqual([]);
  });

  it('rolls back everything written inside withRollback', async () => {
    const row = userFactory.build();

    await withRollback(db, async (tx) => {
      await tx.insert(user).values(row);
      expect(await tx.select().from(user).where(eq(user.id, row.id))).toHaveLength(1);
    });

    expect(await db.select().from(user)).toHaveLength(0);
  });
});
