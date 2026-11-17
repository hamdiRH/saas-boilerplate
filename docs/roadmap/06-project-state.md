# Project state

Update this file at the end of every sprint. It is the first file an agent or a new developer reads.

## Sprint 1 — completed

- **Last completed sprint:** Sprint 1 · **Current sprint:** Sprint 2
- **What exists:** DB layer (Drizzle, PGlite dev server, pool config), `app_meta` table (removed in Sprint 2), route groups, theme, shadcn set, next-intl (en, fr), form components, `createAction`, `AppError`, LogTape, Playwright smoke tests
- **Env vars:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DB_SERVER_PORT`, `LOG_LEVEL`
- **Migrations:** `0000_…` (`app_meta`) · **Tables:** `app_meta`
- **Routes:** `/`, `/contact`, `/sign-in`, `/sign-up`, `/dashboard`, `/admin` (+ `/fr/…`)
- **Measured:** `createTestDb` duration, PGlite concurrent-connection result (R-02), CI duration
- **Deviations:** `pg` driver for every environment (no Neon-specific driver); DB port 5433; routes built before `[locale]` then moved; ticket order changed (T04→T03, T14/T15→T13); no `NEXT_PUBLIC_DEFAULT_LOCALE` (routing config is the single source of truth); `db:reset` also seeds

## Sprint 2 — completed

- **Last completed sprint:** Sprint 2 · **Current sprint:** Sprint 3
- **Tables:** `user`, `session`, `account`, `verification`, `rate_limit` (migrations `0001_…`)
- **Env vars:** `BETTER_AUTH_SECRET`, `EMAIL_FROM`, `RESEND_API_KEY`, `EMAIL_TRANSPORT`, `AUTH_RATE_LIMIT`
- **Routes:** `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password`, `/dashboard`, `/dashboard/account/profile`, `/dashboard/account/security`, `/api/auth/*`
- **Helpers:** `requireSession`, `requireGuest`, `getSessionOrThrow`, `withAuth`, `sendEmail`, `runInBackground`, `createAuth(db)`, `sanitizeCallbackUrl`, `applyActionError`
- **Demo user:** `demo@example.com` / `Demo-Password-123` (seed, local database only)
- **Deviations:** no `BETTER_AUTH_URL`; no dev-email HTTP route (E2E reads `.emails/`); `sendOnSignIn: false` with explicit resend; DAL disables cookie cache; reordered tickets; Better Auth option names verified/changed (see the auth guide)
- **Measured:** CI duration, E2E duration

## Post-Sprint-2 audit fixes (`fix/audit-sprint-2`)

- New env vars: `AUTH_IP_HEADER` (trusted client-IP header for rate limiting), `ALLOW_LOCAL_SERVICES` (CI/e2e only)
- In production, `DATABASE_URL` is required and `EMAIL_TRANSPORT` may not be `console` or `memory`
- `db:seed` refuses any non-local database
- `/admin` now calls `requireSession()`; the guard-coverage test covers `(admin)` as well as `(app)`
- Server Actions can run a `guard` before input validation (`createAction(schema, handler, { guard })`)
- `rate_limit.key` has a unique index (migrations `0002_dedupe_rate_limit`, `0003_…`)
- `pnpm db:cleanup` purges expired sessions, verification tokens and stale rate-limit rows
- Baseline security headers (`src/libs/security-headers.ts`); Geist fonts are self-hosted (`geist` package)
- CI runs unit tests and `db:check`; `.github/workflows/security.yml` adds dependency audit, dependency review and CodeQL
- Dependencies are pinned exactly; `@types/node` follows the Node 22 engine
