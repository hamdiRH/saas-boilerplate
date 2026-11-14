import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { account, user } from './schema';
import type { DbLike } from './types';

export const DEMO_USER = {
  email: 'demo@example.com',
  name: 'Demo User',
  // local development ONLY — seed refuses to run in production
  password: 'Demo-Password-123',
} as const;

interface SeedOptions {
  hashPassword: (password: string) => Promise<string>;
}

/** Idempotent: safe to run any number of times. */
export async function seed(db: DbLike, { hashPassword }: SeedOptions) {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEMO_USER.email));
  if (existing.length > 0) {
    return;
  }

  const userId = randomUUID();
  await db.insert(user).values({
    email: DEMO_USER.email,
    emailVerified: true,
    id: userId,
    name: DEMO_USER.name,
  });
  await db.insert(account).values({
    accountId: userId,
    id: randomUUID(),
    password: await hashPassword(DEMO_USER.password),
    providerId: 'credential',
    userId,
  });
}
