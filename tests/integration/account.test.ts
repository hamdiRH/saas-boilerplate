import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { session, user } from '@/db/schema';
import { createAuth } from '@/libs/auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import { signIn, signUpAndVerify } from '../../src/utils/auth';
import { createTestDb } from '../utils/test-db';
import type { TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
const transport = new MemoryTransport();
let counter = 0;
const nextEmail = () => {
  counter += 1;
  return `acct${Date.now()}-${counter}@example.com`;
};
const fresh = { query: { disableCookieCache: true } } as const;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
  auth = createAuth(db);
  setEmailTransport(transport);
}, 30_000);
afterAll(async () => {
  setEmailTransport(undefined);
  await destroy();
});
beforeEach(() => transport.clear());

describe('sessions', () => {
  it('revoking a session removes it and kills that device immediately', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);
    const laptop = await signIn(auth, email);
    const phone = await signIn(auth, email);

    const sessions = await auth.api.listSessions({ headers: laptop.headers });
    expect(sessions.length).toBeGreaterThanOrEqual(2);

    const phoneSession = await auth.api.getSession({ headers: phone.headers, ...fresh });
    if (!phoneSession) {
      throw new Error('Sign-in should have created a phone session');
    }
    await auth.api.revokeSession({
      body: { token: phoneSession.session.token },
      headers: laptop.headers,
    });

    expect(await auth.api.getSession({ headers: phone.headers, ...fresh })).toBeNull();
    expect(await auth.api.getSession({ headers: laptop.headers, ...fresh })).not.toBeNull();
  });

  it('an expired session is no session', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);
    const device = await signIn(auth, email);

    const current = await auth.api.getSession({ headers: device.headers, ...fresh });
    if (!current) {
      throw new Error('Sign-in should have created a session');
    }
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(session.id, current.session.id));

    expect(await auth.api.getSession({ headers: device.headers, ...fresh })).toBeNull();
  });

  it('never lists another user’s sessions', async () => {
    const a = nextEmail();
    const b = nextEmail();
    await signUpAndVerify(auth, transport, a);
    await signUpAndVerify(auth, transport, b);
    const deviceA = await signIn(auth, a);
    await signIn(auth, b);

    const listedForA = await auth.api.listSessions({ headers: deviceA.headers });
    const [rowA] = await db.select().from(user).where(eq(user.email, a));
    if (!rowA) {
      throw new Error('Sign-up should have created user A');
    }
    expect(listedForA.every((item) => item.userId === rowA.id)).toBe(true);
  });
});
