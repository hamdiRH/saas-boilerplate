import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const Env = createEnv({
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  emptyStringAsUndefined: true,
  // Next.js inlines NEXT_PUBLIC_* at build time, so each var must be listed explicitly.
  runtimeEnv: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
  },
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
