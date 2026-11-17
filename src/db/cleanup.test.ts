import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDb } from '../../tests/utils/test-db';
import { cleanupExpired } from './cleanup';
import { rateLimit, session, user, verification } from './schema';

const NOW = new Date('2026-11-17T12:00:00Z');
const HOUR = 60 * 60 * 1000;

describe('cleanupExpired', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  it('removes only expired sessions, verifications and stale rate limits', async () => {
    const { db } = testDb;
    await db.insert(user).values({ email: 'a@example.com', id: 'u1', name: 'A' });
    await db.insert(session).values([
      { expiresAt: new Date(NOW.getTime() - HOUR), id: 's-old', token: 't1', userId: 'u1' },
      { expiresAt: new Date(NOW.getTime() + HOUR), id: 's-live', token: 't2', userId: 'u1' },
    ]);
    await db.insert(verification).values([
      { expiresAt: new Date(NOW.getTime() - HOUR), id: 'v-old', identifier: 'x', value: '1' },
      { expiresAt: new Date(NOW.getTime() + HOUR), id: 'v-live', identifier: 'y', value: '2' },
    ]);
    await db.insert(rateLimit).values([
      { count: 1, id: 'r-old', key: 'k-old', lastRequest: NOW.getTime() - 48 * HOUR },
      { count: 1, id: 'r-live', key: 'k-live', lastRequest: NOW.getTime() - 1000 },
    ]);

    const result = await cleanupExpired(db, NOW);

    expect(result).toEqual({ rateLimits: 1, sessions: 1, verifications: 1 });
    const sessionRows = await db.select().from(session);
    const sessionIds = sessionRows.map((row) => row.id);
    const verificationRows = await db.select().from(verification);
    const verificationIds = verificationRows.map((row) => row.id);
    const rateLimitRows = await db.select().from(rateLimit);
    const rateLimitIds = rateLimitRows.map((row) => row.id);
    expect(sessionIds).toEqual(['s-live']);
    expect(verificationIds).toEqual(['v-live']);
    expect(rateLimitIds).toEqual(['r-live']);
  });

  it('is a no-op when nothing has expired', async () => {
    const result = await cleanupExpired(testDb.db, NOW);
    expect(result).toEqual({ rateLimits: 0, sessions: 0, verifications: 0 });
  });
});
