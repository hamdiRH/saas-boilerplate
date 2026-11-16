import 'server-only';
import { getLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { cache } from 'react';

import { redirect } from '@/i18n/navigation';
import { auth } from '@/libs/auth';
import { AuthenticationError } from '@/libs/errors';

/** Validated against the database. `cache()` dedupes calls within one request. */
export const getSession = cache(async () =>
  // 🔍 disableCookieCache: always validate against the database (revocation takes effect immediately)
  auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } }),
);

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** For pages/layouts: redirects to sign-in when there is no valid, verified session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session?.user.emailVerified) {
    return redirect({ href: '/sign-in', locale: await getLocale() });
  }
  return session;
}

/** For auth pages: signed-in users have no business there. */
export async function requireGuest(): Promise<void> {
  if (await getSession()) {
    redirect({ href: '/dashboard', locale: await getLocale() });
  }
}

/** For Server Actions / data functions: throw instead of redirecting. */
export async function getSessionOrThrow(): Promise<Session> {
  const session = await getSession();
  if (!session?.user.emailVerified) {
    throw new AuthenticationError();
  }
  return session;
}
