'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { z } from 'zod';

import { getSessionOrThrow } from '@/data/session';
import { withAuth } from '@/data/with-auth';
import { db } from '@/db/client';
import { Env } from '@/libs/env';
import { NotFoundError } from '@/libs/errors';
import { createWebPushTransport } from '@/libs/push/web-push-transport';
import {
  assertTestPushAllowed,
  removeSubscription,
  saveSubscription,
  sendToUser,
} from '@/services/push';
import { createAction } from '@/utils/action';
import { pushSubscriptionSchema, unsubscribePushSchema } from '@/validations/push';

/** The feature flag is checked on the server too: hiding the UI is not a control. */
function assertPushEnabled() {
  if (!Env.PUSH_ENABLED) {
    throw new NotFoundError();
  }
}

const handleSubscribe = createAction(
  pushSubscriptionSchema,
  withAuth(async (input, { session }) => {
    assertPushEnabled();
    const requestHeaders = await headers();
    await saveSubscription(db, session.user.id, {
      ...input,
      userAgent: requestHeaders.get('user-agent'),
    });
    return { subscribed: true as const };
  }),
  { guard: getSessionOrThrow },
);

export async function subscribePush(input: unknown) {
  const result = await handleSubscribe(input);
  return result;
}

const handleUnsubscribe = createAction(
  unsubscribePushSchema,
  withAuth(async ({ endpoint }, { session }) => {
    // Works even when push is disabled, so users can always clean up.
    const removed = await removeSubscription(db, session.user.id, endpoint);
    return { removed };
  }),
  { guard: getSessionOrThrow },
);

export async function unsubscribePush(input: unknown) {
  const result = await handleUnsubscribe(input);
  return result;
}

const handleSendTest = createAction(
  z.object({}),
  withAuth(async (_input, { session }) => {
    assertPushEnabled();
    await assertTestPushAllowed(db, session.user.id);

    const locale = await getLocale();
    const t = await getTranslations({ locale, namespace: 'push' });
    // The content is fixed on purpose: this action is not a way to send arbitrary text.
    const result = await sendToUser(db, createWebPushTransport(), session.user.id, {
      body: t('testBody'),
      tag: 'test',
      title: t('testTitle'),
      url: '/dashboard/account/notifications',
    });
    return result;
  }),
  { guard: getSessionOrThrow },
);

export async function sendTestPush(input: unknown = {}) {
  const result = await handleSendTest(input);
  return result;
}
