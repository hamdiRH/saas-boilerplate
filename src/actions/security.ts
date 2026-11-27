'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { requireFreshSession } from '@/data/session';
import { auth } from '@/libs/auth';
import { mapAuthApiError } from '@/libs/auth-api-errors';
import { createAction } from '@/utils/action';

const handleDeletePasskey = createAction(z.object({ id: z.string().min(1) }), async ({ id }) => {
  // authenticated + recently signed in
  await requireFreshSession();

  try {
    // Better Auth only deletes passkeys that belong to the current user — verify below in the E2E suite
    await auth.api.deletePasskey({ body: { id }, headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  return { deleted: true as const };
});

export async function deletePasskey(input: unknown) {
  return await handleDeletePasskey(input);
}
