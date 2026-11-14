import { getSessionCookie } from 'better-auth/cookies';
import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { routing } from './i18n/routing';
import { buildSignInRedirect, isProtectedPath, splitLocale } from './libs/route-guard';

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { path } = splitLocale(pathname);

  // ⚠️ OPTIMISTIC: only checks that a session cookie EXISTS (ADR-003).
  // The real validation happens in src/data/session.ts on every page and action.
  if (isProtectedPath(path) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL(buildSignInRedirect(pathname, search), request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};
