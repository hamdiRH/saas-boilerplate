import { eq } from 'drizzle-orm';

import { user } from '@/db/schema';
import type { DbLike } from '@/db/types';

export type MagicLinkDecision = 'send' | 'skip-unknown-user';

/**
 * Decides whether an email actually gets sent. The HTTP response is identical either way;
 * this runs in the background so response TIMING doesn't leak the answer either.
 */
export async function decideMagicLink(
  database: DbLike,
  { email, allowSignUp }: { email: string; allowSignUp: boolean },
): Promise<MagicLinkDecision> {
  const [existing] = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.toLowerCase()));

  if (!existing && !allowSignUp) {
    return 'skip-unknown-user';
  }
  return 'send';
}
