# 🎓 SaaS Boilerplate — Tutorial index

Step-by-step build of the Next.js 16 SaaS boilerplate described in `docs/roadmap/`. One tutorial per sprint, in order. Each ticket is one git branch → verify → pull request → merge. Windows (Cmder / Git Bash) and **pnpm** throughout.

> ⚠️ **Read this first.** These tutorials were written, not executed. Code and commands are carefully reasoned but **untested end to end**; places where an API, flag or file name may differ in your installed versions are marked **🔍 Verify against docs**. Treat the _tests and verification steps_ as the source of truth: when a step and reality disagree, make the test pass for the behaviour described, and update the tutorial.

| # | Tutorial | Theme | Tickets | Ends with |
| --- | --- | --- | --- | --- |
| 0 | [sprint-00-tutorial.md](sprint-00-tutorial.md) | Foundation: scaffold, strict TS, Tailwind, shadcn, T3 Env, lint/format, hooks, Vitest, CI | 15 | tag `v0.0.1` |
| 1 | [sprint-01-tutorial.md](sprint-01-tutorial.md) | Data layer (Drizzle, PGlite/Neon), app shell, i18n, forms, errors, logging, first E2E | 16 | tag `v0.0.2` |
| 2 | [sprint-02-tutorial.md](sprint-02-tutorial.md) | Auth core: email, Better Auth, sessions, DAL, account pages, rate limits | 16 | tag `v0.1.0-alpha` |
| 3 | [sprint-03-tutorial.md](sprint-03-tutorial.md) | Advanced auth: magic link, social, passkeys, TOTP, re-authentication | 13 | tag `v0.2.0-alpha` |
| 4 | [sprint-04-tutorial.md](sprint-04-tutorial.md) | Multi-tenancy, RBAC, tenant-scoped data, admin, impersonation, audit | 16 | tag `v0.5.0` (MVP) |
| 5 | [sprint-05-tutorial.md](sprint-05-tutorial.md) | Quality: Storybook, personas, visual regression, coverage, parallel CI, security tests | 13 | tag `v0.5.1` |
| 6 | [sprint-06-tutorial.md](sprint-06-tutorial.md) | Observability, security, analytics: Sentry, logs, request ids, Arcjet, CSP, consent, PostHog | 14 | tag `v0.6.0` |
| 7 | [sprint-07-tutorial.md](sprint-07-tutorial.md) | SEO, marketing, Crowdin, performance, accessibility, RTL, theme | 13 | tag `v0.8.0-beta` |
| 8 | [sprint-08-tutorial.md](sprint-08-tutorial.md) | Release automation, docs, deployment pipeline, governance, init/strip tools, audit, launch | 14 | **`v1.0.0`** (via Semantic Release) |

## Conventions used in every tutorial

- 📄 file to create/edit · ✅ **Verify** block · 🚢 **Ship** line (branch + commit message) · 🔍 _check the docs_
- Branch per ticket; after Sprint 1 every ticket goes through a PR (`gh pr create`, wait for green, `gh pr merge --merge --delete-branch`)
- Standing deviations are listed at the top of each tutorial (decisions table) and in `docs/roadmap/06-project-state.md`

## Suggested way to work

1. Read the sprint's decisions table, then do the tickets **in order** (a few were reordered on purpose — the tutorial says so).
2. Run each ✅ **Verify** block, including the _mutation checks_ (break something, watch the right test fail).
3. When something differs from reality, fix the **code and the tutorial**, and note it in `06-project-state.md`.
4. Re-run `pnpm check` before every pull request.
