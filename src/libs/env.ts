import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const Env = createEnv({
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  // Production-only safety checks (see the refinements below). Server-side only.
  createFinalSchema: (shape, isServer) => {
    const schema = z.object(shape);
    if (!isServer) {
      return schema;
    }
    return schema.superRefine((env, ctx) => {
      if (env.NODE_ENV !== 'production' || env.ALLOW_LOCAL_SERVICES) {
        return;
      }
      if (!env.DATABASE_URL) {
        ctx.addIssue({
          code: 'custom',
          message:
            'DATABASE_URL is required in production (set ALLOW_LOCAL_SERVICES=true only for CI/e2e)',
          path: ['DATABASE_URL'],
        });
      }
      if (env.EMAIL_TRANSPORT === 'console' || env.EMAIL_TRANSPORT === 'memory') {
        ctx.addIssue({
          code: 'custom',
          message: `EMAIL_TRANSPORT=${env.EMAIL_TRANSPORT} is not allowed in production: it logs or drops auth links (set ALLOW_LOCAL_SERVICES=true only for CI/e2e)`,
          path: ['EMAIL_TRANSPORT'],
        });
      }
    });
  },
  emptyStringAsUndefined: true,
  // Next.js inlines NEXT_PUBLIC_* at build time, so each var must be listed explicitly.
  runtimeEnv: {
    ALLOW_LOCAL_SERVICES: process.env.ALLOW_LOCAL_SERVICES,
    AUTH_IP_HEADER: process.env.AUTH_IP_HEADER,
    AUTH_RATE_LIMIT: process.env.AUTH_RATE_LIMIT,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
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
    // CI/e2e only: lets a production build use the embedded database and the console email transport.
    ALLOW_LOCAL_SERVICES: z.stringbool().default(false),
    // Header that carries the real client IP for rate limiting. Default is correct on Vercel
    // (it overwrites x-forwarded-for). Behind any other proxy, set the header YOUR proxy controls.
    AUTH_IP_HEADER: z.string().min(1).default('x-forwarded-for'),
    // Better Auth rate limiting. "off" is only for local development.
    AUTH_RATE_LIMIT: z.enum(['on', 'off']).default('on'),
    // ≥ 32 chars. Generate with: pnpm setup:env
    BETTER_AUTH_SECRET: z.string().min(32),
    // Optional locally: when absent we use the PGlite socket server (see S1-T04).
    // Required in production (enforced by createFinalSchema above).
    DATABASE_URL: z.url().optional(),
    // Direct (non-pooled) URL used for migrations in production
    DATABASE_URL_UNPOOLED: z.url().optional(),
    DB_SERVER_PORT: z.coerce.number().int().positive().default(5433),
    EMAIL_FROM: z.string().min(3).optional(),
    // Optional override. Default: resend if a key exists, console in development, otherwise unset (sending fails loudly).
    EMAIL_TRANSPORT: z.enum(['console', 'resend', 'memory']).optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warning', 'error']).default('info'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    RESEND_API_KEY: z.string().min(1).optional(),
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
