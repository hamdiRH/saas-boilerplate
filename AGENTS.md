# AGENTS.md

Instructions for AI coding agents working in this repository. Humans: see `README.md` and `docs/guides/`.

## Project

SaaS boilerplate — Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui. The delivery plan lives in `docs/roadmap/`. Current state: `docs/roadmap/06-project-state.md`.

## Commands (pnpm only — never npm/yarn)

- `pnpm dev` — dev server
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm typecheck` — TypeScript, must be 0 errors
- `pnpm lint` / `pnpm lint:fix` — Oxlint (Ultracite preset)
- `pnpm format` / `pnpm format:check` — Oxfmt
- `pnpm knip` — unused files/exports/dependencies
- `pnpm test` — unit tests; `pnpm test:browser` — component tests; `pnpm test:coverage`
- `pnpm check` — runs everything above; **run before declaring any task done**
- `pnpm commit` — interactive conventional commit

## Structure

```text
src/app/          routes (App Router)         src/components/ui/  shadcn primitives (don't edit by hand)
src/components/   app components              src/libs/           integrations & Env.ts
src/utils/        pure helpers                src/styles/         global.css, theme
tests/            test setup & utils          e2e/                Playwright (from Sprint 1)
docs/roadmap/     plan, sprints, state        docs/adr/           architecture decisions
```

## Conventions

- TypeScript strict. **No `any`**, no `@ts-ignore` (use `@ts-expect-error` with a reason + a TD item).
- Use `import type` for type-only imports. Use the `@/` alias for `src/` imports.
- Server Components by default; add `"use client"` only when interactivity requires it.
- Named exports (default exports only where Next.js requires them: pages, layouts, route files).
- No business logic inside components; put it in `src/services/` and data access in `src/data/` (when they exist).
- Reuse shadcn primitives; compose classes with `cn()` from `@/utils/cn`.
- `package.json` scripts and tooling must be **cross-platform** (the team develops on Windows, CI runs Linux): use `cross-env` for env vars; never `rm -rf`, `cp`, `VAR=x cmd`; prefer small Node scripts in `scripts/`.
- Files use LF line endings (`.gitattributes`, `.editorconfig`).

## Environment variables

- **Never read `process.env` outside `src/libs/Env.ts`** (enforced by `pnpm check:env`).
- New var → add to the schema in `Env.ts` **and** `.env.example`.
- Never commit secrets. `.env.local` is git-ignored.

## Testing

- New logic ⇒ unit test. New client component ⇒ browser-mode test. New user flow ⇒ E2E (once Playwright exists).
- Tests must be deterministic: no arbitrary sleeps, no real network.

## Git

- One ticket = one branch = one merge into `main` after verification.
- Conventional commits: `type(scope): subject`. Hooks enforce this.
- Never use `--no-verify` or `LEFTHOOK=0` unless the human asks.

## Ask first (do not do without explicit approval)

- Adding a dependency, changing database schema, changing authentication/authorization code, changing CI/release workflows, or deleting files outside the task's scope.

## Security

- Authorization is enforced **server-side** in the data-access layer; `proxy.ts` is only an optimistic redirect.
- Tenant data is accessed only through `tenantDb` helpers (from Sprint 4).
- Validate all external input with Zod. Never log secrets, tokens, or passwords.

## Definition of done

See `docs/roadmap/README.md` §3. In short: `pnpm check` is green, tests added, docs updated.

## Workflow for roadmap tasks

1. Read the sprint file in `docs/roadmap/` and `06-project-state.md`.
2. Implement tasks in listed order; tick checkboxes as you go.
3. Do not redesign the plan; if something is impossible, stop and propose an ADR in `docs/adr/`.

- Logging: `getLogger('<category>')` from `@/libs/Logger` (categories: app, auth, db, email, security, http). Pass data as properties — never interpolate secrets into messages. Never `console.log` in `src/`.

## Commands

- `dev` — starts the embedded PGlite database AND Next.js (`pnpm dev:web` = Next only)
- `db:generate` / `db:migrate` / `db:reset` / `db:seed` / `db:studio` / `db:check` — Drizzle workflow
- `e2e` — Playwright tests; `pin` — pin dependency versions exactly

## Structure

src/db/ schema, client, seed (migrations in drizzle/) src/i18n/ next-intl routing/navigation src/actions/ Server Actions ('use server') src/validations/ Zod schemas shared client/server src/locales/ en.json, fr.json (add keys to BOTH) scripts/ Node scripts (db, checks)

## Conventions

- User-facing strings: always via next-intl (`useTranslations`/`getTranslations`); Zod messages are i18n keys.
- Mutations: Server Action built with `createAction(schema, handler)` returning `ActionResult<T>`; throw `AppError` subclasses.
- Database changes: edit `src/db/schema/*` → `pnpm db:generate` → commit the SQL in `drizzle/`. Never edit generated SQL by hand.
- Internal links: `Link` from `@/i18n/navigation`, never `next/link`.
