import { afterAll, beforeAll, expect, it } from 'vitest';

import { appMeta } from '@/db/schema';

import { createTestDb } from '../../tests/utils/test-db';
import type { TestDb } from '../../tests/utils/test-db';
import { seed } from './seed';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
}, 30_000);
afterAll(() => destroy());

it('is idempotent', async () => {
  await seed(db);
  await seed(db);
  expect(await db.select().from(appMeta)).toHaveLength(1);
});
