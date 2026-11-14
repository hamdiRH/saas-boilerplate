// scripts/setup-env.mjs — creates .env.local with a random BETTER_AUTH_SECRET if missing.
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const file = '.env.local';
const current = existsSync(file) ? readFileSync(file, 'utf-8') : '';

if (/^BETTER_AUTH_SECRET=.+/mu.test(current)) {
  console.log('✅ BETTER_AUTH_SECRET already set in .env.local');
  process.exit(0);
}

const secret = randomBytes(32).toString('base64url');
const prefix = current && !current.endsWith('\n') ? '\n' : '';
appendFileSync(file, `${prefix}BETTER_AUTH_SECRET=${secret}\n`);
console.log('✅ Generated BETTER_AUTH_SECRET in .env.local');
