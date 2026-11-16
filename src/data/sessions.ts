import 'server-only';
import { and, eq, gt } from 'drizzle-orm';

import { db } from '@/db/client';
import { session } from '@/db/schema';
import { describeUserAgent } from '@/utils/user-agent';

import { requireSession } from './session';

export interface SessionSummary {
  id: string;
  device: string;
  ip: string | null;
  updatedAt: string;
  current: boolean;
}

/** The signed-in user's active sessions, WITHOUT their secret tokens. */
export async function listUserSessions(): Promise<SessionSummary[]> {
  const { session: currentSession, user } = await requireSession();
  const activeSessions = await db
    .select({
      id: session.id,
      ipAddress: session.ipAddress,
      updatedAt: session.updatedAt,
      userAgent: session.userAgent,
    })
    .from(session)
    .where(and(eq(session.userId, user.id), gt(session.expiresAt, new Date())));

  return activeSessions
    .map((item) => ({
      current: item.id === currentSession.id,
      device: describeUserAgent(item.userAgent),
      id: item.id,
      ip: item.ipAddress,
      updatedAt: new Date(item.updatedAt).toISOString(),
    }))
    .toSorted((a, b) => Number(b.current) - Number(a.current));
}
