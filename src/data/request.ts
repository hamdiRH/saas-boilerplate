import 'server-only';
import { headers } from 'next/headers';

import { Env } from '@/libs/env';

export async function currentRequest(): Promise<Request> {
  return new Request(Env.NEXT_PUBLIC_APP_URL, { headers: new Headers(await headers()) });
}
