import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pushSubscription, user } from '@/db/schema';
import { ConflictError, RateLimitError } from '@/libs/errors';

import { createTestDb } from '../../tests/utils/test-db';
import {
  assertTestPushAllowed,
  countSubscriptions,
  PushGoneError,
  removeAllSubscriptions,
  removeSubscription,
  saveSubscription,
  sendToUser,
  TEST_PUSH_INTERVAL_MS,
} from './push';
import type { PushTransport } from './push';

const subscription = (endpoint: string, auth = 'auth-secret') => ({
  endpoint,
  keys: { auth, p256dh: 'p256dh-key' },
});

describe('push service', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    testDb = await createTestDb();
    await testDb.db.insert(user).values([
      { email: 'a@example.com', id: 'user-a', name: 'A' },
      { email: 'b@example.com', id: 'user-b', name: 'B' },
    ]);
  }, 30_000);

  afterAll(async () => {
    await testDb.destroy();
  });

  it('saves a subscription once per endpoint', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/a1'));
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/a1'));

    expect(await countSubscriptions(db, 'user-a')).toBe(1);
    await removeAllSubscriptions(db, 'user-a');
  });

  it('lets a shared browser move to the next user when the secret matches', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/shared'));
    await saveSubscription(db, 'user-b', subscription('https://push.example.com/shared'));

    expect(await countSubscriptions(db, 'user-a')).toBe(0);
    expect(await countSubscriptions(db, 'user-b')).toBe(1);
    await removeAllSubscriptions(db, 'user-b');
  });

  it('refuses to take over an endpoint with a different secret', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/victim'));

    await expect(
      saveSubscription(db, 'user-b', subscription('https://push.example.com/victim', 'guessed')),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await countSubscriptions(db, 'user-a')).toBe(1);
    expect(await countSubscriptions(db, 'user-b')).toBe(0);
    await removeAllSubscriptions(db, 'user-a');
  });

  it("never removes another user's subscription", async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/mine'));

    expect(await removeSubscription(db, 'user-b', 'https://push.example.com/mine')).toBe(false);
    expect(await countSubscriptions(db, 'user-a')).toBe(1);
    expect(await removeSubscription(db, 'user-a', 'https://push.example.com/mine')).toBe(true);
    expect(await countSubscriptions(db, 'user-a')).toBe(0);
  });

  it('sends to every device and prunes the ones the push service reports gone', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/alive'));
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/gone'));
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/flaky'));

    const delivered: string[] = [];
    const transport: PushTransport = {
      send: (target, payload) => {
        if (target.endpoint.endsWith('/gone')) {
          return Promise.reject(new PushGoneError());
        }
        if (target.endpoint.endsWith('/flaky')) {
          return Promise.reject(new Error('push service unavailable'));
        }
        delivered.push(payload);
        return Promise.resolve();
      },
    };

    const result = await sendToUser(db, transport, 'user-a', {
      body: 'Hi',
      title: 'Hello',
      url: '/',
    });

    expect(result).toEqual({ failed: 1, removed: 1, sent: 1 });
    expect(JSON.parse(delivered[0] ?? '{}')).toEqual({ body: 'Hi', title: 'Hello', url: '/' });
    // alive + flaky remain, gone is deleted
    expect(await countSubscriptions(db, 'user-a')).toBe(2);
    await removeAllSubscriptions(db, 'user-a');
  });

  it('only sends to the requested user', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-b', subscription('https://push.example.com/b-only'));
    const endpoints: string[] = [];
    const transport: PushTransport = {
      send: (target) => {
        endpoints.push(target.endpoint);
        return Promise.resolve();
      },
    };

    await sendToUser(db, transport, 'user-a', { body: '', title: 'T', url: '/' });

    expect(endpoints).toEqual([]);
    await removeAllSubscriptions(db, 'user-b');
  });

  it('throttles test pushes per user', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/throttle'));
    const transport: PushTransport = { send: () => Promise.resolve() };
    const now = new Date('2026-11-17T12:00:00Z');

    await expect(assertTestPushAllowed(db, 'user-a', now)).resolves.toBeUndefined();
    await sendToUser(db, transport, 'user-a', { body: '', title: 'T', url: '/' }, now);

    await expect(
      assertTestPushAllowed(db, 'user-a', new Date(now.getTime() + 1000)),
    ).rejects.toBeInstanceOf(RateLimitError);
    await expect(
      assertTestPushAllowed(db, 'user-a', new Date(now.getTime() + TEST_PUSH_INTERVAL_MS)),
    ).resolves.toBeUndefined();
    await removeAllSubscriptions(db, 'user-a');
  });

  it('deletes subscriptions when the user is deleted (cascade)', async () => {
    const { db } = testDb;
    await db.insert(user).values({ email: 'c@example.com', id: 'user-c', name: 'C' });
    await saveSubscription(db, 'user-c', subscription('https://push.example.com/c'));

    await db.delete(user).where(eq(user.id, 'user-c'));

    const rows = await db.select().from(pushSubscription);
    expect(rows.some((row) => row.userId === 'user-c')).toBe(false);
  });
});
