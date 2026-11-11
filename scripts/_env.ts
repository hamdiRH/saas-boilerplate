// Import this FIRST in every script: it loads .env, .env.local, .env.development like Next.js.
import { loadEnvConfig } from '@next/env';

// dev=true → also loads .env.development (NODE_ENV is usually unset when running scripts)
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
