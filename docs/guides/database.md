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
