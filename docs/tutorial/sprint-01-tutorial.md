# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 1 — Data Layer, App Shell, i18n, Forms, Errors

> Companion to `docs/roadmap/sprint-01-data-shell-i18n.md`. Every `S1-Txx` section is one ticket. Follow them **in the order shown here** (it differs slightly from the sprint file — see the box below).

🪟 **Windows + Cmder:** work in the **Git Bash tab** (see the Windows section of the Sprint 0 tutorial). Everything below is Bash syntax and cross-platform Node tooling. Extra Windows notes are marked 🪟.

> ⚠️ **About versions.** PGlite, next-intl, LogTape, Zod 4 and Drizzle evolve quickly. Where an API is likely to have drifted the step says **🔍 Verify against docs**. If reality differs, trust the official docs and note the difference in `docs/roadmap/06-project-state.md`.

---

## 📋 What you will have at the end

- Drizzle ORM + migrations, a local **PGlite** database served over a socket (zero external services), Neon-ready for production
- Test DB helper, factories, seed script
- Route groups `(marketing)` `(auth)` `(app)` `(admin)`, light/dark theme, shadcn component set
- **next-intl** with `en`/`fr`, language switcher, typed messages
- Reusable form components (React Hook Form + Zod) and the `ActionResult` pattern
- `AppError` hierarchy, error pages, structured **LogTape** logging with redaction
- Playwright smoke tests running in CI

## 🔢 Ticket order used in this tutorial

The sprint file lists tasks T01…T16. A few have hidden dependencies, so we reorder them to keep every branch buildable:

| Order | Ticket | Why moved |
|---|---|---|
| 1–2 | S1-T01, S1-T02 | DB config + client |
| 3 | **S1-T04** (before T03) | The PGlite server must exist before migration scripts can be verified |
| 4 | S1-T03 | Migration/reset scripts |
| 5–6 | S1-T05, S1-T06 | Test DB, factories, seed |
| 7–9 | S1-T07, S1-T08, S1-T09 | UI shell, theme, shadcn |
| 10–11 | S1-T10, S1-T11 | i18n |
| 12 | S1-T12 | Form components |
| 13 | **S1-T14** (before T13) | `AppError` is needed by the action wrapper |
| 14 | **S1-T15** (before T13) | Logger is needed by the action wrapper |
| 15 | S1-T13 | `createAction` + contact form |
| 16 | S1-T16 | Playwright |
| 17 | Wrap-up | docs, project state, tag |

---

## 🔀 Git workflow (now PR-based)

Branch protection from Sprint 0 means **every ticket goes through a Pull Request**:

```bash
git switch main && git pull
git switch -c <type>/s1-tXX-<slug>
# … work, then verify …
pnpm check                                   # must be green
git add -A
git commit -m "<type>(<scope>): <message>"
git push -u origin <branch>
gh pr create --fill --base main
gh pr checks --watch                         # wait for all jobs green
gh pr merge --merge --delete-branch
git switch main && git pull
```
Each ticket ends with a **🚢 Ship** line giving the branch name and commit message to plug into this block.

> 🔎 If a PR check fails, fix it **on the branch** and push again. Never weaken a check to get green.

After adding dependencies, run **`pnpm pin`** (created in S1-T01) so every version stays exact.

---

## ✅ Before you start

```bash
git switch main && git pull
pnpm install
pnpm check            # must be green: Sprint 0 is really done
```
In `docs/roadmap/06-project-state.md` set **Current sprint: Sprint 1**.

---

## 🎫 S1-T01 — Drizzle config and baseline schema

**Branch:** `feat/s1-t01-drizzle-config` · **Story:** US-010 · **2 SP**

```bash
git switch -c feat/s1-t01-drizzle-config
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg @next/env
```
> 🔎 We use **node-postgres (`pg`)** for every environment. Locally it talks to the PGlite socket server; in production it talks to Neon's **pooled TCP** connection string. One driver = one code path. *(Deviation from the sprint file's "Neon driver switch": the switch is now a pure config function, tested in S1-T02. If you later move to the Edge runtime, adopt Neon's serverless driver — 🔍 see Neon docs.)*

### 1. Helper script: `pnpm pin`

📄 **Edit `package.json`** `scripts`:
```json
{
  "scripts": {
    "pin": "node scripts/pin-versions.mjs && pnpm install"
  }
}
```

### 2. Env variables

📄 **Edit `src/libs/Env.ts`** — extend `server` and `runtimeEnv`:
```ts
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Optional locally: when absent we use the PGlite socket server (see S1-T04)
    DATABASE_URL: z.url().optional(),
    // Direct (non-pooled) URL used for migrations in production
    DATABASE_URL_UNPOOLED: z.url().optional(),
    DB_SERVER_PORT: z.coerce.number().int().positive().default(5433),
  },
```
```ts
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    DB_SERVER_PORT: process.env.DB_SERVER_PORT,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
```
> 🪟 We default the local DB port to **5433**, not 5432, because a Postgres installed on Windows usually already owns 5432.

📄 **Append to `.env.example`:**
```dotenv
# ─── Database ───────────────────────────────────────
# Leave empty locally: `pnpm dev` starts an embedded PGlite server on DB_SERVER_PORT.
# Production: Neon POOLED connection string (host contains "-pooler"), with ?sslmode=require
DATABASE_URL=
# Production migrations: Neon DIRECT connection string
DATABASE_URL_UNPOOLED=
DB_SERVER_PORT=5433
```
📄 **Append to `.env.development`:**
```dotenv
DB_SERVER_PORT=5433
```

### 3. Drizzle config

📄 **Create `drizzle.config.ts`:**
```ts
import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

// Load .env, .env.local, .env.development exactly like Next.js does
// dev=true → also loads .env.development (NODE_ENV is usually unset when running scripts)
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

const port = process.env.DB_SERVER_PORT ?? '5433';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      `postgres://postgres:postgres@127.0.0.1:${port}/postgres`,
  },
});
```
> ✅ `process.env` is allowed in config files; our env guard only scans `src/`.

### 4. Schema helpers + a temporary table

📄 **Create `src/db/schema/_helpers.ts`:**
```ts
import { randomUUID } from 'node:crypto';

import { text, timestamp } from 'drizzle-orm/pg-core';

/** Text primary key, UUID generated in the app (portable, no DB extension needed). */
export const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID());

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
```

📄 **Create `src/db/schema/app-meta.ts`:**
```ts
import { pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';

/** Temporary key/value table proving migrations work. Removed in Sprint 2. */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  ...timestamps,
});
```

📄 **Create `src/db/schema/index.ts`:**
```ts
export * from './app-meta';
```

### 5. Scripts + generate the first migration

📄 **Edit `package.json`** `scripts`:
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:check": "drizzle-kit check"
  }
}
```
Add `pnpm db:check` to the aggregate `check` script (before `pnpm test`):
```json
"check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm knip && pnpm check:env && pnpm check:agents && pnpm db:check && pnpm test && pnpm test:browser"
```

```bash
pnpm db:generate
ls drizzle                # 0000_….sql + meta/
```

### ✅ Verify
```bash
pnpm db:check             # "Everything's fine"
pnpm typecheck
pnpm dev:web 2>/dev/null || pnpm dev     # app still boots (Env accepts missing DATABASE_URL)
```
(`dev:web` is created in S1-T04; for now `pnpm dev` is fine — Ctrl+C after it boots.)

Open the generated SQL and confirm: table `app_meta`, `timestamp with time zone` columns.

**🚢 Ship** — branch `feat/s1-t01-drizzle-config` · message: `feat(db): add drizzle config, schema helpers and first migration`

---

## 🎫 S1-T02 — DB client factory (pool config)

**Branch:** `feat/s1-t02-db-client` · **Story:** US-010 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t02-db-client
```

### 1. Pure, testable pool configuration

📄 **Create `src/db/pool-config.ts`:**
```ts
import type { PoolConfig } from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function localDatabaseUrl(port = 5433): string {
  return `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
}

export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * - No URL        → embedded PGlite socket server (local development).
 * - Local URL     → same, but explicit.
 * - Remote URL    → Neon/any Postgres. TLS comes from `?sslmode=require` in the URL.
 */
export function buildPoolConfig(url: string | undefined, port = 5433): PoolConfig {
  const connectionString = url ?? localDatabaseUrl(port);

  if (isLocalUrl(connectionString)) {
    return {
      connectionString,
      ssl: false,
      // PGlite's socket server serves ONE connection at a time (risk R-02):
      // keep a single, short-lived connection so Studio/scripts can connect too.
      max: 1,
      idleTimeoutMillis: 500,
    };
  }

  return { connectionString, max: 5, idleTimeoutMillis: 10_000 };
}
```

📄 **Create `src/db/pool-config.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';

import { buildPoolConfig, isLocalUrl, localDatabaseUrl } from './pool-config';

describe('buildPoolConfig', () => {
  it('falls back to the local PGlite server when no URL is given', () => {
    const config = buildPoolConfig(undefined, 5555);
    expect(config.connectionString).toBe(localDatabaseUrl(5555));
    expect(config.max).toBe(1);
    expect(config.ssl).toBe(false);
  });

  it('uses a single short-lived connection for local URLs', () => {
    const config = buildPoolConfig('postgres://u:p@localhost:5432/db');
    expect(config.max).toBe(1);
    expect(config.idleTimeoutMillis).toBeLessThan(1000);
  });

  it('uses a small pool for remote hosts and leaves TLS to the URL', () => {
    const url = 'postgres://u:p@ep-cool-123-pooler.eu-central-1.aws.neon.tech/db?sslmode=require';
    const config = buildPoolConfig(url);
    expect(config.connectionString).toBe(url);
    expect(config.max).toBeGreaterThan(1);
    expect(config.ssl).toBeUndefined();
  });
});

describe('isLocalUrl', () => {
  it('detects local hosts and tolerates garbage', () => {
    expect(isLocalUrl('postgres://x@127.0.0.1:5433/db')).toBe(true);
    expect(isLocalUrl('postgres://x@db.example.com/db')).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });
});
```

### 2. The client (HMR-safe singleton)

📄 **Create `src/db/client.ts`:**
```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { Env } from '@/libs/Env';

import { buildPoolConfig } from './pool-config';
import * as schema from './schema';

// Next.js hot-reload re-evaluates modules; keep ONE pool on globalThis in dev.
const globalForDb = globalThis as unknown as { __dbPool?: Pool };

const pool =
  globalForDb.__dbPool ?? new Pool(buildPoolConfig(Env.DATABASE_URL, Env.DB_SERVER_PORT));

if (Env.NODE_ENV !== 'production') {
  globalForDb.__dbPool = pool;
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;
```
> ℹ️ Nothing imports `client.ts` yet, so Knip will flag it as an unused file. Add it temporarily to the `entry` list in `knip.config.ts`: `'src/db/client.ts'` (remove the entry in Sprint 2 when auth imports it).

📄 **Document the two URLs** — create `docs/guides/database.md` (extended in later tickets):
````markdown
# Database

## Environments
| Env | Database | Connection |
|---|---|---|
| Local dev | PGlite (embedded Postgres) served by `pnpm db:server` on port 5433 | `DATABASE_URL` empty |
| Tests | PGlite in memory, one per test file | `tests/utils/test-db.ts` |
| Production / previews | Neon | `DATABASE_URL` = **pooled** URL; `DATABASE_URL_UNPOOLED` = **direct** URL (migrations) |

## Neon connection strings
- Runtime (serverless functions): the **pooled** host (contains `-pooler`) with `?sslmode=require`.
- Migrations: the **direct** host — pooled connections are not suitable for DDL.
````

### ✅ Verify
```bash
pnpm test                 # pool-config tests pass
pnpm typecheck && pnpm lint && pnpm knip
```

**🚢 Ship** — branch `feat/s1-t02-db-client` · message: `feat(db): add pool configuration and database client`

---

## 🎫 S1-T04 — PGlite socket dev server *(done before T03)*

**Branch:** `feat/s1-t04-pglite-server` · **Story:** US-010 · **3 SP** · ⚠️ spike (risk R-02)

> 🎯 **Goal:** `pnpm dev` starts an embedded Postgres + Next.js together — no Docker, no installs.

```bash
git switch main && git pull && git switch -c feat/s1-t04-pglite-server
pnpm add -D @electric-sql/pglite @electric-sql/pglite-socket tsx concurrently
pnpm approve-builds        # tsx → esbuild postinstall: select esbuild, confirm
```

### 1. Load env files in scripts (same rules as Next)

📄 **Create `scripts/_env.ts`:**
```ts
// Import this FIRST in every script: it loads .env, .env.local, .env.development like Next.js.
import { loadEnvConfig } from '@next/env';

// dev=true → also loads .env.development (NODE_ENV is usually unset when running scripts)
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
```

### 2. The server

📄 **Create `scripts/db-server.ts`:**
```ts
import './_env';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const port = Number(process.env.DB_SERVER_PORT ?? 5433);
const dataDir = './local.db';

async function main() {
  const client = await PGlite.create(dataDir); // persisted on disk, survives restarts

  // Apply pending migrations on every start so a fresh clone "just works"
  await migrate(drizzle(client), { migrationsFolder: 'drizzle' });

  const server = new PGLiteSocketServer({ db: client, port, host: '127.0.0.1' });

  try {
    await server.start();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(
        `❌ Port ${port} is already in use. Another db server (or a local Postgres) is running.\n` +
          `   Change DB_SERVER_PORT in .env.local, or stop the other process.`,
      );
      process.exit(1);
    }
    throw error;
  }

  console.log(`🐘 PGlite listening on postgres://postgres:postgres@127.0.0.1:${port}/postgres`);
  console.log(`   data: ${dataDir}`);

  const shutdown = async () => {
    console.log('\n🛑 Shutting down database…');
    await server.stop();
    await client.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGBREAK', shutdown); // Windows Ctrl+Break
}

main().catch((error) => {
  console.error('❌ Failed to start the database server:', error);
  process.exit(1);
});
```
> 🔍 **Verify against docs:** `PGlite.create`, `PGLiteSocketServer` constructor options and `start()/stop()` names in the versions you installed (PGlite is pre-1.0 — signatures change).

### 3. A tiny connectivity probe

📄 **Create `scripts/db-ping.ts`:**
```ts
import './_env';

import { Pool } from 'pg';

import { buildPoolConfig } from '../src/db/pool-config';

async function main() {
  const pool = new Pool(
    buildPoolConfig(process.env.DATABASE_URL, Number(process.env.DB_SERVER_PORT ?? 5433)),
  );
  const { rows } = await pool.query<{ now: Date }>('select now() as now');
  console.log('✅ Database reachable. Server time:', rows[0]?.now);
  await pool.end();
}

main().catch((error) => {
  console.error('❌ Cannot reach the database:', (error as Error).message);
  process.exit(1);
});
```

### 4. Scripts: `dev` now starts both processes

📄 **Edit `package.json`** `scripts`:
```json
{
  "scripts": {
    "dev": "concurrently -k -n db,web -c blue,green \"pnpm db:server\" \"next dev\"",
    "dev:web": "next dev",
    "db:server": "tsx scripts/db-server.ts",
    "db:ping": "tsx scripts/db-ping.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```
> 🪟 The escaped `\"` quotes work in both `cmd.exe` and Bash. Keep them exactly.

📄 **Ensure `.gitignore` has** (added in Sprint 0): `local.db` and `local.db-*`. `local.db` is a **folder** — confirm `git status` doesn't list it.

📄 **Extend `docs/guides/database.md`:**
````markdown

## Local database (PGlite)
`pnpm dev` runs two processes: the embedded Postgres (`pnpm db:server`, port 5433) and Next.js.
Data lives in `./local.db` (git-ignored). Reset with `pnpm db:reset`.

Run the pieces separately when debugging: `pnpm db:server` in one tab, `pnpm dev:web` in another.

### Known limits
- PGlite serves **one connection at a time**. The app pool is capped at 1 short-lived connection
  so `pnpm db:studio` and scripts can connect while the app is idle.
- If you see `ECONNREFUSED`, the db server isn't running.
- If `local.db` is corrupted (e.g. the process was force-killed) delete the folder and restart.

### Fallback: Docker Postgres
If PGlite misbehaves on your machine:
```bash
docker run --name saas-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:17
```
and set `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` in `.env.local`
(skip `pnpm db:server`; use `pnpm dev:web`).
````

### ✅ Verify
Open **three Cmder tabs** (Ctrl+T):
```bash
# Tab 1 — database only
pnpm db:server
# → 🐘 PGlite listening on postgres://postgres:postgres@127.0.0.1:5433/postgres
```
🪟 If Windows Firewall prompts for `node.exe`, choose **Allow (private networks)**.
```bash
# Tab 2
pnpm db:ping                 # ✅ Database reachable
pnpm db:studio               # prints https://local.drizzle.studio → open it, you see app_meta
# Tab 3 — while Studio is open, hit the DB again
pnpm db:ping                 # still ✅ (this is the single-connection risk check)
```
> 🔎 Drizzle Studio at `local.drizzle.studio` is blocked by Brave Shields/Safari — use Chrome or Edge.

Stop tab 1 (Ctrl+C) and test the combined flow:
```bash
pnpm dev
# → both [db] and [web] prefixes appear; http://localhost:3000 renders
```
Ctrl+C must stop **both**. Check the port is free: `netstat -ano | findstr :5433` → no output.

> ⚠️ **Risk R-02 outcome:** write in `06-project-state.md` whether concurrent connections worked. If they don't, document the Docker fallback as the recommended path for Studio.

**🚢 Ship** — branch `feat/s1-t04-pglite-server` · message: `feat(db): add pglite socket dev server and combined dev script`

---

## 🎫 S1-T03 — Migration, reset and seed scripts

**Branch:** `feat/s1-t03-db-scripts` · **Story:** US-010 · **1 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t03-db-scripts
```

### 1. Programmatic migrator (used locally **and** by deploys)

📄 **Create `scripts/migrate.ts`:**
```ts
import './_env';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { buildPoolConfig } from '../src/db/pool-config';

async function main() {
  // Migrations need a DIRECT connection in production
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const pool = new Pool(buildPoolConfig(url, Number(process.env.DB_SERVER_PORT ?? 5433)));

  console.log('⏳ Applying migrations…');
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  console.log('✅ Migrations applied');

  await pool.end();
}

main().catch((error) => {
  console.error('❌ Migration failed:', (error as Error).message);
  process.exit(1);
});
```

### 2. Reset (dev only, with guard rails)

📄 **Create `scripts/db-reset.ts`:**
```ts
import './_env';

import { execSync } from 'node:child_process';

import { Pool } from 'pg';

import { buildPoolConfig, isLocalUrl, localDatabaseUrl } from '../src/db/pool-config';

async function main() {
  const port = Number(process.env.DB_SERVER_PORT ?? 5433);
  const url = process.env.DATABASE_URL ?? localDatabaseUrl(port);

  // 🔒 Never wipe anything that is not a local development database
  if (process.env.NODE_ENV === 'production' || !isLocalUrl(url)) {
    console.error('❌ Refusing to reset: db:reset only runs against a LOCAL database.');
    process.exit(1);
  }

  const pool = new Pool(buildPoolConfig(url, port));
  console.log('🧹 Dropping schemas…');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.end();

  execSync('pnpm db:migrate', { stdio: 'inherit' });
}

main().catch((error) => {
  console.error('❌ Reset failed:', (error as Error).message);
  process.exit(1);
});
```

📄 **Edit `package.json`** `scripts`:
```json
{
  "scripts": {
    "db:migrate": "tsx scripts/migrate.ts",
    "db:reset": "tsx scripts/db-reset.ts"
  }
}
```
(`db:seed` and its chaining into `db:reset` come in S1-T06.)

### ✅ Verify
With `pnpm db:server` running in another tab:
```bash
pnpm db:migrate              # ✅ Migrations applied (idempotent: run it twice)
pnpm db:reset                # drops + recreates; re-applies migrations
pnpm db:ping
```
Safety check — the guard must refuse remote URLs:
```bash
DATABASE_URL="postgres://u:p@db.example.com/x" pnpm db:reset
# → ❌ Refusing to reset: db:reset only runs against a LOCAL database.
```
(🪟 cmd.exe: `set DATABASE_URL=postgres://u:p@db.example.com/x&& pnpm db:reset`, then `set DATABASE_URL=`.)

Optional, now or in Sprint 8: create a free **Neon** project, put its **direct** URL in `.env.local` as `DATABASE_URL_UNPOOLED`, run `pnpm db:migrate` and watch the tables appear in Neon's console. (Remove the variable afterwards so local dev keeps using PGlite.)

**🚢 Ship** — branch `feat/s1-t03-db-scripts` · message: `feat(db): add migrate and reset scripts with production guard`

---

## 🎫 S1-T05 — Test database helper

**Branch:** `test/s1-t05-test-db` · **Story:** US-011 · **2 SP**

```bash
git switch main && git pull && git switch -c test/s1-t05-test-db
mkdir -p tests/utils tests/factories
```

📄 **Create `tests/utils/test-db.ts`:**
```ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '@/db/schema';

/** Fresh in-memory Postgres with all migrations applied. One per test file is plenty. */
export async function createTestDb() {
  const client = new PGlite(); // no path = in memory
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });

  return {
    db,
    destroy: () => client.close(),
  };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>['db'];

class RollbackSignal extends Error {}

/**
 * Runs `fn` inside a transaction that is ALWAYS rolled back → tests stay isolated
 * without recreating the database.
 */
export async function withRollback<T>(
  db: TestDb,
  fn: (tx: Parameters<Parameters<TestDb['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  }
  return result as T;
}
```

📄 **Create `tests/utils/test-db.test.ts`:**
```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appMeta } from '@/db/schema';

import { createTestDb, type TestDb, withRollback } from './test-db';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  const started = performance.now();
  ({ db, destroy } = await createTestDb());
  console.info(`createTestDb took ${Math.round(performance.now() - started)} ms`);
}, 30_000);

afterAll(async () => {
  await destroy();
});

describe('test database', () => {
  it('applies migrations to an empty database', async () => {
    const rows = await db.select().from(appMeta);
    expect(rows).toEqual([]);
  });

  it('rolls back everything written inside withRollback', async () => {
    await withRollback(db, async (tx) => {
      await tx.insert(appMeta).values({ key: 'k', value: 'v' });
      const inside = await tx.select().from(appMeta).where(eq(appMeta.key, 'k'));
      expect(inside).toHaveLength(1);
    });

    const after = await db.select().from(appMeta);
    expect(after).toHaveLength(0);
  });
});
```
> ⏱ Record the `createTestDb took … ms` number in `06-project-state.md`. The sprint target is < 1 s per file; first run on Windows is often slower (WASM compile + antivirus). If it's > 3 s, note it as tech debt `TD-10`.

### ✅ Verify
```bash
pnpm test
```
Rename a column in `src/db/schema/app-meta.ts` **without** generating a migration, then run `pnpm db:check` → drift is reported. Revert.

**🚢 Ship** — branch `test/s1-t05-test-db` · message: `test(db): add in-memory pglite test database helper`

---

## 🎫 S1-T06 — Factories and seed

**Branch:** `feat/s1-t06-factories-seed` · **Story:** US-011 · **1 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t06-factories-seed
pnpm add -D @faker-js/faker
```

📄 **Create `tests/factories/factory.ts`:**
```ts
import { faker } from '@faker-js/faker';

faker.seed(42); // deterministic data → reproducible test failures

export { faker };

/** Tiny factory helper: `build(overrides)` returns a fully-typed object. */
export function defineFactory<T>(make: (sequence: number) => T) {
  let sequence = 0;
  return {
    build: (overrides: Partial<T> = {}): T => ({ ...make(++sequence), ...overrides }),
  };
}
```

📄 **Create `tests/factories/app-meta.factory.ts`:**
```ts
import type { appMeta } from '@/db/schema';

import { defineFactory, faker } from './factory';

export const appMetaFactory = defineFactory<typeof appMeta.$inferInsert>((n) => ({
  key: `key-${n}`,
  value: faker.lorem.words(2),
}));
```

📄 **Create `src/db/types.ts`:**
```ts
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type * as schema from './schema';

/** Any Drizzle Postgres database (node-postgres, PGlite…) bound to our schema. */
export type DbLike = PgDatabase<PgQueryResultHKT, typeof schema>;
```
> 🔍 If TypeScript rejects passing the node-postgres or PGlite database where `DbLike` is expected, check the Drizzle docs for the recommended base type in your version — keep it `any`-free.

📄 **Create `src/db/seed.ts`:**
```ts
import { appMeta } from './schema';
import type { DbLike } from './types';

/** Idempotent: safe to run any number of times. Extended in later sprints. */
export async function seed(db: DbLike) {
  await db
    .insert(appMeta)
    .values({ key: 'seeded_at', value: new Date().toISOString() })
    .onConflictDoNothing();
}
```

📄 **Create `scripts/seed.ts`:**
```ts
import './_env';

import { Env } from '../src/libs/Env';

async function main() {
  // 🔒 Dev-only guard
  if (Env.NODE_ENV === 'production') {
    console.error('❌ Refusing to seed in production.');
    process.exit(1);
  }

  const { db } = await import('../src/db/client');
  const { seed } = await import('../src/db/seed');

  await seed(db);
  console.log('🌱 Seed complete');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Seed failed:', (error as Error).message);
  process.exit(1);
});
```

📄 **Edit `package.json`** `scripts`:
```json
{
  "scripts": {
    "db:seed": "tsx scripts/seed.ts",
    "db:reset": "tsx scripts/db-reset.ts && pnpm db:seed"
  }
}
```

📄 **Create `src/db/seed.test.ts`:**
```ts
import { afterAll, beforeAll, expect, it } from 'vitest';

import { appMeta } from '@/db/schema';
import { createTestDb, type TestDb } from '../../tests/utils/test-db';

import { seed } from './seed';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
}, 30_000);
afterAll(() => destroy());

it('is idempotent', async () => {
  await seed(db);
  await seed(db);
  expect(await db.select().from(appMeta)).toHaveLength(1);
});
```
Remove the temporary `'src/db/client.ts'` Knip entry if you added it (`seed.ts` script now imports the client).

### ✅ Verify
```bash
pnpm test
# with `pnpm db:server` running in another tab:
pnpm db:reset        # drop + migrate + seed
pnpm db:seed         # run again → no error, no duplicate row
```
Open Studio → `app_meta` has one `seeded_at` row. `pnpm knip` must pass (use factories in a test or delete `app-meta.factory.ts` if Knip complains; factories used by tests in Sprint 2).

**🚢 Ship** — branch `feat/s1-t06-factories-seed` · message: `feat(db): add test factories and idempotent seed`

---

## 🎫 S1-T07 — Route groups and layouts

**Branch:** `feat/s1-t07-route-groups` · **Story:** US-012 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t07-route-groups
pnpm dlx shadcn@latest add sheet
```

> 🔎 **Deviation:** the sprint file creates these under `src/app/[locale]/`. next-intl isn't installed yet, so we build the groups at `src/app/` now and **move them under `[locale]` in S1-T10** with `git mv` (history preserved).
> All text here is English placeholders; S1-T11 moves it into translation files.

### 1. Folders

🪟 Quote paths containing parentheses in Bash:
```bash
mkdir -p "src/app/(marketing)" "src/app/(auth)/sign-in" "src/app/(auth)/sign-up" \
         "src/app/(app)/dashboard" "src/app/(admin)/admin" src/components/layout
git mv src/app/page.tsx "src/app/(marketing)/page.tsx"
```

### 2. Layout components

📄 **Create `src/components/layout/mobile-nav.tsx`:**
```tsx
'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export type NavLink = { href: string; label: string };

export function MobileNav({ links }: { links: readonly NavLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-4 p-4">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

📄 **Create `src/components/layout/site-header.tsx`:**
```tsx
import Link from 'next/link';

import { MobileNav, type NavLink } from '@/components/layout/mobile-nav';
import { Button } from '@/components/ui/button';

const links: readonly NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold">
          SaaS Boilerplate
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-up">Get started</Link>
          </Button>
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  );
}
```
> 🔎 Notice `border-e`, `ms-*`, `ps-*`, `text-start` utilities (logical properties) are used instead of `border-r`, `ml-*`… so the layout flips correctly for RTL languages later.

📄 **Create `src/components/layout/site-footer.tsx`:**
```tsx
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto max-w-6xl px-4 py-6 text-sm">
        © {new Date().getFullYear()} SaaS Boilerplate. All rights reserved.
      </div>
    </footer>
  );
}
```

### 3. Group layouts

📄 **Create `src/app/(marketing)/layout.tsx`:**
```tsx
import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
```

📄 **Create `src/app/(auth)/layout.tsx`:**
```tsx
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border p-6 shadow-sm">{children}</div>
    </main>
  );
}
```

📄 **Create `src/app/(app)/layout.tsx`:**
```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';

import { MobileNav, type NavLink } from '@/components/layout/mobile-nav';

const links: readonly NavLink[] = [{ href: '/dashboard', label: 'Dashboard' }];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-e p-4 md:block">
        <p className="mb-6 font-semibold">SaaS Boilerplate</p>
        <nav className="flex flex-col gap-2 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <MobileNav links={links} />
          <span className="text-muted-foreground text-sm">Workspace</span>
        </header>
        <main id="main" className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

📄 **Create `src/app/(admin)/layout.tsx`:**
```tsx
import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="bg-muted flex h-14 items-center border-b px-4 font-semibold">
        Admin console
      </header>
      <main id="main" className="p-6">
        {children}
      </main>
    </div>
  );
}
```

### 4. Pages

📄 **Edit `src/app/(marketing)/page.tsx`:**
```tsx
import { Button } from '@/components/ui/button';
import { Env } from '@/libs/Env';

export default function HomePage() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{Env.NEXT_PUBLIC_APP_NAME}</h1>
      <p className="text-muted-foreground">
        Next.js 16 · TypeScript strict · Tailwind CSS 4 · shadcn/ui
      </p>
      <Button>It works</Button>
    </section>
  );
}
```

📄 **Create the four placeholders** (identical pattern; change the title):
```tsx
// src/app/(auth)/sign-in/page.tsx
export default function SignInPage() {
  // PLACEHOLDER — real form arrives in Sprint 2
  return <h1 className="text-xl font-semibold">Sign in</h1>;
}
```
```tsx
// src/app/(auth)/sign-up/page.tsx
export default function SignUpPage() {
  // PLACEHOLDER — real form arrives in Sprint 2
  return <h1 className="text-xl font-semibold">Create your account</h1>;
}
```
```tsx
// src/app/(app)/dashboard/page.tsx
export default function DashboardPage() {
  // PLACEHOLDER — protected + tenant-aware in Sprints 2 and 4
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
```
```tsx
// src/app/(admin)/admin/page.tsx
export default function AdminPage() {
  // PLACEHOLDER — platform admin arrives in Sprint 4
  return <h1 className="text-2xl font-semibold">Admin</h1>;
}
```
Create a contact placeholder so the nav link doesn't 404 yet (replaced in S1-T13):
```tsx
// src/app/(marketing)/contact/page.tsx
export default function ContactPage() {
  return <h1 className="mx-auto max-w-2xl px-4 py-16 text-3xl font-semibold">Contact</h1>;
}
```

### ✅ Verify
```bash
pnpm dev
```
Visit `/`, `/contact`, `/sign-in`, `/sign-up`, `/dashboard`, `/admin`. Each shows its own layout (header/footer, centered card, sidebar, admin bar). Use the browser's responsive mode:
- **320 px:** the hamburger appears and the Sheet opens/closes; no horizontal scrollbar.
- **1440 px:** sidebar visible in `/dashboard`.

```bash
pnpm check
```

**🚢 Ship** — branch `feat/s1-t07-route-groups` · message: `feat(ui): add route groups, layouts and responsive navigation`

---

## 🎫 S1-T08 — Theme (light / dark / system)

**Branch:** `feat/s1-t08-theme` · **Story:** US-012 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t08-theme
pnpm add next-themes
pnpm dlx shadcn@latest add dropdown-menu
```

### 1. Provider

📄 **Create `src/components/providers/theme-provider.tsx`:**
```tsx
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
```

📄 **Edit `src/app/layout.tsx`** — suppress the expected hydration warning on `<html>` and wrap children (keep your existing font code):
```tsx
import { ThemeProvider } from '@/components/providers/theme-provider';

// …inside RootLayout:
<html lang="en" suppressHydrationWarning>
  <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  </body>
</html>
```
> 🔎 `next-themes` injects a tiny inline script that sets the `dark` class **before** first paint → no flash. `suppressHydrationWarning` is needed only on `<html>` because that script modifies it.

### 2. Tokens — minimalist neutral palette

`shadcn init` already generated CSS variables. Open `src/styles/global.css` and confirm you have:
- `:root { --background …; --foreground …; --primary …; --muted …; --border …; --ring …; --radius … }`
- `.dark { … }` with dark values
- `@custom-variant dark (&:is(.dark *));`

Set the radius and keep the neutral palette:
```css
:root {
  --radius: 0.5rem;
}
```
> 🎯 Sprint 7 centralises tokens in `theme.css` and adds accent presets. For now: neutral grays, one accent (`--primary`).

### 3. Toggle

📄 **Create `src/components/layout/theme-toggle.tsx`:**
```tsx
'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTheme('light')}>Light</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('dark')}>Dark</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('system')}>System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```
Add `<ThemeToggle />` inside the right-hand `div` of `site-header.tsx` (before `MobileNav`) and in the `(app)` layout header (right side, wrap with `<div className="ms-auto">`).

### ✅ Verify
```bash
pnpm dev
```
1. Toggle **Dark** → page turns dark. Hard-reload (Ctrl+Shift+R) → still dark, **no white flash**.
2. Choose **System**, then switch Windows to dark/light mode (Settings → Personalization → Colors) → the page follows.
3. The toggle is reachable with the keyboard (Tab → Enter → arrows).
```bash
pnpm check
```

**🚢 Ship** — branch `feat/s1-t08-theme` · message: `feat(ui): add light/dark/system theme with persistent toggle`

---

## 🎫 S1-T09 — shadcn component set and layout helpers

**Branch:** `feat/s1-t09-shadcn-set` · **Story:** US-012 · **1 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t09-shadcn-set
pnpm dlx shadcn@latest add input label textarea form card dialog sonner avatar badge separator skeleton tabs select checkbox alert table tooltip
```
> 🔍 If the CLI says `form` doesn't exist (newer shadcn versions replace it with a `field` component), install `field` instead and adapt the S1-T12 wrappers to its API — the idea (label + control + message) is identical. Dependencies that shadcn adds (e.g. `react-hook-form`, `@hookform/resolvers`, Radix packages) come with caret versions → run `pnpm pin`.

### 1. Don't lint generated code

📄 **Edit `.oxlintrc.json`** — add to `ignorePatterns`:
```json
"src/components/ui"
```
(Formatting still applies — only rules are skipped for vendor-style primitives.)

### 2. Toasts

📄 **Edit `src/app/layout.tsx`** — mount the toaster inside `<ThemeProvider>`:
```tsx
import { Toaster } from '@/components/ui/sonner';

<ThemeProvider …>
  {children}
  <Toaster richColors />
</ThemeProvider>
```

### 3. Layout helpers

📄 **Create `src/components/layout/page-header.tsx`:**
```tsx
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}
```

📄 **Create `src/components/layout/user-menu.tsx`** (placeholder, becomes real in Sprint 2):
```tsx
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/** PLACEHOLDER — wired to the session in Sprint 2. */
export function UserMenu() {
  return (
    <Avatar className="size-8">
      <AvatarFallback>?</AvatarFallback>
    </Avatar>
  );
}
```
Use them: in `(app)/dashboard/page.tsx` replace the `<h1>` with `<PageHeader title="Dashboard" description="Your workspace will appear here." />`, and add `<UserMenu />` after the theme toggle in the `(app)` header.

### 4. Component gallery (temporary, to eyeball everything)

📄 **Create `src/app/(marketing)/ui-kit/page.tsx`** (deleted at the end of this ticket):
```tsx
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export default function UiKitPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
        <Badge>Badge</Badge>
      </div>
      <Input placeholder="Input" />
      <Card>
        <CardHeader>
          <CardTitle>Card</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>This is an alert.</AlertDescription>
      </Alert>
    </div>
  );
}
```

### ✅ Verify
```bash
pnpm dev                   # open /ui-kit in light and dark mode: everything themed, no unstyled parts
```
Delete the gallery (`git rm -r "src/app/(marketing)/ui-kit"`), then:
```bash
pnpm pin
pnpm check                 # includes Knip → fix any unused-dependency finding
```
Count installed primitives: `ls src/components/ui` → ≥ 12 files.

**🚢 Ship** — branch `feat/s1-t09-shadcn-set` · message: `feat(ui): add shadcn component set, toaster and layout helpers`

---

## 🎫 S1-T10 — next-intl: routing, proxy, `[locale]` segment

**Branch:** `feat/s1-t10-next-intl` · **Story:** US-013 · **3 SP** · 🔍 read the next-intl docs for **Next 16 (`proxy.ts`)** first

```bash
git switch main && git pull && git switch -c feat/s1-t10-next-intl
pnpm add next-intl
```

### 1. Routing config

📄 **Create `src/i18n/routing.ts`:**
```ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'fr'],
  defaultLocale: 'en',
  localePrefix: 'as-needed', // /about (en) · /fr/about (fr) — ADR-010
});
```

📄 **Create `src/i18n/navigation.ts`:**
```ts
import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

// Export only what is used (Knip!). Add `redirect`, `useRouter`… when you need them.
export const { Link, usePathname } = createNavigation(routing);
```

📄 **Create `src/i18n/request.ts`:**
```ts
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../locales/${locale}.json`)).default,
  };
});
```

### 2. Minimal message files (filled in S1-T11)

```bash
mkdir -p src/locales
```
📄 **Create `src/locales/en.json`:**
```json
{ "common": { "appName": "SaaS Boilerplate" } }
```
📄 **Create `src/locales/fr.json`:**
```json
{ "common": { "appName": "SaaS Boilerplate" } }
```

### 3. Typed message keys

📄 **Create `src/types/next-intl.d.ts`:**
```ts
import type { routing } from '@/i18n/routing';

import type en from '../locales/en.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof en;
  }
}
```
→ `t('typo')` is now a **TypeScript error**. Add `'src/types/**'` to `ignore` in `knip.config.ts`.

### 4. Plugin + `proxy.ts`

📄 **Edit `next.config.ts`:**
```ts
import { createJiti } from 'jiti';
import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const jiti = createJiti(import.meta.url);
await jiti.import('./src/libs/Env');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
```
(If you used the `@next/bundle-analyzer` fallback in Sprint 0, compose: `withBundleAnalyzer(withNextIntl(nextConfig))`.)

📄 **Create `src/proxy.ts`** — Next 16's replacement for `middleware.ts`:
```ts
import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

// Later sprints compose more here: request id, optimistic auth redirect, Arcjet.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and files with an extension
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};
```
> 🔍 Confirm in the next-intl docs that the default export form is what `proxy.ts` expects in your Next 16.x (a named `proxy` export may be required in some versions).

### 5. Move the app under `[locale]`

🪟 Quote everything — brackets and parentheses are special in Bash:
```bash
mkdir "src/app/[locale]"
git mv "src/app/(marketing)" "src/app/[locale]/(marketing)"
git mv "src/app/(auth)"      "src/app/[locale]/(auth)"
git mv "src/app/(app)"       "src/app/[locale]/(app)"
git mv "src/app/(admin)"     "src/app/[locale]/(admin)"
git mv src/app/layout.tsx    "src/app/[locale]/layout.tsx"
```
`src/app/favicon.ico` and `src/app/api/` (later) stay at the app root.

### 6. The root layout becomes locale-aware

📄 **Rewrite `src/app/[locale]/layout.tsx`:**
```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/components/providers/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/i18n/routing';
import '@/styles/global.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SaaS Boilerplate',
  description: 'Production-ready SaaS starter',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale); // enables static rendering

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {children}
            <Toaster richColors />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```
> 🔎 There is **no** `src/app/layout.tsx` any more — the `[locale]` layout is the root layout (it owns `<html>`). Static metadata is localised in Sprint 7.

Replace **internal links** with the locale-aware `Link`: in `site-header.tsx`, `app/(app)/layout.tsx` and `mobile-nav.tsx` change `import Link from 'next/link'` → `import { Link } from '@/i18n/navigation'`.

### ✅ Verify
```bash
pnpm typecheck && pnpm dev
```
- `http://localhost:3000/` → English
- `http://localhost:3000/fr` → same page (French strings come in the next ticket)
- `http://localhost:3000/de` → 404 (we add a localized 404 in S1-T14)
- Header links from `/fr` keep the `/fr` prefix (`/fr/contact`)
```bash
pnpm build                 # static generation for en + fr succeeds
pnpm check
```

**🚢 Ship** — branch `feat/s1-t10-next-intl` · message: `feat(i18n): add next-intl routing, proxy and locale segment`

---

## 🎫 S1-T11 — Messages, language switcher, RTL readiness

**Branch:** `feat/s1-t11-messages` · **Story:** US-013 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t11-messages
```

### 1. Messages (English)

📄 **Replace `src/locales/en.json`** — this single file also covers keys used by tickets T12–T15, so we don't revisit it:
```json
{
  "common": {
    "appName": "SaaS Boilerplate",
    "openMenu": "Open menu",
    "menu": "Menu",
    "showPassword": "Show password",
    "hidePassword": "Hide password"
  },
  "nav": {
    "home": "Home",
    "contact": "Contact",
    "signIn": "Sign in",
    "getStarted": "Get started",
    "dashboard": "Dashboard",
    "workspace": "Workspace"
  },
  "theme": { "toggle": "Toggle theme", "light": "Light", "dark": "Dark", "system": "System" },
  "locale": { "label": "Language", "en": "English", "fr": "Français" },
  "footer": { "rights": "All rights reserved." },
  "marketing": {
    "title": "Ship your SaaS faster",
    "subtitle": "Next.js 16 · TypeScript strict · Tailwind CSS 4 · shadcn/ui",
    "cta": "It works"
  },
  "auth": {
    "signInTitle": "Sign in",
    "signUpTitle": "Create your account"
  },
  "dashboard": { "title": "Dashboard", "description": "Your workspace will appear here." },
  "admin": { "consoleTitle": "Admin console", "title": "Admin" },
  "contact": {
    "title": "Contact us",
    "description": "Send us a message and we'll get back to you.",
    "name": "Name",
    "email": "Email",
    "message": "Message",
    "send": "Send message",
    "success": "Thanks! We received your message."
  },
  "validation": {
    "required": "This field is required",
    "nameMin": "Name must be at least 2 characters",
    "email": "Enter a valid email address",
    "messageMin": "Message must be at least 10 characters",
    "messageMax": "Message must be at most 1000 characters",
    "invalid": "Invalid value"
  },
  "errors": {
    "title": "Something went wrong",
    "description": "An unexpected error occurred. Please try again.",
    "retry": "Try again",
    "reference": "Reference",
    "notFoundTitle": "Page not found",
    "notFoundDescription": "The page you are looking for does not exist.",
    "backHome": "Back to home",
    "validation": "Some fields are invalid.",
    "unauthenticated": "Please sign in to continue.",
    "forbidden": "You do not have permission to do this.",
    "notFound": "We couldn't find what you were looking for.",
    "conflict": "This conflicts with existing data.",
    "rateLimited": "Too many requests. Please slow down.",
    "external": "A service we depend on is unavailable.",
    "internal": "An unexpected error occurred."
  }
}
```

📄 **Replace `src/locales/fr.json`:**
```json
{
  "common": {
    "appName": "SaaS Boilerplate",
    "openMenu": "Ouvrir le menu",
    "menu": "Menu",
    "showPassword": "Afficher le mot de passe",
    "hidePassword": "Masquer le mot de passe"
  },
  "nav": {
    "home": "Accueil",
    "contact": "Contact",
    "signIn": "Se connecter",
    "getStarted": "Commencer",
    "dashboard": "Tableau de bord",
    "workspace": "Espace de travail"
  },
  "theme": { "toggle": "Changer de thème", "light": "Clair", "dark": "Sombre", "system": "Système" },
  "locale": { "label": "Langue", "en": "English", "fr": "Français" },
  "footer": { "rights": "Tous droits réservés." },
  "marketing": {
    "title": "Lancez votre SaaS plus vite",
    "subtitle": "Next.js 16 · TypeScript strict · Tailwind CSS 4 · shadcn/ui",
    "cta": "Ça marche"
  },
  "auth": {
    "signInTitle": "Se connecter",
    "signUpTitle": "Créez votre compte"
  },
  "dashboard": { "title": "Tableau de bord", "description": "Votre espace de travail apparaîtra ici." },
  "admin": { "consoleTitle": "Console d'administration", "title": "Administration" },
  "contact": {
    "title": "Nous contacter",
    "description": "Envoyez-nous un message, nous vous répondrons rapidement.",
    "name": "Nom",
    "email": "E-mail",
    "message": "Message",
    "send": "Envoyer le message",
    "success": "Merci ! Nous avons bien reçu votre message."
  },
  "validation": {
    "required": "Ce champ est obligatoire",
    "nameMin": "Le nom doit contenir au moins 2 caractères",
    "email": "Saisissez une adresse e-mail valide",
    "messageMin": "Le message doit contenir au moins 10 caractères",
    "messageMax": "Le message ne doit pas dépasser 1000 caractères",
    "invalid": "Valeur invalide"
  },
  "errors": {
    "title": "Une erreur est survenue",
    "description": "Une erreur inattendue s'est produite. Veuillez réessayer.",
    "retry": "Réessayer",
    "reference": "Référence",
    "notFoundTitle": "Page introuvable",
    "notFoundDescription": "La page que vous cherchez n'existe pas.",
    "backHome": "Retour à l'accueil",
    "validation": "Certains champs sont invalides.",
    "unauthenticated": "Veuillez vous connecter pour continuer.",
    "forbidden": "Vous n'avez pas la permission d'effectuer cette action.",
    "notFound": "Nous n'avons pas trouvé ce que vous cherchiez.",
    "conflict": "Cela entre en conflit avec des données existantes.",
    "rateLimited": "Trop de requêtes. Veuillez ralentir.",
    "external": "Un service dont nous dépendons est indisponible.",
    "internal": "Une erreur inattendue s'est produite."
  }
}
```

### 2. Language switcher

📄 **Create `src/components/layout/locale-switcher.tsx`:**
```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/utils/cn';

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  const pathname = usePathname(); // locale-less path, e.g. "/contact"

  return (
    <nav aria-label={t('label')} className="flex items-center gap-1 text-sm">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          lang={locale}
          hrefLang={locale}
          aria-label={t(locale)}
          aria-current={locale === current ? 'true' : undefined}
          className={cn(
            'rounded px-2 py-1 uppercase',
            locale === current
              ? 'bg-muted font-semibold'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {locale}
        </Link>
      ))}
    </nav>
  );
}
```
> 🔎 Plain links (not a `<select>`) → crawlable, work without JS, trivially testable. Query strings are not preserved; revisit if a page needs it.

### 3. Translate the existing components

📄 **`src/components/layout/site-header.tsx`:**
```tsx
import { useTranslations } from 'next-intl';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { MobileNav, type NavLink } from '@/components/layout/mobile-nav';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export function SiteHeader() {
  const t = useTranslations();

  const links: readonly NavLink[] = [
    { href: '/', label: t('nav.home') },
    { href: '/contact', label: t('nav.contact') },
  ];

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-semibold">
          {t('common.appName')}
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">{t('nav.signIn')}</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-up">{t('nav.getStarted')}</Link>
          </Button>
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  );
}
```

📄 **`src/components/layout/site-footer.tsx`:**
```tsx
import { useTranslations } from 'next-intl';

export function SiteFooter() {
  const t = useTranslations();

  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto max-w-6xl px-4 py-6 text-sm">
        © {new Date().getFullYear()} {t('common.appName')}. {t('footer.rights')}
      </div>
    </footer>
  );
}
```

📄 **`src/components/layout/mobile-nav.tsx`** — change the hard-coded strings:
```tsx
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
// inside MobileNav():
const t = useTranslations('common');
// aria-label={t('openMenu')}  and  <SheetTitle>{t('menu')}</SheetTitle>
```

📄 **`src/components/layout/theme-toggle.tsx`** — `useTranslations('theme')`:
`aria-label={t('toggle')}` and the three items `{t('light')}`, `{t('dark')}`, `{t('system')}`.

📄 **`src/app/[locale]/(marketing)/page.tsx`:**
```tsx
import { setRequestLocale } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { use } from 'react';

import { Button } from '@/components/ui/button';

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('marketing');

  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('subtitle')}</p>
      <Button>{t('cta')}</Button>
    </section>
  );
}
```
Placeholders (same pattern — `useTranslations` + keys from the JSON above):
- `(auth)/sign-in/page.tsx` → `t('auth.signInTitle')`
- `(auth)/sign-up/page.tsx` → `t('auth.signUpTitle')`
- `(app)/dashboard/page.tsx` → `<PageHeader title={t('dashboard.title')} description={t('dashboard.description')} />`
- `(admin)/admin/page.tsx` → `t('admin.title')`
- `(app)/layout.tsx` → `nav.dashboard` link label and `nav.workspace`, brand `common.appName`
- `(admin)/layout.tsx` → `admin.consoleTitle`
- `(marketing)/contact/page.tsx` → `contact.title` (replaced fully in S1-T13)

For **async** server components use `const t = await getTranslations('ns')` from `next-intl/server`.

### 4. Direction helper (RTL-ready) + `<html dir>`

📄 **Create `src/i18n/direction.ts`:**
```ts
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

export function getDirection(locale: string): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}
```
📄 **Create `src/i18n/direction.test.ts`:**
```ts
import { expect, it } from 'vitest';

import { getDirection } from './direction';

it('returns rtl only for right-to-left locales', () => {
  expect(getDirection('ar')).toBe('rtl');
  expect(getDirection('en')).toBe('ltr');
  expect(getDirection('fr')).toBe('ltr');
});
```
📄 **Edit `src/app/[locale]/layout.tsx`:** `import { getDirection } from '@/i18n/direction';` and `<html lang={locale} dir={getDirection(locale)} suppressHydrationWarning>`.

### 5. Locale parity test (full tooling arrives in Sprint 5)

📄 **Create `src/locales/locales.test.ts`:**
```ts
import { expect, it } from 'vitest';

import en from './en.json';
import fr from './fr.json';

function flatten(value: unknown, prefix = ''): string[] {
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

it('has exactly the same keys in every locale', () => {
  expect(flatten(fr).sort()).toEqual(flatten(en).sort());
});
```

### 6. Guide

📄 **Create `docs/guides/i18n.md`:**
````markdown
# Internationalization (next-intl)

- Locales: `en` (default, no URL prefix) and `fr` (`/fr/...`). Config: `src/i18n/routing.ts`.
- Messages: `src/locales/{locale}.json`. Keys are typed — a typo is a TypeScript error.
- **Rule:** no user-facing string in components. Add the key to **both** `en.json` and `fr.json`.
- Server components: `useTranslations()` (sync) or `await getTranslations()` (async).
  Client components: `useTranslations()`.
- Links/navigation: always import `Link`/`usePathname` from `@/i18n/navigation`.
- Dates/numbers: `useFormatter()` / `getFormatter()` — never `toLocaleString()` by hand.
- Every page/layout that renders translations calls `setRequestLocale(locale)` for static rendering.
- Adding a locale: add it to `routing.ts`, create `src/locales/<code>.json`, update `locale.*` labels.
````

### ✅ Verify
```bash
pnpm test               # parity + direction tests
pnpm dev
```
- `/` English, `/fr` French; switcher links keep you on the same page (`/contact` ⇄ `/fr/contact`).
- `<html lang="fr">` on French pages (DevTools → Elements).
- Delete one key from `fr.json` → `pnpm test` fails → restore it.
- Introduce a typo in a `t('nav.hom')` call → `pnpm typecheck` fails → fix it.
```bash
pnpm check
```

**🚢 Ship** — branch `feat/s1-t11-messages` · message: `feat(i18n): add en/fr messages, language switcher and rtl direction helper`

---

## 🎫 S1-T12 — Form components (React Hook Form + Zod + shadcn)

**Branch:** `feat/s1-t12-form-components` · **Story:** US-014 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t12-form-components
mkdir -p src/components/forms src/validations
```
> 🎯 **Design rule:** Zod error messages are **translation keys** (`'validation.email'`), not English sentences. The UI translates them at render time, so one schema serves both languages — and the same schema runs on the server.

> 🔍 These wrappers build on shadcn's `form` primitives (`FormField`, `FormItem`, `FormLabel`, `FormControl`, `useFormField`). If you installed `field` instead, adapt the imports.

### 1. Translated error message

📄 **Create `src/components/forms/field-message.tsx`:**
```tsx
'use client';

import { useTranslations } from 'next-intl';

import { useFormField } from '@/components/ui/form';

/** Renders the field error, translating the Zod message key. Must live inside <FormItem>. */
export function FieldMessage() {
  const t = useTranslations();
  const { error, formMessageId } = useFormField();

  if (!error?.message) return null;

  const key = error.message;
  return (
    <p id={formMessageId} className="text-destructive text-sm">
      {t.has(key as never) ? t(key as never) : t('validation.invalid')}
    </p>
  );
}
```

### 2. Fields

📄 **Create `src/components/forms/text-field.tsx`:**
```tsx
'use client';

import type { ComponentProps } from 'react';
import { useFormContext } from 'react-hook-form';

import { FieldMessage } from '@/components/forms/field-message';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

type TextFieldProps = { name: string; label: string } & Omit<ComponentProps<typeof Input>, 'name'>;

export function TextField({ name, label, ...inputProps }: TextFieldProps) {
  const { control } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...inputProps} {...field} />
          </FormControl>
          <FieldMessage />
        </FormItem>
      )}
    />
  );
}
```

📄 **Create `src/components/forms/textarea-field.tsx`:**
```tsx
'use client';

import type { ComponentProps } from 'react';
import { useFormContext } from 'react-hook-form';

import { FieldMessage } from '@/components/forms/field-message';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

type TextareaFieldProps = { name: string; label: string } & Omit<
  ComponentProps<typeof Textarea>,
  'name'
>;

export function TextareaField({ name, label, ...props }: TextareaFieldProps) {
  const { control } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Textarea {...props} {...field} />
          </FormControl>
          <FieldMessage />
        </FormItem>
      )}
    />
  );
}
```

📄 **Create `src/components/forms/password-field.tsx`:**
```tsx
'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ComponentProps, useState } from 'react';
import { useFormContext } from 'react-hook-form';

import { FieldMessage } from '@/components/forms/field-message';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

type PasswordFieldProps = { name: string; label: string } & Omit<
  ComponentProps<typeof Input>,
  'name' | 'type'
>;

export function PasswordField({ name, label, ...props }: PasswordFieldProps) {
  const t = useTranslations('common');
  const { control } = useFormContext();
  const [visible, setVisible] = useState(false);

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="relative">
            <FormControl>
              <Input {...props} {...field} type={visible ? 'text' : 'password'} className="pe-10" />
            </FormControl>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute inset-y-0 end-0"
              aria-label={visible ? t('hidePassword') : t('showPassword')}
              aria-pressed={visible}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
          <FieldMessage />
        </FormItem>
      )}
    />
  );
}
```

### 3. Submit button and form-level error

📄 **Create `src/components/forms/submit-button.tsx`:**
```tsx
'use client';

import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';

export function SubmitButton({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'type' | 'disabled'>) {
  const {
    formState: { isSubmitting },
  } = useFormContext();

  return (
    <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} {...props}>
      {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}
```

📄 **Create `src/components/forms/form-error.tsx`:**
```tsx
'use client';

import { useTranslations } from 'next-intl';

import { Alert, AlertDescription } from '@/components/ui/alert';

/** Form-level error. `messageKey` is a full key such as "errors.internal". */
export function FormError({ messageKey }: { messageKey?: string | null }) {
  const t = useTranslations();
  if (!messageKey) return null;

  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>
        {t.has(messageKey as never) ? t(messageKey as never) : t('errors.internal')}
      </AlertDescription>
    </Alert>
  );
}
```
> ✅ Accessibility: errors are linked to inputs through shadcn's `aria-describedby`/`aria-invalid`; RHF focuses the first invalid field on submit (`shouldFocusError` default).

### 4. Knip: these files are not used yet

📄 **Edit `knip.config.ts`** — temporarily add to `entry`:
```ts
// TEMP (S1-T12): consumed by the contact form in S1-T13; password-field until Sprint 2
'src/components/forms/**/*.tsx',
```
(In S1-T13 narrow this to `'src/components/forms/password-field.tsx'`.)

### ✅ Verify
```bash
pnpm typecheck && pnpm lint && pnpm knip
```
Behavioural verification happens with the browser tests in S1-T13.

**🚢 Ship** — branch `feat/s1-t12-form-components` · message: `feat(forms): add rhf field components with translated zod errors`

---

## 🎫 S1-T14 — `AppError` hierarchy and error pages *(done before T13)*

**Branch:** `feat/s1-t14-errors` · **Story:** US-015 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t14-errors
mkdir -p src/libs
```

### 1. Error classes

📄 **Create `src/libs/errors.ts`:**
```ts
type AppErrorOptions = {
  code: string;
  httpStatus: number;
  /** Full i18n key (e.g. "errors.notFound") — always safe to show to users. */
  messageKey: string;
  /** Developer-facing detail. Never shown to users unless `expose` is true. */
  message?: string;
  cause?: unknown;
  expose?: boolean;
};

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly messageKey: string;
  readonly expose: boolean;

  constructor({ code, httpStatus, messageKey, message, cause, expose = false }: AppErrorOptions) {
    super(message ?? messageKey, { cause });
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.messageKey = messageKey;
    this.expose = expose;
  }
}

type Init = { message?: string; cause?: unknown };

export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string[]> | undefined;

  constructor(init: Init & { fieldErrors?: Record<string, string[]> } = {}) {
    super({
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
      messageKey: 'errors.validation',
      expose: true,
      message: init.message,
      cause: init.cause,
    });
    this.fieldErrors = init.fieldErrors;
  }
}

export class AuthenticationError extends AppError {
  constructor(init: Init = {}) {
    super({ code: 'UNAUTHENTICATED', httpStatus: 401, messageKey: 'errors.unauthenticated', ...init });
  }
}

export class AuthorizationError extends AppError {
  constructor(init: Init = {}) {
    super({ code: 'FORBIDDEN', httpStatus: 403, messageKey: 'errors.forbidden', ...init });
  }
}

export class NotFoundError extends AppError {
  constructor(init: Init = {}) {
    super({ code: 'NOT_FOUND', httpStatus: 404, messageKey: 'errors.notFound', ...init });
  }
}

export class ConflictError extends AppError {
  constructor(init: Init = {}) {
    super({ code: 'CONFLICT', httpStatus: 409, messageKey: 'errors.conflict', ...init });
  }
}

export class RateLimitError extends AppError {
  constructor(init: Init = {}) {
    super({ code: 'RATE_LIMITED', httpStatus: 429, messageKey: 'errors.rateLimited', ...init });
  }
}

export class ExternalServiceError extends AppError {
  constructor(init: Init = {}) {
    super({ code: 'EXTERNAL_SERVICE', httpStatus: 502, messageKey: 'errors.external', ...init });
  }
}
```

📄 **Create `src/libs/errors.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';

import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors';

describe('AppError hierarchy', () => {
  it.each([
    [new ValidationError(), 400, 'VALIDATION_ERROR', 'errors.validation'],
    [new AuthenticationError(), 401, 'UNAUTHENTICATED', 'errors.unauthenticated'],
    [new AuthorizationError(), 403, 'FORBIDDEN', 'errors.forbidden'],
    [new NotFoundError(), 404, 'NOT_FOUND', 'errors.notFound'],
    [new ConflictError(), 409, 'CONFLICT', 'errors.conflict'],
    [new RateLimitError(), 429, 'RATE_LIMITED', 'errors.rateLimited'],
    [new ExternalServiceError(), 502, 'EXTERNAL_SERVICE', 'errors.external'],
  ])('%o maps to status %i / code %s / key %s', (error, status, code, key) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.httpStatus).toBe(status);
    expect(error.code).toBe(code);
    expect(error.messageKey).toBe(key);
  });

  it('keeps developer detail out of the user-facing key and preserves the cause', () => {
    const cause = new Error('db exploded: password=hunter2');
    const error = new ExternalServiceError({ message: 'Neon timeout', cause });
    expect(error.expose).toBe(false);
    expect(error.messageKey).toBe('errors.external');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('ExternalServiceError');
  });

  it('carries field errors on ValidationError', () => {
    const error = new ValidationError({ fieldErrors: { email: ['validation.email'] } });
    expect(error.fieldErrors?.email).toEqual(['validation.email']);
  });
});
```

### 2. Shared error view

📄 **Create `src/components/layout/error-view.tsx`:**
```tsx
'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

export function ErrorView({ digest, onRetry }: { digest?: string; onRetry?: () => void }) {
  const t = useTranslations('errors');

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      {digest ? (
        <p className="text-muted-foreground text-xs">
          {t('reference')}: {digest}
        </p>
      ) : null}
      {onRetry ? <Button onClick={onRetry}>{t('retry')}</Button> : null}
    </div>
  );
}
```

### 3. Error boundaries and 404

📄 **Create `src/app/[locale]/error.tsx`:**
```tsx
'use client';

import { ErrorView } from '@/components/layout/error-view';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Sprint 6 reports `error` to Sentry here
  return <ErrorView digest={error.digest} onRetry={reset} />;
}
```
📄 **Create `src/app/[locale]/(app)/error.tsx`** — same content (keeps the sidebar visible when a page inside the app fails).

📄 **Create `src/app/[locale]/not-found.tsx`:**
```tsx
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('errors');

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t('notFoundTitle')}</h1>
      <p className="text-muted-foreground">{t('notFoundDescription')}</p>
      <Button asChild>
        <Link href="/">{t('backHome')}</Link>
      </Button>
    </div>
  );
}
```
📄 **Create `src/app/[locale]/[...rest]/page.tsx`** — makes *unknown* URLs render the localized 404:
```tsx
import { notFound } from 'next/navigation';

export default function CatchAllPage() {
  notFound();
}
```
📄 **Create `src/app/not-found.tsx`** — last-resort 404 (outside any locale; has its own `<html>`):
```tsx
import '@/styles/global.css';

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center">
        <h1 className="text-xl font-semibold">404 — Page not found · Page introuvable</h1>
      </body>
    </html>
  );
}
```
📄 **Create `src/app/global-error.tsx`** — crash in the root layout itself (no providers available, so no i18n):
```tsx
'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-semibold">Something went wrong · Une erreur est survenue</h1>
        <button type="button" className="underline" onClick={reset}>
          Try again · Réessayer
        </button>
      </body>
    </html>
  );
}
```
> 🔎 `forbidden.tsx` / `unauthorized.tsx` (Next 16 auth interrupts) are evaluated in Sprint 2 with the session guard.

### ✅ Verify
```bash
pnpm test
```
Browser checks (production build shows real error boundaries; dev mode shows the red overlay instead):
```bash
pnpm build && pnpm start        # tab 1
```
- `/does-not-exist` → localized 404 ("Page not found"); `/fr/nimporte-quoi` → "Page introuvable".
- `/de` → English 404 (the proxy treats `de` as a path, not a locale).
- Temporarily create `src/app/[locale]/(marketing)/boom/page.tsx` with `export default function Boom() { throw new Error('boom'); }` → `/boom` shows the error boundary with a **Try again** button and a **Reference** digest. Delete the file afterwards.
```bash
pnpm check
```

**🚢 Ship** — branch `feat/s1-t14-errors` · message: `feat(errors): add AppError hierarchy, error boundaries and localized 404`

---

## 🎫 S1-T15 — LogTape structured logging *(done before T13)*

**Branch:** `feat/s1-t15-logging` · **Story:** US-016 · **3 SP** · 🔍 read the LogTape docs (APIs below follow the current stable shape)

```bash
git switch main && git pull && git switch -c feat/s1-t15-logging
pnpm add @logtape/logtape
```

### 1. Env

📄 **Edit `src/libs/Env.ts`** — add to `server` and `runtimeEnv`:
```ts
LOG_LEVEL: z.enum(['debug', 'info', 'warning', 'error']).default('info'),
```
```ts
LOG_LEVEL: process.env.LOG_LEVEL,
```
📄 `.env.example`: `LOG_LEVEL=info` · `.env.development`: `LOG_LEVEL=debug`

### 2. Redaction (our own, tiny, fully testable)

📄 **Create `src/libs/logger-redaction.ts`:**
```ts
import type { LogRecord, Sink } from '@logtape/logtape';

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key/i;
export const REDACTED = '[REDACTED]';

/** Deeply masks values whose KEY looks sensitive. Pure → easy to test. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated]';
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));

  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Error)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redactValue(child, depth + 1),
      ]),
    );
  }

  return value;
}

/** Wraps a sink so every record is redacted before it is written anywhere. */
export function withRedaction(sink: Sink): Sink {
  return (record: LogRecord) =>
    sink({ ...record, properties: redactValue(record.properties) as Record<string, unknown> });
}
```
> 🔒 **Logging rule:** always pass data as **properties** (`logger.info('msg', { userId })`), never by string-interpolating secrets into the message — redaction works on property keys.

📄 **Create `src/libs/logger-redaction.test.ts`:**
```ts
import type { LogRecord } from '@logtape/logtape';
import { describe, expect, it, vi } from 'vitest';

import { REDACTED, redactValue, withRedaction } from './logger-redaction';

describe('redactValue', () => {
  it('masks sensitive keys at any depth, case-insensitively', () => {
    const input = {
      user: 'ada',
      Password: 'hunter2',
      nested: { accessToken: 'abc', ok: 1, list: [{ apiKey: 'k', name: 'n' }] },
      headers: { Authorization: 'Bearer x', cookie: 'sid=1' },
    };

    expect(redactValue(input)).toEqual({
      user: 'ada',
      Password: REDACTED,
      nested: { accessToken: REDACTED, ok: 1, list: [{ apiKey: REDACTED, name: 'n' }] },
      headers: { Authorization: REDACTED, cookie: REDACTED },
    });
  });

  it('leaves dates, errors and primitives untouched', () => {
    const date = new Date();
    const error = new Error('x');
    expect(redactValue(date)).toBe(date);
    expect(redactValue(error)).toBe(error);
    expect(redactValue(42)).toBe(42);
  });
});

describe('withRedaction', () => {
  it('passes a redacted copy to the wrapped sink', () => {
    const inner = vi.fn();
    const sink = withRedaction(inner);

    sink({ level: 'info', category: ['app'], message: ['hi'], rawMessage: 'hi', timestamp: 0, properties: { password: 'p', id: 1 } } as LogRecord);

    expect(inner).toHaveBeenCalledOnce();
    expect(inner.mock.calls[0]?.[0].properties).toEqual({ password: REDACTED, id: 1 });
  });
});
```

### 3. The logger

📄 **Create `src/libs/Logger.ts`:**
```ts
import {
  configureSync,
  getAnsiColorFormatter,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger as getBaseLogger,
} from '@logtape/logtape';

import { Env } from '@/libs/Env';
import { withRedaction } from '@/libs/logger-redaction';

type LogCategory = 'app' | 'auth' | 'db' | 'email' | 'security' | 'http';

// Configure ONCE, even with Next.js hot reload / multiple bundles.
const globalForLog = globalThis as unknown as { __logtapeConfigured?: boolean };

if (!globalForLog.__logtapeConfigured) {
  configureSync({
    sinks: {
      console: withRedaction(
        getConsoleSink({
          // Pretty in dev, machine-readable JSON lines in production
          formatter: Env.NODE_ENV === 'production' ? getJsonLinesFormatter() : getAnsiColorFormatter(),
        }),
      ),
    },
    loggers: [
      { category: ['app'], lowestLevel: Env.LOG_LEVEL, sinks: ['console'] },
      { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'] },
    ],
  });
  globalForLog.__logtapeConfigured = true;
}

export function getLogger(category: LogCategory = 'app') {
  return category === 'app' ? getBaseLogger(['app']) : getBaseLogger(['app', category]);
}
```
> 🔍 Function names (`getJsonLinesFormatter`, `getAnsiColorFormatter`, `getConsoleSink`) can differ between LogTape releases (older ones export constants like `jsonLinesFormatter`). Follow the docs for your installed version.

### 4. Keep a single LogTape instance across Next.js bundles

Next.js compiles server code into several bundles (RSC, SSR, actions). If LogTape were bundled into each, only one copy would be configured and logs from the others would vanish. Load it from `node_modules` instead:

📄 **Edit `next.config.ts`:**
```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@logtape/logtape'],
};
```

### 5. Use it in the DB client

📄 **Edit `src/db/client.ts`:**
```ts
import { getLogger } from '@/libs/Logger';

function createPool() {
  const created = new Pool(buildPoolConfig(Env.DATABASE_URL, Env.DB_SERVER_PORT));
  created.on('error', (error) => {
    getLogger('db').error('Unexpected database pool error', { error });
  });
  return created;
}

const pool = globalForDb.__dbPool ?? createPool();
```
(Replace the previous `const pool = …new Pool(…)` line.)

### 6. Document the conventions in `AGENTS.md`
Add under **Conventions**:
```markdown
- Logging: `getLogger('<category>')` from `@/libs/Logger` (categories: app, auth, db, email, security, http).
  Pass data as properties — never interpolate secrets into messages. Never `console.log` in `src/`.
```

### ✅ Verify
```bash
pnpm test                          # redaction tests pass
```
Quick manual proof — temporarily add to `src/app/[locale]/(marketing)/page.tsx` (top of the component):
```ts
import { getLogger } from '@/libs/Logger';
getLogger('app').info('home rendered', { password: 'hunter2', user: 'ada' });
```
```bash
pnpm dev:web          # visit /
# → coloured line in the terminal, password shows [REDACTED]
LOG_LEVEL=error pnpm dev:web      # (cmd.exe: set LOG_LEVEL=error&& pnpm dev:web) → the info line disappears
pnpm build && pnpm start          # production → one JSON line per log
```
Remove the temporary log line, then `pnpm check`.

**🚢 Ship** — branch `feat/s1-t15-logging` · message: `feat(obs): add logtape structured logging with secret redaction`

---

## 🎫 S1-T13 — `createAction`, `ActionResult` and the contact form

**Branch:** `feat/s1-t13-actions-contact` · **Story:** US-014 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s1-t13-actions-contact
mkdir -p src/actions
```

### 1. The action wrapper

📄 **Create `src/utils/action.ts`:**
```ts
import { z } from 'zod';

import { AppError } from '@/libs/errors';
import { getLogger } from '@/libs/Logger';

export type ActionError = {
  code: string;
  /** Full i18n key, e.g. "errors.validation" */
  messageKey: string;
  /** Field → list of i18n keys (Zod messages) */
  fieldErrors?: Record<string, string[]>;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

/**
 * Wraps a server-side handler: validates input with Zod, maps known errors to
 * typed results, logs and hides unknown errors.
 */
export function createAction<S extends z.ZodType, R>(
  schema: S,
  handler: (input: z.output<S>) => Promise<R>,
) {
  return async (raw: unknown): Promise<ActionResult<R>> => {
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      // 🔍 Zod 4: z.flattenError(error). (Zod 3: parsed.error.flatten())
      const { fieldErrors } = z.flattenError(parsed.error);
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          messageKey: 'errors.validation',
          fieldErrors: fieldErrors as Record<string, string[]>,
        },
      };
    }

    try {
      return { ok: true, data: await handler(parsed.data) };
    } catch (error) {
      if (error instanceof AppError) {
        return { ok: false, error: { code: error.code, messageKey: error.messageKey } };
      }

      // Unknown error: log details server-side, return a generic result to the client
      getLogger('app').error('Unhandled error in server action', { error });
      return { ok: false, error: { code: 'INTERNAL', messageKey: 'errors.internal' } };
    }
  };
}
```

📄 **Create `src/utils/action.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConflictError } from '@/libs/errors';

import { createAction } from './action';

const schema = z.object({ email: z.email({ message: 'validation.email' }) });

describe('createAction', () => {
  it('returns data for valid input', async () => {
    const action = createAction(schema, async ({ email }) => ({ echoed: email }));
    expect(await action({ email: 'a@b.co' })).toEqual({ ok: true, data: { echoed: 'a@b.co' } });
  });

  it('returns translated-key field errors for invalid input and never runs the handler', async () => {
    let called = false;
    const action = createAction(schema, async () => {
      called = true;
    });

    const result = await action({ email: 'nope' });

    expect(called).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR', fieldErrors: { email: ['validation.email'] } },
    });
  });

  it('maps AppError to its code and message key', async () => {
    const action = createAction(schema, async () => {
      throw new ConflictError();
    });
    expect(await action({ email: 'a@b.co' })).toEqual({
      ok: false,
      error: { code: 'CONFLICT', messageKey: 'errors.conflict' },
    });
  });

  it('hides unknown errors behind INTERNAL', async () => {
    const action = createAction(schema, async () => {
      throw new Error('secret db detail');
    });
    const result = await action({ email: 'a@b.co' });

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL', messageKey: 'errors.internal' },
    });
    expect(JSON.stringify(result)).not.toContain('secret db detail');
  });
});
```

### 2. Shared schema (client **and** server)

📄 **Create `src/validations/contact.ts`:**
```ts
import { z } from 'zod';

// Messages are i18n KEYS (see src/locales/*.json → "validation")
export const contactSchema = z.object({
  name: z.string().trim().min(2, { message: 'validation.nameMin' }),
  email: z.email({ message: 'validation.email' }),
  message: z
    .string()
    .trim()
    .min(10, { message: 'validation.messageMin' })
    .max(1000, { message: 'validation.messageMax' }),
});

export type ContactInput = z.infer<typeof contactSchema>;
```

### 3. The Server Action

📄 **Create `src/actions/contact.ts`:**
```ts
'use server';

import { getLogger } from '@/libs/Logger';
import { createAction } from '@/utils/action';
import { contactSchema } from '@/validations/contact';

const handleContact = createAction(contactSchema, async (input) => {
  // Sprint 7 sends this through the EmailTransport; for now we only log metadata (no PII)
  getLogger('app').info('Contact form received', { messageLength: input.message.length });
  return { received: true as const };
});

// A 'use server' file may only export async functions
export async function submitContact(input: unknown) {
  return handleContact(input);
}
```

### 4. The form

📄 **Create `src/components/forms/contact-form.tsx`:**
```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { submitContact } from '@/actions/contact';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextareaField } from '@/components/forms/textarea-field';
import { TextField } from '@/components/forms/text-field';
import { Form } from '@/components/ui/form';
import { type ContactInput, contactSchema } from '@/validations/contact';

export function ContactForm() {
  const t = useTranslations('contact');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', message: '' },
  });

  async function onSubmit(values: ContactInput) {
    setFormError(null);
    const result = await submitContact(values);

    if (result.ok) {
      toast.success(t('success'));
      form.reset();
      return;
    }

    // Server-side validation errors → show them under the matching fields
    if (result.error.fieldErrors) {
      for (const [name, keys] of Object.entries(result.error.fieldErrors)) {
        const key = keys[0];
        if (key) form.setError(name as keyof ContactInput, { message: key });
      }
      return;
    }

    setFormError(result.error.messageKey);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="name" label={t('name')} autoComplete="name" />
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <TextareaField name="message" label={t('message')} rows={5} />
        <SubmitButton>{t('send')}</SubmitButton>
      </form>
    </Form>
  );
}
```
Narrow the temporary Knip entry from S1-T12 in `knip.config.ts`:
```ts
// password-field is used from Sprint 2
'src/components/forms/password-field.tsx',
```

### 5. The page

📄 **Rewrite `src/app/[locale]/(marketing)/contact/page.tsx`:**
```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ContactForm } from '@/components/forms/contact-form';
import { PageHeader } from '@/components/layout/page-header';

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('contact');

  return (
    <section className="mx-auto max-w-xl px-4 py-16">
      <PageHeader title={t('title')} description={t('description')} />
      <ContactForm />
    </section>
  );
}
```

### 6. Component tests (browser mode)

📄 **Create `tests/utils/render.tsx`:**
```tsx
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { render } from 'vitest-browser-react';

import messages from '@/locales/en.json';

/** Renders a component with the English messages available. */
export function renderWithIntl(ui: ReactNode) {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}
```
📄 **Create `src/components/forms/contact-form.test.tsx`:**
```tsx
import { beforeEach, expect, test, vi } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';

import { ContactForm } from './contact-form';

const submitContact = vi.hoisted(() => vi.fn());
vi.mock('@/actions/contact', () => ({ submitContact }));

beforeEach(() => {
  submitContact.mockReset();
});

test('shows translated validation errors and does not call the action', async () => {
  const screen = await renderWithIntl(<ContactForm />);

  await screen.getByRole('button', { name: 'Send message' }).click();

  await expect.element(screen.getByText('Name must be at least 2 characters')).toBeVisible();
  await expect.element(screen.getByText('Enter a valid email address')).toBeVisible();
  expect(submitContact).not.toHaveBeenCalled();
});

test('submits valid data to the server action', async () => {
  submitContact.mockResolvedValue({ ok: true, data: { received: true } });
  const screen = await renderWithIntl(<ContactForm />);

  await screen.getByLabelText('Name').fill('Ada Lovelace');
  await screen.getByLabelText('Email').fill('ada@example.com');
  await screen.getByLabelText('Message').fill('Hello there, this is a test.');
  await screen.getByRole('button', { name: 'Send message' }).click();

  await vi.waitFor(() =>
    expect(submitContact).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'Hello there, this is a test.',
    }),
  );
});

test('displays server-side field errors returned by the action', async () => {
  submitContact.mockResolvedValue({
    ok: false,
    error: {
      code: 'VALIDATION_ERROR',
      messageKey: 'errors.validation',
      fieldErrors: { email: ['validation.email'] },
    },
  });
  const screen = await renderWithIntl(<ContactForm />);

  await screen.getByLabelText('Name').fill('Ada Lovelace');
  await screen.getByLabelText('Email').fill('ada@example.com');
  await screen.getByLabelText('Message').fill('Hello there, this is a test.');
  await screen.getByRole('button', { name: 'Send message' }).click();

  await expect.element(screen.getByText('Enter a valid email address')).toBeVisible();
});
```

### ✅ Verify
```bash
pnpm test && pnpm test:browser
pnpm dev
```
On `/contact` and `/fr/contact`:
1. Submit empty → red messages in the right language; focus jumps to the first invalid field.
2. Type an invalid email → message under the email field only.
3. Fill valid data → button shows a spinner and is disabled while pending → toast "Thanks!" and the form resets.
4. The terminal shows `Contact form received` (no name/email/message content).
```bash
pnpm check
```

**🚢 Ship** — branch `feat/s1-t13-actions-contact` · message: `feat(forms): add createAction wrapper, contact form and component tests`

---

## 🎫 S1-T16 — Playwright setup and smoke tests

**Branch:** `test/s1-t16-playwright` · **Story:** US-017 · **3 SP**

```bash
git switch main && git pull && git switch -c test/s1-t16-playwright
pnpm add -D @playwright/test
pnpm exec playwright install chromium     # already done in Sprint 0 for Vitest; harmless to repeat
mkdir -p e2e
```

### 1. Config

📄 **Create `playwright.config.ts`:**
```ts
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI tests the PRODUCTION build; locally we reuse your running dev server (or start one)
    command: isCI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
```
📄 **Edit `package.json`** `scripts`:
```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
  }
}
```
> 🔎 Vitest only includes `src/**` and `tests/**`, Playwright only `e2e/` — they never run each other's files.

### 2. Smoke specs

📄 **Create `e2e/smoke.spec.ts`:**
```ts
import { expect, test } from '@playwright/test';

test('home page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SaaS Boilerplate/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ship your SaaS faster');
});

test('language switcher moves to French and keeps the page', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('link', { name: 'Français' }).click();

  await expect(page).toHaveURL(/\/fr\/contact$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nous contacter');
});

test('theme choice persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('unknown routes show a localized 404', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  await page.goto('/fr/nimporte-quoi');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
});

test('contact form validates input', async ({ page }) => {
  await page.goto('/contact');
  await page.getByRole('button', { name: 'Send message' }).click();

  await expect(page.getByText('Name must be at least 2 characters')).toBeVisible();
  await expect(page.getByText('Enter a valid email address')).toBeVisible();
});
```

### 3. Add the E2E job to CI

📄 **Edit `.github/workflows/ci.yml`** — append a job (keep the others):
```yaml
  e2e:
    name: E2E
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: |
            playwright-report
            test-results
          retention-days: 7
```
> 🔎 In CI, `pnpm start` serves the production build and needs **no database** yet (nothing reads it at runtime). The `NEXT_PUBLIC_*` values come from the workflow-level `env:` block set in Sprint 0.

### ✅ Verify
```bash
pnpm e2e                # starts `pnpm dev` automatically; 5 specs pass
pnpm e2e:ui             # explore interactively; Ctrl+C when done
```
Sabotage: change the expected French heading to `'Contactez'` → spec fails with a trace → revert.

After the PR is open, add the **`E2E`** check to the required checks of the `main` ruleset (GitHub → Settings → Branches/Rules).

🪟 On Windows, if `pnpm e2e` hangs on the web server: stop any `pnpm dev` already running on port 3000 (`netstat -ano | findstr :3000` → `taskkill /PID <pid> /F`), or leave your dev server running — `reuseExistingServer` will use it.

**🚢 Ship** — branch `test/s1-t16-playwright` · message: `test(e2e): add playwright smoke suite and ci job`

---

## 🧾 Sprint 1 wrap-up

**Branch:** `docs/s1-wrap-up`
```bash
git switch main && git pull && git switch -c docs/s1-wrap-up
```

### 1. Update `AGENTS.md`
**Commands** — add:
```markdown
- `pnpm dev` — starts the embedded PGlite database AND Next.js (`pnpm dev:web` = Next only)
- `pnpm db:generate` / `db:migrate` / `db:reset` / `db:seed` / `db:studio` / `db:check` — Drizzle workflow
- `pnpm e2e` — Playwright tests; `pnpm pin` — pin dependency versions exactly
```
**Structure** — add:
```markdown
src/db/        schema, client, seed (migrations in drizzle/)   src/i18n/     next-intl routing/navigation
src/actions/   Server Actions ('use server')                   src/validations/  Zod schemas shared client/server
src/locales/   en.json, fr.json (add keys to BOTH)             scripts/      Node scripts (db, checks)
```
**Conventions** — add:
```markdown
- User-facing strings: always via next-intl (`useTranslations`/`getTranslations`); Zod messages are i18n keys.
- Mutations: Server Action built with `createAction(schema, handler)` returning `ActionResult<T>`; throw `AppError` subclasses.
- Database changes: edit `src/db/schema/*` → `pnpm db:generate` → commit the SQL in `drizzle/`. Never edit generated SQL by hand.
- Internal links: `Link` from `@/i18n/navigation`, never `next/link`.
```
```bash
pnpm check:agents        # every command mentioned must exist
```

### 2. Update `docs/roadmap/06-project-state.md`
- **Last completed sprint:** Sprint 1 · **Current sprint:** Sprint 2
- **What exists:** DB layer (Drizzle, PGlite dev server, pool config), `app_meta` table (removed in Sprint 2), route groups, theme, shadcn set, next-intl (`en`, `fr`), form components, `createAction`, `AppError`, LogTape, Playwright smoke tests
- **Commands:** the new scripts above
- **Env vars:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DB_SERVER_PORT`, `LOG_LEVEL`
- **Migrations:** `0000_…` (app_meta) · **Tables:** `app_meta`
- **Routes:** `/`, `/contact`, `/sign-in`, `/sign-up`, `/dashboard`, `/admin` (+ `/fr/…`)
- **Measured:** `createTestDb` duration, PGlite concurrent-connection result (R-02), CI duration
- **Deviations:** `pg` driver for every environment (no Neon-specific driver); DB port 5433; routes built before `[locale]` then moved; ticket order changed (T04→T03, T14/T15→T13); no `NEXT_PUBLIC_DEFAULT_LOCALE` (routing config is the single source of truth); `db:reset` also seeds

### 3. Tick the checkboxes in `docs/roadmap/sprint-01-data-shell-i18n.md`, then ship
```bash
pnpm check
git add -A
git commit -m "docs: update agent instructions and project state for sprint 1"
git push -u origin docs/s1-wrap-up
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
git tag -a v0.0.2 -m "chore: sprint 1 complete"
git push origin v0.0.2
```

---

## 🏁 Sprint 1 — Definition of Done

Prove it on a **fresh clone**:
```bash
cd "$TEMP" && git clone git@github.com:OWNER/saas-boilerplate.git s1-check && cd s1-check
corepack enable && pnpm install
pnpm dev                 # DB + app, zero external services
```
(🪟 cmd.exe: `cd %TEMP%`)

- [ ] `pnpm dev` works on a clean clone with **zero** external services
- [ ] `pnpm db:reset` → migrations + seed OK; Studio shows `app_meta`
- [ ] Setting `DATABASE_URL_UNPOOLED` to a Neon URL + `pnpm db:migrate` works (or documented as deferred to Sprint 8)
- [ ] `/` renders English, `/fr` French; the switcher keeps you on the same page; `<html lang>` correct
- [ ] Theme persists on reload, no flash
- [ ] Contact form: translated client **and** server validation, spinner while pending, toast on success
- [ ] Unknown route → localized 404; a thrown error → error boundary with retry
- [ ] Logs are structured, secrets show `[REDACTED]`, `LOG_LEVEL` works
- [ ] `pnpm test` (incl. DB, errors, action, redaction, locale parity) · `pnpm test:browser` · `pnpm e2e` all green
- [ ] CI has 5 green jobs (Quality, Tests, Build, Commit messages, E2E); `E2E` is a required check
- [ ] No hard-coded user-facing strings outside `src/locales`
- [ ] `docs/guides/database.md` and `docs/guides/i18n.md` exist
- [ ] `06-project-state.md` updated; tag `v0.0.2` pushed

```bash
git log --first-parent --oneline     # one merge per ticket, 16 + wrap-up
```

### 🎬 Sprint review — measurable acceptance

| Check | Expected |
|---|---|
| `pnpm db:reset && pnpm dev` | app + DB up; Studio lists tables |
| Visit `/`, `/fr` | content in the right language; switcher preserves the path |
| Toggle theme, reload | persisted, no flash |
| Submit invalid contact form | localized field errors; valid → toast |
| Open a missing URL | localized 404 |
| Throw in a page (prod build) | error boundary with **Try again** |
| Log with `{ password }` | shows `[REDACTED]` |
| `pnpm e2e` | 5 specs green |

---

## 🧯 Troubleshooting (Sprint 1)

| Symptom | Likely cause → fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:5433` | DB server not running → `pnpm dev` (or `pnpm db:server`) |
| `EADDRINUSE` on 5433 | Old db process alive → `netstat -ano \| findstr :5433` then `taskkill /PID <pid> /F`, or change `DB_SERVER_PORT` |
| Studio/`db:ping` hang while the app runs | PGlite serves one connection at a time → stop the app briefly, or use the Docker fallback in `docs/guides/database.md` |
| 🪟 `local.db` corrupted after force-kill | Stop everything, delete the `local.db` folder, run `pnpm dev` then `pnpm db:seed` |
| 🪟 PGlite slow/locked | Repo is inside OneDrive or being scanned by antivirus → move to `C:\dev`, exclude from scanning |
| 🪟 `bash: syntax error near unexpected token '('` | Unquoted `(group)` or `[locale]` path → wrap the path in double quotes |
| `drizzle-kit check` fails in CI/locally | Schema changed without a migration → `pnpm db:generate` and commit the SQL |
| `Cannot find module '@next/env'` in scripts | `pnpm add -D @next/env` (S1-T01) |
| `Invalid environment variables` when running a script | Script imported app code before `./_env` → make `import './_env'` the **first** import |
| next-intl: "Unable to find `next-intl` locale" | `src/i18n/request.ts` path wrong in `createNextIntlPlugin(...)`, or `proxy.ts` matcher excludes the route |
| TS error on `t('some.key')` | Key missing in `en.json` (types come from it) — add it to **both** locale files |
| `/fr` works but links lose the prefix | A component still imports `next/link` → use `@/i18n/navigation` |
| Knip: unused file/export after a ticket | Wire it into code, delete it, or add a **commented** `entry`/`ignore` in `knip.config.ts` |
| No logs appear in the terminal | LogTape bundled twice → keep `serverExternalPackages: ['@logtape/logtape']`; check `LOG_LEVEL` |
| Browser tests: provider/`render` API errors | Vitest browser APIs changed → follow the current docs, record the deviation in `06-project-state.md` |
| Playwright can't find "Toggle theme" | Strings changed in `en.json` → update the spec or the message, never both silently |

---

## ➡️ Next

Sprint 1 complete → continue with **Sprint 2 — Authentication core (Better Auth)** (`docs/roadmap/sprint-02-auth-core.md`). Same format: one branch per ticket, verify, PR, merge.
