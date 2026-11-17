'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { currentRequest } from '@/data/request';
import { getSessionOrThrow } from '@/data/session';
import { withAuth } from '@/data/with-auth';
import { auth } from '@/libs/auth';
import { mapAuthApiError } from '@/libs/auth-api-errors';
import { sendPasswordChangedEmail } from '@/libs/auth-emails';
import { NotFoundError } from '@/libs/errors';
import { createAction } from '@/utils/action';
import { runInBackground } from '@/utils/background';
import { changePasswordSchema } from '@/validations/account';

const handleChangePassword = createAction(
  changePasswordSchema,
  withAuth(async (input, { session }) => {
    try {
      await auth.api.changePassword({
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: input.revokeOtherSessions,
        },
        headers: await headers(),
      });
    } catch (error) {
      throw mapAuthApiError(error);
    }

    const request = await currentRequest();
    runInBackground(() => sendPasswordChangedEmail({ request, user: session.user }));
    return { changed: true as const };
  }),
  { guard: getSessionOrThrow },
);

export async function changePassword(input: unknown) {
  const result = await handleChangePassword(input);
  return result;
}

const handleRevokeSession = createAction(
  z.object({ sessionId: z.string().min(1) }),
  withAuth(async ({ sessionId }) => {
    const requestHeaders = await headers();
    const sessions = await auth.api.listSessions({ headers: requestHeaders });

    // Only sessions of the CURRENT user are listed → other users' ids simply "don't exist"
    const target = sessions.find((item) => item.id === sessionId);
    if (!target) {
      throw new NotFoundError();
    }

    try {
      await auth.api.revokeSession({ body: { token: target.token }, headers: requestHeaders });
    } catch (error) {
      throw mapAuthApiError(error);
    }
    return { revoked: true as const };
  }),
  { guard: getSessionOrThrow },
);

export async function revokeSession(input: unknown) {
  const result = await handleRevokeSession(input);
  return result;
}

const handleRevokeOthers = createAction(
  z.object({}),
  withAuth(async () => {
    try {
      await auth.api.revokeOtherSessions({ headers: await headers() });
    } catch (error) {
      throw mapAuthApiError(error);
    }
    return { revoked: true as const };
  }),
  { guard: getSessionOrThrow },
);

export async function revokeOtherSessions() {
  const result = await handleRevokeOthers({});
  return result;
}
