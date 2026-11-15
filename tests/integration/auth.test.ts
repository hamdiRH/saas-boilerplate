import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { session, user } from '@/db/schema';
import { createAuth } from '@/libs/auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import {
  firstLink,
  signIn,
  signUpAndVerify,
  TEST_PASSWORD,
  tokenFromLink,
} from '../../src/utils/auth';
import { createTestDb } from '../utils/test-db';
import type { TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
const transport = new MemoryTransport();
let counter = 0;
const nextEmail = () => {
  counter += 1;
  return `user${Date.now()}-${counter}@example.com`;
};

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

describe('sign-up and email verification', () => {
  it('creates an UNVERIFIED user, sends a link and creates no session', async () => {
    const email = nextEmail();
    await auth.api.signUpEmail({ body: { email, name: 'Ada', password: TEST_PASSWORD } });
    await vi.waitFor(() => expect(transport.last(email)).toBeDefined());

    const [row] = await db.select().from(user).where(eq(user.email, email));
    if (!row) {
      throw new Error('Sign-up should have created the user');
    }
    expect(row.emailVerified).toBe(false);
    expect(await db.select().from(session).where(eq(session.userId, row.id))).toHaveLength(0);
    expect(firstLink(transport.last(email))).toContain('/api/auth/verify-email');
  });

  it('blocks sign-in until the email is verified, then allows it', async () => {
    const email = nextEmail();
    await auth.api.signUpEmail({ body: { email, name: 'Ada', password: TEST_PASSWORD } });
    await vi.waitFor(() => expect(transport.last(email)).toBeDefined());

    // 🔍 APIError shape (status/body.code) can differ slightly between versions
    await expect(
      auth.api.signInEmail({ body: { email, password: TEST_PASSWORD } }),
    ).rejects.toMatchObject({ body: { code: 'EMAIL_NOT_VERIFIED' } });

    await auth.api.verifyEmail({
      query: { token: tokenFromLink(firstLink(transport.last(email))) },
    });

    const { response } = await signIn(auth, email);
    expect(response.status).toBe(200);
  });

  it('rejects a wrong password with a generic error', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);

    await expect(
      auth.api.signInEmail({ body: { email, password: 'Wrong-Passw0rd-123' } }),
    ).rejects.toMatchObject({ body: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
  });
});

describe('password reset', () => {
  it('sends a single-use link, changes the password and revokes every session', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);
    // a session that the reset must kill
    await signIn(auth, email);

    // 🔍 Older versions: auth.api.forgetPassword
    await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } });
    await vi.waitFor(() => expect(transport.last(email)).toBeDefined());
    const token = tokenFromLink(firstLink(transport.last(email)));

    const newPassword = 'Brand-New-Passw0rd!';
    await auth.api.resetPassword({ body: { newPassword, token } });

    const [row] = await db.select().from(user).where(eq(user.email, email));
    if (!row) {
      throw new Error('Sign-up should have created the user');
    }
    expect(await db.select().from(session).where(eq(session.userId, row.id))).toHaveLength(0);

    // old password dead, new one works
    await expect(
      auth.api.signInEmail({ body: { email, password: TEST_PASSWORD } }),
    ).rejects.toThrow();
    const { response } = await signIn(auth, email, newPassword);
    expect(response.status).toBe(200);

    // the token cannot be reused
    await expect(
      auth.api.resetPassword({ body: { newPassword: 'Another-Passw0rd-1', token } }),
    ).rejects.toThrow();
  });

  it('answers identically for unknown emails and sends nothing', async () => {
    await auth.api.requestPasswordReset({
      body: { email: nextEmail(), redirectTo: '/reset-password' },
    });
    expect(transport.outbox).toHaveLength(0);
  });
});
