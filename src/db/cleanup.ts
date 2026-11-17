import { lt } from 'drizzle-orm';

import { rateLimit, session, verification } from './schema';
import type { DbLike } from './types';

/** Longest rate-limit window is 60 s; keep a day of history so nothing live is ever removed. */
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface CleanupResult {
  rateLimits: number;
  sessions: number;
  verifications: number;
}

/**
 * Deletes rows that can never be used again: expired sessions, expired verification tokens and
 * stale rate-limit counters. Better Auth does not purge these itself, so run it periodically
 * (`pnpm db:cleanup`, a cron, or a scheduled pipeline).
 */
export async function cleanupExpired(db: DbLike, now: Date = new Date()): Promise<CleanupResult> {
  const staleBefore = now.getTime() - RATE_LIMIT_RETENTION_MS;

  const sessions = await db
    .delete(session)
    .where(lt(session.expiresAt, now))
    .returning({ id: session.id });
  const verifications = await db
    .delete(verification)
    .where(lt(verification.expiresAt, now))
    .returning({ id: verification.id });
  const rateLimits = await db
    .delete(rateLimit)
    .where(lt(rateLimit.lastRequest, staleBefore))
    .returning({ id: rateLimit.id });

  return {
    rateLimits: rateLimits.length,
    sessions: sessions.length,
    verifications: verifications.length,
  };
}
