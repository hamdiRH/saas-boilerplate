import { afterAll, beforeAll, expect, it } from 'vitest';

import { account, user } from '@/db/schema';

import type { TestDb } from '../../tests/utils/test-db';
import { createTestDb } from '../../tests/utils/test-db';
import { seed } from './seed';

let db: TestDb;
let destroy: () => Promise<void>;

const hashPassword = (password: string): Promise<string> =>
  Promise.resolve(`hashed:${password.length}`);

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
}, 30_000);
afterAll(() => destroy());

it('is idempotent and stores a hashed password, never the plain one', async () => {
  await seed(db, { hashPassword });
  await seed(db, { hashPassword });

  expect(await db.select().from(user)).toHaveLength(1);
  const [row] = await db.select().from(account);
  expect(row?.password).toMatch(/^hashed:/u);
});
