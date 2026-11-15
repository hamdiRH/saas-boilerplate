import { expect, vi } from 'vitest';

import type { createAuth } from '@/libs/auth';
import { extractLinks } from '@/libs/email/console-transport';
import type { MemoryTransport } from '@/libs/email/memory-transport';
import type { EmailMessage } from '@/libs/email/types';

export type TestAuth = ReturnType<typeof createAuth>;
export const TEST_PASSWORD = 'Str0ng-Passw0rd-Test!';

export function firstLink(message: EmailMessage | undefined): string {
  const [link] = extractLinks(message?.text ?? '');
  if (!link) {
    throw new Error('No link found in email');
  }
  return link;
}

/** Verification links use ?token=…, reset links use /reset-password/<token>. */
export function tokenFromLink(link: string): string {
  const url = new URL(link);
  return url.searchParams.get('token') ?? url.pathname.split('/').pop() ?? '';
}

/** Turns Set-Cookie headers of a response into a Cookie header for the next call. */
function cookieHeaderFrom(response: Response): Headers {
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return new Headers({ cookie });
}

export async function signUpAndVerify(auth: TestAuth, transport: MemoryTransport, email: string) {
  await auth.api.signUpEmail({ body: { email, name: 'Test User', password: TEST_PASSWORD } });
  await vi.waitFor(() => expect(transport.last(email)).toBeDefined());

  await auth.api.verifyEmail({ query: { token: tokenFromLink(firstLink(transport.last(email))) } });
  transport.clear();
}

export async function signIn(auth: TestAuth, email: string, password = TEST_PASSWORD) {
  const response = await auth.api.signInEmail({ asResponse: true, body: { email, password } });
  return { headers: cookieHeaderFrom(response), response };
}
