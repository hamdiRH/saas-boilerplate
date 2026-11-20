# AGENTS.md

Instructions for AI coding agents working in this repository. Humans: see `README.md` `docs` and `docs/guides/`.

## Project

SaaS boilerplate — Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui. The delivery plan lives in `docs/roadmap/`. Current state: `docs/roadmap/06-project-state.md`.

## Commands (pnpm only — never npm/yarn)

- `pnpm dev` — starts the embedded PGlite database AND Next.js (`pnpm dev:web` = Next only)
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm typecheck` — TypeScript, must be 0 errors
- `pnpm lint` / `pnpm lint:fix` — Oxlint (Ultracite preset)
- `pnpm format` / `pnpm format:check` — Oxfmt
- `pnpm knip` — unused files/exports/dependencies
- `pnpm test` — unit tests; `pnpm test:browser` — component tests; `pnpm test:coverage`
- `pnpm e2e` — Playwright tests
- `pnpm check` — runs everything above; **run before declaring any task done**
- `pnpm commit` — interactive conventional commit
- `pnpm db:cleanup` (purge expired sessions/tokens/rate limits) / `db:generate` / `db:migrate` / `db:reset` / `db:seed` / `db:studio` / `db:check` — Drizzle workflow (`db:seed` and `db:reset` only touch local databases)
- `pnpm setup:env` — generates `.env.local` with a random `BETTER_AUTH_SECRET`
- `pnpm auth:schema` — regenerate the Better Auth schema reference after plugin changes
- `pnpm email:dev` — preview email templates
- `pnpm pin` — pin dependency versions exactly

## Structure

```text
src/app/          routes (App Router)         src/components/ui/  shadcn primitives (don't edit by hand)
src/components/   app components              src/libs/           integrations & env.ts
src/utils/        pure helpers                src/styles/         global.css, theme
src/db/           schema, client, seed        drizzle/            generated SQL migrations
src/i18n/         next-intl routing/nav       src/locales/        en.json, fr.json (add keys to BOTH)
src/actions/      Server Actions ('use server' only — no components)
src/validations/  Zod schemas shared client/server
src/data/         data-access layer: session guards (requireSession, withAuth), tenant helpers later
src/hooks/        client hooks                src/templates/emails/  React Email templates
src/libs/email/   email transports           scripts/            Node scripts (db, checks)
tests/            test setup & utils          e2e/                Playwright
docs/roadmap/     plan, sprints, state        docs/adr/           architecture decisions
```

Auth: `src/libs/auth.ts` is server-only; `src/libs/auth-client.ts` is for the browser.

## Conventions

- TypeScript strict. **No `any`**, no `@ts-ignore` (use `@ts-expect-error` with a reason + a TD item).
- Use `import type` for type-only imports. Use the `@/` alias for `src/` imports.
- Server Components by default; add `"use client"` only when interactivity requires it.
- Named exports (default exports only where Next.js requires them: pages, layouts, route files).
- No business logic inside components; put it in `src/services/` and data access in `src/data/` (when they exist).
- Reuse shadcn primitives; compose classes with `cn()` from `@/utils/cn`. Never nest a link inside a `Button`: style the `Link` with `buttonVariants()`.
- User-facing strings: always via next-intl (`useTranslations`/`getTranslations`); Zod messages are i18n keys.
- Mutations: Server Action built with `createAction(schema, handler, { guard })` returning `ActionResult<T>`; throw `AppError` subclasses. Authenticated actions pass `guard: getSessionOrThrow` so the session is checked **before** input validation.
- Database changes: edit `src/db/schema/*` → `pnpm db:generate` → commit the SQL in `drizzle/`. Never edit generated SQL by hand.
- Internal links: `Link` from `@/i18n/navigation`, never `next/link`.
- `package.json` scripts and tooling must be **cross-platform** (the team develops on Windows, CI runs Linux): use `cross-env` for env vars; never `rm -rf`, `cp`, `VAR=x cmd`; prefer small Node scripts in `scripts/`. File names are **case-sensitive on Linux**: match the real casing in imports and scripts.
- Files use LF line endings (`.gitattributes`, `.editorconfig`).
- Logging: `getLogger('<category>')` from `@/libs/logger` (categories: app, auth, db, email, security, http). Pass data as properties — never interpolate secrets into messages. Never `console.log` in `src/`.

## Environment variables

- **Never read `process.env` outside `src/libs/env.ts`** (enforced by `pnpm check:env`).
- New var → add to the schema in `src/libs/env.ts` **and** `.env.example`.
- Never commit secrets. `.env.local` is git-ignored.
- `ALLOW_LOCAL_SERVICES` exists for CI/e2e only. Never set it on a real deployment.

## Testing

- New logic ⇒ unit test. New client component ⇒ browser-mode test. New user flow ⇒ E2E.
- Tests must be deterministic: no arbitrary sleeps, no real network.
- Never call recursive `mkdirSync` on `/proc` or similar special paths (Node loops forever on Linux). To force a filesystem error, use a regular file as a path segment.

## Git

- One ticket = one branch = one merge into `main` after verification.
- Conventional commits: `type(scope): subject`. Hooks enforce this; allowed scopes: deps, auth, db, i18n, ui, ci, docs, tests, config, org, admin, seo, obs, sec.
- Never use `--no-verify` or `LEFTHOOK=0` unless the human asks.

## Ask first (do not do without explicit approval)

- Adding a dependency, changing database schema, changing authentication/authorization code, changing CI/release workflows, or deleting files outside the task's scope.

## Security

- Authorization is enforced **server-side** in the data-access layer; `proxy.ts` is only an optimistic redirect.
- Tenant data is accessed only through `tenantDb` helpers (from Sprint 4).
- Validate all external input with Zod. Never log secrets, tokens, or passwords.
- EVERY `page.tsx` under `src/app/[locale]/(app)` **and** `(admin)` calls `requireSession()`; Server Actions use `withAuth()`. A layout is never a guard (enforced by `src/data/guard-coverage.test.ts`).
- Never import `@/libs/auth` in client code — use `@/libs/auth-client`. Never read tokens/hashes in components.
- Post-login redirects go through `sanitizeCallbackUrl`. Auth errors shown to users stay generic.

## Definition of done

See `docs/roadmap/README.md` §3. In short: `pnpm check` is green, tests added, docs updated.

## Workflow for roadmap tasks

1. Read the sprint file in `docs/roadmap/` and `06-project-state.md`.
2. Implement tasks in listed order; tick checkboxes as you go.
3. Do not redesign the plan; if something is impossible, stop and propose an ADR in `docs/adr/`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
