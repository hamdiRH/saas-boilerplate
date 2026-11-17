import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { account, user } from '@/db/schema';

import type { TestDb } from '../../tests/utils/test-db';
import { createTestDb } from '../../tests/utils/test-db';
import { isSeedAllowed, seed } from './seed';

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

describe('isSeedAllowed', () => {
  it('allows the embedded and explicit local databases', () => {
    expect(isSeedAllowed({ databaseUrl: undefined, nodeEnv: undefined })).toBe(true);
    expect(
      isSeedAllowed({ databaseUrl: 'postgres://u:p@127.0.0.1:5433/db', nodeEnv: 'development' }),
    ).toBe(true);
  });

  it('refuses remote databases even when NODE_ENV is not production', () => {
    expect(
      isSeedAllowed({
        databaseUrl: 'postgres://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db',
        nodeEnv: undefined,
      }),
    ).toBe(false);
  });

  it('refuses everything in production', () => {
    expect(isSeedAllowed({ databaseUrl: undefined, nodeEnv: 'production' })).toBe(false);
  });
});
