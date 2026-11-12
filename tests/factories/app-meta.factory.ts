import type { appMeta } from '@/db/schema';

import { defineFactory, faker } from './factory';

export const appMetaFactory = defineFactory<typeof appMeta.$inferInsert>((n) => ({
  key: `key-${n}`,
  value: faker.lorem.words(2),
}));
