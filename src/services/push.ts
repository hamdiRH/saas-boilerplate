import { randomUUID } from 'node:crypto';

import { and, desc, eq, sql } from 'drizzle-orm';

import { pushSubscription } from '@/db/schema';
import type { DbLike } from '@/db/types';
import { ConflictError, RateLimitError } from '@/libs/errors';
import { serializePushPayload } from '@/libs/pwa/push-payload';
import type { PushPayload } from '@/libs/pwa/push-payload';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { auth: string; p256dh: string };
  expirationTime?: number | null;
  userAgent?: string | null;
}

/** Thrown by a transport when the push service says the subscription no longer exists (404/410). */
export class PushGoneError extends Error {
  override readonly name = 'PushGoneError';
}

/** Sends one already-serialized payload. Injected so tests never touch the network. */
export interface PushTransport {
  send: (
    subscription: { endpoint: string; keys: { auth: string; p256dh: string } },
    payload: string,
  ) => Promise<void>;
}

/** Minimum gap between test pushes for one user. */
export const TEST_PUSH_INTERVAL_MS = 10_000;

/**
 * Saves (or refreshes) a device subscription for `userId`.
 *
 * The same endpoint can only move to another user when the caller proves it holds the same
 * auth secret. That covers a shared browser where someone else signs in, and stops anybody who
 * merely learned an endpoint URL from taking over another user's subscription.
 */
export async function saveSubscription(
  db: DbLike,
  userId: string,
  input: PushSubscriptionInput,
): Promise<void> {
  const values = {
    auth: input.keys.auth,
    endpoint: input.endpoint,
    expiresAt:
      input.expirationTime === null || input.expirationTime === undefined
        ? null
        : new Date(input.expirationTime),
    id: randomUUID(),
    p256dh: input.keys.p256dh,
    userAgent: input.userAgent?.slice(0, 255) ?? null,
    userId,
  };

  const written = await db
    .insert(pushSubscription)
    .values(values)
    .onConflictDoUpdate({
      set: {
        auth: values.auth,
        expiresAt: values.expiresAt,
        p256dh: values.p256dh,
        userAgent: values.userAgent,
        userId,
      },
      setWhere: eq(pushSubscription.auth, values.auth),
      target: pushSubscription.endpoint,
    })
    .returning({ id: pushSubscription.id });

  if (written.length === 0) {
    // The endpoint exists with a different secret: do not reveal whose it is.
    throw new ConflictError();
  }
}

/** Removes ONE of the user's own subscriptions. Other users' rows are never touched. */
export async function removeSubscription(
  db: DbLike,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const removed = await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)))
    .returning({ id: pushSubscription.id });
  return removed.length > 0;
}

export async function removeAllSubscriptions(db: DbLike, userId: string): Promise<number> {
  const removed = await db
    .delete(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .returning({ id: pushSubscription.id });
  return removed.length;
}

export async function countSubscriptions(db: DbLike, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId));
  return row?.total ?? 0;
}

/** Sends to every device of one user. Dead subscriptions (404/410) are deleted on the way. */
export async function sendToUser(
  db: DbLike,
  transport: PushTransport,
  userId: string,
  payload: PushPayload,
  now: Date = new Date(),
): Promise<{ failed: number; removed: number; sent: number }> {
  const body = serializePushPayload(payload);
  const rows = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));

  const outcomes = await Promise.all(
    rows.map(async (row) => {
      try {
        await transport.send(
          { endpoint: row.endpoint, keys: { auth: row.auth, p256dh: row.p256dh } },
          body,
        );
        await db
          .update(pushSubscription)
          .set({ lastUsedAt: now })
          .where(eq(pushSubscription.id, row.id));
        return 'sent' as const;
      } catch (error) {
        if (error instanceof PushGoneError) {
          await db.delete(pushSubscription).where(eq(pushSubscription.id, row.id));
          return 'removed' as const;
        }
        return 'failed' as const;
      }
    }),
  );

  return {
    failed: outcomes.filter((outcome) => outcome === 'failed').length,
    removed: outcomes.filter((outcome) => outcome === 'removed').length,
    sent: outcomes.filter((outcome) => outcome === 'sent').length,
  };
}

/** Database-backed throttle (works on serverless, unlike an in-memory counter). */
export async function assertTestPushAllowed(
  db: DbLike,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const [latest] = await db
    .select({ lastUsedAt: pushSubscription.lastUsedAt })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .orderBy(desc(pushSubscription.lastUsedAt))
    .limit(1);

  if (latest?.lastUsedAt && now.getTime() - latest.lastUsedAt.getTime() < TEST_PUSH_INTERVAL_MS) {
    throw new RateLimitError();
  }
}
