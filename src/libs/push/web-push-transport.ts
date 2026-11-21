import 'server-only';
import { sendNotification, setVapidDetails, WebPushError } from 'web-push';

import { Env } from '@/libs/env';
import { ExternalServiceError } from '@/libs/errors';
import { PushGoneError } from '@/services/push';
import type { PushTransport } from '@/services/push';

/** Push messages that cannot be delivered within a minute are not worth delivering. */
const TTL_SECONDS = 60;

export function createWebPushTransport(): PushTransport {
  const publicKey = Env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = Env.VAPID_PRIVATE_KEY;
  const subject = Env.VAPID_SUBJECT;

  if (!Env.PUSH_ENABLED || !publicKey || !privateKey || !subject) {
    throw new ExternalServiceError();
  }

  setVapidDetails(subject, publicKey, privateKey);

  return {
    async send(subscription, payload) {
      try {
        await sendNotification(subscription, payload, { TTL: TTL_SECONDS });
      } catch (error) {
        if (error instanceof WebPushError && [404, 410].includes(error.statusCode)) {
          throw new PushGoneError();
        }
        throw error;
      }
    },
  };
}
