import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { user, verification } from '@/db/schema';
import { createAuth } from '@/libs/auth';
import { decideMagicLink } from '@/libs/auth-magic-link';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';
import { firstLink, tokenFromLink } from '@/utils/auth';

import { createTestDb } from '../utils/test-db';
import type { TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
const transport = new MemoryTransport();
let counter = 0;
const nextEmail = () => {
  counter += 1;
  return `magic${Date.now()}-${counter}@example.com`;
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

async function requestLink(email: string) {
  // 🔍 method name: auth.api.signInMagicLink in current versions
  await auth.api.signInMagicLink({
    body: { email, callbackURL: '/dashboard' },
    headers: new Headers(),
  });
  await vi.waitFor(() => expect(transport.last(email)).toBeDefined());
  return tokenFromLink(firstLink(transport.last(email)));
}

describe('decideMagicLink', () => {
  it('skips unknown users only when sign-up via magic link is disabled', async () => {
    expect(await decideMagicLink(db, { email: 'new@example.com', allowSignUp: false })).toBe(
      'skip-unknown-user',
    );
    expect(await decideMagicLink(db, { email: 'new@example.com', allowSignUp: true })).toBe('send');
  });
});

describe('magic link lifecycle', () => {
  it('creates a verified user and a session, once', async () => {
    const email = nextEmail();
    const token = await requestLink(email);

    // 🔍 method name: auth.api.magicLinkVerify
    const response = await auth.api.magicLinkVerify({
      query: { token, callbackURL: '/dashboard' },
      headers: new Headers(),
      asResponse: true,
    });
    expect(response.status).toBeLessThan(400);

    const [created] = await db.select().from(user).where(eq(user.email, email));
    expect(created?.emailVerified).toBe(true);

    // replay: the token is gone
    const replay = await auth.api
      .magicLinkVerify({
        query: { token, callbackURL: '/dashboard' },
        headers: new Headers(),
        asResponse: true,
      })
      .catch((error: unknown) => error);
    const failed =
      replay instanceof Response
        ? replay.status >= 300 && !replay.headers.getSetCookie().length
        : true;
    expect(failed).toBe(true);
  });

  it('rejects an expired link', async () => {
    const email = nextEmail();
    const token = await requestLink(email);

    // 🔍 the token is stored as the verification identifier
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.identifier, `magic-link:${token}`));

    const attempt = await auth.api
      .magicLinkVerify({
        query: { token, callbackURL: '/dashboard' },
        headers: new Headers(),
        asResponse: true,
      })
      .catch((error: unknown) => error);
    if (!(attempt instanceof Response)) {
      throw new TypeError('Expired magic link should return an error redirect');
    }
    expect(attempt.status).toBe(302);
    expect(
      new URL(attempt.headers.get('location') ?? '/', 'http://localhost').searchParams.get('error'),
    ).toBe('INVALID_TOKEN');
    expect(await db.select().from(user).where(eq(user.email, email))).toHaveLength(0);
  });
});
