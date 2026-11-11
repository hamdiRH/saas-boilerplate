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
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    DB_SERVER_PORT: process.env.DB_SERVER_PORT,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
  },
  server: {
    // Optional locally: when absent we use the PGlite socket server (see S1-T04)
    DATABASE_URL: z.url().optional(),
    // Direct (non-pooled) URL used for migrations in production
    DATABASE_URL_UNPOOLED: z.url().optional(),
    DB_SERVER_PORT: z.coerce.number().int().positive().default(5433),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
