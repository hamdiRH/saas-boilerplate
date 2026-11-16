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

import { AUTH_RATE_LIMIT_DEFAULT, AUTH_RATE_LIMIT_RULES } from './auth-rate-limit';

interface AuthEmailData {
  user: { email: string; name: string };
  url: string;
}

/** Factory so integration tests can run the real auth stack on an in-memory database. */
export function createAuth(database: DbLike) {
  return betterAuth({
    advanced: {
      // 🔍 older versions: advanced.generateId
      database: { generateId: () => randomUUID() },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
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
      sendResetPassword: ({ user, url }, request) => {
        runInBackground(() => sendResetPasswordEmail({ request, url, user }));
        return Promise.resolve();
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      // 1 hour (seconds)
      expiresIn: 60 * 60,
      // we re-send explicitly from the sign-in form (S2-T08) so the link carries the right callbackURL
      sendOnSignIn: false,
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }, request) => {
        runInBackground(() => sendVerificationEmail({ request, url, user }));
        return Promise.resolve();
      },
    },

    // Required so cookies set inside Server Actions reach the browser
    plugins: [nextCookies()],
    rateLimit: {
      ...AUTH_RATE_LIMIT_DEFAULT,
      customRules: { ...AUTH_RATE_LIMIT_RULES },
      enabled: Env.AUTH_RATE_LIMIT === 'on',
      storage: 'database',
    },
    secret: Env.BETTER_AUTH_SECRET,
    session: {
      cookieCache: { enabled: true, maxAge: 60 * 5 },
      // 7 days
      expiresIn: 60 * 60 * 24 * 7,
      // "fresh" for 10 minutes → sensitive actions need recent sign-in
      freshAge: 60 * 10,
      // refresh the expiry once a day,
      updateAge: 60 * 60 * 24,
    },

    trustedOrigins: [Env.NEXT_PUBLIC_APP_URL],
    user: {
      changeEmail: {
        enabled: true,
        // 🔍 Option name/flow differs across versions (sendChangeEmailConfirmation in older ones)
        sendChangeEmailVerification: (
          { user, newEmail, url }: AuthEmailData & { newEmail: string },
          request: Request | undefined,
        ) => {
          runInBackground(() => sendChangeEmailEmail({ newEmail, request, url, user }));
          return Promise.resolve();
        },
      },
      deleteUser: {
        enabled: true,
        // Deletion must be blocked or ownership transferred when the user is the sole owner
        // of an organization that still has other members.
      },
    },
  });
}

export const auth = createAuth(db);
export type Auth = typeof auth;
