# Database

## Environments

| Env | Database | Connection |
| --- | --- | --- |
| Local dev | PGlite (embedded Postgres) served by `pnpm db:server` on port 5433 | `DATABASE_URL` empty |
| Tests | PGlite in memory, one per test file | `tests/utils/test-db.ts` |
| Production / previews | Neon | `DATABASE_URL` = **pooled** URL; `DATABASE_URL_UNPOOLED` = **direct** URL (migrations) |

## Neon connection strings

- Runtime (serverless functions): the **pooled** host (contains `-pooler`) with `?sslmode=require`.
- Migrations: the **direct** host — pooled connections are not suitable for DDL.

## Local database (PGlite)

`pnpm dev` runs two processes: the embedded Postgres (`pnpm db:server`, port 5433) and Next.js. Data lives in `./local.db` (git-ignored). Reset with `pnpm db:reset`.

Run the pieces separately when debugging: `pnpm db:server` in one tab, `pnpm dev:web` in another.

### Known limits

- PGlite serves **one connection at a time**. The app pool is capped at 1 short-lived connection so `pnpm db:studio` and scripts can connect while the app is idle.
- If you see `ECONNREFUSED`, the db server isn't running.
- If `local.db` is corrupted (e.g. the process was force-killed) delete the folder and restart.

### Fallback: Docker Postgres

If PGlite misbehaves on your machine:

```bash
docker run --name saas-pg -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:17
```

and set `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` in `.env.local` (skip `pnpm db:server`; use `pnpm dev:web`).
