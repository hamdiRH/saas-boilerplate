<!-- init:title -->

# SaaS Boilerplate

<!-- /init:title -->

<!-- init:description -->

> A production-minded Next.js 16 SaaS starter: modern authentication, multi-tenant organizations with roles, observability, security hardening and a test suite you can trust — wired together, and optional by design.

<!-- /init:description -->

[![CI](https://github.com/hamdiRH/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/hamdiRH/REPO/actions/workflows/ci.yml) [![codecov](https://codecov.io/gh/hamdiRH/REPO/graph/badge.svg)](https://codecov.io/gh/hamdiRH/REPO) [![Release](https://img.shields.io/github/v/release/hamdiRH/REPO?include_prereleases)](https://github.com/hamdiRH/REPO/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/landing-dark.png">
    <img src="docs/images/landing-light.png" alt="Landing page of the starter, light and dark themes" width="860">
  </picture>
</p>

---

## At a glance

|  |  |
| --- | --- |
| **Stack** | Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · shadcn/ui |
| **Auth** | Better Auth: password, magic link, social, passkeys, TOTP, sessions, impersonation |
| **Data** | Drizzle ORM · PostgreSQL — embedded **PGlite** locally, **Neon** (or any Postgres) in production |
| **Tenancy** | Organizations, invitations, hamdiRH/admin/member roles, tenant-scoped data access |
| **Quality** | Vitest (unit + real-browser), Playwright (E2E, visual, accessibility), Storybook, coverage gates |
| **Ops** | Sentry · Better Stack · Arcjet · Checkly · PostHog — every one optional |
| **Ship** | Semantic Release · Vercel + Neon pipeline with a migration gate · one-command rebrand |

> **Database: PostgreSQL-first.** SQLite and MySQL are _not_ supported in v1.0 (see the [database guide](guides/database.md#portability)). **Not included:** billing/subscriptions (the data model leaves room; see the roadmap).

## Why this exists

Every SaaS spends its first weeks rebuilding the same things: sign-in that doesn't leak accounts, organizations and permissions that actually isolate customers, email, error tracking, CI, translations. This starter does that once, carefully — and then **proves** it with tests, so you can change it without fear.

Three ideas run through the whole codebase:

1. **Secure by construction.** Authorization lives on the server; tenant data is only reachable through `tenantDb`; a test fails if a new Server Action has no declared protection.
2. **Optional everywhere.** Each integration sits behind a small adapter that does nothing without its environment variables. Run it with _no_ configuration, or strip a module out with one command.
3. **Documented decisions, verified docs.** The environment table is generated from the code and the commands in the guides are checked in CI.

## Try it in 5 minutes

You need **Node.js 22+** and **pnpm 10+** (`corepack enable`). On Windows use Git Bash or WSL.

```bash
git clone https://github.com/hamdiRH/REPO.git my-app && cd my-app
pnpm install
pnpm setup:env        # creates .env.local with a random BETTER_AUTH_SECRET
pnpm dev              # embedded database on :5433, app on http://localhost:3000
```

In a second terminal (first run only):

```bash
pnpm db:migrate && pnpm db:seed
```

Sign in with the seeded demo — `demo@example.com` / `Demo-Password-123` — or create an account: verification emails are **printed in the terminal**, no email service needed. Then make it yours:

```bash
pnpm init:template    # name, slug, repository, default language, accent colour
```

<details>
<summary><b>Screenshots</b></summary>

| Projects (organization workspace) | Account security                 |
| --------------------------------- | -------------------------------- |
| ![Projects](images/projects.png)  | ![Security](images/security.png) |

</details>

## What's inside

Legend: ✅ core · 🔌 optional (works with zero configuration; enable with environment variables; removable with `pnpm init:template --remove <module>`).

<details open>
<summary><b>Authentication & accounts</b></summary>

- ✅ Email + password with verification, reset, change email/password, account deletion
- ✅ Magic links (enumeration-safe), session list with revoke, re-authentication for sensitive actions
- ✅ Passkeys (register, manage, sign in by button or autofill) · TOTP two-factor with backup codes
- 🔌 Social sign-in: Google and GitHub tested; Facebook, X and Apple config-ready
- ✅ Built-in rate limiting, security checkup score on the account page

</details>

<details>
<summary><b>Organizations, roles & administration</b></summary>

- ✅ Personal workspace on sign-up, organizations, invitations (email, accept, resend, revoke)
- ✅ Roles `hamdiRH` / `admin` / `member` with a written permission matrix and a test for every cell
- ✅ Tenant isolation: data access goes through `tenantDb`; a boundary test forbids raw database imports in routes, components and actions
- ✅ Platform admin console (users, ban, role), **audited** impersonation with a persistent banner and guarded endpoints
- ✅ Append-only audit log (enforced by a database trigger)

</details>

<details>
<summary><b>Developer experience</b></summary>

- ✅ Strict TypeScript, Oxlint (Ultracite preset), Oxfmt, Knip, T3 Env, absolute `@/` imports
- ✅ Lefthook + lint-staged, Commitlint + Commitizen, VS Code configuration, `AGENTS.md` for AI coding agents
- ✅ Zod + React Hook Form with translated errors; a `createAction` wrapper with a typed `ActionResult`
- ✅ Bundle analyzer, bundle-size budget, generated environment docs

</details>

<details>
<summary><b>Quality & testing</b></summary>

- ✅ Vitest unit/integration tests on an in-memory Postgres, plus component tests in a real browser
- ✅ Playwright E2E with ready-made **personas** (hamdiRH, admin, member, platform admin) — no UI sign-in in most specs
- ✅ Visual regression across theme × language × viewport, baselines generated by CI (Linux)
- ✅ Accessibility: axe in E2E, contrast tests on the theme tokens, skip link, reduced motion, RTL review run
- ✅ **Security suites:** an authorization matrix running the real Server Actions against every role, IDOR / injection / mass-assignment tests
- ✅ Coverage thresholds with Codecov · 🔌 Storybook with a11y checks
- ✅ Parallel CI behind one required check (`CI OK`), E2E sharding, Lighthouse CI budgets

</details>

<details>
<summary><b>Observability, security & privacy</b></summary>

- ✅ Structured logging (LogTape) with redaction; one **request id** from response header to logs to error reports
- ✅ Security headers, **nonce-based CSP** for dynamic areas, secret scanning (gitleaks), CodeQL, dependency and licence audit
- ✅ Cookie consent (default denied, Global Privacy Control respected); nothing non-essential loads before consent
- 🔌 Sentry (+ Spotlight for local debugging), Better Stack logs, Arcjet (bots, shield, rate limits, email validation), PostHog (consent-gated), Checkly (monitoring as code)
- ✅ `/api/health` endpoint, [threat model](security/threat-model.md) and an [ASVS checklist](security/asvs-checklist.md)

</details>

<details>
<summary><b>Internationalization, SEO & performance</b></summary>

- ✅ next-intl (English, French) with typed keys, `i18n-check` in CI, RTL-ready layout · 🔌 Crowdin sync
- ✅ Metadata, canonical + hreflang, JSON-LD, generated Open Graph images, sitemap, robots, manifest
- ✅ Static marketing pages, lazy-loaded heavy widgets, Lighthouse budgets enforced in CI
- ✅ Minimalist theme with accent presets (`neutral`, `blue`, `green`) and a single brand config

</details>

<details>
<summary><b>Release & deployment</b></summary>

- ✅ **Semantic Release**: Conventional Commits decide the version, the changelog and GitHub Releases
- ✅ Production deploys through a gated workflow: _approve → migrate → deploy (not live) → smoke test → promote_; instant rollback runbook
- ✅ Vercel previews with their own Neon database branch; expand/contract migration lint
- ✅ Dependabot (grouped, patch auto-merge), CodeRabbit config, PR/issue templates, branch rules as code

</details>

## How it fits together

```
 request ──► proxy.ts ──► route / Server Action ──► data layer ──► database
             │            │                         │
             │            │                         └─ tenantDb (organization-scoped queries only)
             │            └─ withAuth / withOrgPermission  (checks run on the server, every time)
             └─ request id · abuse protection · CSP nonce · locale · optimistic auth redirect
```

```
src/
  app/[locale]/      routes: (marketing) (auth) (app) (admin)
  actions/           Server Actions — each is registered in tests/security
  data/              session + authorization helpers, tenant-scoped repositories
  db/                Drizzle schema and client (migrations live in /drizzle)
  libs/              adapters and pure helpers: Auth, Env, Logger, Sentry, Arcjet, seo, csp…
  components/        ui/ (shadcn) · forms · auth · org · layout · marketing · consent
  locales/           en.json · fr.json
  config/            brand.ts · site.ts
e2e/  tests/  .storybook/  docs/  scripts/  loadtest/
```

## Everyday commands

| I want to… | Run |
| --- | --- |
| start developing | `pnpm dev` |
| run everything CI runs, locally | `pnpm check` |
| commit, open a PR, wait for CI, merge, and sync `main` | `pnpm git:pr` (stages all changes) |
| run tests | `pnpm test` (unit) · `pnpm test:browser` (components) · `pnpm test:coverage` |
| run end-to-end tests | `pnpm e2e` · `pnpm e2e:visual` · `pnpm e2e:rtl` |
| work on UI in isolation | `pnpm storybook` |
| change the database | edit `src/db/schema/`, then `pnpm db:generate` → `pnpm db:migrate` · explore with `pnpm db:studio` |
| reset local data | `pnpm db:reset` · then `pnpm db:seed` |
| become platform admin | add your email to `ADMIN_EMAILS`, then `pnpm admin:grant` |
| check translations | `pnpm i18n:check` |
| measure performance | `pnpm lighthouse` · `pnpm analyze` · `pnpm bundle:size` |
| preview the next release | `pnpm release:dry` |
| write a proper commit | `pnpm commit` |

Prefer a full list? Open `package.json` → `scripts`; every command used in the docs is verified by `pnpm docs:check`.

## Configure only what you need

Nothing below is required to run locally. Variables are validated at startup by one typed module (`src/libs/Env.ts`); the full, generated table is in the **[environment reference](guides/environment.md)**.

| Service | Set these | What you get | Guide |
| --- | --- | --- | --- |
| **Database (production)** | `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (migrations) | Neon or any PostgreSQL | [database](guides/database.md) |
| **Email** | `EMAIL_TRANSPORT=resend`, `EMAIL_FROM`, `RESEND_API_KEY` | real verification, reset, invitation emails | [deployment](guides/deployment.md#email) |
| **Social sign-in** | `<PROVIDER>_CLIENT_ID` + `_CLIENT_SECRET` | the provider's button appears | [social auth](guides/social-auth.md) |
| **Sentry** | `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_*` for source maps) | error tracking; `pnpm spotlight` locally | [observability](guides/observability.md) |
| **Better Stack** | `BETTER_STACK_SOURCE_TOKEN`, `BETTER_STACK_INGESTING_HOST` | log shipping | [observability](guides/observability.md) |
| **Arcjet** | `ARCJET_KEY` (`ARCJET_MODE`) | bot detection, shield, rate limits | [security](guides/security.md) |
| **PostHog** | `NEXT_PUBLIC_POSTHOG_KEY` | analytics — only after the visitor consents | [privacy](guides/privacy.md) |
| **Crowdin** | CI secrets `CROWDIN_PROJECT_ID`, `CROWDIN_PERSONAL_TOKEN` | translation sync PRs | [i18n](guides/i18n.md) |
| **Codecov / Checkly** | CI secrets `CODECOV_TOKEN`, `CHECKLY_*` | coverage reports, uptime checks | [testing](guides/testing.md) · [observability](guides/observability.md) |

Don't want a module at all? `pnpm init:template --remove sentry,posthog` deletes its code, dependencies and CI wiring (see [optional modules](guides/modules.md)).

## Make it yours

- **Rename & rebrand:** `pnpm init:template`, then follow [theming](guides/theming.md) — name, accent, logo and icon take about ten minutes.
- **Colours and radius:** one file, `src/styles/theme.css` (OKLCH tokens, light + dark). A contrast test tells you if a colour is unreadable.
- **Copy:** `src/locales/*.json` (`{appName}` is filled in for you). Legal pages are **templates** — have a lawyer review them.
- **A new feature:** follow the worked example in [adding a feature](guides/adding-a-feature.md).
- **A new language:** the checklist is in [i18n](guides/i18n.md#adding-a-language-checklist).

## Quality gates

Pull requests cannot merge until **`CI OK`** passes: types, lint, format, Knip, env and docs checks, `i18n-check`, migration lint, unit + component tests with coverage thresholds, production build with a bundle budget, Storybook build, two E2E shards, visual regression, Lighthouse budgets and accessibility checks. Secret scanning and CodeQL run alongside.

> Visual-regression baselines are produced by CI on Linux — never commit screenshots from your own machine. Add the `update-snapshots` label to a PR instead ([how](guides/visual-testing.md)).

## Deploy

1. Create a **Neon** project (branches `main` and `staging`) and a **Vercel** project — [one-time setup](guides/deployment.md#one-time-setup--30-minutes).
2. Merge a `feat:` or `fix:` commit: CI runs, **Semantic Release** tags `vX.Y.Z`, the **Deploy** workflow waits for your approval, runs migrations, deploys without going live, smoke-tests `/api/health`, then promotes.
3. If something is wrong, roll back in one click — the [runbook](guides/deployment.md#rollback-runbook) covers app and database.

Migrations are **expand/contract only**: production runs them _before_ the new code is live, so the previous version must keep working.

## Documentation

| Start here | Build | Operate |
| --- | --- | --- |
| [Getting started](guides/getting-started.md) | [Adding a feature](guides/adding-a-feature.md) | [Deployment](guides/deployment.md) |
| [Environment](guides/environment.md) | [Authentication](guides/auth.md) · [advanced](guides/auth-security.md) | [Releasing](guides/releasing.md) |
| [Database](guides/database.md) | [Multi-tenancy](guides/multi-tenancy.md) · [RBAC](guides/rbac.md) | [Observability](guides/observability.md) |
| [Troubleshooting](guides/troubleshooting.md) | [Testing](guides/testing.md) · [Accessibility](guides/accessibility.md) | [Security](guides/security.md) · [Threat model](security/threat-model.md) |
| [Upgrading](guides/upgrading.md) | [i18n](guides/i18n.md) · [SEO](guides/seo.md) · [Theming](guides/theming.md) | [Performance](guides/performance.md) · [Privacy](guides/privacy.md) |

Working with an AI coding agent? Point it at [`AGENTS.md`](../AGENTS.md): architecture, conventions and the rules that tests enforce.

## FAQ

**Can I use it without any third-party account?** Yes. Database, email (printed to the terminal) and all tooling run locally. **Do I need Vercel and Neon?** No — they are the documented path. Any host and any PostgreSQL work; a Docker/standalone appendix is in the deployment guide. **Where is billing?** Not in v1.0. **Windows?** Supported through Git Bash or WSL; the repository is LF-normalised. **How do I report a vulnerability?** Privately — see [SECURITY.md](../SECURITY.md).

## Contributing

Issues and pull requests are welcome — start with [CONTRIBUTING.md](../CONTRIBUTING.md) and the [code of conduct](../CODE_OF_CONDUCT.md). Commits follow [Conventional Commits](https://www.conventionalcommits.org/): the type of your commit decides the next version.

## License

[MIT](../LICENSE) © hamdiRH
