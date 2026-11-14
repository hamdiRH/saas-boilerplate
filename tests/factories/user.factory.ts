import { randomUUID } from 'node:crypto';

import type { user } from '@/db/schema';

import { defineFactory, faker } from './factory';

export const userFactory = defineFactory<typeof user.$inferInsert>((n) => ({
  email: `user${n}-${faker.string.alphanumeric(6).toLowerCase()}@example.com`,
  emailVerified: true,
  id: randomUUID(),
  name: faker.person.fullName(),
}));
