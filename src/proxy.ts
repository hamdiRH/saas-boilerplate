import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

// Later sprints compose more here: request id, optimistic auth redirect, Arcjet.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and files with an extension
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};
