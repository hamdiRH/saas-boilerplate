import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError, ReauthRequiredError } from '@/libs/errors';

import { getSessionOrThrow, requireGuest, requireSession, requireFreshSession } from './session';
import { withAuth } from './with-auth';

const getSessionMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((target: unknown) => {
    throw new Error(`REDIRECT:${JSON.stringify(target)}`);
  }),
);

vi.mock('@/libs/auth', () => ({ auth: { api: { getSession: getSessionMock } } }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next-intl/server', () => ({ getLocale: () => Promise.resolve('fr') }));
vi.mock('@/i18n/navigation', () => ({ redirect: redirectMock }));

const verified = {
  session: { id: 's1' },
  user: { email: 'ada@example.com', emailVerified: true, id: 'u1', name: 'Ada' },
};

beforeEach(() => {
  getSessionMock.mockReset();
  redirectMock.mockClear();
});

describe('requireSession (no proxy involved)', () => {
  it('redirects to sign-in, in the visitor’s locale, when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow('REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith({ href: '/sign-in', locale: 'fr' });
  });

  it('treats an expired/invalid session (null from Better Auth) like no session', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow('REDIRECT');
  });

  it('rejects sessions of unverified users', async () => {
    getSessionMock.mockResolvedValue({
      ...verified,
      user: { ...verified.user, emailVerified: false },
    });
    await expect(requireSession()).rejects.toThrow('REDIRECT');
  });

  it('returns the session when valid', async () => {
    getSessionMock.mockResolvedValue(verified);
    await expect(requireSession()).resolves.toMatchObject({ user: { id: 'u1' } });
  });
});

describe('requireGuest', () => {
  it('redirects signed-in users to the dashboard', async () => {
    getSessionMock.mockResolvedValue(verified);
    await expect(requireGuest()).rejects.toThrow('REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith({ href: '/dashboard', locale: 'fr' });
  });

  it('lets guests through', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireGuest()).resolves.toBeUndefined();
  });
});

describe('getSessionOrThrow / withAuth', () => {
  it('throws AuthenticationError without a session', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(getSessionOrThrow()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('withAuth never runs the handler for anonymous callers', async () => {
    getSessionMock.mockResolvedValue(null);
    const handler = vi.fn();
    await expect(withAuth(handler)({ a: 1 })).rejects.toBeInstanceOf(AuthenticationError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('withAuth passes the session to the handler', async () => {
    getSessionMock.mockResolvedValue(verified);
    const handler = vi.fn((input: { a: number }, ctx: { session: unknown }) =>
      Promise.resolve({ ctx, input }),
    );
    const result = await withAuth(handler)({ a: 1 });
    expect(result.input).toEqual({ a: 1 });
    expect(result.ctx.session).toBe(verified);
  });
});

describe('requireFreshSession', () => {
  it('accepts a recent session', async () => {
    getSessionMock.mockResolvedValue({ ...verified, session: { id: 's1', createdAt: new Date() } });
    await expect(requireFreshSession()).resolves.toBeDefined();
  });

  it('asks for re-authentication when the session is old', async () => {
    getSessionMock.mockResolvedValue({
      ...verified,
      session: { id: 's1', createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await expect(requireFreshSession()).rejects.toBeInstanceOf(ReauthRequiredError);
  });
});
