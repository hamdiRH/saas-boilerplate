'use server';

import { headers } from 'next/headers';

import { currentRequest } from '@/data/request';
import { withAuth } from '@/data/with-auth';
import { auth } from '@/libs/auth';
import { mapAuthApiError } from '@/libs/auth-api-errors';
import { sendPasswordChangedEmail } from '@/libs/auth-emails';
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
);

export function changePassword(input: unknown) {
  return handleChangePassword(input);
}
