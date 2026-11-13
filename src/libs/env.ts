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
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT,
    LOG_LEVEL: process.env.LOG_LEVEL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  },
  server: {
    // Optional locally: when absent we use the PGlite socket server (see S1-T04)
    DATABASE_URL: z.url().optional(),
    // Direct (non-pooled) URL used for migrations in production
    DATABASE_URL_UNPOOLED: z.url().optional(),
    DB_SERVER_PORT: z.coerce.number().int().positive().default(5433),
    EMAIL_FROM: z.string().min(3).default('SaaS Boilerplate <onboarding@resend.dev>'),
    EMAIL_TRANSPORT: z.enum(['console', 'resend', 'memory']).optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warning', 'error']).default('info'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    RESEND_API_KEY: z.string().min(1).optional(),
    // Optional override. Default: resend if a key exists, console in development, otherwise unset (sending fails loudly).
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
