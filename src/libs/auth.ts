import 'server-only';
import { randomUUID } from 'node:crypto';

import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { magicLink } from 'better-auth/plugins';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import type { DbLike } from '@/db/types';
import {
  sendChangeEmailEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendMagicLinkEmail,
} from '@/libs/auth-emails';
import { ACCOUNT_LINKING } from '@/libs/auth-linking';
import { decideMagicLink } from '@/libs/auth-magic-link';
import { buildPasskeyConfig } from '@/libs/auth-passkey';
import {
  buildSocialProviders,
  buildTrustedOrigins,
  getEnabledProviders,
  incompleteProviders,
} from '@/libs/auth-providers';
import { Env } from '@/libs/env';
import { runInBackground } from '@/utils/background';

import { SESSION_FRESH_SECONDS } from './auth-constants';
import { AUTH_RATE_LIMIT_DEFAULT, AUTH_RATE_LIMIT_RULES } from './auth-rate-limit';
import { getLogger } from './logger';

interface AuthEmailData {
  user: { email: string; name: string };
  url: string;
}

const enabledProviderIds = getEnabledProviders(Env).map((provider) => provider.id);

for (const id of incompleteProviders(Env)) {
  getLogger('auth').warning(
    'Social provider "{id}" has only one of CLIENT_ID / CLIENT_SECRET set — ignoring it',
    { id },
  );
}

/** Factory so integration tests can run the real auth stack on an in-memory database. */
export function createAuth(database: DbLike) {
  return betterAuth({
    account: { accountLinking: ACCOUNT_LINKING },
    advanced: {
      // 🔍 older versions: advanced.generateId
      database: { generateId: () => randomUUID() },
      // Rate limiting trusts this header, so it must be one YOUR proxy sets/overwrites (see env.ts).
      ipAddress: { ipAddressHeaders: [Env.AUTH_IP_HEADER] },
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
      // we re-send explicitly from the sign-in form (S2-T08) so the link carries the right callbackURL
      sendOnSignIn: false,
      sendOnSignUp: true,
      sendVerificationEmail: ({ user, url }: AuthEmailData, request: Request | undefined) => {
        runInBackground(() => sendVerificationEmail({ request, url, user }));
        return Promise.resolve();
      },
    },

    // Required so cookies set inside Server Actions reach the browser
    plugins: [
      magicLink({
        // seconds
        expiresIn: 60 * 5,
        sendMagicLink: ({ email, url }, request) => {
          if (!Env.AUTH_MAGIC_LINK_ENABLED) {
            return;
          }

          runInBackground(async () => {
            const decision = await decideMagicLink(database, {
              email,
              allowSignUp: Env.AUTH_ALLOW_SIGNUP_VIA_MAGIC_LINK,
            });
            if (decision !== 'send') {
              getLogger('security').info('Magic link not sent: {decision}', { decision });
              return;
            }
            await sendMagicLinkEmail({ email, url, request: request?.request });
          });
        },
      }),
      passkey(
        buildPasskeyConfig({
          appUrl: Env.NEXT_PUBLIC_APP_URL,
          appName: Env.NEXT_PUBLIC_APP_NAME,
          rpId: Env.PASSKEY_RP_ID,
          rpName: Env.PASSKEY_RP_NAME,
        }),
      ),
      nextCookies(),
    ],
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
      freshAge: SESSION_FRESH_SECONDS,
      // refresh the expiry once a day,
      updateAge: 60 * 60 * 24,
    },

    trustedOrigins: buildTrustedOrigins(Env.NEXT_PUBLIC_APP_URL, enabledProviderIds),
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: (
          { user, newEmail, url }: AuthEmailData & { newEmail: string },
          request?: Request,
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

    socialProviders: buildSocialProviders(Env),
  });
}

export const auth = createAuth(db);
export type Auth = typeof auth;
