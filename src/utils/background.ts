import { after } from 'next/server';

import { getLogger } from '@/libs/logger';

/**
 * Runs a task after the response is sent. Inside a request we use Next's `after()`
 * (keeps serverless functions alive until it finishes). Outside a request (tests, scripts)
 * it falls back to a plain detached promise.
 *
 * Why: awaiting email delivery inside auth endpoints makes response times differ between
 * "user exists" and "user doesn't exist" → a timing side-channel for account enumeration.
 */
export function runInBackground(task: () => Promise<void>): void {
  const guarded = async () => {
    try {
      await task();
    } catch (error: unknown) {
      getLogger('app').error('Background task failed', { error });
    }
  };

  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
