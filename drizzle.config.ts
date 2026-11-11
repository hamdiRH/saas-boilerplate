import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

// Load .env, .env.local, .env.development exactly like Next.js does
// dev=true → also loads .env.development (NODE_ENV is usually unset when running scripts)
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

const port = process.env.DB_SERVER_PORT ?? '5433';

export default defineConfig({
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/db/schema/index.ts',
});
