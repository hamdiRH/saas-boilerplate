# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 8 — Release Engineering, Documentation, Deployment & Launch

> Companion to `docs/roadmap/sprint-08-release-launch.md`. Every `S8-Txx` section is one ticket. Tickets follow the sprint file's order.
> **Release gate: v1.0 GA.** Nothing new is added to the product. This sprint makes it **releasable** (automatic versions), **understandable** (docs verified from a clean clone), **deployable** (a pipeline that cannot break production), **reusable** (init and strip tools) and **trustworthy** (threat model, audit, load test).

🪟 **Windows + Cmder:** use the **Git Bash tab**. Several tickets create files in `.github/`, `scripts/` and `docs/`; run shell snippets in Git Bash. Windows-specific notes are marked 🪟.

> ⚠️ **About versions.** Semantic Release, CodeRabbit's schema, Vercel's CLI, Neon's GitHub actions and k6 change often; spots likely to differ are marked **🔍 Verify against docs**. Unlike earlier sprints, much of this one touches **accounts outside the repository** (GitHub rules, Vercel, Neon, Resend, DNS). Each such step says so — and the code around it is written to fail *closed* (when something is missing, nothing is deployed).

---

## 📋 What you will have at the end

- **Semantic Release**: a merged `feat:` becomes a version, a tag, release notes, a changelog and a GitHub Release — with `rc` and `beta` pre-release channels
- A **README** that gets a stranger to a running app in 5 minutes, and **guides** whose commands and environment tables are **checked by scripts**
- A **deploy pipeline** (Vercel + Neon): build → migrate **before** promoting → smoke test → promote; fail closed; previews with their own database; a rehearsed **rollback**
- **Email deliverability** (SPF, DKIM, DMARC) documented and verified
- **CodeRabbit**, PR/issue templates, `CODEOWNERS`, Dependabot grouping and auto-merge, branch rules **as code**
- `pnpm init:template` (rename the project in one command) and **module stripping** (`--remove sentry,posthog`), proven by a nightly CI matrix
- A **threat model**, dependency/licence audit and an ASVS checklist; a **k6 load smoke test**
- The **launch checklist**, `v1.0.0`, and a repository marked as a GitHub **template**

## 🧭 Decisions & deviations (made once, here)

| Topic | Decision | Why |
|---|---|---|
| Existing `v0.x` tags | Renamed to `milestone/<x>` before the first release | Semantic Release treats `v*` tags as releases; our hand-made milestone tags would confuse it and block `1.0.0` |
| Release trigger | After **CI succeeds** on `main` (`workflow_run`), and only if `main` hasn't moved since | We never release a commit CI didn't validate |
| Pushing the release commit | A **`RELEASE_TOKEN`** (PAT or GitHub App) whose owner may bypass the `main` ruleset | Branch protection (Sprint 1) forbids direct pushes; default `GITHUB_TOKEN` pushes also **don't trigger** the deploy workflow |
| Production deploys | **From release tags** (`v1.2.3`), via GitHub Actions + Vercel CLI | Version, Sentry release and deployment are the same thing; the pipeline is gated (migrate → smoke → promote) |
| Previews | Vercel's **Git integration** + Neon–Vercel integration (a database branch per preview); production auto-deploy is **disabled** in `vercel.json` | Previews are cheap and native; only production needs a custom gate |
| App URL on previews | `NEXT_PUBLIC_APP_URL` falls back to `NEXT_PUBLIC_VERCEL_URL` when unset | Each preview has its own host; auth origins/passkeys must follow it |
| Migration safety | **Expand/contract only**: a migration must work with the *previous* version of the code | The migration runs before the new code is live; rollback must stay possible |
| Environment docs | Generated from `src/libs/Env.ts` + a metadata file; CI fails when they drift | Documentation that can't rot |
| Stripping modules | Supported for **7 integrations** (sentry, posthog, better-stack, arcjet, checkly, crowdin, storybook). **Passkeys / MFA / admin / social providers are not script-stripped**: they touch the database schema and UI; each gets a documented *disable* recipe | A half-working "remove passkeys" button is worse than a clear manual recipe |
| License | **MIT** (default answer to Q-01) | Matches the project's goal; change it deliberately if you disagree |

---

## 🔀 Git workflow (PR-based)

```bash
git switch main && git pull
git switch -c <type>/s8-tXX-<slug>
# … work, then verify …
pnpm check
git add -A
git commit -m "<type>(<scope>): <message>"
git push -u origin <branch>
gh pr create --fill --base main
gh pr checks --watch
gh pr merge --merge --delete-branch
git switch main && git pull
```
> From **S8-T02 on, merging a `feat:`/`fix:` PR can publish a release.** Until the pipeline is rehearsed (S8-T02.3) keep your changes `docs:`/`chore:`/`ci:` — or remember that `feat` means "a new version appears".

---

## ✅ Before you start

```bash
git switch main && git pull
pnpm install
pnpm check              # Sprint 7 must be green
```
Set **Current sprint: Sprint 8** in `docs/roadmap/06-project-state.md`. Have ready (you'll use them in the matching tickets): a **GitHub** admin account for this repository, a **Vercel** account, a **Neon** account, a **Resend** account and a **domain name** you control (DNS access).

---

## 🎫 S8-T01 — Semantic Release configuration

**Branch:** `ci/s8-t01-semantic-release` · **Story:** US-080 · **3 SP**

> 🎯 **Commit messages drive versions.** Conventional Commits (enforced since Sprint 0) are exactly the input Semantic Release needs: `fix:` → patch, `feat:` → minor, `BREAKING CHANGE:` → major. No human picks a number.

```bash
git switch main && git pull && git switch -c ci/s8-t01-semantic-release
pnpm add -D semantic-release @semantic-release/changelog @semantic-release/git @semantic-release/github @semantic-release/npm conventional-changelog-conventionalcommits
```
(`commit-analyzer` and `release-notes-generator` ship inside `semantic-release`.)

### 1. Free the version namespace

Our Sprint tags (`v0.0.1` … `v0.8.0-beta`) were **bookmarks**, not releases. Semantic Release would read them as previous versions. Rename them once (Git Bash):
```bash
for tag in $(git tag -l 'v0.*'); do
  git tag "milestone/${tag#v}" "$tag"     # keep the bookmark under a new name
  git tag -d "$tag"
  git push origin "milestone/${tag#v}" ":refs/tags/$tag"
done
git tag -l                                 # → milestone/0.0.1 … milestone/0.8.0-beta  (no v* left)
```
> From now on the first release will be **`1.0.0`** (or `1.0.0-rc.1` on the `rc` branch): with no previous release, Semantic Release starts at 1.0.0.

### 2. The configuration

📄 **Create `release.config.mjs`:**
```js
/** @type {import('semantic-release').GlobalConfig} */
export default {
  // main = stable releases · rc / beta = pre-releases (1.0.0-rc.1, 1.1.0-beta.3…)
  branches: ['main', { name: 'rc', prerelease: 'rc' }, { name: 'beta', prerelease: 'beta' }],
  tagFormat: 'v${version}',

  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        // When several rules match, the highest release wins.
        releaseRules: [
          { breaking: true, release: 'major' },
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'revert', release: 'patch' },
          // No release for housekeeping — a README tweak must not publish a version
          { type: 'docs', scope: 'readme', release: false },
          { type: 'docs', release: false },
          { type: 'style', release: false },
          { type: 'refactor', release: false },
          { type: 'test', release: false },
          { type: 'build', release: false },
          { type: 'ci', release: false },
          { type: 'chore', release: false },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        presetConfig: {
          types: [
            { type: 'feat', section: '✨ Features' },
            { type: 'fix', section: '🐛 Bug fixes' },
            { type: 'perf', section: '⚡ Performance' },
            { type: 'revert', section: '⏪ Reverts' },
            { type: 'docs', section: '📚 Documentation', hidden: true },
            { type: 'refactor', section: '♻️ Refactoring', hidden: true },
            { type: 'test', section: '✅ Tests', hidden: true },
            { type: 'ci', section: '🤖 CI', hidden: true },
            { type: 'chore', section: '🔧 Maintenance', hidden: true },
          ],
        },
      },
    ],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md', changelogTitle: '# Changelog' }],
    ['@semantic-release/npm', { npmPublish: false }], // bumps "version" in package.json; never publishes (the app is private)
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        // [skip ci]: the release commit must not start another CI run (and so another release)
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    ['@semantic-release/github', { successComment: false, failTitle: false }],
  ],
};
```
> 🔍 If `@semantic-release/npm` complains about `pnpm` or `private: true`, check the plugin's *"private packages"* notes — `npmPublish: false` is the supported setting.

### 3. Keep the formatter and Knip out of the way

- `CHANGELOG.md` is machine-written: add it to your formatter's ignore list (`ignorePatterns` in `.oxfmtrc.json`; 🔍 name per your Oxfmt version) so `pnpm format:check` never rewrites it.
- 📄 **Edit `knip.config.ts`** → `entry`: add `'release.config.mjs'`.
- 📄 **Edit `package.json`:** `"release:dry": "semantic-release --dry-run --no-ci"`.

### 4. Release rules, written down

📄 **Create `docs/guides/releasing.md`:**
````markdown
# Releasing

Releases are **automatic**: merging to `main` runs CI; when CI passes, Semantic Release reads the commit messages since
the last release and decides.

| Commit | Release | Example |
|---|---|---|
| `fix: …`, `perf: …`, `revert: …` | **patch** (1.2.3 → 1.2.4) | `fix(auth): reject expired magic links` |
| `feat: …` | **minor** (1.2.3 → 1.3.0) | `feat(projects): add archive action` |
| `feat!: …` or a `BREAKING CHANGE:` footer | **major** (1.2.3 → 2.0.0) | see below |
| `docs`, `refactor`, `test`, `ci`, `chore`, `build`, `style` | none | `docs: fix a typo` |
| `docs(readme): …` | none (explicitly) | |

Breaking change:
```
feat(auth)!: require email verification before the first sign-in

BREAKING CHANGE: accounts created before 1.4 must verify their email. See the migration note in the PR.
```

## Pre-releases
- `rc` branch → `1.0.0-rc.1`, `-rc.2`… · `beta` branch → `1.1.0-beta.1`…
- Start one: `git push origin main:rc`. Pre-releases are tagged and published on GitHub as **pre-release**; they are never deployed to production.

## What a release does
1. Computes the next version, writes `CHANGELOG.md`, bumps `package.json`, commits `chore(release): x.y.z [skip ci]`.
2. Creates the tag `vX.Y.Z` and the GitHub Release with notes.
3. The tag triggers the **deploy** workflow (migrate → smoke test → promote) — see `deployment.md`.

## Trying it locally (safe)
```bash
git push -u origin <your-branch>
GITHUB_TOKEN=$(gh auth token) pnpm exec semantic-release --dry-run --no-ci --branches <your-branch>
```
Prints the version it *would* publish and the notes. Nothing is created.

## Hotfix
Fix on a branch → PR with `fix:` → merge → patch release. To undo a bad release: ship a `revert:` (patch) and use the rollback runbook (`deployment.md`).
````

### 5. Prove the rules without publishing anything

```bash
git add -A && git commit -m "ci(release): add semantic release configuration"
git push -u origin ci/s8-t01-semantic-release
GITHUB_TOKEN=$(gh auth token) pnpm exec semantic-release --dry-run --no-ci --branches ci/s8-t01-semantic-release
```
Read the output: it should say *"The next release version is 1.0.0"* (only `feat`/`fix` commits count; everything in this sprint so far is `ci`/`docs`/`chore`, so on a branch like this you may see *"no relevant changes"* — that's correct!). To **see a version appear**, add a throw-away commit and dry-run again:
```bash
git commit --allow-empty -m "feat(demo): pretend feature"
GITHUB_TOKEN=$(gh auth token) pnpm exec semantic-release --dry-run --no-ci --branches ci/s8-t01-semantic-release
# → next version 1.0.0, notes list "✨ Features: demo: pretend feature"
git reset --hard HEAD~1                  # remove the throw-away commit
git commit --allow-empty -m "fix(demo): pretend fix"; # → still 1.0.0 (first release); then:
git reset --hard HEAD~1
```
> 🪟 `GITHUB_TOKEN=… command` is Git Bash syntax; in `cmd.exe` use `set GITHUB_TOKEN=…&& pnpm exec semantic-release …`.

### ✅ Verify
```bash
pnpm check
```
1. `git tag -l 'v*'` is empty; `git tag -l 'milestone/*'` lists the bookmarks (and they are on GitHub).
2. The dry run reports sensible versions for `feat`, `fix`, `perf`, `feat!` (try each with a throw-away empty commit) and *no release* for `docs`/`chore`/`docs(readme)`.
3. `pnpm format:check` still passes after the first real changelog is created (you'll confirm in S8-T02).

**🚢 Ship** — branch `ci/s8-t01-semantic-release` · message: `ci(release): add semantic release configuration and release guide`

---

## 🎫 S8-T02 — The release workflow

**Branch:** `ci/s8-t02-release-workflow` · **Story:** US-080 · **2 SP**

> 🎯 After CI passes on `main`, release automatically. One careful detail: the release commit must be pushed to a **protected** branch.

```bash
git switch main && git pull && git switch -c ci/s8-t02-release-workflow
```

### 1. A token that can push (outside the repository — do this once)

1. GitHub → *Settings → Developer settings → Fine-grained personal access tokens* (or create a **GitHub App** — better for teams): resource owner = you/your org, repository = this one, permissions **Contents: read & write**, **Issues: read & write**, **Pull requests: read & write**, **Workflows: read & write**.
2. Add it as a repository secret: `gh secret set RELEASE_TOKEN`.
3. Allow its owner to bypass the `main` rules (the ruleset arrives *as code* in S8-T08; until then): *Settings → Rules → your ruleset → Bypass list → add **Repository admin** (the PAT's owner) or the GitHub App*.
> Why not `GITHUB_TOKEN`? It cannot bypass protection, and events created with it **don't trigger other workflows** — the deploy-on-tag workflow (S8-T07) would never start.

### 2. CI also runs on the pre-release branches

📄 **Edit `.github/workflows/ci.yml`:**
```yaml
on:
  pull_request:
  push:
    branches: [main, rc, beta]
```

### 3. The workflow

📄 **Create `.github/workflows/release.yml`:**
```yaml
name: Release

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main, rc, beta]

permissions:
  contents: read

concurrency:
  group: release
  cancel-in-progress: false # never interrupt a release halfway

jobs:
  release:
    name: Semantic Release
    # Only releases a commit that PASSED CI
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: write
      issues: write
      pull-requests: write
    env:
      LEFTHOOK: '0' # no git hooks inside CI
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_branch }}
          fetch-depth: 0 # Semantic Release needs the whole history and the tags
          persist-credentials: false # it authenticates with RELEASE_TOKEN itself

      - name: Stop if the branch moved on since CI ran
        id: fresh
        run: |
          if [ "$(git rev-parse HEAD)" != "${{ github.event.workflow_run.head_sha }}" ]; then
            echo "Branch moved on — a newer CI run will release it."
            echo "skip=true" >> "$GITHUB_OUTPUT"
          fi

      - uses: ./.github/actions/setup
        if: steps.fresh.outputs.skip != 'true'

      - name: Release
        if: steps.fresh.outputs.skip != 'true'
        env:
          GITHUB_TOKEN: ${{ secrets.RELEASE_TOKEN }}
        run: pnpm exec semantic-release
```
> 🔒 Secrets are available here because `workflow_run` workflows run from the **default branch's** copy of the file — a pull request can't alter this workflow to leak them.

### 3. Hooks for later tickets (nothing to do yet)

- **Sentry release name**: 📄 in `next.config.ts` → `withSentryConfig(config, { …, release: { name: process.env.SENTRY_RELEASE } })` — the deploy workflow (S8-T07) sets `SENTRY_RELEASE` to the tag, so errors are grouped by version and source maps match.
- **Checkly deploy** runs from the deploy workflow after the smoke test (S8-T07): turn `.github/workflows/checkly.yml`'s trigger into `workflow_call` + `workflow_dispatch` then.

### 4. Rehearse the first pre-release (safe, reversible)

```bash
git add -A && git commit -m "ci(release): release after ci succeeds on main, rc and beta"
git push -u origin ci/s8-t02-release-workflow
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
```
This merge is a `ci:` commit → **no release** (that's a result too: check the *Release* run says "no relevant changes").

Now publish a **release candidate** from a branch of `main`, with a real feature commit on it:
```bash
git switch -c rc-prep main
git commit --allow-empty -m "feat(release): first release candidate"
git push origin rc-prep:rc                 # creates the rc branch
```
Watch *Actions → CI → Release* on the `rc` branch. Expected:
- a tag **`v1.0.0-rc.1`** and a GitHub **pre-release** with notes;
- a commit **`chore(release): 1.0.0-rc.1 [skip ci]`** on `rc` with `CHANGELOG.md` and `package.json` updated;
- **no** CI run for that release commit.
```bash
git switch main && git branch -D rc-prep
```
> If the push of the release commit is rejected, the token's owner isn't allowed to bypass the ruleset (step 1.3). If the *Release* run never starts, check that the CI workflow's name is exactly `CI` and that `rc` is listed in its `push.branches`.

Clean up if you want a pristine history for the real `1.0.0`: the `rc` branch and `v1.0.0-rc.1` pre-release may stay (they sort **below** `1.0.0`), or delete them: `git push origin :rc :refs/tags/v1.0.0-rc.1` and delete the GitHub pre-release.

### ✅ Verify
1. `v1.0.0-rc.1` exists as a **pre-release** on GitHub with generated notes; `CHANGELOG.md` on `rc` has a `1.0.0-rc.1` section.
2. A subsequent `docs:` merge to `main` produces **no** release.
3. Push a commit to `main` while a CI run is in progress → the older run's *Release* step prints "Branch moved on" and does nothing (the newer run decides).
4. `pnpm format:check` is green on the `rc` branch after the changelog was committed.

**🚢 Ship** — branch `ci/s8-t02-release-workflow` · message: `ci(release): publish releases automatically after ci succeeds`

---

## 🎫 S8-T03 — README and root documents

**Branch:** `docs/s8-t03-readme` · **Story:** US-082 · **2 SP** · risk **R-16** (PostgreSQL-first must be unmistakable)

```bash
git switch main && git pull && git switch -c docs/s8-t03-readme
mkdir -p docs/images
```

### 1. Screenshots made by a script (so they never go stale)

📄 **Create `e2e/screenshots.spec.ts`:**
```ts
import { expect, test } from './fixtures';

// Regenerates the README images. Run: pnpm docs:screenshots   (skipped in normal runs)
test.skip(!process.env.E2E_SCREENSHOTS, 'run with E2E_SCREENSHOTS=1 (pnpm docs:screenshots)');
test.use({ viewport: { width: 1280, height: 800 } });

const shot = (name: string) => ({ path: `docs/images/${name}.png` });

test('landing page', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ ...shot('landing-light') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ ...shot('landing-dark') });
});

test('dashboard and projects', async ({ ownerPage, world }) => {
  await ownerPage.goto(`/dashboard/${world.orgSlug}/projects`);
  await ownerPage.waitForLoadState('networkidle');
  await expect(ownerPage.getByText(world.project.name)).toBeVisible();
  await ownerPage.screenshot({ ...shot('projects') });
});

test('account security', async ({ ownerPage }) => {
  await ownerPage.goto('/dashboard/account/security');
  await ownerPage.waitForLoadState('networkidle');
  await ownerPage.screenshot({ ...shot('security') });
});
```
📄 **Edit `package.json`:** `"docs:screenshots": "cross-env E2E_SCREENSHOTS=1 playwright test e2e/screenshots.spec.ts"`
```bash
pnpm docs:screenshots && ls docs/images
```
(Run it in your **dev theme**; commit the PNGs. They are documentation, not test baselines.)

### 2. The README

📄 **Replace `README.md`** (keep the `<!-- init:… -->` markers: S8-T09's script rewrites what's between them):
````markdown
<!-- init:title -->
# SaaS Boilerplate
<!-- /init:title -->

<!-- init:description -->
> An open-source Next.js 16 SaaS starter: authentication, organizations and roles, observability, a serious test suite — wired, secure and optional-by-design.
<!-- /init:description -->

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/OWNER/REPO/graph/badge.svg)](https://codecov.io/gh/OWNER/REPO)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/OWNER/REPO?include_prereleases)](https://github.com/OWNER/REPO/releases)

![Landing page](docs/images/landing-light.png)

## Why

Every SaaS starts by rebuilding sign-in, organizations, permissions, email, tests and CI. This starter does it once —
carefully — so you can start on what makes your product different.

> **Database: PostgreSQL-first.** Locally it runs on an embedded Postgres (PGlite — nothing to install), in production on
> Neon (or any Postgres). SQLite/MySQL via Drizzle are on the roadmap but **not supported in v1.0**
> (see [database guide](docs/guides/database.md#portability)).

## Features

Legend: ✅ core · 🔌 optional (works with no configuration; enable by setting env vars, remove with `pnpm init:template --remove <module>`).

| Area | What you get | |
|---|---|---|
| **Auth** | Email + password, email verification, password reset, sessions, account deletion | ✅ |
| | Magic links | ✅ |
| | Social sign-in (Google, GitHub; Facebook, X, Apple ready) | 🔌 |
| | Passkeys (WebAuthn), TOTP two-factor, backup codes | ✅ |
| **Multi-tenancy** | Organizations, invitations, roles (owner/admin/member), tenant-scoped data access proven by tests | ✅ |
| | Platform admin console, audited impersonation | ✅ |
| **Product** | Projects example resource (CRUD, search, pagination) | ✅ |
| **i18n** | next-intl (en/fr), typed keys, RTL-ready, Crowdin sync | ✅ / 🔌 |
| **Quality** | Strict TypeScript, Oxlint/Ultracite, Oxfmt, Knip, Vitest (unit + browser), Playwright (E2E + visual), axe, coverage gates | ✅ |
| | Storybook with a11y checks | 🔌 |
| **Observability** | Structured logs (LogTape) | ✅ |
| | Sentry (+ Spotlight), Better Stack, Checkly | 🔌 |
| **Security** | Security headers, nonce-based CSP, rate limits, secret scanning, CodeQL | ✅ |
| | Arcjet (bots, shield, email validation) | 🔌 |
| **Analytics** | Cookie consent; PostHog only after consent | ✅ / 🔌 |
| **SEO & perf** | Metadata, hreflang, JSON-LD, OG images, sitemap, Lighthouse CI budgets | ✅ |
| **Release** | Semantic Release, Dependabot, CodeRabbit, deploy pipeline with migration gate | ✅ |

## Tech stack

Next.js 16 (App Router, React 19) · TypeScript (strict) · Tailwind CSS 4 + shadcn/ui · Better Auth · Drizzle ORM ·
PostgreSQL (PGlite / Neon) · next-intl · Zod + React Hook Form · T3 Env · Vitest · Playwright · pnpm.

## Quick start (≈ 5 minutes)

Prerequisites: **Node.js 22+** and **pnpm 10+** (`corepack enable`). Git Bash/WSL on Windows.

```bash
git clone https://github.com/OWNER/REPO.git my-app && cd my-app
pnpm install
pnpm setup:env          # creates .env.local with a random BETTER_AUTH_SECRET
pnpm dev                # starts the embedded database and the app → http://localhost:3000
```
In a second terminal, the first time only:
```bash
pnpm db:migrate && pnpm db:seed     # demo@example.com / Demo-Password-123
```
Then sign in at <http://localhost:3000/sign-in>. Verification emails are printed in the terminal (no email service needed).

Make it yours in one command: `pnpm init:template` (name, slug, repository, accent colour).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Embedded DB + Next.js dev server |
| `pnpm build` / `pnpm start` | Production build / server |
| `pnpm check` | Everything CI runs locally: types, lint, format, Knip, env/docs checks, i18n, tests |
| `pnpm test` · `test:browser` · `test:coverage` | Unit / component (real browser) / coverage with thresholds |
| `pnpm e2e` · `e2e:visual` · `e2e:rtl` | End-to-end / visual regression / right-to-left review |
| `pnpm storybook` | Component workshop |
| `pnpm lighthouse` | Performance, a11y, SEO budgets |
| `pnpm db:migrate` · `db:seed` · `db:studio` · `db:reset` | Database workflow |
| `pnpm admin:grant` | Make a verified user a platform admin |
| `pnpm i18n:check` | Missing keys / invalid ICU |
| `pnpm docs:check` | Env table and documented commands match the code |
| `pnpm init:template` | Rename the project; `--remove sentry,posthog` strips modules |
| `pnpm release:dry` | Preview the next release |

## Project structure

```
src/
  app/[locale]/        routes: (marketing) (auth) (app) (admin)
  actions/             Server Actions (every one is registered in tests/security)
  data/                database access, authorization helpers, tenant-scoped repositories
  db/                  Drizzle schema, client, migrations in /drizzle
  libs/                adapters and pure helpers (Auth, Env, Logger, Sentry, Arcjet, seo, csp…)
  components/          ui/ (shadcn), forms/, auth/, org/, layout/, marketing/…
  locales/             en.json, fr.json (Crowdin syncs these)
  config/              brand.ts, site.ts
e2e/  tests/  .storybook/  docs/  scripts/
```

## Documentation

[Getting started](docs/guides/getting-started.md) · [Environment](docs/guides/environment.md) · [Database](docs/guides/database.md) ·
[Authentication](docs/guides/auth.md) · [Multi-tenancy](docs/guides/multi-tenancy.md) · [RBAC](docs/guides/rbac.md) ·
[Adding a feature](docs/guides/adding-a-feature.md) · [Testing](docs/guides/testing.md) · [i18n](docs/guides/i18n.md) ·
[Theming](docs/guides/theming.md) · [Deployment](docs/guides/deployment.md) · [Releasing](docs/guides/releasing.md) ·
[Upgrading](docs/guides/upgrading.md) · [Troubleshooting](docs/guides/troubleshooting.md)

## FAQ

**Is billing included?** Not in 1.0 — see the roadmap. **Can I remove what I don't need?** Yes — every integration is optional.
**Windows?** Use Git Bash or WSL; the repository is LF-normalised and tested on both. **How do I report a vulnerability?** See [SECURITY.md](SECURITY.md).

## Contributing · License

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Released under the [MIT License](LICENSE).
````

### 3. Root documents

📄 **Replace `LICENSE`** (MIT — the default answer to Q-01; change it only deliberately):
```text
MIT License

Copyright (c) 2026 OWNER

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
📄 **Create `CONTRIBUTING.md`:**
````markdown
# Contributing

Thanks for helping! This project values small, tested, well-explained changes.

## Setup
`pnpm install && pnpm setup:env && pnpm dev` — see the [getting started guide](docs/guides/getting-started.md). Windows: use Git Bash or WSL.

## Workflow
1. Open an issue first for anything non-trivial (bugs and small fixes: just send the PR).
2. Branch from `main`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
3. Commit with **Conventional Commits** (`pnpm commit` helps) — they decide the next version.
4. `pnpm check` must pass locally. Add tests for behaviour changes; a Server Action needs a row in `tests/security/action-registry.ts`.
5. Open a PR. CI (`CI OK`), secret scan and CodeQL must pass; CodeRabbit leaves a first review.
6. UI changes: add/adjust the story; visual baselines are regenerated by CI (label `update-snapshots`) — never from your machine.

## Ground rules
Read `AGENTS.md` (architecture and conventions). Security issues: **do not open a public issue** — see `SECURITY.md`.
````
📄 **Create `SECURITY.md`:**
````markdown
# Security policy

## Supported versions
The latest minor release of the current major version receives security fixes.

## Reporting a vulnerability
**Please do not open a public issue.** Use GitHub's private reporting:
<https://github.com/OWNER/REPO/security/advisories/new>

Include what you found, how to reproduce it and the impact. You will get an acknowledgement within **3 working days** and
a status update at least every **7 days**. We credit reporters who want to be credited.

## Scope
The application code in this repository. Third-party services you connect (hosting, email, analytics) have their own policies.
For how the project defends itself see `docs/security/threat-model.md` and `docs/guides/security.md`.
````
📄 **Code of conduct** — adopt the Contributor Covenant 2.1 as published (don't paraphrase it):
```bash
curl -L https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md -o CODE_OF_CONDUCT.md
sed -i 's/\[INSERT CONTACT METHOD\]/security@your-domain.example/' CODE_OF_CONDUCT.md   # use a real address you read
```
> Replace `OWNER/REPO` and the contact address with real values (S8-T09's init script does the repository part for you).

### ✅ Verify
```bash
pnpm check
```
1. The README renders correctly on GitHub; every link in it resolves (the link checker arrives in S8-T05).
2. The PostgreSQL-first statement is in the **first screen** of the README.
3. Follow the Quick start **literally** in a fresh folder (`git clone … /tmp/clean && cd /tmp/clean`): time it; write the result in `06-project-state.md` (target ≤ 5 min).
4. `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` exist; GitHub's *Community Standards* page (Insights → Community) shows them all green.

**🚢 Ship** — branch `docs/s8-t03-readme` · message: `docs: rewrite the readme with postgres-first statement and add license, contributing, security and conduct files`

---

## 🎫 S8-T04 — Guides, part 1: start, environment, database, auth

**Branch:** `docs/s8-t04-guides-1` · **Story:** US-082 · **3 SP**

> 🎯 The environment table is the document most likely to rot, so it is **generated from `Env.ts`** and **checked in CI**. Everything else is prose that a human keeps honest.

```bash
git switch main && git pull && git switch -c docs/s8-t04-guides-1
```

### 1. The environment documentation generator

📄 **Create `scripts/env-metadata.ts`** — one line of *meaning* per variable (the generator reads names, scope, required and default from `Env.ts` itself):
```ts
export type EnvMeta = { group: string; description: string; obtain?: string };

const social = (provider: string, label: string, where: string): Record<string, EnvMeta> => ({
  [`${provider}_CLIENT_ID`]: { group: 'Social sign-in', description: `${label} OAuth client ID. The button appears only when ID **and** secret are set.`, obtain: where },
  [`${provider}_CLIENT_SECRET`]: { group: 'Social sign-in', description: `${label} OAuth client secret.`, obtain: where },
});

export const ENV_METADATA: Record<string, EnvMeta> = {
  // Core
  NODE_ENV: { group: 'Core', description: 'Runtime mode. Set by Next.js and your host; don’t set it yourself.' },
  NEXT_PUBLIC_APP_URL: { group: 'Core', description: 'Public base URL (auth origins, emails, canonical URLs, passkey domain). On Vercel previews it falls back to `NEXT_PUBLIC_VERCEL_URL`.', obtain: 'Your production domain, e.g. https://app.example.com' },
  NEXT_PUBLIC_APP_NAME: { group: 'Core', description: 'Product name shown everywhere (header, emails, titles).' },
  NEXT_PUBLIC_SUPPORT_EMAIL: { group: 'Core', description: 'Where contact messages go and what legal pages show.' },
  APP_VERSION: { group: 'Core', description: 'Version reported by `/api/health`. The deploy workflow sets it from the release tag.' },
  LOG_LEVEL: { group: 'Core', description: 'Minimum log level (`debug`, `info`, `warning`, `error`).' },

  // Database
  DATABASE_URL: { group: 'Database', description: 'Postgres connection string. Empty locally → the embedded PGlite server. In production use the **pooled** Neon URL.', obtain: 'Neon → Connection details (pooled)' },
  DATABASE_URL_UNPOOLED: { group: 'Database', description: 'Direct (non-pooled) connection, used only for **migrations**.', obtain: 'Neon → Connection details (direct)' },
  DB_SERVER_PORT: { group: 'Database', description: 'Port of the local embedded database server.' },
  DB_DATA_DIR: { group: 'Database', description: 'Folder of the local embedded database (used by E2E/Lighthouse to isolate data).' },

  // Auth
  BETTER_AUTH_SECRET: { group: 'Auth', description: 'Secret for signing sessions and encrypting tokens, ≥ 32 characters. **Rotating it signs everyone out.**', obtain: '`pnpm setup:env` (local) · `openssl rand -base64 32` (production)' },
  AUTH_RATE_LIMIT: { group: 'Auth', description: 'Turns Better Auth’s built-in rate limiting on/off (always on in production).' },
  ADMIN_EMAILS: { group: 'Auth', description: 'Comma-separated emails that `pnpm admin:grant` may promote to platform admin (verified users only).' },
  ADMIN_REQUIRE_MFA: { group: 'Auth', description: 'Require two-factor for the admin console.' },
  ...social('GOOGLE', 'Google', 'Google Cloud Console → Credentials'),
  ...social('GITHUB', 'GitHub', 'GitHub → Settings → Developer settings → OAuth Apps'),
  ...social('FACEBOOK', 'Facebook', 'Meta for Developers'),
  ...social('TWITTER', 'X / Twitter', 'X Developer Portal'),
  ...social('APPLE', 'Apple', 'Apple Developer → Sign in with Apple (see `pnpm apple:secret`)'),

  // Email
  EMAIL_TRANSPORT: { group: 'Email', description: '`console` (prints/writes emails — local), `resend` (sends), `memory` (tests).' },
  EMAIL_FROM: { group: 'Email', description: 'Sender address; must belong to a domain verified at your email provider.' },
  RESEND_API_KEY: { group: 'Email', description: 'Resend API key (needed when `EMAIL_TRANSPORT=resend`).', obtain: 'resend.com → API Keys' },

  // Observability
  NEXT_PUBLIC_SENTRY_DSN: { group: 'Observability', description: 'Sentry DSN. Empty → no error reporting.', obtain: 'Sentry → Project → Client Keys' },
  NEXT_PUBLIC_SENTRY_SPOTLIGHT: { group: 'Observability', description: 'Dev only: send events to the local Spotlight sidecar.' },
  SENTRY_ORG: { group: 'Observability', description: 'Build-time: Sentry organization slug (source-map upload).' },
  SENTRY_PROJECT: { group: 'Observability', description: 'Build-time: Sentry project slug.' },
  SENTRY_AUTH_TOKEN: { group: 'Observability', description: 'Build-time: token used to upload source maps. CI/deploy only.', obtain: 'Sentry → Settings → Auth Tokens' },
  BETTER_STACK_SOURCE_TOKEN: { group: 'Observability', description: 'Log shipping token (both Better Stack variables must be set).', obtain: 'Better Stack → Source' },
  BETTER_STACK_INGESTING_HOST: { group: 'Observability', description: 'Log ingestion host of your source.', obtain: 'Better Stack → Source' },

  // Security
  ARCJET_KEY: { group: 'Security', description: 'Arcjet site key. Empty → no bot/rate protection layer.', obtain: 'app.arcjet.com' },
  ARCJET_MODE: { group: 'Security', description: '`DRY_RUN` logs what would be blocked; `LIVE` blocks. Default: LIVE in production, DRY_RUN elsewhere.' },
  CSP_MODE: { group: 'Security', description: 'Content-Security-Policy: `off`, `report-only` (default) or `enforce`.' },

  // Analytics
  NEXT_PUBLIC_POSTHOG_KEY: { group: 'Analytics', description: 'PostHog project key. Used only after the visitor consents.', obtain: 'PostHog → Project settings' },
  NEXT_PUBLIC_POSTHOG_HOST: { group: 'Analytics', description: 'PostHog region host (EU or US cloud).' },

  // SEO & presentation
  SITE_INDEXING: { group: 'SEO & presentation', description: 'Let search engines index the site. **Production only.**' },
  LEGAL_NOINDEX: { group: 'SEO & presentation', description: 'Keep legal pages `noindex` until a lawyer has reviewed them.' },
  NEXT_PUBLIC_ACCENT: { group: 'SEO & presentation', description: 'Accent preset: `neutral`, `blue`, `green`.' },
  NEXT_PUBLIC_FORCE_DIR: { group: 'SEO & presentation', description: 'Review tool: force `rtl`/`ltr` on every locale (build-time).' },
};
```
📄 **Create `scripts/docs-env.ts`:**
```ts
// pnpm docs:env         → rewrite the table in docs/guides/environment.md
// pnpm docs:check-env   → fail if the table is out of date or a variable has no description
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import { ENV_METADATA } from './env-metadata';

export type EnvRow = { name: string; scope: 'server' | 'client'; required: boolean; defaultValue: string | undefined };

const START = '<!-- env:start -->';
const END = '<!-- env:end -->';

/** Reads the T3 Env schema straight from the source, so the docs can't disagree with it. */
export function parseEnvSchema(source: string): EnvRow[] {
  const file = ts.createSourceFile('Env.ts', source, ts.ScriptTarget.Latest, true);
  const rows: EnvRow[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'createEnv') {
      const config = node.arguments[0];
      if (config && ts.isObjectLiteralExpression(config)) {
        for (const property of config.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const scope = property.name.getText(file);
          if ((scope !== 'server' && scope !== 'client') || !ts.isObjectLiteralExpression(property.initializer)) continue;

          for (const entry of property.initializer.properties) {
            if (!ts.isPropertyAssignment(entry)) continue;
            const text = entry.initializer.getText(file);
            const defaultValue = /\.default\(\s*([^)]*?)\s*\)/.exec(text)?.[1] ?? /^flag\(\s*([^)]*?)\s*\)/.exec(text)?.[1];
            rows.push({
              name: entry.name.getText(file),
              scope,
              required: !/\.optional\(\)|\.default\(|^flag\(/.test(text),
              defaultValue,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return rows;
}

export function renderTables(rows: EnvRow[]): string {
  const groups = new Map<string, string[]>();
  for (const row of [...rows].sort((a, b) => a.name.localeCompare(b.name))) {
    const meta = ENV_METADATA[row.name]!;
    const line = `| \`${row.name}\` | ${row.scope} | ${row.required ? '**yes**' : 'no'} | ${row.defaultValue ? `\`${row.defaultValue}\`` : '—'} | ${meta.description} | ${meta.obtain ?? '—'} |`;
    groups.set(meta.group, [...(groups.get(meta.group) ?? []), line]);
  }
  return [...groups]
    .map(([group, lines]) => `### ${group}\n\n| Variable | Scope | Required | Default | What it does | Where to get it |\n|---|---|---|---|---|---|\n${lines.join('\n')}`)
    .join('\n\n');
}

export function missingDescriptions(rows: EnvRow[]): string[] {
  return rows.map((row) => row.name).filter((name) => !ENV_METADATA[name]);
}

function replaceBlock(document: string, body: string): string {
  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (!pattern.test(document)) throw new Error(`docs/guides/environment.md needs the markers ${START} … ${END}`);
  return document.replace(pattern, `${START}\n\n${body}\n\n${END}`);
}

function main() {
  const rows = parseEnvSchema(readFileSync('src/libs/Env.ts', 'utf8'));

  const missing = missingDescriptions(rows);
  if (missing.length > 0) {
    console.error(`❌ No description for: ${missing.join(', ')}\n   Add them to scripts/env-metadata.ts`);
    process.exit(1);
  }
  const stale = Object.keys(ENV_METADATA).filter((name) => !rows.some((row) => row.name === name));
  if (stale.length > 0) console.warn(`⚠️  Described but not in Env.ts (harmless): ${stale.join(', ')}`);

  const path = 'docs/guides/environment.md';
  const current = readFileSync(path, 'utf8');
  const next = replaceBlock(current, renderTables(rows));

  if (process.argv.includes('--check')) {
    if (current !== next) {
      console.error('❌ docs/guides/environment.md is out of date. Run: pnpm docs:env');
      process.exit(1);
    }
    console.log(`✅ environment.md documents all ${rows.length} variables`);
    return;
  }
  writeFileSync(path, next);
  console.log(`✅ environment.md updated (${rows.length} variables)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
```
📄 **Create `tests/scripts/docs-env.test.ts`:**
```ts
import { expect, it } from 'vitest';

import { missingDescriptions, parseEnvSchema, renderTables } from '../../scripts/docs-env';

const source = `
export const Env = createEnv({
  server: {
    DATABASE_URL: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().min(32),
    LOG_LEVEL: z.enum(['info', 'debug']).default('info'),
    SITE_INDEXING: flag('false'),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),
  },
  runtimeEnv: { DATABASE_URL: process.env.DATABASE_URL },
});`;

it('reads names, scope, required and defaults from the T3 Env schema', () => {
  const rows = parseEnvSchema(source);
  expect(rows).toEqual([
    { name: 'DATABASE_URL', scope: 'server', required: false, defaultValue: undefined },
    { name: 'BETTER_AUTH_SECRET', scope: 'server', required: true, defaultValue: undefined },
    { name: 'LOG_LEVEL', scope: 'server', required: false, defaultValue: "'info'" },
    { name: 'SITE_INDEXING', scope: 'server', required: false, defaultValue: "'false'" },
    { name: 'NEXT_PUBLIC_APP_URL', scope: 'client', required: false, defaultValue: "'http://localhost:3000'" },
  ]);
});

it('every variable that really exists in Env.ts has a description (so the table can be generated)', () => {
  const real = parseEnvSchema(`${process.cwd() ? '' : ''}${require('node:fs').readFileSync('src/libs/Env.ts', 'utf8')}`);
  expect(missingDescriptions(real), 'Add to scripts/env-metadata.ts').toEqual([]);
});

it('renders one table per group with the required marker', () => {
  const markdown = renderTables(parseEnvSchema(source).filter((row) => row.name === 'BETTER_AUTH_SECRET'));
  expect(markdown).toContain('### Auth');
  expect(markdown).toContain('| `BETTER_AUTH_SECRET` | server | **yes** |');
});
```
> The second test uses `require` for brevity; if your lint rules reject it, switch to `import { readFileSync } from 'node:fs'` at the top.

📄 **Edit `package.json`:**
```json
"docs:env": "tsx scripts/docs-env.ts",
"docs:check-env": "tsx scripts/docs-env.ts --check"
```
📄 **Edit `knip.config.ts`** → `entry`: `'scripts/docs-env.ts'`, `'scripts/env-metadata.ts'`.

### 2. The guides

📄 **Create `docs/guides/environment.md`:**
````markdown
# Environment variables

All configuration is read through **one** typed module, `src/libs/Env.ts` (T3 Env + Zod): the app refuses to start with an
invalid configuration, and server-only variables can never reach the browser. `process.env` is not used anywhere else
(`pnpm check:env` enforces it).

Files: `.env.example` (template, committed) · `.env.development` (safe local defaults, committed) · `.env.local` (yours, git-ignored).
Everything is **optional unless marked required**: with nothing but `BETTER_AUTH_SECRET` the app runs fully locally.

<!-- env:start -->
<!-- env:end -->

> This table is **generated** from `Env.ts` (`pnpm docs:env`) and verified in CI (`pnpm docs:check-env`). Add a variable:
> declare it in `Env.ts` (all three places), describe it in `scripts/env-metadata.ts`, run `pnpm docs:env`.
````
```bash
pnpm docs:env
```
If it prints `No description for: …` add those names to `scripts/env-metadata.ts` (social-provider names that differ from the pattern are the usual suspects), run again, then `pnpm docs:check-env`.

📄 **Create `docs/guides/getting-started.md`:**
````markdown
# Getting started

## Prerequisites
- **Node.js 22+** (`nvm`/`nvm-windows`/`winget install OpenJS.NodeJS.LTS`) and **pnpm 10+** (`corepack enable`)
- Git. On Windows use **Git Bash** (Cmder's Git tab) or WSL — never `cmd.exe` for the scripts.
- Nothing else: the database is embedded.

## Run it
```bash
git clone <your-fork-url> my-app && cd my-app
pnpm install
pnpm setup:env          # writes .env.local with a random BETTER_AUTH_SECRET
pnpm dev                # DB on :5433, app on :3000
```
First time only, in a second terminal: `pnpm db:migrate && pnpm db:seed`.

## First sign-in
1. Open <http://localhost:3000/sign-up>, create an account — the verification link is **printed in the terminal** (and written to `.emails/`).
2. Or use the seeded demo: `demo@example.com` / `Demo-Password-123` (also `teammate@`, `other@`, `admin@example.com`).
3. Make yourself platform admin: add your email to `ADMIN_EMAILS` in `.env.local`, then `pnpm admin:grant`.

## Make it yours
`pnpm init:template` (name, slug, repository, accent) → `docs/guides/theming.md` for colours and logo.

## What to run before pushing
`pnpm check` (the same gates as CI). Details: `docs/guides/testing.md`.

## Common problems
| Symptom | Fix |
|---|---|
| `Invalid environment variables` at start | Run `pnpm setup:env`; see `environment.md` |
| `EADDRINUSE :3000` / `:5433` | Another dev server is running — stop it (`netstat -ano \| findstr :3000` on Windows) |
| Passkey button missing | Passkeys need `localhost` or HTTPS; use `http://localhost:3000`, not `127.0.0.1` |
| Line-ending warnings on Windows | `git config core.autocrlf false` (the repo is LF) |
| Slow/locked files on Windows | Keep the project outside OneDrive/Dropbox |
More in `troubleshooting.md`.
````
📄 **Create `docs/guides/database.md`:**
````markdown
# Database

PostgreSQL only (v1.0). Drizzle ORM; the schema lives in `src/db/schema/*.ts`, migrations in `drizzle/`.

## Local: PGlite (nothing to install)
`pnpm dev` starts an embedded Postgres (PGlite) behind a socket on `:5433` and stores data in `./local.db`.
It serves **one connection at a time** — the pool is capped at 1 locally. Reset: `pnpm db:reset`. Inspect: `pnpm db:studio`.

## Production: Neon (or any Postgres)
Use the **pooled** connection string for the app (`DATABASE_URL`) and the **direct** one for migrations
(`DATABASE_URL_UNPOOLED`). Serverless functions open many short connections — pooling is what keeps Postgres alive.

## Migration workflow
```bash
# 1. edit src/db/schema/…
pnpm db:generate        # writes drizzle/NNNN_name.sql — READ IT
pnpm db:migrate         # applies locally
pnpm db:check           # CI also runs this: schema and migrations must agree
```
### Expand / contract (mandatory)
Production runs the migration **before** the new code goes live, and a rollback re-activates the **previous** code.
So every migration must work with both versions of the code:
| Change | Do it in steps |
|---|---|
| Add a column | add nullable (or with default) → deploy code that writes it → backfill → later make it required |
| Rename/remove a column | add the new one → dual-write → switch reads → deploy → **only then** drop the old (a later release) |
| Add a NOT NULL constraint | backfill first, add the constraint in a later release |
| Drop a table | stop using it, release, drop in the *next* release |
Never ship a destructive migration in the same release that stops using the data.

## Seeding
`pnpm db:seed` creates demo users (password `Demo-Password-123`), two organizations and a few projects. Never run it against production.

## Backups
Neon keeps point-in-time history (plan-dependent) — see the rollback runbook in `deployment.md`. Take a manual branch before risky changes.

## Docker Postgres fallback
If PGlite doesn't suit you (very large datasets, extensions): `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17`, then
`DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres` in `.env.local` and `pnpm db:migrate`.

## Portability
SQLite/MySQL are **not supported in v1.0** (roadmap item). What would have to change: the schema files (`pgTable` → dialect
tables), column types (uuid, timestamptz, jsonb), the append-only audit trigger (Postgres-specific), PGlite tooling, and the
migration set. Keep Postgres.
````
📄 **Append to `docs/guides/auth.md`** — a consolidated front section and recipes (the S2/S3 content stays below):
````markdown
## Methods at a glance (and how to switch them)
| Method | Default | Disable it |
|---|---|---|
| Email + password | on | Core — keep it |
| Email verification | required | Core — keep it |
| Magic link | on | remove the `magicLink()` plugin in `src/libs/Auth.ts` and `MagicLinkForm` from the sign-in page |
| Social (Google, GitHub, …) | on only if **both** id and secret are set | just **unset** the two variables; the button disappears |
| Passkeys | on | remove `passkey()` in `Auth.ts`, `PasskeyButton`, `PasskeysCard`, `use-passkey-autofill`; leave the table (drop it in a later release) |
| TOTP / backup codes | on | remove `twoFactor()` and the security-page sections the same way; leave the table |
| Impersonation / admin console | on | remove `admin()` and the `(admin)` route group; keep `user.role` |
Each recipe: remove, run `pnpm typecheck` (it points at leftovers), `pnpm test` (guard-coverage and matrix tests will name routes/actions you deleted — delete their rows too), `pnpm check`.
See also: `social-auth.md` (provider setup) and `auth-security.md` (threat notes, MFA, re-authentication).
````

### ✅ Verify
```bash
pnpm docs:env && pnpm docs:check-env && pnpm test tests/scripts && pnpm check
```
1. `environment.md` lists **every** variable of `Env.ts`; add a fake variable to `Env.ts` without a description → `docs:check-env` fails; add the description but forget `pnpm docs:env` → it fails with "out of date".
2. Follow `getting-started.md` in a clean checkout, on a machine that has never run the project: note every hiccup and fix the guide.
3. `database.md`'s expand/contract table matches what you'd tell a new teammate.

**🚢 Ship** — branch `docs/s8-t04-guides-1` · message: `docs: add generated environment reference and getting started, database and auth guides`

---

## 🎫 S8-T05 — Guides, part 2, and verification by script

**Branch:** `docs/s8-t05-guides-2` · **Story:** US-082 · **3 SP**

```bash
git switch main && git pull && git switch -c docs/s8-t05-guides-2
```

### 1. Don't let the docs invent commands

📄 **Create `scripts/check-docs-commands.mjs`:**
```js
// Fails when a guide tells the reader to run `pnpm <something>` that doesn't exist.
import { readdirSync, readFileSync } from 'node:fs';

const BUILTINS = new Set([
  'install', 'i', 'add', 'remove', 'rm', 'update', 'up', 'dlx', 'exec', 'run', 'store', 'why', 'list', 'ls', 'outdated',
  'audit', 'config', 'create', 'init', 'link', 'prune', 'rebuild', 'root', 'setup', 'self-update', 'approve-builds', 'licenses',
]);
const scripts = new Set(Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts));

const files = [
  'README.md', 'CONTRIBUTING.md', 'AGENTS.md',
  ...readdirSync('docs/guides').filter((file) => file.endsWith('.md')).map((file) => `docs/guides/${file}`),
];

const problems = [];
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/\bpnpm\s+([a-z][a-z0-9:_-]*)/g)) {
      const command = match[1];
      if (!scripts.has(command) && !BUILTINS.has(command)) problems.push(`${file}:${index + 1}  "pnpm ${command}" is not a script`);
    }
  });
}

if (problems.length > 0) {
  console.error(`❌ Documented commands that don't exist:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`✅ every documented pnpm command exists (${files.length} files checked)`);
```
📄 **Edit `package.json`:**
```json
"docs:check-commands": "node scripts/check-docs-commands.mjs",
"docs:check": "pnpm docs:check-env && pnpm docs:check-commands"
```
and add `pnpm docs:check` to the `check` script (after `i18n:check`). Run it and fix every hit (typos, renamed scripts, or add the missing script):
```bash
pnpm docs:check-commands
```

### 2. Guides to write

Most of the content already exists from earlier sprints; this ticket makes each guide **complete, current and linked from the README**. For each file, open it and confirm the checklist item.

| Guide | Must contain |
|---|---|
| `multi-tenancy.md` | model (org/member/invitation), the `[orgSlug]` routes, why `tenantDb`, the tenant-boundary test, personal workspaces, what RLS would add (TD-02) |
| `rbac.md` | the permission matrix, how roles map to Better Auth statements, how to add a permission/role/resource |
| `i18n.md` | typed keys, adding a string, Crowdin lifecycle, adding a language, RTL recipe, `i18n:check` |
| `testing.md` | the five layers, factories/world, personas, visual rules, security suites, coverage thresholds |
| `observability.md` | Sentry, Spotlight, logs, request ID, health, Checkly, Arcjet |
| `security.md` | headers, CSP rollout, secret rotation table, scanning |
| `performance.md` | how Lighthouse is run, budgets, before/after, decisions |
| `accessibility.md` · `theming.md` · `seo.md` · `releasing.md` | as written in their sprints |

Two new guides:

📄 **Create `docs/guides/adding-a-feature.md`** — the end-to-end recipe, using a hypothetical **Tasks** resource:
````markdown
# Adding a feature: a worked example ("Tasks" inside an organization)

Follow the **Projects** feature as your template — it exercises every layer. Order matters: each step has a test that protects it.

1. **Schema** — `src/db/schema/task.ts`: `pgTable('task', { id, organizationId (FK, indexed), title, done, createdBy, createdAt })`. Export it from `src/db/schema/index.ts`.
   `pnpm db:generate` → read the SQL → `pnpm db:migrate`. (Expand/contract: new tables are always safe.)
2. **Tenant-scoped access** — add a `tasks` repository to `src/data/tenant-db.ts` next to `projects`. Every query **must** filter by the organization id; the tenant-boundary test forbids importing the raw `db` in `src/app`, `src/components`, `src/actions`.
3. **Permissions** — add `task` to the statements in `src/libs/permissions.ts` and decide which roles get `create/read/update/delete`; update the matrix in `docs/guides/rbac.md` **and** the hand-written matrix test.
4. **Validation** — `src/validations/task.ts` (Zod; messages are i18n keys; use `noNullBytes` for free text).
5. **Server Actions** — `src/actions/tasks.ts` with `createAction` + `withOrgPermission({ task: ['create'] }, …)`.
   Then: a row in `tests/security/action-registry.ts`, a case in `authz-matrix.test.ts`, a stub in `.storybook/stubs/actions.ts`.
6. **Pages** — `src/app/[locale]/(app)/dashboard/[orgSlug]/tasks/{page,loading}.tsx` using `requirePagePermission`, `EmptyState`, `ListSkeleton`, `notify`. The guard-coverage test checks the page is guarded.
7. **i18n** — keys in `en.json` **and** `fr.json` (`pnpm i18n:check`), nav entry in `AppNav`.
8. **Tests** — repository integration test (isolation: another org can't read/update/delete), action tests, component tests for forms, an IDOR case in `idor.test.ts`.
9. **Story** for each new component; **E2E** for the main flow with persona fixtures; add the page to `e2e/a11y.spec.ts`.
10. **Analytics** (optional) — add a typed event to `src/libs/analytics/events.ts`.
11. **Docs** — one paragraph in the relevant guide; `pnpm docs:check`.
12. `pnpm check` → commit (`feat(tasks): …`) → PR. The commit type decides the version.
````
📄 **Create `docs/guides/upgrading.md`:**
````markdown
# Upgrading from the template

A project created from the GitHub template has **no shared history** with it, so updates are pulled deliberately.

1. Read the template's `CHANGELOG.md` between your version and the latest; note breaking changes (`BREAKING CHANGE`).
2. Add the template as a remote (once): `git remote add template https://github.com/OWNER/REPO.git && git fetch template --tags`.
3. On a branch: `git switch -c chore/upgrade-template && git merge template/main --allow-unrelated-histories` (first time) — later merges are ordinary `git merge template/main`.
4. Expect conflicts in: `src/locales/*.json` (your copy), `src/config/brand.ts`, `README.md`, `package.json`, `src/styles/theme.css`. Keep **your** product content; take **theirs** for infrastructure files (`.github/`, `scripts/`, `tests/security/`).
5. `pnpm install && pnpm db:generate` — if the template added migrations, they arrive in `drizzle/`; apply them locally first, then follow expand/contract in production.
6. `pnpm check && pnpm e2e` — fix, then PR. Regenerate visual baselines with the `update-snapshots` label.
Tip: keep customisations in few places (brand config, theme tokens, messages, new routes) and the merges stay small.
````
📄 **Create `docs/guides/troubleshooting.md`** — gather the top issues from the sprints, grouped:
````markdown
# Troubleshooting

## Install & run
| Symptom | Cause → fix |
|---|---|
| `pnpm: command not found` | `corepack enable` (🪟 as administrator once) |
| `Invalid environment variables` | `pnpm setup:env`; compare with `docs/guides/environment.md` |
| Port in use (3000, 3100, 5433, 5434) | stop the other process; E2E uses 3100/5434 on purpose |
| PGlite "too many connections" | the local pool is capped at 1; don't open extra clients; stop `db:studio` while testing |
## Auth
| Symptom | Cause → fix |
|---|---|
| No verification email | local: look in the terminal / `.emails/`; production: Resend domain not verified (see `deployment.md`) |
| Passkey button missing or failing | use `localhost` or HTTPS; the origin must equal `NEXT_PUBLIC_APP_URL` |
| `INVALID_ORIGIN` | `NEXT_PUBLIC_APP_URL` doesn't match the URL in the address bar |
| Signed out after deploy | `BETTER_AUTH_SECRET` changed |
## Tests & CI
| Symptom | Cause → fix |
|---|---|
| Visual tests fail on your machine | baselines are Linux/CI-made — see `testing.md` and `visual-testing.md` |
| `CI OK` red but jobs green | a job was cancelled; re-run. See `testing.md` |
| Coverage threshold failure | add tests (don't exclude files); `pnpm coverage:summary` |
| `i18n:check` fails on French | apostrophe before `{` → use `’` or `''` |
## Deploy
| Symptom | Cause → fix |
|---|---|
| Deploy blocked at "migrate" | read the migration error; fix forward (expand/contract); production is untouched |
| Health check fails after deploy | the promote step never ran, so users are safe; read the smoke-test log |
| Emails land in spam | SPF/DKIM/DMARC not all passing → `deployment.md#email` |
## Windows
LF line endings (`core.autocrlf false`), Git Bash for scripts, no OneDrive, long paths enabled — see `sprint-00` notes in the tutorial or `getting-started.md`.
````

### 3. Verify links automatically, and the quick start from scratch

📄 **Create `.lychee.toml`:**
```toml
# Link checker configuration
accept = [200, 206, 429]
exclude = [
  '^https?://localhost',
  '^https?://127\.0\.0\.1',
  'OWNER/REPO',
  'example\.com',
  'your-app\.example',
]
exclude_path = ['node_modules', '.next', 'CHANGELOG.md', 'docs/tutorial', 'docs/roadmap']
max_retries = 2
timeout = 20
```
📄 **Create `.github/workflows/docs.yml`:**
```yaml
name: Docs

on:
  pull_request:
    paths: ['**/*.md', 'docs/**', 'scripts/**', 'package.json', 'src/libs/Env.ts']
  schedule:
    - cron: '0 6 * * 3' # links rot: check weekly too
  workflow_dispatch:

permissions:
  contents: read

jobs:
  links:
    name: Links
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: lycheeverse/lychee-action@v2
        with:
          args: --config .lychee.toml --no-progress '**/*.md'
          fail: true

  consistency:
    name: Env table and commands
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm docs:check

  quickstart:
    name: README quick start from scratch
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      NEXT_PUBLIC_APP_NAME: SaaS Boilerplate
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - name: Time the documented steps
        run: |
          start=$(date +%s)
          pnpm install --frozen-lockfile
          pnpm setup:env
          (pnpm db:server &) ; sleep 8
          pnpm db:migrate && pnpm db:seed
          pnpm build
          (pnpm start &) ; for i in $(seq 1 30); do curl -sf http://localhost:3000/api/health && break || sleep 2; done
          curl -sf http://localhost:3000/ > /dev/null
          echo "Quick start took $(( $(date +%s) - start )) seconds"
```
> `quickstart` follows the README's commands **verbatim** on a bare runner: if the README breaks the build or an undocumented step creeps in, this job turns red. 🔍 Keep it in sync with the README steps (it is intentionally *not* using the shared setup action).

### 4. The human verification: a clean clone on other machines

Do this once, with a colleague or a second machine (the roadmap's launch checklist asks for **macOS, Linux and Windows/WSL**):
1. Fresh folder, fresh clone, **no** existing `node_modules`/`.env.local`.
2. Follow **only** the README and `getting-started.md`. Don't "just know" anything.
3. Write down: time to first page, every command that failed, every sentence that was unclear.
4. Fix the docs (not your memory); repeat on the next OS.
Record in `06-project-state.md`: OS, Node/pnpm versions, time-to-first-run, fixes.

### ✅ Verify
```bash
pnpm check                     # includes docs:check now
```
1. Break a doc (`pnpm doesnotexist`) → `docs:check-commands` names the file and line. Fix it.
2. Open the PR: *Links*, *Env table and commands* and *README quick start* are green; the last one prints the elapsed seconds (target well under 5 minutes of the roadmap's budget, install dominated).
3. `docs/guides/` has every guide of the table above; each is linked from the README; `lychee` finds no broken link.
4. Clean-clone results recorded for at least **two** operating systems.

**🚢 Ship** — branch `docs/s8-t05-guides-2` · message: `docs: complete the guides, verify commands and links in ci and time the quick start`

---

## 🎫 S8-T06 — Vercel + Neon deployment and the email domain

**Branch:** `ci/s8-t06-deployment-setup` · **Story:** US-084 · **3 SP** · risk **R-13** (email deliverability)

> 🎯 Most of this ticket happens **in dashboards** (Vercel, Neon, Resend, DNS). The repository changes are small but important: a `vercel.json` that hands production deployment over to our pipeline, a build script that migrates **preview** databases (never production), and an app URL that works on previews. Everything is written down in `docs/guides/deployment.md`.

```bash
git switch main && git pull && git switch -c ci/s8-t06-deployment-setup
```

### 1. The app URL must follow the deployment

Each Vercel preview has its own host; auth origins, emails and passkeys have to match it. Make `NEXT_PUBLIC_APP_URL` optional on previews and fall back to Vercel's variable.

📄 **Create `src/libs/app-url.ts`:**
```ts
/**
 * Production sets NEXT_PUBLIC_APP_URL explicitly (custom domain). Preview deployments leave it unset and
 * get the deployment's own host from Vercel — so sign-in cookies, trusted origins and links point at THAT preview.
 */
export function resolveAppUrl({ appUrl, vercelUrl }: { appUrl?: string | undefined; vercelUrl?: string | undefined }): string | undefined {
  if (appUrl) return appUrl;
  if (vercelUrl) return `https://${vercelUrl}`;
  return undefined; // local development: the schema default (http://localhost:3000) applies
}
```
📄 **Create `src/libs/app-url.test.ts`:**
```ts
import { expect, it } from 'vitest';

import { resolveAppUrl } from './app-url';

it('an explicit URL always wins (production)', () => {
  expect(resolveAppUrl({ appUrl: 'https://app.example.com', vercelUrl: 'x-git-main.vercel.app' })).toBe('https://app.example.com');
});
it('previews fall back to the deployment host', () => {
  expect(resolveAppUrl({ vercelUrl: 'my-app-git-feature-team.vercel.app' })).toBe('https://my-app-git-feature-team.vercel.app');
});
it('local development keeps the schema default', () => {
  expect(resolveAppUrl({})).toBeUndefined();
});
```
📄 **Edit `src/libs/Env.ts`:**
```ts
import { resolveAppUrl } from './app-url';

  server: {
    // …
    // Direct (non-pooled) connection: used ONLY for migrations (pgbouncer and migrations don't mix)
    DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  },
  runtimeEnv: {
    // …
    NEXT_PUBLIC_APP_URL: resolveAppUrl({
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      vercelUrl: process.env.NEXT_PUBLIC_VERCEL_URL, // exposed by Vercel when "system environment variables" are enabled
    }),
    DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
```
`.env.example`: add `DATABASE_URL_UNPOOLED=  # production only: the direct Neon URL used for migrations`.
📄 **Migrations use the direct connection** — in the script behind `pnpm db:migrate` (`git grep -n "DATABASE_URL" scripts` finds it), change the connection string line to:
```ts
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
```
(locally both are empty → the embedded server, exactly as before).
```bash
pnpm docs:env     # DATABASE_URL_UNPOOLED is already described in scripts/env-metadata.ts
```

### 2. `vercel.json` and a build script that knows the environment

📄 **Create `vercel.json`:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "node scripts/vercel-build.mjs",
  "git": {
    "deploymentEnabled": { "main": false, "rc": false, "beta": false }
  }
}
```
> Production is deployed by **our workflow** (S8-T07), not by Vercel's Git integration, so a merge to `main` can't ship anything without passing the migration gate. Every *other* branch (previews) still deploys natively. 🔍 `git.deploymentEnabled` per-branch syntax per Vercel's docs.

📄 **Create `scripts/seed-if-empty.ts`:**
```ts
// Seeds a (preview) database only when it has no users yet — so redeploying a preview never duplicates data.
import { spawnSync } from 'node:child_process';

import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error('No database URL');

const pool = new Pool({ connectionString, max: 1 });
try {
  const { rows } = await pool.query('select count(*)::int as count from "user"');
  if (rows[0].count > 0) {
    console.log('Database already has users — not seeding.');
  } else {
    const result = spawnSync('pnpm db:seed', { shell: true, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} finally {
  await pool.end();
}
```
📄 **Create `scripts/vercel-build.mjs`:**
```js
// The ONE build command Vercel runs.
//  - preview     → the preview has its own Neon branch: bring it up to date and give it demo data
//  - production  → NEVER touches the database here; the deploy workflow migrates BEFORE promoting (S8-T07)
import { spawnSync } from 'node:child_process';

const run = (command) => {
  const result = spawnSync(command, { shell: true, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (process.env.VERCEL_ENV === 'preview') {
  run('pnpm db:migrate');
  run('pnpm tsx scripts/seed-if-empty.ts');
}
run('pnpm build');
```
📄 **Edit `knip.config.ts`** → `entry`: `'scripts/vercel-build.mjs'`, `'scripts/seed-if-empty.ts'`.

### 3. Create the services (dashboards — once)

**Neon** (<https://neon.tech>)
1. New project, region **close to your Vercel region** (e.g. Frankfurt ↔ `fra1`); Postgres version = the one you test with.
2. The default branch `main` is **production**. Create a second branch **`staging`** (copy of `main`).
3. Copy for each branch the **pooled** string (host contains `-pooler`) and the **direct** string.

**Vercel** (<https://vercel.com>)
1. *Add New → Project* → import the repository. Framework: Next.js (detected). Root directory: `/`.
2. *Settings → General*: Node.js version 22; **leave the build command empty** — `vercel.json` provides it.
3. *Settings → Git*: confirm *Production Branch* = `main` (our `vercel.json` disables its auto-deploys).
4. *Integrations → Neon → Add*: connect the project, enable **"Create a branch for each preview deployment"** and let it inject `DATABASE_URL` and `DATABASE_URL_UNPOOLED` into **Preview** only.
5. *Settings → Environment Variables*: add the sets below. *Settings → Environment Variables → "Automatically expose System Environment Variables"* ✅ (gives `NEXT_PUBLIC_VERCEL_URL`).
6. *Settings → Deployment Protection*: keep **Vercel Authentication** for previews; for **production** deployments either disable it or create a *Protection Bypass for Automation* secret (the smoke test needs to reach the not-yet-promoted deployment — see S8-T07).
7. Note `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (`.vercel/project.json` after `pnpm dlx vercel link`).

**Production environment variables** (*Environment: Production*)

| Variable | Value / note |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://app.your-domain.example` (**exact**, no trailing slash) |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SUPPORT_EMAIL` | your brand and a mailbox you read |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` — **unique to production**, never reused |
| `DATABASE_URL` | Neon `main` branch, **pooled** |
| `DATABASE_URL_UNPOOLED` | Neon `main` branch, direct (used by the GitHub workflow, not by the app) |
| `EMAIL_TRANSPORT=resend`, `EMAIL_FROM`, `RESEND_API_KEY` | see "Email domain" below |
| `AUTH_RATE_LIMIT` | `on` |
| OAuth `*_CLIENT_ID` / `*_CLIENT_SECRET` | production credentials; redirect URI `https://app.your-domain.example/api/auth/callback/<provider>` |
| `CSP_MODE` | `report-only` for the first week, then `enforce` (S6-T11 rollout) |
| `SITE_INDEXING` | `false` until launch day, then `true` |
| `LEGAL_NOINDEX` | `true` until your legal pages are reviewed |
| `ARCJET_KEY` (`ARCJET_MODE` unset → LIVE) · Sentry (DSN + org/project/token) · Better Stack · PostHog | optional integrations |
| `ADMIN_EMAILS` | the platform admins (then `pnpm admin:grant` once) |
**Preview**: the same set, but *without* `NEXT_PUBLIC_APP_URL` (so previews derive it), `EMAIL_TRANSPORT=console`, test OAuth apps or none, `SITE_INDEXING=false`.
**Passkeys** use the host of `NEXT_PUBLIC_APP_URL` as their relying-party id: a passkey registered on production does not exist on previews — by design.

```bash
pnpm dlx vercel link && pnpm dlx vercel env pull .env.vercel.check --environment=production
# compare against docs/guides/environment.md; then delete the file (it contains secrets):
rm .env.vercel.check
```

### 4. Email domain (Resend)

1. Resend → *Domains → Add Domain*: use a **sub-domain** such as `mail.your-domain.example` (keeps your root domain's mail reputation separate).
2. Add the DNS records Resend lists at your DNS provider: the **SPF** TXT/MX records and the **DKIM** record(s). Click *Verify* (propagation: minutes to hours).
3. Add **DMARC** at `_dmarc.your-domain.example` — start in monitoring mode:
```text
v=DMARC1; p=none; rua=mailto:dmarc@your-domain.example; adkim=s; aspf=s
```
   After **2–4 weeks** of clean reports move to `p=quarantine`, then `p=reject`.
4. `EMAIL_FROM="Your Product <noreply@mail.your-domain.example>"`.
5. **Test every template** on staging with `EMAIL_TRANSPORT=resend` to a Gmail address and an Outlook address:

| Template | How to trigger |
|---|---|
| Verify your email | sign up · "resend verification" |
| Reset your password | "forgot password" |
| Magic link | sign in with a magic link |
| Change email confirmation | account → email |
| Organization invitation | invite a member |
| Email OTP (if enabled) | two-factor via email |
For each: it arrives in the **inbox** (not spam); Gmail → *Show original* → `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`; links point at the right host; French and English render. Send one to <https://www.mail-tester.com> — target **≥ 9/10**.

### 5. Custom domain, HTTPS, HSTS

- Vercel → *Domains* → add `app.your-domain.example`; create the CNAME/A record Vercel shows; HTTPS certificates are automatic.
- Our HSTS header already contains `includeSubDomains; preload` (S6-T9). **Decision to record:** do **not** submit to <https://hstspreload.org> yet — preloading is hard to undo and covers *every* sub-domain. Submit only after one month of stable HTTPS everywhere. Write the decision (and its date) in the guide.

### 6. The deployment guide

📄 **Create `docs/guides/deployment.md`:**
````markdown
# Deployment (Vercel + Neon)

## Overview
```
merge feat/fix → CI passes → Release (tag vX.Y.Z) → Deploy workflow:
  build → migrate (direct Neon URL) → deploy (not live yet) → smoke test /api/health → promote
```
Previews: every pull request/branch gets a Vercel preview **and** its own Neon branch (migrated and seeded by `scripts/vercel-build.mjs`).
Staging: the long-lived `staging` branch → `staging.your-domain.example` with the Neon `staging` branch.

## One-time setup  (≈ 30 minutes)
1. Neon project, branches `main` (production) and `staging`, pooled + direct URLs.
2. Vercel project, Neon integration (preview branches), environment variables (tables in `environment.md`; checklist below).
3. GitHub: secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`; **environment `production`** with a required reviewer and the secret `DATABASE_URL_UNPOOLED`; optional `VERCEL_AUTOMATION_BYPASS_SECRET`, `CHECKLY_*`, `NEON_API_KEY` (+ variable `NEON_PROJECT_ID`).
4. Resend domain (SPF, DKIM, DMARC) — see **Email**.
5. Domain + HTTPS. OAuth redirect URIs: `https://<domain>/api/auth/callback/<provider>`.
6. First deploy: merge a `feat:`/`fix:` commit (or run the **Deploy** workflow manually) and approve the `production` environment.

## Production checklist
`NEXT_PUBLIC_APP_URL` exact · unique `BETTER_AUTH_SECRET` · pooled `DATABASE_URL` · `EMAIL_TRANSPORT=resend` + verified domain ·
`AUTH_RATE_LIMIT=on` · OAuth redirect URIs · `CSP_MODE=report-only` → `enforce` after a clean week · `SITE_INDEXING` + `LEGAL_NOINDEX` decisions ·
Checkly pointed at production · `ADMIN_EMAILS` + `pnpm admin:grant`.

## Email
Sub-domain with SPF + DKIM; DMARC `p=none` → `quarantine` → `reject` over weeks. Test every template (inbox, headers all PASS, mail-tester ≥ 9).

## Custom domain & HSTS
HTTPS is automatic. HSTS is sent with `preload`; **HSTS preload submission is deferred** until a month of stable HTTPS on all sub-domains _(decision date: …)_.

## Migrations: the rule
Expand/contract only (`database.md`). The pipeline runs the migration **before** the new code is live, so the *previous* code must keep working with the new schema.
`pnpm check:migrations` blocks destructive SQL unless a human approved it.

## Rollback runbook
| Situation | Action | Time |
|---|---|---|
| Bad release, schema fine | Vercel → Deployments → previous production deployment → **Instant Rollback** (or `vercel rollback`). Then ship a `revert:` commit. | ~1 min |
| Bad migration (expand/contract was respected) | Roll the app back as above; the old code works with the new schema. Fix forward with a new migration. | ~1 min + fix |
| Data damaged | Neon → Branches → **Restore** `main` to a timestamp before the incident (creates a restore point; take a branch first). Roll the app back to the version that matched that schema. | 5–15 min |
| Deploy pipeline failed before "promote" | Nothing to do: production still serves the old version. Read the failed step, fix, re-run. | — |
Never edit production data by hand without a Neon branch/backup first.

## Rehearsal log
| Date | Scenario | Detection | Recovery time | Notes |
|---|---|---|---|---|
| | breaking migration on staging, then rollback | | | |

## Appendix: Docker / standalone (stretch)
Set `output: 'standalone'` in `next.config.ts`, then a multi-stage Dockerfile: `corepack enable && pnpm install --frozen-lockfile` → `pnpm build` → copy `.next/standalone`, `.next/static`, `public` → `CMD ["node","server.js"]`. Provide the same environment variables; run migrations as a separate job (`pnpm db:migrate`) against `DATABASE_URL_UNPOOLED`.
````

### ✅ Verify
```bash
pnpm test && pnpm docs:check && pnpm check && pnpm build
```
1. With `NEXT_PUBLIC_APP_URL` **unset** and `NEXT_PUBLIC_VERCEL_URL=my-preview.vercel.app`, `pnpm build` (or the unit test) yields `https://my-preview.vercel.app`; locally nothing changes.
2. Open a **pull request**: Vercel comments with a preview URL; the preview works (sign-up verification email is printed in Vercel's function logs because `EMAIL_TRANSPORT=console`); a Neon branch `preview/<branch>` appears and is seeded once (redeploy → *"Database already has users — not seeding"*).
3. Production variables are set; `vercel env pull` matches the checklist.
4. Email: all templates tested, DNS records verified, mail-tester score recorded.
5. Merging this PR does **not** change production (the pipeline arrives in the next ticket).

**🚢 Ship** — branch `ci/s8-t06-deployment-setup` · message: `ci(deploy): add vercel build script, preview url fallback, unpooled migrations and deployment guide`

---

## 🎫 S8-T07 — The deploy pipeline: migrate, smoke test, promote, roll back

**Branch:** `ci/s8-t07-deploy-pipeline` · **Story:** US-084 · **2 SP** · risk **R-14** (migration failures in production)

> 🎯 **Fail closed.** Each step must succeed for the next to run, and the last step — making users see the new version — comes *after* the new version has proven it's alive. A failed migration or a failed smoke test leaves production exactly as it was.

```bash
git switch main && git pull && git switch -c ci/s8-t07-deploy-pipeline
```

### 1. A lint for dangerous migrations

Expand/contract only works if nobody slips in a `DROP COLUMN` by accident.

📄 **Create `scripts/check-migrations.ts`:**
```ts
// pnpm check:migrations — destructive SQL in a migration needs an explicit, reviewed approval.
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const RULES: [RegExp, string][] = [
  [/\bDROP\s+TABLE\b/i, 'DROP TABLE'],
  [/\bDROP\s+COLUMN\b/i, 'DROP COLUMN'],
  [/\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/i, 'SET NOT NULL'],
  [/\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i, 'ALTER COLUMN TYPE'],
  [/\bRENAME\s+(?:COLUMN|TO)\b/i, 'RENAME'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  [/\bDELETE\s+FROM\b(?![^;]*\bWHERE\b)/i, 'DELETE without WHERE'],
];

/** Statements that break the *previous* version of the code (so can't ship in the same release). */
export function findDestructive(sql: string): string[] {
  // Drizzle separates statements with `--> statement-breakpoint`; comments never count
  const withoutComments = sql.replace(/--[^\n]*/g, '');
  return RULES.filter(([pattern]) => pattern.test(withoutComments)).map(([, label]) => label);
}

type Approvals = Record<string, string>; // migration file → reason

function main() {
  const approvals = JSON.parse(readFileSync('drizzle/destructive-approved.json', 'utf8')) as Approvals;
  const problems: string[] = [];

  for (const file of readdirSync('drizzle').filter((name) => name.endsWith('.sql')).sort()) {
    const found = findDestructive(readFileSync(`drizzle/${file}`, 'utf8'));
    if (found.length > 0 && !approvals[file]) problems.push(`${file}: ${found.join(', ')}`);
  }

  if (problems.length > 0) {
    console.error(
      `❌ Destructive migration(s) without approval:\n  ${problems.join('\n  ')}\n\n` +
        `Expand/contract: split it over two releases (see docs/guides/database.md).\n` +
        `If this IS the contract step (code no longer uses the old column), add the file to drizzle/destructive-approved.json with a reason.`,
    );
    process.exit(1);
  }
  console.log('✅ no unapproved destructive migrations');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
```
📄 **Create `drizzle/destructive-approved.json`:**
```json
{}
```
Run it against the history you already have:
```bash
pnpm check:migrations
```
Any early migration that legitimately dropped something (e.g. Sprint 2's `app_meta` table) is listed — add it with a reason **instead of editing the SQL file**:
```json
{ "0002_remove_app_meta.sql": "Sprint 2: app_meta was never used in production; code removed in the same commit (pre-1.0, no deployed data)" }
```
📄 **Create `tests/scripts/check-migrations.test.ts`:**
```ts
import { expect, it } from 'vitest';

import { findDestructive } from '../../scripts/check-migrations';

it('allows additive migrations', () => {
  expect(findDestructive('CREATE TABLE "task" ("id" uuid PRIMARY KEY);\n--> statement-breakpoint\nALTER TABLE "task" ADD COLUMN "title" text;')).toEqual([]);
  expect(findDestructive('CREATE INDEX "task_org_idx" ON "task" ("organization_id");')).toEqual([]);
});

it('flags the changes that break the previous version of the code', () => {
  expect(findDestructive('ALTER TABLE "user" DROP COLUMN "legacy";')).toEqual(['DROP COLUMN']);
  expect(findDestructive('DROP TABLE "old";')).toEqual(['DROP TABLE']);
  expect(findDestructive('ALTER TABLE "user" ALTER COLUMN "name" SET NOT NULL;')).toEqual(['SET NOT NULL']);
  expect(findDestructive('ALTER TABLE "user" RENAME COLUMN "a" TO "b";')).toContain('RENAME');
  expect(findDestructive('DELETE FROM "session";')).toEqual(['DELETE without WHERE']);
});

it('ignores commented-out SQL', () => {
  expect(findDestructive('-- DROP TABLE "x";\nSELECT 1;')).toEqual([]);
});
```
📄 **Edit `package.json`:** `"check:migrations": "tsx scripts/check-migrations.ts"`; add it to the `check` script (after `db:check`) and to the `quality` job in `ci.yml` (`- run: pnpm check:migrations`). Knip `entry`: `'scripts/check-migrations.ts'`.

### 2. The deploy workflow

📄 **Create `.github/workflows/deploy.yml`:**
```yaml
name: Deploy

on:
  push:
    tags: ['v*'] # created by Semantic Release (S8-T02)
  workflow_dispatch: # re-run a failed deploy for an existing tag
    inputs:
      tag:
        description: 'Release tag to deploy (e.g. v1.0.0)'
        required: true

permissions:
  contents: read

concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
  TAG: ${{ github.event.inputs.tag || github.ref_name }}

jobs:
  production:
    name: Build → migrate → smoke test → promote
    # Pre-releases (v1.0.0-rc.1) are published on GitHub but never deployed to production
    if: ${{ !contains(github.event.inputs.tag || github.ref_name, '-') }}
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: production # ← required reviewer + the production-only secrets live here
    outputs:
      url: ${{ steps.deploy.outputs.url }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ env.TAG }}
      - uses: ./.github/actions/setup

      - name: Version
        run: echo "VERSION=${TAG#v}" >> "$GITHUB_ENV"

      - name: Refuse destructive migrations that weren't approved
        run: pnpm check:migrations

      - name: Pull production settings from Vercel
        run: pnpm dlx vercel@latest pull --yes --environment=production --token "${{ secrets.VERCEL_TOKEN }}"

      - name: Build (the exact artefact that will be deployed)
        env:
          APP_VERSION: ${{ env.VERSION }}
          SENTRY_RELEASE: ${{ env.VERSION }} # errors and source maps are grouped by release
        run: pnpm dlx vercel@latest build --prod --token "${{ secrets.VERCEL_TOKEN }}"

      # ── The database BEFORE the code. If this fails, nothing below runs and production is untouched. ──
      - name: Migrate the production database
        env:
          DATABASE_URL_UNPOOLED: ${{ secrets.DATABASE_URL_UNPOOLED }}
        run: pnpm db:migrate

      - name: Deploy (not live yet)
        id: deploy
        run: |
          url=$(pnpm dlx vercel@latest deploy --prebuilt --prod --skip-domain --token "${{ secrets.VERCEL_TOKEN }}")
          echo "url=$url" >> "$GITHUB_OUTPUT"
          echo "Deployed (not promoted): $url"

      - name: Smoke test the new deployment
        env:
          URL: ${{ steps.deploy.outputs.url }}
          BYPASS: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
        run: |
          headers=()
          [ -n "$BYPASS" ] && headers=(-H "x-vercel-protection-bypass: $BYPASS")
          curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-connrefused "${headers[@]}" "$URL/api/health" | tee health.json
          jq -e --arg v "$VERSION" '.status == "ok" and .db == "ok" and .version == $v' health.json

      - name: Promote to production
        run: pnpm dlx vercel@latest promote "${{ steps.deploy.outputs.url }}" --yes --token "${{ secrets.VERCEL_TOKEN }}"

  # @strip:checkly:start
  checks:
    name: Production monitoring checks
    needs: production
    uses: ./.github/workflows/checkly.yml
    secrets: inherit
  # @strip:checkly:end
```
Turn the Checkly workflow into a callable one — 📄 **edit `.github/workflows/checkly.yml`:** replace the `on:` block with:
```yaml
on:
  workflow_call:
  workflow_dispatch:
```
> 🔒 **Why this order is safe.** (1) the migration is **expand-only**, so the *old* code, which is still what users see, keeps working with the new schema; (2) the new code is deployed but **not aliased** to the domain; (3) only a healthy `/api/health` reporting the **right version and a working database** triggers `promote`. A failure anywhere before promote = users never noticed.
> 🧑‍⚖️ The `production` **environment** pauses the job for a human approval before it touches the database — the cheapest safety net there is.
> 🔍 Flags (`--skip-domain`, `promote`) per the current Vercel CLI; if your version differs, the pattern (deploy un-aliased → verify → promote) stays the same.

GitHub setup (*Settings → Environments → New environment `production`*): add **Required reviewers** (yourself), and the environment secret `DATABASE_URL_UNPOOLED`. Repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, optional `VERCEL_AUTOMATION_BYPASS_SECRET`.

### 3. Clean up preview databases when a PR closes

📄 **Create `.github/workflows/neon-preview-cleanup.yml`:**
```yaml
name: Preview database cleanup

on:
  pull_request:
    types: [closed]

permissions:
  contents: read

jobs:
  delete-branch:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      NEON_API_KEY: ${{ secrets.NEON_API_KEY }}
    steps:
      - name: Not configured
        if: ${{ env.NEON_API_KEY == '' }}
        run: echo "NEON_API_KEY not set — skipping (previews keep their branch until you delete it)."
      - name: Delete the preview's Neon branch
        if: ${{ env.NEON_API_KEY != '' && github.event.pull_request.head.repo.full_name == github.repository }}
        uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          branch: preview/${{ github.event.pull_request.head.ref }} # 🔍 the integration names branches preview/<git-branch>
          api_key: ${{ secrets.NEON_API_KEY }}
```

### 4. The rehearsal (do it — it is the point of the ticket)

On **staging** (never production):
1. **Fail closed.** In a branch add a migration with a deliberate error (`ALTER TABLE "nope" ADD COLUMN "x" text;`). Run `pnpm db:migrate` against the **staging** direct URL → it exits non-zero. In the pipeline, that is the step *before* `deploy`: nothing would be deployed. Also try `DROP COLUMN` → `pnpm check:migrations` blocks it before anything runs.
2. **Breaking-then-reverted.** Merge to `staging` a migration that **renames** a column the running code uses (approve it in `destructive-approved.json` for the exercise). Watch staging break (errors/`/api/health`), then:
   - roll the app back (Vercel → previous deployment → *Instant Rollback*) → note the time;
   - restore the database: Neon → *Restore* the `staging` branch to a timestamp before the migration → note the time.
3. Write both timings and what you'd improve into the **Rehearsal log** table of `docs/guides/deployment.md`.
4. Add the rule to `AGENTS.md` → Conventions: *"Migrations are expand/contract only. A destructive statement needs an approval row in `drizzle/destructive-approved.json` and its own release. Production runs the migration before the new code is live."*

### ✅ Verify
```bash
pnpm test tests/scripts && pnpm check
```
1. Open the PR: *Quality* now runs `check:migrations`; the workflow files lint (`gh workflow list`).
2. **First real deploy** (after merging): merge a small `fix:` PR → CI → *Release* creates `v1.0.0` → *Deploy* starts and **waits for approval** → approve → migrate, deploy, smoke test (`{"status":"ok","version":"1.0.0"…}`), promote → the live site reports `1.0.0` at `/api/health`; Sentry shows release `1.0.0`; the Checkly job (if enabled) is green.
3. **Break it on purpose** (a throw-away tag on a branch you can delete, e.g. dispatch with a tag whose smoke test fails): the job stops before *Promote*; `https://your-domain/` still serves the previous version.
4. Rollback and database-restore timings are in the rehearsal log.

**🚢 Ship** — branch `ci/s8-t07-deploy-pipeline` · message: `ci(deploy): add gated production pipeline with migration lint, smoke test, promote and preview cleanup`

---

## 🎫 S8-T08 — CodeRabbit, templates, CODEOWNERS, Dependabot, rules as code

**Branch:** `chore/s8-t08-governance` · **Story:** US-081 · **3 SP**

```bash
git switch main && git pull && git switch -c chore/s8-t08-governance
mkdir -p .github/ISSUE_TEMPLATE .github/rulesets
```

### 1. CodeRabbit (AI review that knows our rules)

Install the **CodeRabbit GitHub App** on the repository (outside the repo). Then:

📄 **Create `.coderabbit.yaml`:**
```yaml
# 🔍 Keys per the current CodeRabbit schema: https://docs.coderabbit.ai/reference/configuration
language: en-US
reviews:
  profile: assertive
  high_level_summary: true
  request_changes_workflow: false # advisory: humans decide
  auto_review:
    enabled: true
    drafts: false
    base_branches: ['main']
  path_filters:
    - '!**/pnpm-lock.yaml'
    - '!drizzle/meta/**'
    - '!e2e/visual/__screenshots__/**'
    - '!docs/images/**'
    - '!CHANGELOG.md'
    - '!.lighthouseci/**'
  path_instructions:
    - path: 'src/data/**'
      instructions: >
        Security-critical. Every query touching tenant data must be scoped by organization id and go through tenantDb.
        Authorization must be checked on the server (requireOrgMember / requirePermission), never trusted from the client.
        Flag any raw db import outside src/data.
    - path: 'src/actions/**'
      instructions: >
        Server Actions are public endpoints. They must use createAction + withAuth/withOrgPermission, validate input with Zod,
        never return secrets, and have a row in tests/security/action-registry.ts and a case in authz-matrix.test.ts.
    - path: 'src/libs/Auth*.ts'
      instructions: 'Authentication configuration. Check session freshness, rate limits, trusted origins and that no secret is logged.'
    - path: 'src/libs/permissions.ts'
      instructions: 'Changing a permission changes the authorization matrix: docs/guides/rbac.md and the matrix test must change in the same PR.'
    - path: 'src/proxy.ts'
      instructions: 'Runs on every request. Keep it fast and side-effect free; protection (Arcjet, CSP) must fail open or closed deliberately.'
    - path: 'drizzle/**'
      instructions: >
        Migrations run before the new code is live. Only expand/contract-safe changes: additive, nullable or defaulted columns.
        Flag DROP, RENAME, SET NOT NULL, type changes. See docs/guides/database.md.
    - path: 'src/locales/**'
      instructions: 'Both languages must change together; ICU placeholders must be identical; apostrophes before { must be ’ or doubled.'
    - path: '**/*.tsx'
      instructions: 'Accessibility (labels, keyboard, contrast tokens), logical CSS properties only (ms-/pe-/text-start), no hard-coded brand name or colours.'
    - path: '.github/workflows/**'
      instructions: 'Least-privilege permissions, no secrets in logs, pin third-party actions to a major version, no untrusted input in run: steps.'
chat:
  auto_reply: true
knowledge_base:
  code_guidelines:
    enabled: true
    filePatterns: ['AGENTS.md', 'docs/guides/*.md']
```

### 2. Pull-request and issue templates

📄 **Create `.github/PULL_REQUEST_TEMPLATE.md`:**
````markdown
## What and why
<!-- One paragraph. Link the issue: Closes #123 -->

## Type
- [ ] feat  - [ ] fix  - [ ] perf  - [ ] refactor  - [ ] docs  - [ ] test  - [ ] ci/chore
<!-- The commit/PR title decides the release: feat → minor, fix/perf → patch, `!` or BREAKING CHANGE → major -->

## Definition of done
- [ ] `pnpm check` passes locally
- [ ] Tests added/updated (behaviour, not only coverage)
- [ ] New Server Action → row in `tests/security/action-registry.ts` + matrix case
- [ ] Tenant data only via `tenantDb`; permissions checked on the server
- [ ] Strings in **both** `en.json` and `fr.json`; `pnpm i18n:check`
- [ ] UI: story added/updated; keyboard + screen-reader sanity check; logical CSS properties; no hard-coded brand/colours
- [ ] Migration is **expand/contract-safe** (additive) — or approved in `drizzle/destructive-approved.json` with a reason
- [ ] Docs updated (`docs/guides/…`); `pnpm docs:check` passes
- [ ] No secrets, no new `process.env` outside `Env.ts`; new env var described in `scripts/env-metadata.ts`
- [ ] Visual change? Added the `update-snapshots` label and reviewed the images

## Screenshots / notes for reviewers
````
📄 **Create `.github/ISSUE_TEMPLATE/bug_report.yml`:**
```yaml
name: Bug report
description: Something doesn't work as documented
labels: [bug, triage]
body:
  - type: markdown
    attributes:
      value: 'Security problem? **Do not file it here** — see SECURITY.md.'
  - type: textarea
    id: what
    attributes: { label: What happened?, description: What did you expect instead? }
    validations: { required: true }
  - type: textarea
    id: steps
    attributes: { label: Steps to reproduce, placeholder: '1. …\n2. …' }
    validations: { required: true }
  - type: input
    id: version
    attributes: { label: Version / commit }
  - type: input
    id: env
    attributes: { label: 'OS, Node, pnpm, browser' }
  - type: textarea
    id: logs
    attributes: { label: Logs or screenshots, description: 'Remove secrets first.' }
```
📄 **Create `.github/ISSUE_TEMPLATE/feature_request.yml`:**
```yaml
name: Feature request
description: Suggest an improvement
labels: [enhancement, triage]
body:
  - type: textarea
    id: problem
    attributes: { label: What problem would this solve? }
    validations: { required: true }
  - type: textarea
    id: proposal
    attributes: { label: What do you propose? }
  - type: dropdown
    id: scope
    attributes:
      label: Does it fit the template's scope?
      options: ['Core (every project needs it)', 'Optional module', 'Not sure']
```
📄 **Create `.github/ISSUE_TEMPLATE/config.yml`:**
```yaml
blank_issues_enabled: false
contact_links:
  - name: Report a security vulnerability
    url: https://github.com/OWNER/REPO/security/advisories/new
    about: Private reporting — please don't open a public issue.
  - name: Ask a question
    url: https://github.com/OWNER/REPO/discussions
    about: Usage questions and ideas belong in Discussions.
```

### 3. Owners and dependency updates

📄 **Create `.github/CODEOWNERS`:**
```text
# The last matching pattern wins. Replace @OWNER with a user or a team (@org/maintainers).
*                           @OWNER
/.github/                   @OWNER
/drizzle/                   @OWNER
/src/data/                  @OWNER
/src/actions/               @OWNER
/src/libs/Auth*.ts          @OWNER
/src/libs/auth-*.ts         @OWNER
/src/libs/permissions.ts    @OWNER
/src/proxy.ts               @OWNER
/tests/security/            @OWNER
/scripts/                   @OWNER
```
📄 **Replace `.github/dependabot.yml`:**
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly, day: monday }
    open-pull-requests-limit: 10
    commit-message: { prefix: chore, include: scope } # chore(deps): … → never triggers a release by itself
    groups:
      framework: { patterns: ['next', 'next-intl', 'react', 'react-dom', '@types/react', '@types/react-dom'] }
      auth: { patterns: ['better-auth', '@better-auth/*'] }
      database: { patterns: ['drizzle-orm', 'drizzle-kit', '@electric-sql/pglite*', 'pg', '@types/pg'] }
      testing: { patterns: ['vitest', '@vitest/*', 'vitest-browser-*', 'playwright', '@playwright/*', '@axe-core/*', '@testing-library/*', '@lhci/*'] }
      storybook: { patterns: ['storybook', '@storybook/*'] }
      tooling: { patterns: ['oxlint*', 'oxfmt*', 'ultracite', 'lefthook', 'knip', 'typescript', 'tsx', '@commitlint/*', 'commitizen', 'cz-*', 'semantic-release', '@semantic-release/*', 'conventional-changelog-*'] }
      observability: { patterns: ['@sentry/*', '@spotlightjs/*', '@logtape/*', 'posthog-*', '@arcjet/*', 'checkly'] }
      ui: { patterns: ['@radix-ui/*', 'lucide-react', 'sonner', 'tailwindcss', '@tailwindcss/*', 'tailwind-merge', 'class-variance-authority', 'clsx', 'culori'] }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly, day: monday }
    commit-message: { prefix: ci }
    groups:
      actions: { patterns: ['*'] }
```
📄 **Create `.github/workflows/dependabot-automerge.yml`** — **patch** updates only, and only after the required checks pass:
```yaml
name: Dependabot auto-merge

on: pull_request

permissions:
  contents: write
  pull-requests: write

jobs:
  automerge:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
      - name: Enable auto-merge for patch updates (merges when CI OK is green)
        if: steps.metadata.outputs.update-type == 'version-update:semver-patch'
        run: gh pr merge --auto --merge "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
Repository setting: *Settings → General → Pull Requests → **Allow auto-merge** ✅*. Minor and major updates are **never** merged automatically — a human reads the changelog.

### 4. Branch protection as code

📄 **Create `.github/rulesets/main.json`:**
```json
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [{ "context": "CI OK" }, { "context": "Secret scan" }, { "context": "CodeQL" }]
      }
    }
  ]
}
```
> `actor_id: 5` is the **Repository admin** role — the owner of `RELEASE_TOKEN` (S8-T02) uses it to push the release commit. 🔍 Confirm the role id and schema in GitHub's rulesets docs. A solo maintainer can leave `required_approving_review_count` at `0`; a team should use `1` and enable `require_code_owner_review`.

Apply it (replacing the ruleset you created in Sprint 1 so there are no duplicates):
```bash
gh api repos/{owner}/{repo}/rulesets --jq '.[] | "\(.id) \(.name)"'     # find the old one
gh api repos/{owner}/{repo}/rulesets/<old-id> --method DELETE
gh api repos/{owner}/{repo}/rulesets --method POST --input .github/rulesets/main.json
```
**Signed commits** are optional: add `{ "type": "required_signatures" }` if your team uses them (document how to set up signing in `CONTRIBUTING.md`).

### ✅ Verify
```bash
pnpm check
```
1. Open the PR: CodeRabbit posts a summary and path-aware comments (try touching `src/data/` in a throw-away commit to see its security instructions at work).
2. *New issue* shows the two forms, no blank issue, and the security link; *New pull request* is pre-filled with the checklist.
3. Dependabot: *Insights → Dependency graph → Dependabot* shows the groups; a patch PR (or run *Check for updates*) auto-merges once `CI OK` is green; a minor PR waits for you.
4. `gh api repos/{owner}/{repo}/rulesets` lists the one `main` ruleset; pushing directly to `main` as a non-admin is rejected; the release bot (admin PAT) can still push.

**🚢 Ship** — branch `chore/s8-t08-governance` · message: `chore: add coderabbit config, templates, codeowners, grouped dependabot with patch auto-merge and rulesets as code`

---

## 🎫 S8-T09 — The template init script

**Branch:** `feat/s8-t09-init-template` · **Story:** US-083 · **3 SP**

> 🎯 *"I cloned it. Now what?"* → `pnpm init:template`: it asks (or takes flags) for the name, slug, description, repository, default language and accent, rewrites the right files, creates `.env.local` with a fresh secret, and can reset git history. **Idempotent**, with a **dry run**, and its logic is **pure functions** so it's unit-tested.

```bash
git switch main && git pull && git switch -c feat/s8-t09-init-template
mkdir -p scripts/lib
```

### 1. The pure part

📄 **Create `scripts/lib/init-transforms.ts`:**
```ts
export type Accent = 'neutral' | 'blue' | 'green';

export type Answers = {
  name: string;
  slug: string;
  description: string;
  repoUrl: string; // https://github.com/owner/repo
  owner: string;
  repoName: string;
  locale: string;
  accent: Accent;
};

export type Files = Record<string, string>;

export const slugify = (value: string) =>
  value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function parseRepoUrl(url: string): { owner: string; repoName: string } | null {
  const match = /github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? { owner: match[1]!, repoName: match[2]! } : null;
}

const setLine = (text: string, key: string, value: string) => {
  const pattern = new RegExp(`^#?\\s*${key}=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, `${key}=${value}`) : `${text.replace(/\n*$/, '\n')}${key}=${value}\n`;
};

/** Where the placeholder repository/owner appear (the init script replaces them). */
export const PLACEHOLDER_FILES = [
  'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE', '.github/CODEOWNERS', '.github/ISSUE_TEMPLATE/config.yml',
];

/**
 * Pure: takes the current content of the files, returns the new content.
 * Running it twice with the same answers gives the same result (idempotent).
 */
export function applyInit(files: Files, answers: Answers): Files {
  const out: Files = { ...files };
  const edit = (path: string, change: (text: string) => string) => {
    if (out[path] !== undefined) out[path] = change(out[path]!);
  };

  edit('package.json', (text) => {
    const json = JSON.parse(text);
    json.name = answers.slug;
    json.description = answers.description;
    json.version = '0.0.0'; // Semantic Release writes the real versions
    json.repository = { type: 'git', url: `git+https://github.com/${answers.owner}/${answers.repoName}.git` };
    return `${JSON.stringify(json, null, 2)}\n`;
  });

  edit('README.md', (text) =>
    text
      .replace(/(<!-- init:title -->\n)[\s\S]*?(\n<!-- \/init:title -->)/, `$1# ${answers.name}$2`)
      .replace(/(<!-- init:description -->\n)[\s\S]*?(\n<!-- \/init:description -->)/, `$1> ${answers.description}$2`),
  );

  for (const path of PLACEHOLDER_FILES) {
    edit(path, (text) =>
      text
        .replaceAll('OWNER/REPO', `${answers.owner}/${answers.repoName}`)
        .replaceAll('@OWNER', `@${answers.owner}`)
        .replace(/Copyright \(c\) (\d{4}) OWNER/, `Copyright (c) $1 ${answers.owner}`),
    );
  }

  edit('src/i18n/routing.ts', (text) => text.replace(/defaultLocale:\s*'[a-zA-Z-]+'/, `defaultLocale: '${answers.locale}'`));
  edit('src/config/brand.ts', (text) =>
    text.replace(/github:\s*(?:undefined|'[^']*')\s+as string \| undefined/, `github: '${answers.repoUrl}' as string | undefined`),
  );

  for (const path of ['.env.example', '.env.development']) {
    edit(path, (text) => setLine(setLine(text, 'NEXT_PUBLIC_APP_NAME', answers.name), 'NEXT_PUBLIC_ACCENT', answers.accent));
  }
  return out;
}

/** Content for .env.local: keep what's there, make sure a secret and the brand are set. */
export function buildEnvLocal(existing: string | undefined, example: string, secret: string, answers: Pick<Answers, 'name' | 'accent'>): string {
  let text = existing ?? example;
  if (!/^BETTER_AUTH_SECRET=.{32,}/m.test(text)) text = setLine(text, 'BETTER_AUTH_SECRET', secret);
  text = setLine(text, 'NEXT_PUBLIC_APP_NAME', answers.name);
  return setLine(text, 'NEXT_PUBLIC_ACCENT', answers.accent);
}
```
📄 **Create `tests/scripts/init-transforms.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';

import { applyInit, type Answers, buildEnvLocal, parseRepoUrl, slugify } from '../../scripts/lib/init-transforms';

const answers: Answers = {
  name: 'Acme Cloud',
  slug: 'acme-cloud',
  description: 'Acme’s cloud',
  repoUrl: 'https://github.com/acme/cloud',
  owner: 'acme',
  repoName: 'cloud',
  locale: 'fr',
  accent: 'blue',
};

const files = () => ({
  'package.json': JSON.stringify({ name: 'saas-boilerplate', version: '1.4.0', scripts: { dev: 'x' } }),
  'README.md': '<!-- init:title -->\n# SaaS Boilerplate\n<!-- /init:title -->\n[ci](https://github.com/OWNER/REPO)\n<!-- init:description -->\n> old\n<!-- /init:description -->',
  'LICENSE': 'Copyright (c) 2026 OWNER',
  '.github/CODEOWNERS': '* @OWNER',
  'src/i18n/routing.ts': "export const routing = { locales: ['en', 'fr'], defaultLocale: 'en' };",
  'src/config/brand.ts': 'social: { github: undefined as string | undefined, x: undefined as string | undefined }',
  '.env.example': '# comment\nNEXT_PUBLIC_APP_NAME=SaaS Boilerplate\n# NEXT_PUBLIC_ACCENT=neutral\n',
});

describe('applyInit', () => {
  it('renames the project everywhere that matters', () => {
    const out = applyInit(files(), answers);
    expect(JSON.parse(out['package.json']!)).toMatchObject({ name: 'acme-cloud', description: 'Acme’s cloud', version: '0.0.0', repository: { url: 'git+https://github.com/acme/cloud.git' }, scripts: { dev: 'x' } });
    expect(out['README.md']).toContain('# Acme Cloud');
    expect(out['README.md']).toContain('github.com/acme/cloud');
    expect(out['README.md']).toContain('> Acme’s cloud');
    expect(out['LICENSE']).toBe('Copyright (c) 2026 acme');
    expect(out['.github/CODEOWNERS']).toBe('* @acme');
    expect(out['src/i18n/routing.ts']).toContain("defaultLocale: 'fr'");
    expect(out['src/config/brand.ts']).toContain("github: 'https://github.com/acme/cloud'");
    expect(out['.env.example']).toContain('NEXT_PUBLIC_APP_NAME=Acme Cloud');
    expect(out['.env.example']).toContain('NEXT_PUBLIC_ACCENT=blue');
  });

  it('is idempotent: applying it again changes nothing', () => {
    const once = applyInit(files(), answers);
    expect(applyInit(once, answers)).toEqual(once);
  });

  it('ignores files that are not there', () => {
    expect(applyInit({}, answers)).toEqual({});
  });
});

describe('helpers', () => {
  it('slugifies names', () => {
    expect(slugify('Acme Cloud — Été!')).toBe('acme-cloud-ete');
  });
  it('parses GitHub URLs in both forms', () => {
    expect(parseRepoUrl('https://github.com/acme/cloud')).toEqual({ owner: 'acme', repoName: 'cloud' });
    expect(parseRepoUrl('git@github.com:acme/cloud.git')).toEqual({ owner: 'acme', repoName: 'cloud' });
    expect(parseRepoUrl('https://example.com/x')).toBeNull();
  });
  it('builds .env.local keeping an existing secret, or adding one', () => {
    const secret = 'x'.repeat(40);
    expect(buildEnvLocal(undefined, 'NEXT_PUBLIC_APP_NAME=a\n', secret, answers)).toContain(`BETTER_AUTH_SECRET=${secret}`);
    const kept = buildEnvLocal(`BETTER_AUTH_SECRET=${'k'.repeat(40)}\n`, '', secret, answers);
    expect(kept).toContain('k'.repeat(40));
    expect(kept).not.toContain(secret);
  });
});
```

### 2. The command

📄 **Create `scripts/init-template.ts`:**
```ts
// pnpm init:template [--name "Acme" --slug acme --description "…" --repo https://github.com/acme/acme
//                     --locale en --accent neutral|blue|green --yes --dry-run --fresh-git --remove-roadmap
//                     --remove sentry,posthog --no-install]
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';

import { type Accent, type Answers, applyInit, buildEnvLocal, parseRepoUrl, PLACEHOLDER_FILES, slugify } from './lib/init-transforms';
import { ALL_MODULE_IDS, removeModules } from './lib/strip';

const { values } = parseArgs({
  options: {
    name: { type: 'string' }, slug: { type: 'string' }, description: { type: 'string' }, repo: { type: 'string' },
    locale: { type: 'string' }, accent: { type: 'string' }, remove: { type: 'string' },
    yes: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false },
    'fresh-git': { type: 'boolean', default: false }, 'remove-roadmap': { type: 'boolean', default: false },
    'no-install': { type: 'boolean', default: false }, check: { type: 'boolean', default: false },
  },
});

const interactive = !values.yes && process.stdin.isTTY;
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
const ask = async (question: string, fallback: string) => {
  if (!rl) return fallback;
  const answer = (await rl.question(`${question} (${fallback}) `)).trim();
  return answer || fallback;
};

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : undefined);

async function main() {
  const name = values.name ?? (await ask('Project name', 'My SaaS'));
  const slug = values.slug ?? (await ask('Package slug', slugify(name)));
  const description = values.description ?? (await ask('One-line description', `${name} — a SaaS built on the starter`));
  const repoUrl = values.repo ?? (await ask('GitHub repository URL', 'https://github.com/OWNER/REPO'));
  const locale = values.locale ?? (await ask('Default language', 'en'));
  const accent = (values.accent ?? (await ask('Accent colour (neutral|blue|green)', 'neutral'))) as Accent;

  const repo = parseRepoUrl(repoUrl);
  if (!repo) throw new Error(`"${repoUrl}" is not a GitHub URL (https://github.com/<owner>/<repo>)`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`Invalid slug "${slug}" (lower-case letters, digits, dashes)`);
  if (!existsSync(`src/locales/${locale}.json`)) throw new Error(`No src/locales/${locale}.json — add the language first (docs/guides/i18n.md)`);
  if (!['neutral', 'blue', 'green'].includes(accent)) throw new Error(`Unknown accent "${accent}"`);

  const answers: Answers = { name, slug, description, repoUrl, locale, accent, ...repo };
  const dryRun = values['dry-run'];

  // 1) Rewrite files (pure transform → write only what changed)
  const paths = ['package.json', 'README.md', ...PLACEHOLDER_FILES, 'src/i18n/routing.ts', 'src/config/brand.ts', '.env.example', '.env.development'];
  const before = Object.fromEntries(paths.flatMap((path) => { const text = read(path); return text === undefined ? [] : [[path, text]]; }));
  const after = applyInit(before, answers);
  for (const path of Object.keys(after)) {
    if (after[path] === before[path]) continue;
    console.log(`${dryRun ? '• would update' : '✏️  updated'} ${path}`);
    if (!dryRun) writeFileSync(path, after[path]!);
  }

  // 2) .env.local with a fresh secret (never overwrites an existing one)
  const envLocal = buildEnvLocal(read('.env.local'), read('.env.example') ?? '', randomBytes(32).toString('base64url'), answers);
  console.log(`${dryRun ? '• would write' : '🔐 wrote'} .env.local`);
  if (!dryRun) writeFileSync('.env.local', envLocal);

  // 3) Optional: strip modules (S8-T10)
  const remove = (values.remove ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (remove.length > 0) removeModules(remove, { dryRun, log: console.log });

  // 4) Optional: author's planning documents
  if (values['remove-roadmap']) {
    for (const dir of ['docs/roadmap', 'docs/tutorial']) {
      console.log(`${dryRun ? '• would remove' : '🗑️  removed'} ${dir}`);
      if (!dryRun) rmSync(dir, { recursive: true, force: true });
    }
  }

  // 5) Optional: brand-new git history
  if (values['fresh-git']) {
    const confirmed = values.yes || (rl && (await rl.question('This DELETES the git history. Type "reset" to continue: ')) === 'reset');
    if (!confirmed) throw new Error('Not confirmed — git history untouched.');
    console.log(`${dryRun ? '• would reset' : '🌱 reset'} git history`);
    if (!dryRun) {
      rmSync('.git', { recursive: true, force: true });
      execSync('git init -b main && git add -A && git commit -m "chore: initial commit from template"', { stdio: 'inherit' });
    }
  }

  rl?.close();

  if (!dryRun && !values['no-install'] && remove.length > 0) {
    execSync('pnpm install --no-frozen-lockfile', { stdio: 'inherit' }); // dependencies were removed
  }
  if (!dryRun && values.check) execSync('pnpm check', { stdio: 'inherit' });

  console.log(dryRun ? '\nDry run — nothing was changed.' : `\n✅ ${name} is ready.\n   pnpm install && pnpm dev\n   Next: docs/guides/theming.md (logo, colours), docs/guides/deployment.md`);
  if (!values['dry-run'] && remove.length === 0) console.log(`   Modules you can remove: ${ALL_MODULE_IDS.join(', ')}  (--remove a,b)`);
}

main().catch((error) => {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
```
📄 **Edit `package.json`:** `"init:template": "tsx scripts/init-template.ts"` · Knip `entry`: `'scripts/init-template.ts'`.
> The script imports `./lib/strip`, written in the next ticket. Create that file as a **stub first** if you want to run this ticket alone: `export const ALL_MODULE_IDS: string[] = []; export function removeModules(_ids: string[], _options: unknown) { throw new Error('not yet'); }` — S8-T10 replaces it.

### ✅ Verify
```bash
pnpm test tests/scripts
```
Try it on a **throw-away copy** (never on your working tree):
```bash
git worktree add ../init-test && cd ../init-test
pnpm install
pnpm init:template --dry-run --yes --name "Acme Cloud" --repo https://github.com/acme/cloud --accent blue    # lists the files it would change; nothing changes
pnpm init:template --yes --name "Acme Cloud" --repo https://github.com/acme/cloud --accent blue
git diff --stat && pnpm init:template --yes --name "Acme Cloud" --repo https://github.com/acme/cloud --accent blue   # second run: no "updated" lines
pnpm check:agents && pnpm typecheck && pnpm dev    # "Acme Cloud", blue accent, a fresh BETTER_AUTH_SECRET in .env.local
cd .. && git -C <your-repo> worktree remove ../init-test --force
```
1. Header, footer, titles, emails and the manifest say **Acme Cloud**; buttons are blue (accent).
2. `README.md` has the new title/description and links to `acme/cloud`; `LICENSE`, `CODEOWNERS`, the issue-template link and `SECURITY.md` carry the new owner.
3. `.env.local` has a unique secret; running again **keeps** it.
4. `--fresh-git` asks for confirmation (typing `reset`) and leaves a single "initial commit" (try it only in the throw-away copy).

**🚢 Ship** — branch `feat/s8-t09-init-template` · message: `feat(tooling): add idempotent init-template script with dry run`

---

## 🎫 S8-T10 — Strip optional modules

**Branch:** `feat/s8-t10-strip-modules` · **Story:** US-083 · **2 SP**

> 🎯 `pnpm init:template --remove sentry,posthog` deletes the code, dependencies, scripts and env documentation of an integration — and the project still passes `pnpm check`. Because every integration already sits behind an **adapter**, "removing" means **replacing the adapter with a no-op stub** and deleting what only it used; call sites don't change.
>
> **Scope (decided):** *sentry, posthog, better-stack, arcjet, checkly, crowdin, storybook*. Passkeys, MFA, admin and social providers touch the database schema and the UI — they get documented **disable recipes** (`auth.md`), not a script.

```bash
git switch main && git pull && git switch -c feat/s8-t10-strip-modules
```

### 1. Remove the last direct vendor imports

The stub approach only works if app code never talks to a vendor SDK directly.
```bash
git grep -n "from '@sentry/nextjs'" src            # expected: src/libs/Sentry.ts, instrumentation*.ts, sentry.server.config.ts, sentry-replay-consent.tsx
git grep -n "from 'posthog-" src                   # expected: src/libs/analytics/client.ts + server.ts only
git grep -n "from '@arcjet/next'" src              # expected: src/libs/Arcjet.ts only
```
📄 **Edit `src/app/global-error.tsx`:** use the adapter instead of the SDK:
```tsx
import { reportError } from '@/libs/Sentry';
// …
  useEffect(() => {
    reportError(error);
  }, [error]);
```
(remove `import * as Sentry from '@sentry/nextjs'`). Anything else in the grep lists above (besides the expected files) → route it through its adapter now.

📄 **Edit `src/libs/csp.ts`:** make the Sentry parts optional so the proxy compiles with or without them: `connectSourcesFor({ sentryDsn, spotlight = false, dev }: { sentryDsn?: string | undefined; spotlight?: boolean; dev: boolean })`.

### 2. Strip markers in the few files that must change

A **marker block** is removed when its module is removed:
```ts
// @strip:sentry:start
…lines…
// @strip:sentry:end
```
(`#` instead of `//` in YAML/dotenv files.) Add them exactly here:

📄 **`next.config.ts`:**
```ts
// @strip:sentry:start
import { withSentryConfig } from '@sentry/nextjs';
// @strip:sentry:end
// @strip:posthog:start
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
const posthogAssets = posthogHost.replace('.i.posthog.com', '-assets.i.posthog.com');
// @strip:posthog:end

const nextConfig: NextConfig = {
  // …
  // @strip:posthog:start
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: `${posthogAssets}/static/:path*` },
      { source: '/ingest/:path*', destination: `${posthogHost}/:path*` },
    ];
  },
  // @strip:posthog:end
};

let finalConfig = withNextIntl(nextConfig);
// @strip:sentry:start
finalConfig = withSentryConfig(finalConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  release: { name: process.env.SENTRY_RELEASE },
});
// @strip:sentry:end

export default finalConfig;
```
📄 **`.env.example`** — wrap each integration's block with `# @strip:<id>:start` … `# @strip:<id>:end` (ids: `sentry`, `better-stack`, `arcjet`, `posthog`).

📄 **`.github/workflows/ci.yml`:** wrap the whole `storybook:` job in `# @strip:storybook:start/end`, and make the aggregate's `needs` a **block list** so one entry can be wrapped:
```yaml
  ci-ok:
    needs:
      - changes
      - quality
      - test
      - build
      # @strip:storybook:start
      - storybook
      # @strip:storybook:end
      - e2e
      - visual
      - lighthouse
      - commitlint
```
📄 **`knip.config.ts`** — wrap the `entry` lines that exist only for a module (e.g. `'.storybook/stubs/*.ts'`, `'checkly.config.ts'`, `'__checks__/**/*.ts'`, the Sentry instrumentation files) in `// @strip:<id>:start/end`.
(`deploy.yml`'s Checkly job already carries its markers from S8-T07.)

### 3. The module manifest

📄 **Create `scripts/lib/modules.ts`:**
```ts
export type ModuleDef = {
  id: string;
  description: string;
  /** Files or directories (trailing "/") to delete. */
  delete: string[];
  /** Delete every file under `dir` whose name ends with `suffix`. */
  deleteMatching?: { dir: string; suffix: string }[];
  /** Replace the file with a no-op version that keeps the same exports (call sites keep compiling). */
  stubs?: Record<string, string>;
  dependencies?: string[]; // exact names
  dependencyPrefixes?: string[]; // e.g. "@storybook/"
  scripts?: string[];
  /** Env variables documented in .env.example (the schema in Env.ts keeps them as harmless optional declarations). */
  envNotes?: string;
};

export const MODULES: ModuleDef[] = [
  {
    id: 'sentry',
    description: 'Error tracking, source maps, Spotlight, Session Replay',
    delete: [
      'src/instrumentation.ts', 'src/instrumentation-client.ts', 'src/sentry.server.config.ts',
      'src/libs/sentry-scrub.ts', 'src/libs/sentry-scrub.test.ts', 'src/libs/Sentry.test.ts',
    ],
    stubs: {
      'src/libs/Sentry.ts': `export function reportError(_error: unknown, _context?: { requestId?: string; tags?: Record<string, string>; extra?: Record<string, unknown> }): void {}
export function setRequestTag(_requestId: string): void {}
`,
      'src/components/consent/sentry-replay-consent.tsx': `export function SentryReplayConsent() {
  return null;
}
`,
    },
    dependencies: ['@sentry/nextjs', '@spotlightjs/spotlight'],
    scripts: ['spotlight'],
  },
  {
    id: 'posthog',
    description: 'Consent-gated product analytics',
    delete: [
      'src/libs/analytics/hosts.ts', 'src/libs/analytics/hosts.test.ts', 'src/libs/analytics/client.test.ts',
      'src/libs/analytics/server.test.ts', 'src/libs/analytics/no-direct-posthog.test.ts',
      'src/components/analytics/analytics-provider.test.tsx', 'e2e/analytics.spec.ts',
    ],
    stubs: {
      'src/libs/analytics/client.ts': `import type { AnalyticsEvents } from '@/libs/analytics/events';

export const isAnalyticsActive = () => false;
export async function activateAnalytics(_options: { key: string; host: string }): Promise<void> {}
export function deactivateAnalytics(): void {}
export function capturePageview(_pathname: string): void {}
export function trackEvent<E extends keyof AnalyticsEvents>(_event: E, _properties: AnalyticsEvents[E]): void {}
export function identifyUser(_userId: string): void {}
export function groupOrganization(_orgId: string): void {}
export function resetAnalytics(): void {}
`,
      'src/libs/analytics/server.ts': `import type { AnalyticsEvents } from '@/libs/analytics/events';

export async function trackServer<E extends keyof AnalyticsEvents>(_distinctId: string, _event: E, _properties: AnalyticsEvents[E]): Promise<void> {}
`,
      'src/components/analytics/analytics-provider.tsx': `import type { ReactNode } from 'react';

export const useAnalyticsReady = () => false;
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  return children;
}
`,
    },
    dependencies: ['posthog-js', 'posthog-node'],
  },
  {
    id: 'better-stack',
    description: 'Log shipping to Better Stack',
    delete: ['src/libs/logger-betterstack.test.ts'],
    stubs: {
      'src/libs/logger-betterstack.ts': `import type { LogRecord, Sink } from '@logtape/logtape';

export type FlushableSink = Sink & { flush: () => Promise<void> };

/** Better Stack removed: a sink that drops everything. */
export function createBetterStackSink(_options: { endpoint: string; token: string }): FlushableSink {
  const sink = ((_record: LogRecord) => {}) as FlushableSink;
  sink.flush = async () => {};
  return sink;
}
`,
    },
  },
  {
    id: 'arcjet',
    description: 'Bot detection, shield, rate limits, email validation',
    delete: [
      'src/libs/arcjet-routes.ts', 'src/libs/arcjet-routes.test.ts', 'src/libs/request-body.ts', 'src/libs/request-body.test.ts',
      'src/libs/arcjet.test.ts', 'src/libs/arcjet-decision.test.ts',
    ],
    stubs: {
      'src/libs/Arcjet.ts': `import type { Verdict } from '@/libs/arcjet-decision';

/** Arcjet removed: every request is allowed. */
export async function protectRequest(_request: Request, _input: { pathname: string }): Promise<Verdict> {
  return { allowed: true };
}
`,
    },
    dependencies: ['@arcjet/next'],
  },
  {
    id: 'checkly',
    description: 'Monitoring as code',
    delete: ['checkly.config.ts', '__checks__/', '.github/workflows/checkly.yml'],
    dependencies: ['checkly'],
    scripts: ['checkly:test', 'checkly:deploy'],
  },
  {
    id: 'crowdin',
    description: 'Translation sync',
    delete: ['crowdin.yml', 'src/config/crowdin-config.test.ts', '.github/workflows/crowdin.yml'],
  },
  {
    id: 'storybook',
    description: 'Component workshop',
    delete: ['.storybook/'],
    deleteMatching: [{ dir: 'src', suffix: '.stories.tsx' }],
    dependencies: ['storybook'],
    dependencyPrefixes: ['@storybook/'],
    scripts: ['storybook', 'build-storybook'],
  },
];

export const ALL_MODULE_IDS = MODULES.map((module) => module.id);
```

### 4. The engine (pure over a file-system interface)

📄 **Create `scripts/lib/strip.ts`:**
```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { MODULES, type ModuleDef } from './modules';

export { ALL_MODULE_IDS } from './modules';

export type Fs = {
  exists(file: string): boolean;
  read(file: string): string;
  write(file: string, content: string): void;
  remove(target: string): void;
  /** All files below `dir` (recursive). */
  walk(dir: string): string[];
};

/** Files that may contain `@strip:<id>:start/end` blocks. */
export const MARKER_FILES = ['next.config.ts', '.env.example', 'knip.config.ts', '.github/workflows/ci.yml', '.github/workflows/deploy.yml'];

const escapeId = (id: string) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Removes every `// @strip:<id>:start` … `// @strip:<id>:end` block (and `#` flavour), markers included. */
export function removeMarkedBlocks(source: string, id: string): string {
  const e = escapeId(id);
  const start = new RegExp(`^[ \\t]*(?://|#)\\s*@strip:${e}:start\\b.*$`);
  const end = new RegExp(`^[ \\t]*(?://|#)\\s*@strip:${e}:end\\b.*$`);

  const lines = source.split('\n');
  const kept: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (!inside && start.test(line)) {
      inside = true;
      continue;
    }
    if (inside) {
      if (end.test(line)) inside = false;
      continue;
    }
    kept.push(line);
  }
  if (inside) throw new Error(`Unbalanced marker: @strip:${id}:start without @strip:${id}:end`);
  return kept.join('\n');
}

export function removeFromPackageJson(text: string, def: ModuleDef): string {
  const json = JSON.parse(text);
  const drop = (name: string) => (def.dependencies ?? []).includes(name) || (def.dependencyPrefixes ?? []).some((prefix) => name.startsWith(prefix));
  for (const section of ['dependencies', 'devDependencies'] as const) {
    if (!json[section]) continue;
    for (const name of Object.keys(json[section])) if (drop(name)) delete json[section][name];
  }
  for (const script of def.scripts ?? []) delete json.scripts?.[script];
  return `${JSON.stringify(json, null, 2)}\n`;
}

export function removeModuleFrom(fs: Fs, def: ModuleDef, log: (message: string) => void): void {
  for (const target of def.delete) {
    if (fs.exists(target)) {
      fs.remove(target);
      log(`  🗑️  ${target}`);
    }
  }
  for (const { dir, suffix } of def.deleteMatching ?? []) {
    if (!fs.exists(dir)) continue;
    for (const file of fs.walk(dir).filter((name) => name.endsWith(suffix))) {
      fs.remove(file);
      log(`  🗑️  ${file}`);
    }
  }
  for (const [file, content] of Object.entries(def.stubs ?? {})) {
    if (fs.exists(file)) {
      fs.write(file, content);
      log(`  🔌 stubbed ${file}`);
    }
  }
  for (const file of MARKER_FILES) {
    if (!fs.exists(file)) continue;
    const before = fs.read(file);
    const after = removeMarkedBlocks(before, def.id);
    if (after !== before) {
      fs.write(file, after);
      log(`  ✂️  ${file}`);
    }
  }
  if (fs.exists('package.json')) {
    const before = fs.read('package.json');
    const after = removeFromPackageJson(before, def);
    if (after !== before) {
      fs.write('package.json', after);
      log('  📦 package.json');
    }
  }
}

const realFs = (dryRun: boolean): Fs => ({
  exists: existsSync,
  read: (file) => readFileSync(file, 'utf8'),
  write: (file, content) => {
    if (!dryRun) writeFileSync(file, content);
  },
  remove: (target) => {
    if (!dryRun) rmSync(target, { recursive: true, force: true });
  },
  walk: function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full.split(path.sep).join('/')];
    });
  },
});

export function removeModules(ids: string[], { dryRun, log }: { dryRun: boolean; log: (message: string) => void }): void {
  const unknown = ids.filter((id) => !MODULES.some((module) => module.id === id));
  if (unknown.length > 0) throw new Error(`Unknown module(s): ${unknown.join(', ')}. Available: ${MODULES.map((module) => module.id).join(', ')}`);

  for (const id of ids) {
    log(`${dryRun ? '• would remove' : '➖ removing'} module "${id}"`);
    removeModuleFrom(realFs(dryRun), MODULES.find((module) => module.id === id)!, log);
  }
  if (!dryRun) mkdirSync('.', { recursive: true }); // (no-op; keeps the function side-effect shape explicit)
}
```
📄 **Create `tests/scripts/strip.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';

import { type Fs, removeFromPackageJson, removeMarkedBlocks, removeModuleFrom } from '../../scripts/lib/strip';
import type { ModuleDef } from '../../scripts/lib/modules';

function memoryFs(initial: Record<string, string>): Fs & { files: Record<string, string> } {
  const files = { ...initial };
  return {
    files,
    exists: (file) => Object.keys(files).some((name) => name === file || name.startsWith(file.endsWith('/') ? file : `${file}/`)),
    read: (file) => files[file]!,
    write: (file, content) => void (files[file] = content),
    remove: (target) => {
      for (const name of Object.keys(files)) if (name === target || name.startsWith(target.endsWith('/') ? target : `${target}/`)) delete files[name];
    },
    walk: (dir) => Object.keys(files).filter((name) => name.startsWith(`${dir}/`)),
  };
}

describe('removeMarkedBlocks', () => {
  it('removes // and # blocks for that module only', () => {
    const ts = ['keep 1', '// @strip:sentry:start', 'import sentry', '// @strip:sentry:end', '// @strip:posthog:start', 'posthog', '// @strip:posthog:end', 'keep 2'].join('\n');
    expect(removeMarkedBlocks(ts, 'sentry')).toBe(['keep 1', '// @strip:posthog:start', 'posthog', '// @strip:posthog:end', 'keep 2'].join('\n'));

    const env = 'A=1\n# @strip:sentry:start\nDSN=\n# @strip:sentry:end\nB=2';
    expect(removeMarkedBlocks(env, 'sentry')).toBe('A=1\nB=2');
  });

  it('refuses an unbalanced block instead of deleting the rest of the file', () => {
    expect(() => removeMarkedBlocks('a\n// @strip:x:start\nb', 'x')).toThrow(/Unbalanced/);
  });

  it('is idempotent', () => {
    const once = removeMarkedBlocks('a\n# @strip:x:start\nb\n# @strip:x:end\nc', 'x');
    expect(removeMarkedBlocks(once, 'x')).toBe(once);
  });
});

describe('removeFromPackageJson', () => {
  const def: ModuleDef = { id: 'm', description: '', delete: [], dependencies: ['foo'], dependencyPrefixes: ['@bar/'], scripts: ['go'] };
  it('drops exact names, prefixes and scripts, keeps the rest', () => {
    const out = JSON.parse(removeFromPackageJson(JSON.stringify({ dependencies: { foo: '1', keep: '1' }, devDependencies: { '@bar/a': '1', '@baz/b': '1' }, scripts: { go: 'x', stay: 'y' } }), def));
    expect(out).toEqual({ dependencies: { keep: '1' }, devDependencies: { '@baz/b': '1' }, scripts: { stay: 'y' } });
  });
});

describe('removeModuleFrom', () => {
  const def: ModuleDef = {
    id: 'demo',
    description: '',
    delete: ['src/demo.ts', 'demo-dir/'],
    deleteMatching: [{ dir: 'src', suffix: '.stories.tsx' }],
    stubs: { 'src/libs/Demo.ts': 'export const noop = () => {};\n' },
    dependencies: ['demo-sdk'],
  };
  const start = () =>
    memoryFs({
      'src/demo.ts': 'x', 'demo-dir/a.ts': 'x', 'src/Button.stories.tsx': 'x', 'src/Keep.tsx': 'x',
      'src/libs/Demo.ts': 'real implementation',
      'next.config.ts': 'a\n// @strip:demo:start\nwithDemo()\n// @strip:demo:end\nb',
      'package.json': JSON.stringify({ dependencies: { 'demo-sdk': '1', react: '19' } }),
    });

  it('deletes, stubs, unwraps markers and cleans package.json', () => {
    const fs = start();
    removeModuleFrom(fs, def, () => {});

    expect(Object.keys(fs.files).sort()).toEqual(['next.config.ts', 'package.json', 'src/Keep.tsx', 'src/libs/Demo.ts']);
    expect(fs.files['src/libs/Demo.ts']).toBe('export const noop = () => {};\n');
    expect(fs.files['next.config.ts']).toBe('a\nb');
    expect(JSON.parse(fs.files['package.json']!).dependencies).toEqual({ react: '19' });
  });

  it('running it twice changes nothing more', () => {
    const fs = start();
    removeModuleFrom(fs, def, () => {});
    const snapshot = JSON.stringify(fs.files);
    removeModuleFrom(fs, def, () => {});
    expect(JSON.stringify(fs.files)).toBe(snapshot);
  });
});
```
📄 **Create `tests/scripts/strip-markers.test.ts`** — the REAL files carry balanced markers for known modules (a typo here would make a strip delete half a file):
```ts
import { existsSync, readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { ALL_MODULE_IDS } from '../../scripts/lib/modules';
import { MARKER_FILES, removeMarkedBlocks } from '../../scripts/lib/strip';

it('every marker block in the repository is balanced and belongs to a known module', () => {
  for (const file of MARKER_FILES.filter(existsSync)) {
    const source = readFileSync(file, 'utf8');
    const ids = new Set([...source.matchAll(/@strip:([a-z-]+):(?:start|end)/g)].map((match) => match[1]!));
    for (const id of ids) {
      expect(ALL_MODULE_IDS, `${file}: unknown module "${id}"`).toContain(id);
      expect(() => removeMarkedBlocks(source, id), file).not.toThrow();
    }
  }
});
```

### 5. Docs and the nightly proof

📄 **Create `docs/guides/modules.md`:**
````markdown
# Optional modules

Every integration is optional and lives behind an adapter. Without its environment variables it does nothing; to **remove it
from your project** run (from a clean working tree):
```bash
pnpm init:template --remove sentry,posthog          # add --dry-run to preview
```
| Module | What it is | Env | Removing it |
|---|---|---|---|
| `sentry` | errors, source maps, Spotlight, Replay | `NEXT_PUBLIC_SENTRY_*`, `SENTRY_*` | deletes instrumentation + scrubber, stubs `Sentry.ts` |
| `posthog` | consent-gated analytics | `NEXT_PUBLIC_POSTHOG_*` | stubs the analytics wrappers, removes `/ingest` rewrites |
| `better-stack` | log shipping | `BETTER_STACK_*` | stubs the sink |
| `arcjet` | bots, shield, limits, email validation | `ARCJET_*` | stubs `protectRequest` (everything allowed) |
| `checkly` | monitoring as code | CI secrets | deletes config, checks and workflow job |
| `crowdin` | translation sync | CI secrets | deletes config and workflow |
| `storybook` | component workshop | — | deletes `.storybook`, all stories, deps, CI job |
After a removal the script runs `pnpm install`; then `pnpm check`. The optional variables stay declared in `Env.ts` (harmless);
delete them by hand if you want a leaner schema (and `pnpm docs:env`).

**Not script-removable** (they involve the database schema and UI): passkeys, two-factor, admin/impersonation, individual social providers —
see the recipes in `docs/guides/auth.md`.
**Adding a module to the manifest:** put its vendor SDK behind one adapter, list its files/stubs/deps in `scripts/lib/modules.ts`, wrap the few unavoidable edits in `@strip` markers.
````
📄 **Create `.github/workflows/modules.yml`** — proves, every night, that each module can really be removed:
```yaml
name: Module removal

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:
  pull_request:
    paths: ['scripts/lib/**', 'scripts/init-template.ts', 'next.config.ts', 'src/libs/**']

permissions:
  contents: read

env:
  NEXT_PUBLIC_APP_URL: http://localhost:3100
  NEXT_PUBLIC_APP_NAME: SaaS Boilerplate
  BETTER_AUTH_SECRET: ci-only-secret-ci-only-secret-0123456789

jobs:
  strip:
    name: Without ${{ matrix.module }}
    runs-on: ubuntu-latest
    timeout-minutes: 25
    strategy:
      fail-fast: false
      matrix:
        module: [sentry, posthog, better-stack, arcjet, checkly, crowdin, storybook, 'sentry,posthog,better-stack,arcjet,checkly,crowdin,storybook']
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: Remove the module(s)
        run: pnpm init:template --yes --name "Strip Test" --slug strip-test --repo https://github.com/acme/strip-test --remove "${{ matrix.module }}"
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm knip
      - run: pnpm build
```
> On pull requests it runs only when the stripping code or its markers change; **nightly** it covers everything (including "all seven at once").

### ✅ Verify
```bash
pnpm test tests/scripts && pnpm check
```
Prove it on a throw-away worktree (never your working copy), one module at a time and then all together:
```bash
git worktree add ../strip-test && cd ../strip-test && pnpm install
pnpm init:template --dry-run --yes --name "Strip Test" --repo https://github.com/acme/strip-test --remove sentry,posthog   # lists deletions/stubs/markers
pnpm init:template --yes --name "Strip Test" --repo https://github.com/acme/strip-test --remove sentry,posthog
pnpm typecheck && pnpm lint && pnpm knip && pnpm build && pnpm test
git grep -n "@sentry\|posthog" -- src package.json | head        # only the harmless Env declarations and the documentation remain
pnpm init:template --yes --name "Strip Test" --repo https://github.com/acme/strip-test --remove sentry,posthog   # idempotent: nothing more to do
cd .. && git -C <your-repo> worktree remove ../strip-test --force
```
1. The build is **green** without Sentry/PostHog; the browser bundle no longer contains `@sentry`/`posthog` (check with `pnpm analyze`).
2. Run the dry-run for `storybook`, `arcjet`, `better-stack`, `checkly`, `crowdin` too (or trigger the **Module removal** workflow once: `gh workflow run modules.yml`) — all eight matrix jobs green.
3. A deliberately **unbalanced marker** (delete one `@strip:…:end` line) makes `strip-markers.test.ts` fail.
4. Anything the script leaves behind that `knip`/`typecheck` complains about → add it to that module's `delete`/`stubs` and re-run.

**🚢 Ship** — branch `feat/s8-t10-strip-modules` · message: `feat(tooling): add module manifest and stripping engine with a nightly removal matrix`

---

## 🎫 S8-T11 — Threat model, dependency audit and an ASVS pass

**Branch:** `docs/s8-t11-security-review` · **Story:** US-085 · **2 SP** · risk **R-15**

> 🎯 A threat model answers *"what could go wrong, and what stops it?"* — and every answer points at a **control** (code) and a **test** (proof). A claim without a test is a hope. The model also records what we **knowingly accept**.

```bash
git switch main && git pull && git switch -c docs/s8-t11-security-review
mkdir -p docs/security
```

### 1. The threat model (STRIDE per trust boundary)

📄 **Create `docs/security/threat-model.md`:**
````markdown
# Threat model

STRIDE: **S**poofing · **T**ampering · **R**epudiation · **I**nformation disclosure · **D**enial of service · **E**levation of privilege.
Severity: **H**igh / **M**edium / **L**ow (impact × likelihood, before controls). Every **H** has a control **and** a test.

## Assets
Accounts and credentials · sessions · organization data (tenant isolation) · admin powers (impersonation) · email delivery · secrets · availability.

## Trust boundaries
```
Browser ──(1)── App (Next.js on Vercel) ──(2)── Database (Neon)
                   │  ├──(3)── Email provider (Resend)
                   │  ├──(4)── OAuth providers (Google, GitHub…)
                   │  ├──(7)── Telemetry (Sentry, Better Stack, PostHog, Arcjet)
                   └──(5)── Admin console / impersonation
CI/CD & dependencies ──(6)── everything above
```

## 1 · Browser ↔ App
| # | Threat | STRIDE | Sev | Control | Proof |
|---|---|---|---|---|---|
| 1.1 | Credential stuffing / brute force on sign-in | S | H | Better Auth per-IP limits; Arcjet limits per IP and per address; uniform error `INVALID_EMAIL_OR_PASSWORD` | `e2e/auth.spec.ts` (rate limit), `src/libs/arcjet.test.ts`, `tests/security/idor.test.ts` (same error for unknown/wrong) |
| 1.2 | Account enumeration (sign-in, reset, sign-up) | I | M | identical responses; timing parity check | `tests/security/idor.test.ts`, `tests/security/timing.test.ts` (opt-in) |
| 1.3 | Session theft / fixation | S | H | HttpOnly + Secure + SameSite cookies; session rotation on sign-in; sensitive actions require a *fresh* session | `e2e/auth*.spec.ts`, `requireFreshSession` tests |
| 1.4 | CSRF | T | H | SameSite=Lax cookies; Better Auth origin checks (`NEXT_PUBLIC_APP_URL`/trusted origins); Server Actions' built-in origin check | `e2e/auth.spec.ts` (origin), ASVS 4.2.2 manual check |
| 1.5 | XSS | T/I | H | React escaping; JSON-LD serializer escapes `<`; **nonce-based CSP** on dynamic areas, no `dangerouslySetInnerHTML` elsewhere; contact email HTML-escaped | `src/libs/json-ld.test.ts`, `src/libs/csp.test.ts`, `e2e/csp.spec.ts`, `src/actions/contact.test.ts` |
| 1.6 | Clickjacking | T | M | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` | `e2e/security-headers.spec.ts`, `src/libs/csp.test.ts` |
| 1.7 | Open redirect after sign-in | S | M | `sanitizeCallbackUrl` allows same-origin paths only | route-guard unit tests, `e2e/auth.spec.ts` (open-redirect case) |
| 1.8 | Bots / scraping / abuse of public forms | D | M | Arcjet shield + bot detection; contact honeypot + per-IP limit | `src/libs/arcjet.test.ts`, `src/actions/contact.test.ts` |
| 1.9 | Tracking without consent | I | M | consent default-denied, GPC respected, nothing loads before consent | `src/libs/consent.test.ts`, `e2e/analytics.spec.ts` |
| 1.10 | Mass assignment / prototype pollution via request bodies | T | M | Zod strips unknown keys; hostile JSON test | `tests/security/idor.test.ts` |
| 1.11 | Phishing via our emails (spoofed sender) | S | M | SPF, DKIM, DMARC on the sending domain | deliverability checklist (`deployment.md`) |

## 2 · App ↔ Database
| # | Threat | STRIDE | Sev | Control | Proof |
|---|---|---|---|---|---|
| 2.1 | SQL injection | T | H | Drizzle parameterised queries only; hostile-input test | `tests/security/idor.test.ts` ("table survives") |
| 2.2 | **Cross-tenant data access (IDOR)** | I/E | H | every tenant query scoped via `tenantDb`; raw `db` import forbidden in `src/app`, `components`, `actions`; role read from DB on every request | `tenant-boundary.test.ts`, isolation integration tests (with mutation proof), `tests/security/idor.test.ts`, `tests/security/authz-matrix.test.ts` |
| 2.3 | Missing authorization on a new Server Action | E | H | `createAction` + `withAuth`/`withOrgPermission`; registry meta-test fails on unclassified actions | `tests/security/action-coverage.test.ts`, `authz-matrix.test.ts` |
| 2.4 | Destructive or breaking migration reaching production | T/D | H | expand/contract rule, `check:migrations`, migrate-before-promote pipeline with approval | `tests/scripts/check-migrations.test.ts`, deploy workflow |
| 2.5 | Audit trail tampering | R | M | `audit_log` has no FKs and an append-only trigger | audit-log integration test |
| 2.6 | Connection exhaustion | D | M | pooled `DATABASE_URL`, small per-instance pool, health check with timeout | `src/data/health.test.ts`, load test (S8-T12) |
| 2.7 | Secrets/PII in logs | I | H | redaction before every sink; request id instead of personal data | logger redaction tests, `src/libs/logger-betterstack.test.ts` |

## 3 · App ↔ Email provider
| # | Threat | STRIDE | Sev | Control | Proof |
|---|---|---|---|---|---|
| 3.1 | Header/HTML injection through user input in emails | T | M | `singleLine` + `escapeHtml` | `src/libs/email/sanitize.test.ts`, `src/actions/contact.test.ts` |
| 3.2 | Email bombing a victim through our forms | D | M | per-address limits (Arcjet + Better Auth), enumeration-safe magic-link policy | `src/libs/arcjet.test.ts`, magic-link policy tests |
| 3.3 | Token leakage in links (referrer, logs, analytics, Sentry) | I | H | `Referrer-Policy`, scrubbing of `token/code` params (Sentry, analytics, logs) | `src/libs/sentry-scrub.test.ts`, `src/libs/analytics/hosts.test.ts` |
| 3.4 | Provider outage blocks sign-up | D | L | transports are pluggable; errors surfaced, not swallowed | email transport tests |

## 4 · App ↔ OAuth providers
| # | Threat | STRIDE | Sev | Control | Proof |
|---|---|---|---|---|---|
| 4.1 | Account takeover by auto-linking an unverified provider email | S/E | H | linking only for trusted providers (Google, GitHub) with verified emails | social-auth tests, `docs/guides/social-auth.md` |
| 4.2 | Redirect URI / state tampering | T | M | exact redirect URIs per environment; Better Auth state + PKCE | `e2e/auth-advanced.spec.ts` (authorize URL), provider config checklist |
| 4.3 | Provider secret leak | I | H | server-only env (T3 Env), secret scanning, rotation table | `pnpm check:env`, gitleaks, `docs/guides/security.md` |

## 5 · Admin and impersonation
| # | Threat | STRIDE | Sev | Control | Proof |
|---|---|---|---|---|---|
| 5.1 | Normal user reaches admin features | E | H | `getAdminOrThrow` on every admin action/page; 404 for non-admins | `tests/security/authz-matrix.test.ts`, `e2e/rbac-ui.spec.ts` |
| 5.2 | Admin abuses impersonation (changes password, deletes account, edits security) | E/R | H | impersonation guard blocks sensitive auth endpoints; banner; every start/stop **audited** | `impersonation-guard.test.ts`, `e2e/admin.spec.ts` |
| 5.3 | Admin account takeover | E | H | admin role granted only via script to *verified* users; optional MFA requirement (`ADMIN_REQUIRE_MFA`) | admin tests, `docs/guides/auth-security.md` |
| 5.4 | Impersonated actions attributed to the wrong person (incl. analytics) | R | L | audit entries carry both ids; analytics never identify impersonation sessions | analytics tests |

## 6 · CI/CD and supply chain
| # | Threat | STRIDE | Sev | Control | Proof |
|---|---|---|---|---|---|
| 6.1 | Malicious/vulnerable dependency | T | H | Dependabot (grouped, patch auto-merge only), `pnpm audit`, OSV scan, licence check, 2-week-old pins for CDN scripts | `audit.yml`, `pnpm licenses:check` |
| 6.2 | Secret committed | I | H | gitleaks (hook + history scan), GitHub push protection | `security.yml` |
| 6.3 | Workflow abuse by forks/PRs | E | M | least-privilege `permissions`, secrets only in `workflow_run`/environments, forks get no secrets | review checklist (CODEOWNERS on `.github/`) |
| 6.4 | Bad migration or code reaching production | T/D | H | gated deploy: approval → migrate → smoke test → promote; instant rollback | `deploy.yml`, rehearsal log |
| 6.5 | Unreviewed change to security-critical paths | T | M | CODEOWNERS, CodeRabbit path instructions, required checks | ruleset |

## 7 · Third-party telemetry
| # | Threat | STRIDE | Sev | Control | Proof |
|---|---|---|---|---|---|
| 7.1 | Personal data sent to Sentry | I | H | `sendDefaultPii:false`, `beforeSend` scrubber, replay masked and consent-gated | `src/libs/sentry-scrub.test.ts` |
| 7.2 | Vendor outage takes the site down | D | M | every adapter fails open or no-ops; bounded queues | `src/libs/arcjet.test.ts`, `src/libs/logger-betterstack.test.ts` |

## Accepted risks
| Risk | Why accepted | Revisit |
|---|---|---|
| App-level tenant scoping only (no Postgres RLS) — TD-02 | Spiked in S4: complexity vs benefit; mitigated by `tenantDb`, boundary test and mutation-proven isolation tests | v1.1 |
| Logs batched on serverless may be lost — TD-14 | Use Better Stack's Vercel log drain in production | v1.1 |
| CSP report endpoint is unauthenticated and unthrottled | Body capped at 10 KB; only logs a clipped line | v1.1 |
| `unsafe-inline` scripts on static marketing pages | no user-supplied HTML renders there; nonce would defeat static caching | when partial prerendering matures |
| Visual/E2E on Chromium only — TD-03 | cost | post-launch |

## Review
Re-read this document at every minor release and whenever a trust boundary changes (new provider, new admin power, new data flow).
````

### 2. Dependency audit: vulnerabilities and licences

📄 **Create `scripts/check-licenses.mjs`:**
```js
// pnpm licenses:check — production dependencies must use licences we can live with.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ALLOWED = new Set([
  'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0', 'CC-BY-4.0',
  'Python-2.0', 'Unlicense', 'MPL-2.0', 'Zlib',
]);

/** SPDX expressions: "(MIT OR Apache-2.0)" needs ONE allowed term, "A AND B" needs ALL. */
export function isAllowed(expression, allowed = ALLOWED) {
  const cleaned = expression.replace(/[()]/g, ' ').trim();
  if (/\bAND\b/.test(cleaned)) return cleaned.split(/\bAND\b/).every((part) => isAllowed(part, allowed));
  return cleaned.split(/\bOR\b/).some((part) => allowed.has(part.trim()));
}

function main() {
  const exceptions = existsSync('docs/security/license-exceptions.json')
    ? JSON.parse(readFileSync('docs/security/license-exceptions.json', 'utf8'))
    : {};
  // pnpm prints { "<license>": [ { name, versions, … } ] }
  const byLicense = JSON.parse(execSync('pnpm licenses list --prod --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

  const problems = [];
  for (const [license, packages] of Object.entries(byLicense)) {
    if (isAllowed(license)) continue;
    for (const pkg of packages) if (!exceptions[pkg.name]) problems.push(`${pkg.name} (${license})`);
  }

  if (problems.length > 0) {
    console.error(`❌ Packages with a licence that is not on the allow-list:\n  ${problems.join('\n  ')}\n\nReplace them, or document an exception (with the reason) in docs/security/license-exceptions.json.`);
    process.exit(1);
  }
  console.log(`✅ all production dependencies use allowed licences (${Object.keys(byLicense).length} licence types)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
```
📄 **Create `tests/scripts/check-licenses.test.ts`:**
```ts
import { expect, it } from 'vitest';

import { isAllowed } from '../../scripts/check-licenses.mjs';

it('accepts permissive licences and OR-expressions with one allowed term', () => {
  expect(isAllowed('MIT')).toBe(true);
  expect(isAllowed('(MIT OR GPL-3.0)')).toBe(true);
  expect(isAllowed('Apache-2.0 AND MIT')).toBe(true);
});

it('rejects copyleft/unknown licences and AND-expressions with a bad term', () => {
  expect(isAllowed('GPL-3.0')).toBe(false);
  expect(isAllowed('AGPL-3.0-only')).toBe(false);
  expect(isAllowed('MIT AND GPL-3.0')).toBe(false);
  expect(isAllowed('UNLICENSED')).toBe(false);
});
```
📄 **Create `docs/security/license-exceptions.json`:**
```json
{}
```
```bash
pnpm licenses:check
```
Typical first finding: `@img/sharp-libvips-*` (LGPL-3.0 prebuilt binaries pulled in by Next's image optimiser). That's acceptable (dynamically linked, unmodified) — **record it** instead of widening the allow-list:
```json
{ "@img/sharp-libvips-linux-x64": "LGPL-3.0 prebuilt libvips used by next/image; dynamically linked, unmodified, no obligation beyond attribution" }
```
(one line per platform package it reports).

📄 **Edit `package.json`:** `"licenses:check": "node scripts/check-licenses.mjs"`, `"audit:prod": "pnpm audit --prod --audit-level=high"` · Knip `entry`: `'scripts/check-licenses.mjs'`.

📄 **Create `.github/workflows/audit.yml`:**
```yaml
name: Dependency audit

on:
  pull_request:
    paths: ['pnpm-lock.yaml', 'package.json']
  schedule:
    - cron: '0 4 * * 1'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  audit:
    name: Vulnerabilities and licences
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: pnpm audit (production, high and critical)
        run: pnpm audit:prod
      - name: Licences
        run: pnpm licenses:check

  osv:
    name: OSV scan
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: google/osv-scanner-action/osv-scanner-action@v2 # 🔍 pin to the current major per the project's README
        with:
          scan-args: |-
            --lockfile=pnpm-lock.yaml
```
Run `pnpm audit:prod` now. **Fix** (update the dependency / its parent) or, only when it truly can't be exploited here, document the exception **with a reason** — both in `package.json` and in prose:
```json
"pnpm": { "auditConfig": { "ignoreGhsas": ["GHSA-xxxx-xxxx-xxxx"] } }
```
📄 **Create `docs/security/dependency-exceptions.md`:**
````markdown
# Dependency exceptions
Each ignored advisory needs: id, package, why it does not apply here, who accepted it, and an expiry date.
| Advisory | Package | Why it doesn't apply | Accepted by | Review by |
|---|---|---|---|---|
````
Make `Dependency audit` an additional **required check** in `.github/rulesets/main.json` only if you want PRs that don't touch the lockfile to wait for it — usually not: it is path-filtered, which makes it a poor required check. Keep it informative on PRs and **mandatory in the launch gate** (S8-T14).

### 3. A penetration pass (OWASP ASVS Level 2, subset)

📄 **Create `docs/security/asvs-checklist.md`** — fill the **Status** and **Evidence** columns by actually checking:
````markdown
# OWASP ASVS 4.0 — Level 2 subset

Legend: ✅ verified · ⚠️ partly / accepted risk (explain) · ❌ gap (ticket) · n/a
Run date: ____ · Environment: staging · Tester: ____

| ASVS | Requirement (short) | Status | Evidence / how verified |
|---|---|---|---|
| 2.1.1 | Passwords ≥ 12 characters | | `src/validations/auth.ts` minimum length; sign up with a short password |
| 2.1.2 | Long passwords (≥ 64 chars) accepted | | try a 100-char password |
| 2.2.1 | Anti-automation on authentication | | rate-limit E2E; Arcjet logs |
| 2.5.1 | Reset secrets are single-use, time-limited, not guessable | | reset the same link twice; wait past expiry |
| 2.7 | Out-of-band (email) verifiers expire quickly | | magic link / OTP expiry |
| 2.8 | TOTP: replay protection and throttling | | reuse a code; brute-force attempts |
| 2.9 | Passkeys (cryptographic verifiers) | | `e2e/auth-advanced.spec.ts` |
| 3.2.1 | New session token on every sign-in | | compare cookies before/after sign-in |
| 3.3.1 | Sign-out invalidates the session server-side | | replay the old cookie after sign-out |
| 3.4.1–3.4.3 | Cookies: `Secure`, `HttpOnly`, `SameSite` | | `curl -i` the sign-in response; DevTools → Application |
| 4.1.1 | Access control enforced server-side | | `tests/security/authz-matrix.test.ts` |
| 4.1.3 | Least privilege (roles) | | `docs/guides/rbac.md` matrix + matrix test |
| 4.2.1 | No IDOR on object ids | | `tests/security/idor.test.ts` + manual id swapping on staging |
| 4.2.2 | CSRF protection | | cross-origin form POST to a Server Action / auth endpoint is rejected |
| 4.3.1 | Administrative interfaces need strong auth | | `ADMIN_REQUIRE_MFA=true` on staging; non-admin gets 404 |
| 5.1.3 | All input validated (allow-list) | | Zod schemas; hostile-input tests |
| 5.3.4 | Parameterised queries | | `git grep -n "sql\`" src` review; injection test |
| 7.1.1 | Credentials/tokens never logged | | redaction tests; grep the production logs for a test password |
| 7.1.2 | Other sensitive data not logged | | same |
| 8.2.1 | Authenticated pages not cached by shared caches | | `curl -I` an authenticated page: `Cache-Control: private/no-store` |
| 9.1.1 | TLS everywhere; HSTS | | SSL Labs on the production domain; HSTS header |
| 14.2.1 | Components free of known vulnerabilities | | `audit.yml` green |
| 14.4.3 | Content-Security-Policy | | `e2e/csp.spec.ts`; `CSP_MODE=enforce` in production |
| 14.4.4 | `X-Content-Type-Options: nosniff` | | `e2e/security-headers.spec.ts` |
| 14.4.5 | HSTS | | same |
| 14.4.6 | `Referrer-Policy` | | same |
| 14.4.7 | Anti-framing | | same |
| 11.1.4 | Business-logic anti-automation (forms, invitations, emails) | | per-address limits |
````
**Automated sweep (optional but recommended):** OWASP ZAP baseline against **staging**:
```bash
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://staging.your-domain.example -I
```
Triage its warnings into the table above (false positives noted, real ones ticketed). **Never** run active scans against production.

### ✅ Verify
```bash
pnpm test tests/scripts && pnpm audit:prod && pnpm licenses:check && pnpm check
```
1. Every **High** row of the threat model names a control and an existing test file (`git ls-files | grep <name>` finds each one; fix wrong names).
2. `pnpm audit:prod` is clean or every exception is documented with an expiry; `pnpm licenses:check` passes (exceptions listed with reasons).
3. The ASVS table is filled in; every ❌ has an issue (P0/P1 if it's a real hole — those block launch).
4. The `Dependency audit` workflow is green on the PR.

**🚢 Ship** — branch `docs/s8-t11-security-review` · message: `docs(security): add threat model and asvs checklist, and audit dependencies and licences in ci`

---

## 🎫 S8-T12 — Load smoke test

**Branch:** `test/s8-t12-load-smoke` · **Story:** US-085 · **2 SP**

> 🎯 A smoke test, not a benchmark: *does the app keep its promises under realistic parallel use on production-like infrastructure?* **Targets:** dashboard p95 **< 500 ms** at **50 virtual users**, error rate **< 1 %**. Run it against **staging** (Vercel + Neon) — never production, never PGlite (it serves one connection).

```bash
git switch main && git pull && git switch -c test/s8-t12-load-smoke
mkdir -p loadtest
```
Install k6: 🪟 `winget install k6 --source winget` (or `docker run --rm -i grafana/k6 run -`), macOS `brew install k6`.

### 1. Prepare staging

- Staging runs with the **seeded** demo data (the Neon `staging` branch; `pnpm db:seed` once through its direct URL).
- `AUTH_RATE_LIMIT=off` **or** a high limit — the test signs in once, but the sign-in scenario would trip it.
- `ARCJET_MODE=DRY_RUN` (or no key): k6's user agent *looks like a bot* — that's Arcjet working, not a bug.
- Production-like: `EMAIL_TRANSPORT=console` is fine; Sentry/analytics optional.

### 2. The script

📄 **Create `loadtest/smoke.js`:**
```js
// k6 run -e BASE_URL=https://staging.example.com -e LOAD_EMAIL=demo@example.com -e LOAD_PASSWORD='Demo-Password-123' -e LOAD_ORG_SLUG=demo loadtest/smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL;
const ORG = __ENV.LOAD_ORG_SLUG || 'demo';
if (!BASE) throw new Error('BASE_URL is required');

export const options = {
  scenarios: {
    marketing: { executor: 'constant-vus', vus: 25, duration: '2m', exec: 'marketing', tags: { scenario: 'marketing' } },
    signin_page: { executor: 'constant-vus', vus: 10, duration: '2m', exec: 'signInPage', tags: { scenario: 'signin_page' } },
    dashboard: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m', target: 50 }, // hold 50 concurrent users
        { duration: '20s', target: 0 },
      ],
      exec: 'dashboard',
      tags: { scenario: 'dashboard' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    'http_req_duration{scenario:dashboard}': ['p(95)<500'],
    'http_req_duration{scenario:signin_page}': ['p(95)<500'],
    'http_req_duration{scenario:marketing}': ['p(95)<300'],
  },
};

/** Sign in ONCE; every virtual user reuses the session (it measures page performance, not password hashing). */
export function setup() {
  const response = http.post(
    `${BASE}/api/auth/sign-in/email`,
    JSON.stringify({ email: __ENV.LOAD_EMAIL, password: __ENV.LOAD_PASSWORD }),
    { headers: { 'Content-Type': 'application/json', Origin: BASE } },
  );
  if (response.status !== 200) throw new Error(`Sign-in failed (${response.status}): ${response.body}`);

  const cookie = Object.entries(response.cookies)
    .map(([name, list]) => `${name}=${list[0].value}`)
    .join('; ');
  return { cookie };
}

export function marketing() {
  for (const path of ['/', '/pricing', '/fr']) {
    const response = http.get(`${BASE}${path}`, { tags: { name: `marketing ${path}` } });
    check(response, { 'marketing 200': (r) => r.status === 200 });
    sleep(1);
  }
}

export function signInPage() {
  const response = http.get(`${BASE}/sign-in`, { tags: { name: 'sign-in page' } });
  check(response, { 'sign-in page 200': (r) => r.status === 200 });
  sleep(1);
}

export function dashboard(data) {
  const params = (name) => ({ headers: { Cookie: data.cookie }, tags: { name } });

  const overview = http.get(`${BASE}/dashboard/${ORG}`, params('dashboard overview'));
  check(overview, { 'overview 200': (r) => r.status === 200 });
  sleep(1);

  const projects = http.get(`${BASE}/dashboard/${ORG}/projects`, params('projects list'));
  check(projects, { 'projects 200': (r) => r.status === 200 });
  sleep(1);

  const search = http.get(`${BASE}/dashboard/${ORG}/projects?q=a`, params('projects search'));
  check(search, { 'search 200': (r) => r.status === 200 });
  sleep(1);

  const members = http.get(`${BASE}/dashboard/${ORG}/members`, params('members'));
  check(members, { 'members 200': (r) => r.status === 200 });
  sleep(2);
}
```
📄 **Create `.github/workflows/load-test.yml`** (manual, against the URL you give it):
```yaml
name: Load smoke test

on:
  workflow_dispatch:
    inputs:
      base_url:
        description: 'Staging URL (NOT production)'
        required: true

permissions:
  contents: read

jobs:
  k6:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1
      - name: Refuse to hit production
        run: |
          case "${{ inputs.base_url }}" in
            *staging*|*preview*|*.vercel.app*) ;;
            *) echo "Refusing: the URL must look like a staging/preview environment"; exit 1 ;;
          esac
      - run: k6 run loadtest/smoke.js
        env:
          BASE_URL: ${{ inputs.base_url }}
          LOAD_EMAIL: ${{ secrets.LOAD_EMAIL }}
          LOAD_PASSWORD: ${{ secrets.LOAD_PASSWORD }}
          LOAD_ORG_SLUG: demo
```
(`gh secret set LOAD_EMAIL` / `LOAD_PASSWORD` — the seeded demo account. Run `pnpm check:docs`-style linting doesn't apply to `.js` in `loadtest/`; if Oxlint flags the k6 globals, add `loadtest/**` to `ignorePatterns`.)

### 3. Run it, read it, fix what it finds

```bash
k6 run -e BASE_URL=https://staging.your-domain.example -e LOAD_EMAIL=demo@example.com \
       -e LOAD_PASSWORD='Demo-Password-123' -e LOAD_ORG_SLUG=demo loadtest/smoke.js
```
Read the summary: **thresholds** (✓/✗), `http_req_duration` p(95) per scenario, `http_req_failed`, and the per-page `name` tags. Then investigate in this order:

| Finding | Usual cause | Fix |
|---|---|---|
| High p95 on every dashboard page | too many sequential queries per request (session + membership + page data) | cache within a request (`React.cache`), fetch in parallel (`Promise.all`), select fewer columns |
| One page is slow | missing index / N+1 | Neon console: `select relname, seq_scan, idx_scan from pg_stat_user_tables order by seq_scan desc;` — add an index in a new (additive) migration |
| Errors rising with VUs: `too many connections` | per-instance pool too large for the pooler | use the **pooled** `DATABASE_URL`; keep the per-instance pool small (e.g. 5) |
| Cold-start spikes | serverless cold starts | check Vercel function region = Neon region; reduce bundle (Sprint 7) |
| 429/403 | Arcjet/rate limits seeing k6 as a bot | `ARCJET_MODE=DRY_RUN` on staging |
Re-run until the thresholds pass. What you **can't** fix now becomes a `TD-` entry with the measurement.

📄 **Write it down** — append to `docs/guides/performance.md`:
````markdown
## Load smoke test (staging)
Run: `k6 run … loadtest/smoke.js` (or the *Load smoke test* workflow). Date: ____ · Environment: Vercel (region) + Neon (region, plan).
| Scenario | VUs | p95 | Errors | Target |
|---|---|---|---|---|
| dashboard | 50 | | | < 500 ms, < 1 % |
| marketing | 25 | | | < 300 ms |
| sign-in page | 10 | | | < 500 ms |
**Connection/pooling findings:** pooled URL, per-instance pool size, peak connections observed, plan limits.
**Fixes applied:** …  **Left as debt:** …
````

### ✅ Verify
1. The k6 run ends with **all thresholds ✓**: dashboard p95 < 500 ms at 50 VUs, failures < 1 %.
2. The results table and pooling notes are in `performance.md`; any unfixed bottleneck has a `TD-` entry.
3. The workflow refuses a non-staging URL (try `https://app.your-domain.example` → it stops).
4. Staging is back to its normal settings (`AUTH_RATE_LIMIT`, Arcjet mode) afterwards.

**🚢 Ship** — branch `test/s8-t12-load-smoke` · message: `test(load): add k6 smoke scenarios, a staging-only workflow and recorded results`

---

## 🎫 S8-T13 — Beta bug bash and cross-browser pass

**Branch:** `docs/s8-t13-beta` · **Story:** US-085 · **1 SP**

> 🎯 Real people find what tests can't: unclear docs, a command that fails on *their* machine, a passkey flow that only breaks in Safari. This ticket is a **process**: collect, triage, fix P0/P1, defer the rest.

```bash
git switch main && git pull && git switch -c docs/s8-t13-beta
mkdir -p docs/release
```

### 1. The feedback channel

📄 **Create `.github/ISSUE_TEMPLATE/beta_feedback.yml`:**
```yaml
name: Beta feedback
description: Tell us about your first hour with the template
labels: [beta, triage]
body:
  - type: input
    id: ttfr
    attributes: { label: Time to first run, description: 'From `git clone` to a page in your browser (minutes).' }
  - type: input
    id: ttfd
    attributes: { label: Time to first deploy, description: 'To a working production URL (minutes), if you got that far.' }
  - type: textarea
    id: failed
    attributes: { label: Commands or steps that failed, description: 'Paste the command and the error.' }
  - type: textarea
    id: docs
    attributes: { label: What was unclear in the docs? }
  - type: textarea
    id: missing
    attributes: { label: What did you expect that isn't there? }
  - type: input
    id: env
    attributes: { label: 'OS, Node, pnpm, browser' }
```
```bash
# labels used by triage (once)
gh label create beta --color 0E8A16 --force
gh label create triage --color FBCA04 --force
gh label create P0 --color B60205 --description "Blocks launch: security hole, data loss, can't install/run" --force
gh label create P1 --color D93F0B --description "Blocks launch: major feature broken, docs make setup impossible" --force
gh label create P2 --color FEF2C0 --description "Post-launch backlog" --force
gh label create post-launch --color C5DEF5 --force
```

### 2. The programme

📄 **Create `docs/release/beta-programme.md`:**
````markdown
# Beta programme

**Who:** 5–10 developers who haven't seen the project. **When:** from the 0.8 beta until two weeks before 1.0.
**Ask:** scaffold a project from the template, deploy it, and file *Beta feedback* issues. Offer a 30-minute screen-share to two of them and just watch — don't help.

## Triage (within 2 working days of each report)
| Priority | Definition | Decision |
|---|---|---|
| **P0** | security hole, data loss, cannot install/run, cannot sign in | fix now; **blocks launch** |
| **P1** | major feature broken, a doc step that makes setup impossible | fix before launch; **blocks launch** |
| **P2** | annoyance, nice-to-have, rough edge | label `P2 post-launch`; goes to the v1.1 board |
Duplicates are linked and closed. Questions move to Discussions. Doc gaps are bugs.

## Metrics to record
| Tester | OS | Time to first run | Time to first deploy | Failed steps | Verdict |
|---|---|---|---|---|---|
| | | | | | |
Targets: first run ≤ 5 min, first deploy ≤ 30 min (roadmap review criteria).

## Exit
All P0/P1 closed (`gh issue list --label P0 --state open` is empty, same for P1); P2s labelled and moved to the post-launch board.
````

### 3. Cross-browser pass (manual, ~1 hour)

📄 **Create `docs/release/browser-matrix.md`** and run every row on **staging** (production-like HTTPS — passkeys need it):
````markdown
# Browser matrix

Legend: ✅ works · ⚠️ works with a caveat (note it) · ❌ broken (issue #) · — not applicable
Date: ____ · Tester: ____ · Build/version: ____

| Flow | Chrome (desktop) | Firefox | Safari (macOS) | Edge | Safari iOS | Chrome Android |
|---|---|---|---|---|---|---|
| Landing, pricing, about render correctly (light/dark) | | | | | | |
| `/fr` fully French; language switcher keeps the page | | | | | | |
| Sign-up + email verification link | | | | | | |
| Sign-in with password | | | | | | |
| Magic link | | | | | | |
| **Passkey: register** (platform authenticator) | | | | | | |
| **Passkey: sign in** (button) | | | | | | |
| **Passkey: sign in** (autofill) | | | | | | |
| TOTP enrolment + sign-in + backup code | | | | | | |
| Social sign-in (Google / GitHub) | | | | | | |
| Create organization, invite, accept invitation | | | | | | |
| Projects: create / search / edit / delete | | | | | | |
| Consent banner + settings dialog | | | | | | |
| Mobile navigation menu, forms usable with the on-screen keyboard | — | — | — | — | | |
| Keyboard-only navigation and focus rings | | | | | | |
Notes per browser: _(passkey availability depends on OS settings; Safari asks for iCloud Keychain; Firefox supports passkeys on recent versions)_
````

### 4. Close the loop

- Every P0/P1 gets a branch, a test that reproduces it, and a `fix:` commit (a `fix:` ships as a patch release — see `releasing.md`).
- Docs gaps found by testers go straight into the guides; `pnpm docs:check` must stay green.
- Update **06-project-state.md**: tester count, time-to-first-run/deploy averages, P0/P1/P2 counts, top 3 lessons.

### ✅ Verify
1. At least **5** beta reports are triaged (or: you documented why fewer — e.g. a private beta of 3 plus your own clean-clone runs).
2. `gh issue list --label P0 --state open` and `--label P1` both print **nothing**.
3. The browser matrix is complete for the six browsers; any ❌ is an issue, any ⚠️ is a documented caveat in the relevant guide (usually `auth.md` for passkeys).
4. Average time-to-first-run ≤ 5 min and time-to-first-deploy ≤ 30 min — or the gap and the doc fixes are recorded.

**🚢 Ship** — branch `docs/s8-t13-beta` · message: `docs(release): add beta programme, triage rules and browser matrix`

---

## 🎫 S8-T14 — Launch checklist and v1.0.0

**Branch:** `chore/s8-t14-launch` · **Story:** US-086 · **3 SP**

> 🎯 Nothing new is built. We **prove** the product is ready, publish `v1.0.0` through the pipeline we rehearsed, make the repository easy to adopt, and plan what comes next.

```bash
git switch main && git pull && git switch -c chore/s8-t14-launch
```

### 1. An automated gate for the things a machine can check

📄 **Create `scripts/launch-check.sh`:**
```bash
#!/usr/bin/env bash
# pnpm launch:check [production-url]   — the machine-checkable part of the launch checklist
set -u
fail=0
ok()  { echo "✅ $1"; }
bad() { echo "❌ $1"; fail=1; }
manual() { echo "☐  $1  (manual)"; }

for label in P0 P1; do
  count=$(gh issue list --label "$label" --state open --json number --jq length 2>/dev/null || echo "?")
  [ "$count" = "0" ] && ok "no open $label issues" || bad "open $label issues: $count"
done

for workflow in CI Security; do
  conclusion=$(gh run list --workflow "$workflow" --branch main --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null)
  [ "$conclusion" = "success" ] && ok "$workflow is green on main" || bad "$workflow on main: ${conclusion:-unknown}"
done

pnpm docs:check >/dev/null 2>&1 && ok "docs: env table, commands" || bad "docs:check fails"
pnpm audit:prod >/dev/null 2>&1 && ok "no high/critical vulnerabilities (production)" || bad "pnpm audit:prod fails"
pnpm licenses:check >/dev/null 2>&1 && ok "licences allowed" || bad "licences:check fails"
[ -f LICENSE ] && [ -f CONTRIBUTING.md ] && [ -f SECURITY.md ] && [ -f CODE_OF_CONDUCT.md ] && ok "community files present" || bad "missing LICENSE/CONTRIBUTING/SECURITY/CODE_OF_CONDUCT"

if [ -n "${1:-}" ]; then
  health=$(curl -fsS "$1/api/health" 2>/dev/null)
  echo "$health" | grep -q '"status":"ok"' && ok "production health: $health" || bad "production health failed ($1)"
fi

manual "Checkly green for 7 days on the demo deployment (dashboard screenshot linked in the PR)"
manual "Deploy rehearsal incl. rollback recorded in docs/guides/deployment.md"
manual "Clean-clone run verified on macOS, Linux, Windows/WSL (06-project-state.md)"
manual "Cross-browser matrix complete (docs/release/browser-matrix.md)"
manual "Threat model + ASVS table reviewed; no ❌ without an issue"
exit $fail
```
📄 **Edit `package.json`:** `"launch:check": "bash scripts/launch-check.sh"`.
```bash
chmod +x scripts/launch-check.sh && pnpm launch:check https://app.your-domain.example
```

### 2. The checklist (evidence, not promises)

📄 **Create `docs/release/launch-checklist.md`** — a copy of the roadmap checklist with a **link to proof** per line:
````markdown
# Launch checklist — v1.0.0

| ☐ | Item | Evidence |
|---|---|---|
| ☐ | All P0/P1 closed; CI green on `main` | `pnpm launch:check` output |
| ☐ | Docs verified from a clean clone on macOS, Linux, Windows (WSL) | `06-project-state.md` table |
| ☐ | Security review and dependency audit done | `docs/security/threat-model.md`, `asvs-checklist.md`, audit workflow run |
| ☐ | Production deploy rehearsal incl. rollback | rehearsal log in `deployment.md` |
| ☐ | LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY in place | files |
| ☐ | Demo deployment live; Checkly green for 7 days | dashboard link |
| ☐ | Final gates on `main`: `pnpm check`, full E2E, visual, Lighthouse | latest CI run |
| ☐ | Email deliverability verified (SPF/DKIM/DMARC pass, mail-tester ≥ 9) | `deployment.md` |
| ☐ | Load smoke test passed on staging | `performance.md` |
| ☐ | `CSP_MODE=enforce` in production after a clean report-only week | logs |
| ☐ | `SITE_INDEXING=true`; `LEGAL_NOINDEX=false` **only if** legal pages were reviewed | env |
| ☐ | Announcement drafted; demo link works | `announcement.md` |
````

### 3. The final gates, on `main`

Run these on a clean checkout of `main` and attach the results to the PR:
```bash
pnpm install --frozen-lockfile
pnpm check
CI=1 pnpm e2e
pnpm e2e:visual           # (CI's Visual job is the authority — baselines are Linux-made)
pnpm lighthouse
pnpm launch:check https://app.your-domain.example
```
…and confirm the same **jobs are green in GitHub Actions** on the latest `main` commit.

### 4. The demo deployment and the 7 days

Deploy the template as its own product (the production environment you built in S8-T06, or a second Vercel project): `SITE_INDEXING=true`, seeded demo data (`pnpm db:seed` once through the Neon direct URL — acceptable *only* on a demo), `EMAIL_TRANSPORT=console` or a sandboxed mailbox. Point **Checkly** at it (S6-T08) and let it run for **seven days**; link the green dashboard in the PR. Schedule a weekly demo reset if visitors can write data.

### 5. Publish `v1.0.0`

There is no "release PR" with Semantic Release — **a releasable commit on `main` *is* the release**. Because our history before launch contains hundreds of commits, give the first stable release a clean starting point:

1. **Baseline tag** — marks "everything before this is pre-release history", so the changelog doesn't start with Sprint 0:
```bash
git switch main && git pull
git tag -a v0.9.0 -m "chore: baseline before 1.0 (pre-release history is not part of the changelog)"
git push origin v0.9.0
```
   This tag triggers the **Deploy** workflow: treat it as the **last rehearsal on the real production environment** — approve it at the `production` gate, watch migrate → smoke test → promote succeed, and check the site.
2. **The launch PR** — updates the checklist (ticked, with links) and carries the breaking-change marker that makes the version **1.0.0**:
```bash
git add -A
git commit -m "feat!: general availability

BREAKING CHANGE: first stable release. The public conventions documented in docs/guides are stable from 1.0.0; later breaking changes will bump the major version."
git push -u origin chore/s8-t14-launch
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
```
3. **Watch the pipeline:** *CI → Release* creates **`v1.0.0`** with generated notes and `CHANGELOG.md`; *Deploy* waits for approval → approve → production now reports `1.0.0` at `/api/health`.
4. **Review the GitHub Release notes** (edit them: a short human introduction, highlights, upgrade note, thank-yous).

### 6. Make the repository adoptable

```bash
gh repo edit --template \
  --enable-discussions \
  --description "Open-source Next.js 16 SaaS starter: auth, organizations, RBAC, observability, tests — optional by design" \
  --homepage "https://demo.your-domain.example" \
  --add-topic nextjs --add-topic saas --add-topic boilerplate --add-topic starter-template \
  --add-topic better-auth --add-topic drizzle-orm --add-topic typescript --add-topic tailwindcss
```
Set the **social preview** image (*Settings → General → Social preview*; use the generated Open Graph card). 📄 **Create `docs/release/announcement.md`** — the short post (what it is, 3 differentiators, demo link, quick start, how to contribute) and publish it where your audience is.

### 7. The post-launch board

📄 **Create `scripts/create-post-launch-issues.sh`:**
```bash
#!/usr/bin/env bash
# Creates the v1.1+ milestones and one issue per post-launch epic. Run once.
set -euo pipefail
gh label create post-launch --color C5DEF5 --force >/dev/null

milestone() { gh api "repos/{owner}/{repo}/milestones" -f title="$1" -f description="$2" >/dev/null 2>&1 || true; }
issue() { gh issue create --title "$1" --body "$2" --label post-launch --milestone "$3" >/dev/null && echo "created: $1"; }

milestone v1.1 "Billing & entitlements"
milestone v1.2 "Audit log UI, notifications, onboarding"
milestone v1.3 "File uploads, background jobs"
milestone v1.4 "Public API, API keys, webhooks"
milestone v2.0 "Multi-dialect, SSO/SAML/SCIM, CLI generator, MDX blog"

issue "E20 — Billing & entitlements (Stripe), plan limits per organization" "See docs/roadmap/03-master-backlog.md (E20)." v1.1
issue "E22 — Audit log UI"                  "See backlog E22. Data already exists (TD-05)." v1.2
issue "E27 — Notifications"                 "See backlog E27." v1.2
issue "E30 — Onboarding wizard"             "See backlog E30." v1.2
issue "E23 — File uploads"                  "See backlog E23." v1.3
issue "E24 — Background jobs (TD-06)"       "See backlog E24." v1.3
issue "E25 — Public API, API keys, webhooks" "See backlog E25." v1.4
issue "E21 — SQLite/MySQL dialects (TD-01)" "See backlog E21." v2.0
issue "E26 — SSO / SAML / SCIM"             "See backlog E26." v2.0
issue "E29 — CLI generator"                 "See backlog E29." v2.0
issue "E28 — Blog / MDX"                    "See backlog E28." v2.0
echo "Also review epic E31 and the P2 issues from the beta: label them post-launch and assign a milestone."
```
```bash
bash scripts/create-post-launch-issues.sh
```
Then add the **P2** beta issues to the same board and open a GitHub **Project** (*Projects → New → Board*) with the milestones as columns/filters.

### 8. Retrospective

📄 **Create `docs/release/retrospective.md`:**
````markdown
# Retrospective — v1.0

## Velocity
| Sprint | Planned SP | Actual SP | Notes |
|---|---|---|---|
| S0 | 32 | | |
| S1 | 35 | | |
| S2 | 37 | | |
| S3 | 34 | | |
| S4 | 38 | | |
| S5 | 36 | | |
| S6 | 31 | | |
| S7 | 32 | | |
| S8 | 34 | | |

## Risks that happened (update `docs/roadmap/04-dependencies-risks.md` to match)
| Risk | Happened? | What we did | Would we do it differently? |
|---|---|---|---|
| R-04/R-05 tenant isolation | | | |
| R-09 visual flake | | | |
| R-10 CSP vs integrations | | | |
| R-13 email deliverability | | | |
| R-14 migration failures | | | |
| R-16 multi-dialect promise | | | |

## What went well / what hurt / what to change
- 
## Lessons for the next project
- 
````
Update `docs/roadmap/04-dependencies-risks.md` (mark which risks materialised and how they were handled) and `docs/roadmap/06-project-state.md` ("v1.0.0 released on …", final env/route inventory, links to the release, demo and board).

### ✅ Verify
1. `pnpm launch:check <production-url>` prints **no ❌**; the manual lines are all ticked in `launch-checklist.md` with evidence links.
2. `https://github.com/OWNER/REPO/releases/tag/v1.0.0` exists with notes; `git tag -l 'v*'` shows `v0.9.0` and `v1.0.0` (plus the `rc` pre-release if you kept it); `CHANGELOG.md` starts at 1.0.0 with only the post-baseline changes.
3. Production serves **1.0.0** (`/api/health`), Sentry shows release `1.0.0`, Checkly is green.
4. The repository is marked **Template** (the green *Use this template* button), Discussions are on, topics are set.
5. The v1.1–v2.0 milestones and issues exist; the beta P2s are on the board.
6. Retrospective written; risk register updated.

**🚢 Ship** — branch `chore/s8-t14-launch` · message: `feat!: general availability` *(as shown in step 5 — this single commit is what makes the version 1.0.0)*

---

## 🧾 Sprint 8 wrap-up

**Branch:** `docs/s8-wrap-up` (after `v1.0.0` is out)
```bash
git switch main && git pull && git switch -c docs/s8-wrap-up
```

1. **Update `AGENTS.md`** — Commands: `pnpm release:dry`, `pnpm init:template`, `pnpm docs:check`, `pnpm check:migrations`, `pnpm licenses:check`, `pnpm audit:prod`, `pnpm launch:check`, `pnpm docs:screenshots`. Conventions:
```markdown
- Commit messages decide releases (feat → minor, fix/perf/revert → patch, `!`/BREAKING CHANGE → major). Never tag by hand.
- Migrations are expand/contract only; destructive SQL needs an entry in `drizzle/destructive-approved.json` and its own release.
- Production deploys only through `.github/workflows/deploy.yml` (approval → migrate → smoke test → promote). Never deploy from a laptop.
- New env var: declare in `Env.ts`, describe in `scripts/env-metadata.ts`, run `pnpm docs:env`.
- New integration: behind one adapter that no-ops without config; register it in `scripts/lib/modules.ts`.
- Documented commands must exist (`pnpm docs:check`).
```
```bash
pnpm check:agents
```
2. **Tutorial index** — create `docs/tutorial/README.md` listing the nine sprint tutorials in order with their tags (see the file delivered with this sprint) and tick every box in `docs/roadmap/README.md`'s progress tracker.
3. **`06-project-state.md`** final: version `1.0.0`, deployment URLs, owners of each external account (Vercel, Neon, Resend, Sentry…, with where the secrets live), the post-launch board link.
```bash
pnpm check
git add -A && git commit -m "docs: finalise project state and agent guide after v1.0.0"
git push -u origin docs/s8-wrap-up
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
```
(a `docs:` commit **does not** release anything — correct.)

---

## 🏁 Sprint 8 — Definition of Done

- [ ] Merging a `feat:` commit produces a version, tag, release notes, changelog and GitHub Release **automatically**; pre-release channels (`rc`, `beta`) work
- [ ] README gets a stranger to a running app in ≤ 5 minutes (CI `quickstart` job + human clean-clone runs); PostgreSQL-first is unmistakable
- [ ] `environment.md` is generated and CI-checked; documented commands and links are verified by CI
- [ ] All guides exist and are current; clean-clone verified on ≥ 2 OS (target: macOS, Linux, Windows/WSL)
- [ ] Production pipeline: approval → migrate → deploy (not live) → smoke test → promote; a failing migration leaves production untouched; rollback runbook **rehearsed and timed**
- [ ] Email domain: SPF/DKIM/DMARC pass; every template tested; mail-tester ≥ 9/10
- [ ] CodeRabbit, PR/issue templates, CODEOWNERS, grouped Dependabot with patch auto-merge, rulesets as code
- [ ] `pnpm init:template` is idempotent with a dry run; `--remove sentry,posthog` (and every other supported module) leaves a green build — proven nightly
- [ ] Threat model: every High threat has a control **and** a test; dependency audit and licence check pass; ASVS table filled
- [ ] Load smoke test: dashboard p95 < 500 ms at 50 VUs, errors < 1 %, pooling findings documented
- [ ] Beta feedback triaged; **zero** open P0/P1; cross-browser matrix complete
- [ ] Launch checklist complete; **`v1.0.0`** released and deployed; repository marked as a template; post-launch board and retrospective created

### 🎬 Sprint review — measurable acceptance

| Check | Expected |
|---|---|
| Merge a `feat:` commit | automatic version, tag, release notes, changelog |
| Clean clone → local run | ≤ 5 min following the README |
| Clean clone → production | ≤ 30 min following the deployment guide |
| Migration deploy failure | deploy blocked, production untouched |
| `pnpm init:template --remove sentry,posthog` | build green |
| Load test | p95 < 500 ms, errors < 1 % |
| Threat model | every high threat has a control + a test |

---

## 🧯 Troubleshooting (Sprint 8)

| Symptom | Likely cause → fix |
|---|---|
| Semantic Release says "no release" after a `feat` | the commit isn't Conventional (check the subject), or it was squashed with a different title; `pnpm release:dry` shows how it parsed |
| First release is `1.0.0` with a gigantic changelog | no baseline tag — create `v0.9.0` first (S8-T14 step 5) |
| Release commit rejected (`protected branch`) | `RELEASE_TOKEN` owner isn't in the ruleset's bypass list |
| Deploy workflow never starts after a release | the tag was pushed with `GITHUB_TOKEN` (no workflow triggers) → use `RELEASE_TOKEN` for Semantic Release |
| Deploy stuck "waiting" | the `production` environment needs your approval (Actions → the run → *Review deployments*) |
| Smoke test gets 401 | Vercel Deployment Protection blocks the un-promoted URL → set `VERCEL_AUTOMATION_BYPASS_SECRET` (or disable protection for production deployments) |
| `vercel deploy --skip-domain` unknown flag | CLI version differs → check `vercel deploy --help`; the pattern is "deploy without aliasing, verify, then promote" |
| Migration step fails with `prepared statement` / `pgbouncer` errors | it ran through the **pooled** URL → set `DATABASE_URL_UNPOOLED` (environment secret) |
| Preview database empty or duplicated | `scripts/vercel-build.mjs` runs only for `VERCEL_ENV=preview`; `seed-if-empty` guards duplicates |
| Auth fails on a preview (`INVALID_ORIGIN`) | `NEXT_PUBLIC_APP_URL` is set in the Preview environment → unset it so the Vercel host is used |
| `docs:check-env` fails | add the variable's description in `scripts/env-metadata.ts`, then `pnpm docs:env` |
| `--remove` leaves a broken build | the module's `delete`/`stubs` list is incomplete → read the `typecheck`/`knip` error, extend `scripts/lib/modules.ts`, re-run on a fresh worktree |
| `strip-markers.test.ts` fails | a marker pair is unbalanced or names an unknown module |
| `pnpm licenses:check` flags an LGPL native binary | document it in `docs/security/license-exceptions.json` with the reason |
| `gh` commands in `launch-check.sh` fail | `gh auth login` first; Git Bash needed on Windows |
| k6 gets 403/429 | Arcjet/rate limits on staging → `ARCJET_MODE=DRY_RUN`, relax `AUTH_RATE_LIMIT` |

---

## 🎉 Where you are now

Nine sprints, from an empty folder to a released, deployable, documented, tested and secured SaaS template:
**S0** foundation → **S1** data, shell, i18n → **S2** authentication → **S3** modern authentication → **S4** tenancy, RBAC, admin → **S5** quality and testing → **S6** observability, security, analytics → **S7** SEO, performance, accessibility, theme → **S8** release, deployment, docs, launch.

**Next:** the post-launch board (`v1.1` billing & entitlements first). The same loop applies — one branch per ticket, tests first, a conventional commit, a PR, and the pipeline does the rest.
