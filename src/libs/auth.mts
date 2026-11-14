import 'server-only';
import { randomUUID } from 'node:crypto';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import type { DbLike } from '@/db/types';
import {
  sendChangeEmailEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from '@/libs/auth-emails';
import { Env } from '@/libs/env';
import { runInBackground } from '@/utils/background';

interface AuthEmailUser {
  email: string;
  name: string;
}

interface AuthEmailData {
  user: AuthEmailUser;
  url: string;
}

/** Factory so integration tests can run the real auth stack on an in-memory database. */
export function createAuth(database: DbLike) {
  return betterAuth({
    advanced: {
      // Older versions used advanced.generateId.
      database: { generateId: () => randomUUID() },
      useSecureCookies: Env.NODE_ENV === 'production',
    },
    appName: Env.NEXT_PUBLIC_APP_NAME,
    baseURL: Env.NEXT_PUBLIC_APP_URL,
    database: drizzleAdapter(database, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
      requireEmailVerification: true,
      // 1 hour (seconds)
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }: AuthEmailData, request: Request | undefined) => {
        runInBackground(() => sendResetPasswordEmail({ request, url, user }));
        return Promise.resolve();
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      // 1 hour (seconds)
      expiresIn: 60 * 60,
      // Re-sent from the sign-in form so the link carries the right callbackURL.
      sendOnSignIn: false,
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }: AuthEmailData, request: Request | undefined) => {
        runInBackground(() => sendVerificationEmail({ request, url, user }));
        return Promise.resolve();
      },
    },
    plugins: [nextCookies()],
    secret: Env.BETTER_AUTH_SECRET,
    session: {
      cookieCache: { enabled: true, maxAge: 60 * 5 },
      // 7 days
      expiresIn: 60 * 60 * 24 * 7,
      // "Fresh" for 10 minutes; sensitive actions need recent sign-in.
      freshAge: 60 * 10,
      // Refresh the expiry once a day.
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: [Env.NEXT_PUBLIC_APP_URL],
    user: {
      changeEmail: {
        enabled: true,
        // Option name and flow differ across Better Auth versions.
        sendChangeEmailVerification: (
          { user, newEmail, url }: AuthEmailData & { newEmail: string },
          request: Request | undefined,
        ) => {
          runInBackground(() => sendChangeEmailEmail({ newEmail, request, url, user }));
          return Promise.resolve();
        },
      },
      deleteUser: { enabled: true },
    },
    // Required so cookies set inside Server Actions reach the browser.
  });
}

export const auth = createAuth(db);
export type Auth = typeof auth;
