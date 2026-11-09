# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 0 — Foundation & Tooling

> Companion to `docs/roadmap/sprint-00-foundation.md`. Every `S0-Txx` section below is one ticket from that sprint file. Follow them **in order** — each step assumes the previous one is merged into `main`.

> 🪟 **Written for Windows + Cmder.** Read the Windows section right below before Step 0 — it explains which tab to use and what differs from Linux/macOS tutorials.

**How to use this doc:** for every ticket → create a branch, copy the commands/files, run the **✅ Verify** block, commit, then merge. Never merge a branch whose verification failed.

> ⚠️ **About versions.** Library APIs (Next 16, Oxlint/Ultracite, Oxfmt, Vitest browser mode) move fast. Where a command or config shape is likely to have drifted, the step says **🔍 Verify against docs**. If reality differs from this tutorial, trust the official docs, then note the difference in `docs/roadmap/06-project-state.md`.

---

## 🔀 Git workflow used in this tutorial (read once)

**Rule: one ticket = one branch = one merge into `main`, only after verification passes.**

| Step | Command |
|---|---|
| Start a ticket | `git switch main && git switch -c <type>/s0-tXX-<slug>` |
| Work + verify | run the ✅ Verify block of the ticket |
| Commit | `git add -A && git commit -m "<type>(<scope>): <message>"` |
| Merge (after verify) | `git switch main && git merge --no-ff --no-edit <branch>` |
| Clean up | `git branch -d <branch>` |

Branch naming: `chore/…` (tooling), `feat/…` (features), `docs/…`, `ci/…`.

> 🔎 **Why `--no-ff`?** It always creates a merge commit, so `git log --first-parent` shows exactly one line per ticket — a readable history and an easy revert point (`git revert -m 1 <merge-sha>`).

> 🔎 **Why not squash?** Optional. We keep the ticket's commits for traceability; switch to `--squash` if you prefer a linear history.

> ℹ️ **Once you push to GitHub (S0-T14/T15)** you can replace the local merge with a Pull Request: push the branch → open PR → wait for CI green → merge. The local flow above is identical in spirit.

**Commit message format** (enforced from S0-T07): `type(scope): subject` — types `feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert`.

---

## 🪟 Windows + Cmder — read this first

### 1. Use a **Git Bash** tab inside Cmder
Cmder's default tab is `cmd.exe`, which does **not** understand `# comments`, `$(…)`, heredocs (`<<'EOF'`), `&`, single quotes, `grep`, `rm`, `cp`… All commands in this tutorial are written for **Git Bash** (same syntax as Linux/macOS), so open a Bash tab:

- Press **Win+Alt+T** (new tab dialog) → choose **`bash::bash`** (full Cmder ships with Git for Windows).
- If there is no bash task: install [Git for Windows](https://git-scm.com/download/win), then in Cmder go to **Settings → Startup → Tasks → `+`**, name it `Git Bash`, and set the command to:
  ```
  "%ProgramFiles%\Git\bin\bash.exe" --login -i -new_console:d:%USERPROFILE%
  ```
- Make it the default (Settings → Startup → *Specified named task*) so you don't have to think about it.

> If you really prefer `cmd.exe`, use the cheat-sheet in §5. Never paste the `# …` comments from code blocks into cmd — it treats them as arguments.

### 2. One-time admin steps
Open Cmder **as Administrator** (right-click → *Run as administrator*) once to run:
```bash
corepack enable          # writes shims into the Node install folder → needs admin
```
(Without admin you get `EPERM`. Alternative without admin: `corepack enable --install-directory "%USERPROFILE%\bin"` and add that folder to `PATH`.)

### 3. Git settings (once per machine)
```bash
git config --global core.autocrlf false     # we enforce LF via .gitattributes + .editorconfig
git config --global core.longpaths true     # avoids "Filename too long" in node_modules
git config --global init.defaultBranch main
```
> 🔎 Windows' default `autocrlf=true` silently rewrites line endings. Linux CI then sees different bytes than you do, and formatters report phantom diffs. We neutralise this in S0-T01 with `.gitattributes` (`eol=lf`).

### 4. Where to put the project
- ✅ `C:\dev\saas-boilerplate` — short path, local disk.
- ❌ Inside **OneDrive/Dropbox** (file locking breaks `node_modules` and PGlite in Sprint 1), ❌ paths with spaces or very deep folders, ❌ network drives.
- Antivirus (Defender) slows `pnpm install`; consider excluding `C:\dev` from real-time scanning if installs are slow.

### 5. Bash ↔ cmd cheat-sheet (only if you stay in `cmd.exe`)

| Bash (tutorial) | cmd.exe |
|---|---|
| `ls` / `ls -a` | `dir` / `dir /a` |
| `cat file` | `type file` |
| `rm file` | `del file` |
| `rm -rf dir` | `rmdir /s /q dir` |
| `mv a b` | `move a b` (rename: `ren a b`) |
| `cp -r a b` | `xcopy a b /E /I` |
| `mkdir -p a/b` | `mkdir a\b` |
| `grep text file` | `findstr text file` |
| `cmd \| grep x` | `cmd \| findstr x` |
| `VAR=1 cmd` | `set VAR=1 && cmd` |
| `LEFTHOOK=0 git commit …` | `set LEFTHOOK=0 && git commit …` |
| `echo 'x' > f` | `echo x> f` (never use single quotes) |
| `# comment` | not supported — skip it |
| `kill %1` | `taskkill /PID <pid> /F` |

### 6. Cmder habits that save time
- **Ctrl+T** opens a new tab — you'll run the dev server in one tab and verification commands in another.
- **Ctrl+C** stops a running process. If a port stays busy afterwards:
  ```bash
  netstat -ano | findstr :3000        # find the PID (last column)
  taskkill /PID <pid> /F
  ```
- First time a Node server listens on a port, Windows Firewall asks for permission → **Allow on private networks**.
- Paths containing `[brackets]` or `(parentheses)` (Next.js route folders like `[locale]` and `(marketing)`) **must be quoted** in Bash: `git mv "src/app/(auth)" "src/app/[locale]/(auth)"`.
- Cross-platform rule for this repo: `package.json` scripts and tooling must work on Windows **and** Linux CI — we use `cross-env` and small Node scripts instead of `rm -rf`, `VAR=x cmd`, `cp`, etc.

---

## ✅ Prerequisites

### Node 22 (LTS)
Option A — **nvm-windows** (recommended if you juggle Node versions): install from <https://github.com/coreybutler/nvm-windows/releases>, then in an **admin** terminal:
```bash
nvm install 22
nvm use 22
node -v      # v22.x
```
> nvm-windows does **not** read `.nvmrc` automatically — run `nvm use 22` yourself in new terminals.

Option B — **winget** (no version manager):
```bash
winget install OpenJS.NodeJS.LTS
```
Then **close and reopen Cmder** so `PATH` refreshes.

### pnpm via Corepack
After `corepack enable` (admin, see §2):
```bash
corepack prepare pnpm@latest --activate
pnpm -v
```

### Git, GitHub CLI, editor
```bash
git --version                       # Git for Windows
winget install --id GitHub.cli      # GitHub CLI (needed from S0-T14)
gh auth login                       # choose GitHub.com → HTTPS → authenticate via browser
```
- VS Code (optional, see S0-T13): <https://code.visualstudio.com/>

---

## 🏗️ Step 0 — Scaffold the base project

This is the only commit that lands directly on `main` (a repo needs a first commit). Everything after goes through branches.

```bash
pnpm create next-app@latest saas-boilerplate
```

Answer the prompts like this (🔍 prompts change between releases — choose the equivalent):

| Prompt | Answer |
|---|---|
| TypeScript | **Yes** |
| Linter | **None** (we use Oxlint; `next lint` no longer exists in Next 16) |
| React Compiler | **No** (evaluated later in Sprint 7) |
| Tailwind CSS | **Yes** |
| `src/` directory | **Yes** |
| App Router | **Yes** |
| Turbopack | **Yes** (default in Next 16) |
| Customize import alias | **Yes → `@/*`** |

> ⚡ Non-interactive shortcut — **use it if the arrow-key menus misbehave in Cmder** (flags may differ by version — check `pnpm create next-app --help`):
> `pnpm create next-app@latest saas-boilerplate --ts --tailwind --src-dir --app --turbopack --import-alias "@/*" --use-pnpm`

```bash
cd saas-boilerplate
git branch -M main            # make sure the default branch is "main"
git log --oneline             # create-next-app already made an initial commit
pnpm dev
# → http://localhost:3000 should render the Next.js starter. Stop with Ctrl+C.
```

> 🔎 **pnpm 10 and build scripts.** Recent pnpm versions block dependency `postinstall` scripts by default. If you see "Ignored build scripts: sharp, @tailwindcss/oxide, …" run `pnpm approve-builds`, select the listed packages, and commit the resulting `pnpm.onlyBuiltDependencies` entry. Don't approve packages you don't recognise.

---

## 🎫 S0-T01 — Baseline: Node/pnpm pinning, exact versions, ADRs, roadmap docs

**Branch:** `chore/s0-t01-baseline` · **Story:** US-001 · **3 SP**

```bash
git switch -c chore/s0-t01-baseline
```

### 1. Pin Node and pnpm

📄 **Create `.nvmrc`:**
```
22
```

Pin the pnpm version into `package.json` (Corepack reads this field):
```bash
corepack use pnpm@latest
```
This writes `"packageManager": "pnpm@x.y.z+sha512..."`.

📄 **Edit `package.json`** — add an `engines` block:
```json
{
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=10.0.0"
  }
}
```

📄 **Create `.npmrc`:**
```ini
save-exact=true
engine-strict=true
```
> 🔎 `save-exact` makes every future `pnpm add` write `1.2.3` instead of `^1.2.3` — reproducible installs and deliberate upgrades (Dependabot proposes them, CI proves them). `engine-strict` fails installs on the wrong Node version.

### 2. Re-pin existing dependencies to exact versions

`create-next-app` wrote caret ranges. This script rewrites each dependency to the version **actually installed**:

📄 **Create `scripts/pin-versions.mjs`:**
```js
// scripts/pin-versions.mjs
// Rewrites "^x.y.z" ranges in package.json to the exact installed versions.
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

for (const field of ['dependencies', 'devDependencies']) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    const installed = JSON.parse(
      readFileSync(`node_modules/${name}/package.json`, 'utf8'),
    ).version;
    pkg[field][name] = installed;
  }
}

writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ Dependencies pinned to exact installed versions.');
```

```bash
pnpm install
node scripts/pin-versions.mjs
pnpm install          # refresh lockfile against the pinned ranges
git diff package.json # all "^" should be gone
```

### 3. Read the Next 16 docs and note deltas (🔍 required)

Open the Next.js 16 upgrade guide and confirm these still hold (they shape later sprints):
- `middleware.ts` → **`proxy.ts`** (Node runtime)
- Turbopack is the default bundler for `dev` and `build`
- `params`, `searchParams`, `cookies()`, `headers()` are **async**
- `next lint` is removed
- `next.config.ts` is supported

Write any differences into `docs/roadmap/06-project-state.md` under "Known issues / deviations".

### 4. `.gitignore`, `.gitattributes`, `.editorconfig`

📄 **Append to `.gitignore`:**
```gitignore
# env (keep examples + development defaults)
.env*
!.env.example
!.env.development

# local database (Sprint 1)
local.db
local.db-*

# tests
coverage
playwright-report
test-results
e2e/.auth

# dev emails (Sprint 2)
.emails

# editors (keep shared VS Code config)
.idea
.DS_Store
```

📄 **Create `.gitattributes`:**
```
* text=auto eol=lf
*.png binary
*.jpg binary
*.webp binary
*.ico binary
```

📄 **Create `.editorconfig`:**
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
```

### 4b. Normalise line endings (Windows)
Now that `.gitattributes` exists, re-apply it to every tracked file:
```bash
git add --renormalize .
git status --short     # files listed here had CRLF and are now LF
```
(If nothing is listed, you're already clean.)

### 5. License placeholder

📄 **Create `LICENSE`** — paste the standard MIT text with your name/year (default from open question Q-01; change later if needed).

### 6. Copy the roadmap into the repo

```bash
mkdir -p docs
# Git Bash: drive C: is /c — adjust the source path to where you saved the roadmap
cp -r /c/Users/YOUR_NAME/Downloads/roadmap docs/roadmap
```
Or in `cmd.exe`: `xcopy "C:\Users\YOUR_NAME\Downloads\roadmap" docs\roadmap /E /I`
Or simply drag-and-drop the folder in Explorer into `docs\`.
> 🔎 From now on, tick the checkboxes in `docs/roadmap/sprint-00-foundation.md` as you finish each ticket — the repo itself is your progress tracker.

### 7. ADR folder with stubs

```bash
mkdir -p docs/adr
```

📄 **Create `docs/adr/0000-template.md`:**
```markdown
# ADR-XXX — Title

- **Status:** proposed | accepted | superseded by ADR-YYY
- **Date:** YYYY-MM-DD

## Context
What problem or constraint forces a decision?

## Decision
What we decided.

## Consequences
Trade-offs, follow-ups, what becomes harder/easier.
```

> 🪟 We generate the stubs with a **Node script** instead of shell loops, so it behaves the same in Git Bash, cmd and CI.

📄 **Create `scripts/gen-adrs.mjs`:**
```js
// scripts/gen-adrs.mjs — one-off: creates ADR stubs 001–012 from the architecture doc.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const TITLES = [
  'PostgreSQL-first; SQLite/MySQL deferred',
  'Better Auth as the authentication framework',
  'proxy.ts is optimistic only; DAL is authoritative',
  'Server Actions for app mutations; Route Handlers for external surface',
  'Tenant scoping via tenantDb helper (RLS evaluated)',
  'Lefthook with lint-staged and Commitlint',
  'Oxlint (Ultracite) and Oxfmt replace ESLint and Prettier',
  'All integrations optional via adapters and env',
  'Playwright snapshot visual regression',
  'Locale routing as-needed with [locale] segment',
  'Semantic Release with Conventional Commits',
  'Resend behind an EmailTransport abstraction',
];

mkdirSync('docs/adr', { recursive: true });
const today = new Date().toISOString().slice(0, 10);

TITLES.forEach((title, index) => {
  const n = String(index + 1).padStart(3, '0');
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = `docs/adr/${n}-${slug}.md`;
  if (existsSync(file)) return; // never overwrite
  writeFileSync(
    file,
    `# ADR-${n} — ${title}\n\n- **Status:** accepted\n- **Date:** ${today}\n\n## Context\nSee \`docs/roadmap/02-architecture.md\` §14.\n\n## Decision\n${title}.\n\n## Consequences\n_Fill in details when the related sprint is implemented._\n`,
  );
});

console.log('✅ ADR stubs created in docs/adr');
```
```bash
node scripts/gen-adrs.mjs
ls docs/adr
```

### 8. Record the pinned versions

📄 **Create `scripts/record-versions.mjs`:**
```js
// scripts/record-versions.mjs — writes docs/adr/013-pinned-versions.md
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const today = new Date().toISOString().slice(0, 10);

const body = [
  '# ADR-013 — Pinned versions',
  '',
  '- **Status:** accepted',
  `- **Date:** ${today}`,
  '',
  '```text',
  `node ${run('node -v')}`,
  `pnpm ${run('pnpm -v')}`,
  run('pnpm list --depth 0'),
  '```',
  '',
].join('\n');

writeFileSync('docs/adr/013-pinned-versions.md', body);
console.log('✅ docs/adr/013-pinned-versions.md written');
```
```bash
node scripts/record-versions.mjs
```

### ✅ Verify
```bash
pnpm install --frozen-lockfile
pnpm dev                       # serves "/" — Ctrl+C
pnpm build && pnpm start       # production server works — Ctrl+C
grep -E '"packageManager"|"engines"' package.json
grep -c '\^' package.json      # expect 0 (no caret ranges)
```

### Commit & merge
```bash
git add -A
git commit -m "chore: pin node/pnpm and dependency versions, add ADRs and roadmap docs"
git switch main
git merge --no-ff --no-edit chore/s0-t01-baseline
git branch -d chore/s0-t01-baseline
```
☑️ Tick **S0-T01** in `docs/roadmap/sprint-00-foundation.md` (you'll commit the tick with the next ticket).

---

## 🎫 S0-T02 — TypeScript strictness, Tailwind 4, shadcn/ui

**Branch:** `chore/s0-t02-ts-tailwind-shadcn` · **Story:** US-001 · **2 SP**

```bash
git switch -c chore/s0-t02-ts-tailwind-shadcn
```

### 1. Strict TypeScript

📄 **Edit `tsconfig.json`** — in `compilerOptions` make sure these are set (keep the other options Next generated):
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

> 🔎 **`noUncheckedIndexedAccess`** makes `arr[0]` typed `T | undefined` — it catches a whole class of runtime crashes. **`verbatimModuleSyntax`** forces `import type` for type-only imports, which keeps bundles and lint rules honest. If `verbatimModuleSyntax` conflicts with something Next generates, drop it and record the reason in an ADR. Also consider `exactOptionalPropertyTypes` — try it, and if it creates friction with libraries, leave it off and note it in `docs/adr/`.

### 2. `next.config.ts`

📄 **Edit `next.config.ts`:**
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 🔍 Verify against docs: typedRoutes is stable in Next 16? If so:
  // typedRoutes: true,
};

export default nextConfig;
```

### 3. Tailwind 4 stylesheet location

`create-next-app` put the CSS in `src/app/globals.css`. Our architecture keeps styles under `src/styles/`:
```bash
mkdir -p src/styles
git mv src/app/globals.css src/styles/global.css
```
📄 **Edit `src/app/layout.tsx`** — update the import:
```tsx
import '@/styles/global.css';
```
> 🔎 Tailwind v4 is **CSS-first**: there is no `tailwind.config.js`. Theme tokens live in the CSS (`@theme`), and the PostCSS plugin `@tailwindcss/postcss` is already configured in `postcss.config.mjs`.

### 4. Initialise shadcn/ui
```bash
pnpm dlx shadcn@latest init
```
Choose: base color **Neutral**, CSS variables **yes**. If it asks for the CSS file path, answer `src/styles/global.css`. 🔍 If a prompt differs, pick the closest option.

### 5. Move the `cn` helper to `src/utils/`

shadcn creates `src/lib/utils.ts`. We use `src/utils/`:
```bash
mkdir -p src/utils
git mv src/lib/utils.ts src/utils/cn.ts   # if shadcn created it elsewhere, adjust
rmdir src/lib 2>/dev/null || true
```
📄 **Edit `components.json`** — update aliases:
```json
{
  "aliases": {
    "components": "@/components",
    "utils": "@/utils/cn",
    "ui": "@/components/ui",
    "lib": "@/utils",
    "hooks": "@/hooks"
  }
}
```
Fix imports of the old path:
```bash
grep -rl "@/lib/utils" src | xargs sed -i.bak 's#@/lib/utils#@/utils/cn#g' && find src -name '*.bak' -delete
```
(Run this in the **Git Bash** tab — it ships GNU `sed`. Windows alternative: in VS Code press **Ctrl+Shift+H**, search `@/lib/utils`, replace with `@/utils/cn`, scope `src/`, *Replace All*.)

### 6. Add a Button and a demo page
```bash
pnpm dlx shadcn@latest add button
```

📄 **Replace `src/app/page.tsx`:**
```tsx
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">SaaS Boilerplate</h1>
      <p className="text-muted-foreground text-center">
        Next.js 16 · TypeScript strict · Tailwind CSS 4 · shadcn/ui
      </p>
      <Button>It works</Button>
    </main>
  );
}
```

### 7. `typecheck` script

📄 **Edit `package.json`** `scripts`:
```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```
Pin any newly added dependencies:
```bash
node scripts/pin-versions.mjs && pnpm install
```

### ✅ Verify
```bash
pnpm typecheck                 # 0 errors
pnpm build                     # succeeds
pnpm dev                       # the Button is styled using theme tokens (rounded, dark background)
```

**Evidence for minification + cache busting** (feature checklist items). 🪟 A tiny Node script does this on every OS — no `curl`/`kill` juggling:

📄 **Create `scripts/verify-build-assets.mjs`:**
```js
// scripts/verify-build-assets.mjs
// Usage: start the production server in another tab (pnpm start), then run this.
const base = process.env.BASE_URL ?? 'http://localhost:3000';

const html = await (await fetch(base)).text();
const chunk = html.match(/\/_next\/static\/[^"']+\.js/)?.[0];

console.log('HTML length:', html.length, '(compact, no pretty-printing)');
console.log('First 200 chars:', html.slice(0, 200).replace(/\s+/g, ' '));

if (!chunk) {
  console.error('❌ No static JS chunk found in HTML');
  process.exit(1);
}

const res = await fetch(base + chunk, { method: 'HEAD' });
console.log('Asset:', chunk);
console.log('Cache-Control:', res.headers.get('cache-control'));
console.log(
  /immutable/.test(res.headers.get('cache-control') ?? '')
    ? '✅ hashed + immutable (cache busting works)'
    : '❌ expected an immutable Cache-Control',
);
```

Two Cmder tabs (**Ctrl+T** for the second):
```bash
# Tab 1
pnpm build && pnpm start

# Tab 2 (after "Ready" appears in tab 1)
node scripts/verify-build-assets.mjs
```
Stop the server in tab 1 with **Ctrl+C**.

Copy the outputs into `docs/roadmap/06-project-state.md` ("Evidence" section).

### Commit & merge
```bash
git add -A
git commit -m "chore: enable strict typescript, tailwind 4 stylesheet and shadcn ui"
git switch main
git merge --no-ff --no-edit chore/s0-t02-ts-tailwind-shadcn
git branch -d chore/s0-t02-ts-tailwind-shadcn
```

---

## 🎫 S0-T03 — Type-safe environment variables (T3 Env)

**Branch:** `feat/s0-t03-env` · **Story:** US-002 · **3 SP**

> 🎯 **Goal:** a missing or invalid env var must crash `pnpm dev`/`pnpm build` with a readable message — not blow up three requests later.

```bash
git switch -c feat/s0-t03-env
pnpm add @t3-oss/env-nextjs zod
pnpm add -D jiti
```

### 1. The env module

📄 **Create `src/libs/Env.ts`:**
```ts
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const Env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_APP_NAME: z.string().min(1),
  },
  // Next.js inlines NEXT_PUBLIC_* at build time, so each var must be listed explicitly.
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
  emptyStringAsUndefined: true,
  // Escape hatch for Docker/CI builds that don't have real values (never use in prod runtime)
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
```
> 🔎 `z.url()` is Zod 4 syntax. If you ended up on Zod 3, write `z.string().url()`.

### 2. Validate at build/boot time

📄 **Edit `next.config.ts`:**
```ts
import { createJiti } from 'jiti';
import type { NextConfig } from 'next';

const jiti = createJiti(import.meta.url);

// Importing Env here runs validation when Next loads its config (dev, build, start).
await jiti.import('./src/libs/Env');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
```
> 🔍 **Verify against docs:** the T3 Env + Next 16 guide for loading TypeScript env files from `next.config.ts`. If Next 16 can import a relative `.ts` file natively, you may use a plain `import './src/libs/Env';` instead and drop `jiti`.

### 3. Env files

📄 **Create `.env.example`** (documents **every** var; committed; no secrets):
```dotenv
# ─── App ────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="SaaS Boilerplate"
```

📄 **Create `.env.development`** (committed; safe local defaults only):
```dotenv
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="SaaS Boilerplate"
```
> 🔒 Real secrets (later sprints) go in `.env.local` (git-ignored). `.env.development` must never contain a secret.

### 4. Use it

📄 **Edit `src/app/page.tsx`** — show the app name from the validated env:
```tsx
import { Button } from '@/components/ui/button';
import { Env } from '@/libs/Env';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">{Env.NEXT_PUBLIC_APP_NAME}</h1>
      <p className="text-muted-foreground text-center">
        Next.js 16 · TypeScript strict · Tailwind CSS 4 · shadcn/ui
      </p>
      <Button>It works</Button>
    </main>
  );
}
```

### 5. Guard: no `process.env` outside `Env.ts`

📄 **Create `scripts/check-env-usage.mjs`:**
```js
// scripts/check-env-usage.mjs
// Fails if process.env is read anywhere except the env module and config files.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ALLOWED = new Set(['src/libs/Env.ts']);
const offenders = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(full)) {
      const rel = full.split(path.sep).join('/');
      if (!ALLOWED.has(rel) && /process\.env/.test(readFileSync(full, 'utf8'))) {
        offenders.push(rel);
      }
    }
  }
}

walk('src');

if (offenders.length > 0) {
  console.error('❌ process.env used outside src/libs/Env.ts:\n  ' + offenders.join('\n  '));
  process.exit(1);
}
console.log('✅ No stray process.env usage.');
```

📄 **Edit `package.json`** `scripts`:
```json
{
  "scripts": {
    "check:env": "node scripts/check-env-usage.mjs"
  }
}
```

> ℹ️ The unit tests for `Env.ts` (invalid URL fails, missing var fails) are written in **S0-T10**, when Vitest exists.

### ✅ Verify
```bash
pnpm check:env                         # ✅ no stray usage
pnpm typecheck

# Fail-fast test: remove a required var
mv .env.development .env.development.bak
pnpm dev
# → crashes immediately with "Invalid environment variables" naming NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_APP_NAME
mv .env.development.bak .env.development

pnpm dev                               # boots; page shows "SaaS Boilerplate"
```

### Commit & merge
```bash
node scripts/pin-versions.mjs && pnpm install
git add -A
git commit -m "feat(config): add type-safe env validation with t3 env"
git switch main
git merge --no-ff --no-edit feat/s0-t03-env
git branch -d feat/s0-t03-env
```

---

## 🎫 S0-T04 — Oxlint with the Ultracite preset

**Branch:** `chore/s0-t04-oxlint` · **Story:** US-003 · **2 SP**

```bash
git switch -c chore/s0-t04-oxlint
pnpm add -D oxlint ultracite
```

### 1. Initialise the Ultracite preset

```bash
pnpm dlx ultracite init
```
- Choose **Oxlint** as the linter and **Oxfmt** as the formatter when asked. 🔍 Verify against docs — the Ultracite init flow and the exact config shape change between releases.
- ⚠️ `ultracite init` may also generate editor settings, git hooks or AI-agent rule files. **Review the diff** (`git status`) and discard anything we'll write ourselves later: hooks (S0-T06), `AGENTS.md`/agent files (S0-T12), `.vscode/` (S0-T13). Keep only the lint/format config.

The result should be an `.oxlintrc.json` (or equivalent) that *extends* the Ultracite presets. If init isn't usable, create it manually following the Ultracite docs. The expected shape is:

📄 **`.oxlintrc.json`** (illustrative — 🔍 take the exact `extends` entries from the Ultracite docs):
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "extends": [
    "ultracite/oxlint/core",
    "ultracite/oxlint/react",
    "ultracite/oxlint/next"
  ],
  "ignorePatterns": [".next", "node_modules", "coverage", "drizzle", "playwright-report"],
  "rules": {
    "typescript/no-explicit-any": "error"
  },
  "overrides": [
    {
      "files": ["**/*.test.ts", "**/*.test.tsx", "e2e/**", "**/*.stories.tsx", "*.config.ts", "*.config.mjs"],
      "rules": {}
    }
  ]
}
```

> 🔒 **Rule:** never relax `no-explicit-any` — not even for tests or config files. `any` is where type-safety goes to die.

### 2. Type-aware linting (evaluate)
Check whether `oxlint-tsgolint` type-aware linting is stable in your version:
```bash
pnpm add -D oxlint-tsgolint
# then try: pnpm oxlint --type-aware
```
If it works and is fast, enable it. If not, remove it and write one line in `docs/adr/007-…` explaining why.

### 3. Scripts

📄 **Edit `package.json`:**
```json
{
  "scripts": {
    "lint": "oxlint",
    "lint:fix": "oxlint --fix"
  }
}
```

### 4. Fix the baseline
```bash
pnpm lint
```
Fix every finding in the scaffold code (usually a few import-order or `import type` issues). Prefer fixing over disabling.

### ✅ Verify
```bash
pnpm lint                              # exit 0
echo 'export const x: any = 1;' > src/scratch.ts
pnpm lint                              # ❌ must FAIL (no-explicit-any)
rm src/scratch.ts
pnpm lint                              # exit 0 again
ls | grep -i eslint                    # nothing: no ESLint files/deps remain
```

### Commit & merge
```bash
node scripts/pin-versions.mjs && pnpm install
git add -A
git commit -m "chore: add oxlint with ultracite preset"
git switch main
git merge --no-ff --no-edit chore/s0-t04-oxlint
git branch -d chore/s0-t04-oxlint
```

---

## 🎫 S0-T05 — Oxfmt formatter

**Branch:** `chore/s0-t05-oxfmt` · **Story:** US-003 · **1 SP**

```bash
git switch -c chore/s0-t05-oxfmt
pnpm add -D oxfmt     # skip if ultracite init already installed it
pnpm oxfmt --help     # 🔍 check the real CLI flags in your version
```

### 1. Config

📄 **Create/edit `.oxfmtrc.json`** (🔍 option names follow Prettier-style keys; confirm against `oxfmt` docs):
```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "endOfLine": "lf",
  "ignorePatterns": [
    ".next",
    "node_modules",
    "coverage",
    "drizzle",
    "pnpm-lock.yaml",
    "playwright-report",
    "test-results"
  ]
}
```
> 🪟 `endOfLine: "lf"` keeps Windows from producing CRLF files (🔍 confirm the option name in Oxfmt's docs).

> 🔎 Tutorial code in this doc uses single quotes + semicolons + trailing commas. If you prefer double quotes, change `singleQuote` once, then format the whole repo in one go.

### 2. Tailwind class sorting
Check whether Oxfmt supports sorting Tailwind classes (docs / `--help`). If **not**, that's fine — add one line to `docs/adr/007-…` ("class sorting unavailable, revisit later") and move on. Not a blocker.

### 3. Scripts

📄 **Edit `package.json`:**
```json
{
  "scripts": {
    "format": "oxfmt .",
    "format:check": "oxfmt --check ."
  }
}
```
(🔍 if your Oxfmt version takes different arguments, adapt — the intent is "format everything" / "check everything".)

### 4. Format the whole repo **in a dedicated commit**
Mixing a repo-wide reformat with real changes makes history unreadable, so it gets its own commit:
```bash
pnpm format
git diff --stat | tail -1
```

### ✅ Verify
```bash
pnpm format:check          # exit 0
echo 'const   x={a:1}' > src/scratch.ts
pnpm format:check          # ❌ must FAIL
pnpm format && cat src/scratch.ts   # now formatted
rm src/scratch.ts
pnpm lint && pnpm typecheck         # still green after reformat
ls | grep -i prettier               # nothing
```

### Commit & merge
```bash
node scripts/pin-versions.mjs && pnpm install
git add -A
git commit -m "style: add oxfmt and format the whole repository"
git switch main
git merge --no-ff --no-edit chore/s0-t05-oxfmt
git branch -d chore/s0-t05-oxfmt
```

---

## 🎫 S0-T06 — Lefthook + lint-staged (pre-commit)

**Branch:** `chore/s0-t06-lefthook` · **Story:** US-004 · **2 SP**

```bash
git switch -c chore/s0-t06-lefthook
pnpm add -D lefthook lint-staged
```

### 1. Install hooks automatically for every teammate

📄 **Edit `package.json`** `scripts`:
```json
{
  "scripts": {
    "prepare": "lefthook install"
  }
}
```
> 🔎 `prepare` runs after `pnpm install`, so cloning + installing sets up hooks automatically. We use Lefthook instead of Husky (ADR-006): one fast binary, config in a single YAML file.

### 2. Hook configuration

📄 **Create `lefthook.yml`:**
```yaml
# https://lefthook.dev/configuration/
pre-commit:
  parallel: false
  commands:
    lint-staged:
      run: pnpm exec lint-staged
```
(`commit-msg` and `pre-push` are added in S0-T07 and S0-T10.)

### 3. lint-staged — only touch staged files

📄 **Edit `package.json`** — add:
```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs,cjs}": ["oxlint --fix", "oxfmt"],
    "*.{json,md,css,yml,yaml}": ["oxfmt"]
  }
}
```
> 🔍 If Oxfmt doesn't support one of those file types yet (md/yml/css), remove that glob rather than letting it error — the rest keeps working.

### 4. Install the hook now

```bash
pnpm install              # triggers "prepare"
ls .git/hooks | grep pre-commit
```

> ℹ️ Emergency bypass only — Git Bash: `LEFTHOOK=0 git commit …` · cmd.exe: `set LEFTHOOK=0 && git commit …`. It's for emergencies; CI is the safety net.

> 🪟 Git runs hooks through the `sh` bundled with **Git for Windows**, so hooks work from Cmder, VS Code and GUI clients alike.

### ✅ Verify
```bash
printf 'export const x:any = 1\n' > src/scratch.ts
git add src/scratch.ts
git commit -m "test: scratch"      # ❌ must be BLOCKED by oxlint (no-explicit-any)
git restore --staged src/scratch.ts && rm src/scratch.ts

printf 'const   y  =  { a:1 }\nexport { y }\n' > src/scratch.ts
git add src/scratch.ts
git commit -m "test: scratch"      # ✅ passes; file was auto-formatted
git show --stat HEAD               # contains the formatted scratch.ts
git reset --hard HEAD~1            # discard the test commit
```

Confirm no Husky leftovers: `ls -a | grep -i husky` → nothing.

### Commit & merge
```bash
node scripts/pin-versions.mjs && pnpm install
git add -A
git commit -m "chore: add lefthook pre-commit with lint-staged"
git switch main
git merge --no-ff --no-edit chore/s0-t06-lefthook
git branch -d chore/s0-t06-lefthook
```

---

## 🎫 S0-T07 — Commitlint + Commitizen

**Branch:** `chore/s0-t07-commitlint` · **Story:** US-004 · **1 SP**

```bash
git switch -c chore/s0-t07-commitlint
pnpm add -D @commitlint/cli @commitlint/config-conventional commitizen cz-conventional-changelog
```

### 1. Commitlint config

📄 **Create `commitlint.config.mjs`:**
```js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'scope-enum': [
      1, // warning, not error: new scopes shouldn't block work
      'always',
      ['deps', 'auth', 'db', 'i18n', 'ui', 'ci', 'docs', 'tests', 'config', 'org', 'admin', 'seo', 'obs', 'sec'],
    ],
    'subject-case': [0],
  },
};
```
> 🔎 Plan note: the roadmap said `commitlint.config.ts`; we use `.mjs` because it loads with zero TypeScript-loader setup — same behaviour, fewer failure modes.

### 2. Hook it up

📄 **Edit `lefthook.yml`** — add:
```yaml
commit-msg:
  commands:
    commitlint:
      run: pnpm exec commitlint --edit {1}
```

### 3. Commitizen (interactive commit helper)

📄 **Create `.czrc`:**
```json
{ "path": "cz-conventional-changelog" }
```

📄 **Edit `package.json`:**
```json
{
  "scripts": {
    "commit": "cz"
  }
}
```

```bash
pnpm exec lefthook install   # refresh hooks with the new commit-msg entry
```

### 4. CONTRIBUTING (commit section)

📄 **Create `CONTRIBUTING.md`:**
```markdown
# Contributing

## Workflow
1. One ticket = one branch (`feat/…`, `chore/…`, `docs/…`, `ci/…`).
2. Run `pnpm check` before opening a PR.
3. Squash/merge only when CI is green.

## Commit messages
We follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by Commitlint.

Format: `type(scope): subject` — e.g. `feat(auth): add magic link sign-in`.

Use `pnpm commit` for an interactive prompt.
```

### ✅ Verify
```bash
git commit --allow-empty -m "bad message"
# ❌ rejected: subject/type may not be empty, type must be one of [...]

git commit --allow-empty -m "feat: verify commitlint works"
# ✅ accepted
git reset --soft HEAD~1 && git reset      # undo the test commit

pnpm commit                               # interactive prompt appears (Ctrl+C to cancel)
```

### Commit & merge
```bash
node scripts/pin-versions.mjs && pnpm install
git add -A
git commit -m "chore: add commitlint and commitizen"
git switch main
git merge --no-ff --no-edit chore/s0-t07-commitlint
git branch -d chore/s0-t07-commitlint
```
> ✅ From this ticket on, **every commit message you write must be conventional** — including the ones in this tutorial (they already are).

---

## 🎫 S0-T08 — Knip (unused files, exports, dependencies)

**Branch:** `chore/s0-t08-knip` · **Story:** US-005 · **2 SP**

```bash
git switch -c chore/s0-t08-knip
pnpm add -D knip
```

### 1. Config

📄 **Create `knip.config.ts`:**
```ts
import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Knip's Next.js plugin already treats app-router files (page, layout, route, …) as entries.
  entry: [
    'src/proxy.ts',
    'scripts/**/*.{ts,mjs}',
    'e2e/**/*.ts',
    'src/**/*.stories.{ts,tsx}',
    'src/**/*.test.{ts,tsx}',
    'tests/**/*.ts',
  ],
  project: ['src/**/*.{ts,tsx}', 'scripts/**/*.{ts,mjs}', 'e2e/**/*.ts', 'tests/**/*.ts'],
  // shadcn primitives intentionally export more than we use
  ignore: ['src/components/ui/**'],
  ignoreDependencies: [
    // Used from CSS (@import), which Knip can't always see
    'tw-animate-css',
  ],
};

export default config;
```
> 🔒 **Rule:** every entry in `ignoreDependencies` needs a comment explaining *why*. An unexplained ignore is a future bug.

📄 **Edit `package.json`:**
```json
{
  "scripts": {
    "knip": "knip"
  }
}
```

### 2. Run and resolve
```bash
pnpm knip
```
Typical first-run findings and the right fix:

| Finding | Fix |
|---|---|
| Unused dependency (e.g. a leftover scaffold package) | `pnpm remove <pkg>` |
| Unused devDependency that **is** used by config | add to `ignoreDependencies` **with a comment** |
| Unused file | delete it |
| Unused export in non-UI code | delete the export or its code |

Record any recurring false positives in `docs/guides/knip.md`:
📄 **Create `docs/guides/knip.md`:**
```markdown
# Knip notes

Run: `pnpm knip`

## Known false positives
| Item | Why it's ignored |
|---|---|
| `tw-animate-css` | Imported from CSS, invisible to Knip |
| `src/components/ui/**` | shadcn primitives export more than we consume |
```

### ✅ Verify
```bash
pnpm knip                               # exit 0
echo 'export const unused = 1;' > src/utils/unused.ts
pnpm knip                               # ❌ must FAIL (unused file)
rm src/utils/unused.ts
pnpm knip                               # exit 0
```

### Commit & merge
```bash
node scripts/pin-versions.mjs && pnpm install
git add -A
git commit -m "chore: add knip for unused code and dependency detection"
git switch main
git merge --no-ff --no-edit chore/s0-t08-knip
git branch -d chore/s0-t08-knip
```

---

## 🎫 S0-T09 — Bundle analyzer

**Branch:** `chore/s0-t09-bundle-analyzer` · **Story:** US-005 · **1 SP**

```bash
git switch -c chore/s0-t09-bundle-analyzer
```

### 1. Try Next's built-in Turbopack analyzer first
```bash
pnpm next --help | grep -i analyze
```
🔍 If `experimental-analyze` (Turbopack bundle analyzer) is listed in your Next 16 version:

📄 **Edit `package.json`:**
```json
{
  "scripts": {
    "analyze": "next experimental-analyze"
  }
}
```

### 2. Fallback (only if the built-in command isn't available)
```bash
pnpm add -D @next/bundle-analyzer cross-env
```
📄 **Edit `next.config.ts`:**
```ts
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

// ...at the bottom, instead of `export default nextConfig;`
export default withBundleAnalyzer(nextConfig);
```
📄 **Edit `package.json`:**
```json
{
  "scripts": {
    "analyze": "cross-env ANALYZE=true next build --webpack"
  }
}
```
> 🔎 `process.env.ANALYZE` is read in a config file — that's allowed (our env guard only scans `src/`).

> 🪟 **Why `cross-env`?** `ANALYZE=true next build` is Unix-only syntax; pnpm runs scripts with `cmd.exe` on Windows, where it fails (`'ANALYZE' is not recognized…`). `cross-env` makes it portable.

### 3. Document it

📄 **Create `docs/guides/performance.md`:**
```markdown
# Performance

## Bundle analysis
Run `pnpm analyze` and open the report. Look for:
- Large third-party libraries on the marketing pages
- Duplicate dependencies
- Client components that could be Server Components

Budgets and Lighthouse targets are added in Sprint 7.
```

### ✅ Verify
```bash
pnpm analyze        # produces a report / opens the analyzer UI
```
Open it and confirm you can see the route-level chunks.

### Commit & merge
```bash
node scripts/pin-versions.mjs && pnpm install
git add -A
git commit -m "chore: add bundle analyzer script"
git switch main
git merge --no-ff --no-edit chore/s0-t09-bundle-analyzer
git branch -d chore/s0-t09-bundle-analyzer
```

---

## 🎫 S0-T10 — Vitest (unit project)

**Branch:** `feat/s0-t10-vitest-unit` · **Story:** US-006 · **2 SP**

```bash
git switch -c feat/s0-t10-vitest-unit
pnpm add -D vitest @vitest/coverage-v8
```

### 1. Config (unit project only for now)

📄 **Create `vitest.config.ts`:**
```ts
import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    env: {
      // Safe defaults so modules that import Env.ts can load in tests
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_APP_NAME: 'Test App',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/components/ui/**',
        'src/**/*.stories.*',
        'src/**/*.d.ts',
        'src/types/**',
        '**/*.test.*',
      ],
    },
    // 🔍 Vitest `projects` API — verify in docs for your version
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
    ],
  },
});
```

### 2. Scripts

📄 **Edit `package.json`:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 3. Sample tests

📄 **Create `src/utils/cn.test.ts`:**
```ts
import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('lets later Tailwind classes win', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('ignores falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});
```

📄 **Create `src/libs/Env.test.ts`** (the tests promised in S0-T03):
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('loads when all variables are valid', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'My App');

    const { Env } = await import('./Env');

    expect(Env.NEXT_PUBLIC_APP_URL).toBe('https://example.com');
    expect(Env.NEXT_PUBLIC_APP_NAME).toBe('My App');
  });

  it('throws when NEXT_PUBLIC_APP_URL is not a URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'not-a-url');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', 'My App');

    await expect(import('./Env')).rejects.toThrow(/Invalid environment variables/i);
  });

  it('throws when a required variable is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_NAME', '');

    await expect(import('./Env')).rejects.toThrow(/Invalid environment variables/i);
  });
});
```
> ℹ️ "Client code can't read server vars" is enforced by T3 Env at runtime in the browser; we cover it with a browser-mode test later only if it proves stable (not a Sprint 0 requirement).

### 4. Pre-push hook (typecheck + changed tests)

📄 **Edit `lefthook.yml`** — add:
```yaml
pre-push:
  commands:
    typecheck:
      run: pnpm typecheck
    tests:
      run: pnpm vitest run --changed
```
```bash
pnpm exec lefthook install
```

### ✅ Verify
```bash
pnpm test               # all green
pnpm test:coverage      # prints a coverage table and writes coverage/lcov.info
pnpm lint && pnpm format:check && pnpm knip && pnpm typecheck
```
Sabotage check — break `cn` on purpose (`return ''`), see the test fail, then `git restore src/utils/cn.ts`.

### Commit & merge
```bash
node scripts/pin-versions.mjs && pnpm install
git add -A
git commit -m "test: add vitest unit project with env and cn tests"
git switch main
git merge --no-ff --no-edit feat/s0-t10-vitest-unit
git branch -d feat/s0-t10-vitest-unit
```

---

## 🎫 S0-T11 — Vitest browser mode (component tests)

**Branch:** `feat/s0-t11-vitest-browser` · **Story:** US-006 · **3 SP**

> ⚠️ This is the most API-volatile ticket of the sprint. 🔍 Read the current Vitest "Browser Mode" guide first; names below follow the current Playwright-provider setup.

```bash
git switch -c feat/s0-t11-vitest-browser
pnpm add -D @vitest/browser-playwright vitest-browser-react playwright @vitejs/plugin-react
pnpm exec playwright install chromium
```

### 1. Browser setup file (so Tailwind styles apply in tests)

📄 **Create `tests/browser-setup.ts`:**
```ts
import '@/styles/global.css';
```

### 2. Add the browser project

📄 **Edit `vitest.config.ts`:**
```ts
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    env: {
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_APP_NAME: 'Test App',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/components/ui/**', 'src/**/*.stories.*', 'src/**/*.d.ts', 'src/types/**', '**/*.test.*'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['tests/browser-setup.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
```

### 3. Scripts

📄 **Edit `package.json`:**
```json
{
  "scripts": {
    "test": "vitest run --project unit",
    "test:browser": "vitest run --project browser",
    "test:all": "vitest run"
  }
}
```
> 🔎 `pnpm test` stays fast (node only). `test:browser` needs Chromium. CI runs both.

### 4. First component test

📄 **Create `src/components/ui/button.test.tsx`:**
```tsx
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { Button } from '@/components/ui/button';

test('renders an accessible button and handles clicks', async () => {
  const onClick = vi.fn();
  const screen = await render(<Button onClick={onClick}>Save</Button>);

  const button = screen.getByRole('button', { name: 'Save' });
  await expect.element(button).toBeVisible();

  await button.click();
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('does not fire onClick when disabled', async () => {
  const onClick = vi.fn();
  const screen = await render(
    <Button disabled onClick={onClick}>
      Save
    </Button>,
  );

  await screen.getByRole('button', { name: 'Save' }).click({ force: true });
  expect(onClick).not.toHaveBeenCalled();
});
```
> ℹ️ We test the shadcn `Button` here purely to prove the pipeline (real tests target our own components from Sprint 1). Its file lives in `ui/`, which is excluded from coverage and Knip.

### 5. Debugging cheat-sheet (add to `docs/guides/testing.md`)

📄 **Create `docs/guides/testing.md`:**
```markdown
# Testing

| Command | What it runs |
|---|---|
| `pnpm test` | Unit tests (node) |
| `pnpm test:browser` | Component tests in real Chromium |
| `pnpm test:all` | Both projects |
| `pnpm test:coverage` | Coverage report |

## Debugging browser tests
- Headed mode: `pnpm vitest --project browser --browser.headless=false`
- Filter: `pnpm vitest run --project browser button`
```

### ✅ Verify
```bash
pnpm test                # unit: green
pnpm test:browser        # browser: green (headless Chromium)
pnpm test:all
```
Sabotage check: change the expected name to `'Nope'` → test must fail → revert.

Note any API surprises (renamed options, provider package name) in `docs/roadmap/06-project-state.md` — risk R-01.

### Commit & merge
```bash
node scripts/pin-versions.mjs && pnpm install
git add -A
git commit -m "test: add vitest browser mode project with component test"
git switch main
git merge --no-ff --no-edit feat/s0-t11-vitest-browser
git branch -d feat/s0-t11-vitest-browser
```

---

## 🎫 S0-T12 — AI coding-agent instruction files

**Branch:** `docs/s0-t12-agent-instructions` · **Story:** US-007 · **3 SP**

> 🎯 **Goal:** any AI agent (Claude Code, Codex, Cursor, OpenCode, Copilot…) that opens this repo immediately knows the commands, conventions and boundaries. **`AGENTS.md` is the single source of truth**; every other file points to it.

```bash
git switch -c docs/s0-t12-agent-instructions
mkdir -p .claude/commands .cursor/rules .github docs/guides
```

### 1. `AGENTS.md` (canonical)

📄 **Create `AGENTS.md`:**
````markdown
# AGENTS.md

Instructions for AI coding agents working in this repository.
Humans: see `README.md` and `docs/guides/`.

## Project
SaaS boilerplate — Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui.
The delivery plan lives in `docs/roadmap/`. Current state: `docs/roadmap/06-project-state.md`.

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
- Adding a dependency, changing database schema, changing authentication/authorization code,
  changing CI/release workflows, or deleting files outside the task's scope.

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
````

### 2. Claude Code

📄 **Create `CLAUDE.md`:**
```markdown
@AGENTS.md

## Claude Code specifics
- Use plan mode for tasks touching more than 3 files.
- Prefer the slash commands in `.claude/commands/`:
  - `/verify` — run the full check suite and report
  - `/sprint` — load the current sprint file and continue
- Verify library APIs against current official docs before using them.
```

📄 **Create `.claude/settings.json`:**
```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.local)",
      "Read(./.env.*.local)"
    ]
  }
}
```

📄 **Create `.claude/commands/verify.md`:**
```markdown
---
description: Run the full verification suite and summarise failures
---

Run `pnpm check`. If anything fails, fix the root cause (do not disable rules or skip tests),
re-run, and finish with a short summary of what changed.
```

📄 **Create `.claude/commands/sprint.md`:**
```markdown
---
description: Load the current sprint and continue the next unchecked task
---

Read `docs/roadmap/06-project-state.md` and the sprint file named in it (docs/roadmap/sprint-0N-*.md).
Find the first unchecked task, implement it following AGENTS.md, run `/verify`, tick its checkboxes, and stop.
```

### 3. Cursor

📄 **Create `.cursor/rules/project.mdc`:**
```markdown
---
description: Project-wide rules (see AGENTS.md for the full version)
alwaysApply: true
---

Follow AGENTS.md in the repository root.
Use pnpm. TypeScript strict, no `any`. Never read `process.env` outside `src/libs/Env.ts`.
Run `pnpm check` before finishing a task. Conventional commits.
```

### 4. GitHub Copilot

📄 **Create `.github/copilot-instructions.md`:**
```markdown
Follow the rules in `AGENTS.md` at the repository root.

Key points: pnpm only; TypeScript strict with no `any`; Server Components by default;
never read `process.env` outside `src/libs/Env.ts`; add tests with new logic; conventional commits.
```

### 5. Codex & OpenCode
Both read `AGENTS.md` natively — nothing else to create. (Add thin pointer files such as `GEMINI.md` only if you use those tools.)

### 6. Consistency check script

📄 **Create `scripts/check-agent-files.mjs`:**
```js
// scripts/check-agent-files.mjs
// Ensures agent instruction files exist and that every `pnpm <script>` mentioned
// in AGENTS.md really exists in package.json.
import { existsSync, readFileSync } from 'node:fs';

const REQUIRED = [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/settings.json',
  '.cursor/rules/project.mdc',
  '.github/copilot-instructions.md',
];

const PNPM_BUILTINS = new Set(['install', 'add', 'remove', 'dlx', 'exec', 'run', 'i', 'create', 'approve-builds', 'update', 'up', 'list']);

let failed = false;

for (const file of REQUIRED) {
  if (!existsSync(file)) {
    console.error(`❌ Missing ${file}`);
    failed = true;
  }
}

const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {};
const agents = readFileSync('AGENTS.md', 'utf8');

for (const match of agents.matchAll(/`pnpm ([a-z][a-z:-]*)/g)) {
  const name = match[1];
  if (!PNPM_BUILTINS.has(name) && !(name in scripts)) {
    console.error(`❌ AGENTS.md mentions "pnpm ${name}" but package.json has no such script`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('✅ Agent instruction files are consistent.');
```

📄 **Edit `package.json`:**
```json
{
  "scripts": {
    "check:agents": "node scripts/check-agent-files.mjs"
  }
}
```

> ⚠️ AGENTS.md mentions `pnpm check` — it's added in **S0-T14**. Until then `check:agents` will (correctly) complain. Either add the `check` script now (see S0-T14 §1) or tolerate the failure until that ticket. **Recommended: add the script now.**

📄 **Edit `package.json`** — add the aggregate script right away:
```json
{
  "scripts": {
    "check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm knip && pnpm check:env && pnpm check:agents && pnpm test && pnpm test:browser"
  }
}
```

### 7. Human-facing doc

📄 **Create `docs/guides/ai-agents.md`:**
```markdown
# Working with AI coding agents

`AGENTS.md` is the single source of truth. Other files only point to it:

| Tool | File |
|---|---|
| Claude Code | `CLAUDE.md` (+ `.claude/`) |
| Codex, OpenCode | `AGENTS.md` |
| Cursor | `.cursor/rules/project.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |

After changing commands or conventions, update `AGENTS.md` and run `pnpm check:agents`.
```

### ✅ Verify
```bash
pnpm check:agents          # ✅
mv CLAUDE.md CLAUDE.md.bak && pnpm check:agents   # ❌ must fail
mv CLAUDE.md.bak CLAUDE.md
pnpm check                 # whole suite green
```
**Fresh-agent test:** open a brand-new Claude Code session in the repo and ask: *"What command verifies a task is done?"* — it should answer `pnpm check` without you telling it.

### Commit & merge
```bash
git add -A
git commit -m "docs: add AGENTS.md and per-tool agent instruction files"
git switch main
git merge --no-ff --no-edit docs/s0-t12-agent-instructions
git branch -d docs/s0-t12-agent-instructions
```

---

## 🎫 S0-T13 — VS Code configuration

**Branch:** `chore/s0-t13-vscode` · **Story:** US-008 · **2 SP** · *P2 — may slip*

```bash
git switch -c chore/s0-t13-vscode
mkdir -p .vscode
```

> Check that `.vscode` is **not** in `.gitignore` (we only ignore `.idea`). The shared config is committed on purpose.

📄 **Create `.vscode/settings.json`:**
```json
{
  "files.eol": "\n",
  "terminal.integrated.defaultProfile.windows": "Git Bash",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "oxc.oxc-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.oxc": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "files.associations": { "*.css": "tailwindcss" },
  "tailwindCSS.experimental.classRegex": [
    ["cva\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"],
    ["cn\\(([^)]*)\\)", "[\"'`]([^\"'`]*).*?[\"'`]"]
  ],
  "search.exclude": {
    "**/.next": true,
    "**/coverage": true,
    "pnpm-lock.yaml": true
  }
}
```
> 🔍 The Oxc extension's id and code-action names come from its marketplace page — adjust if they differ.

📄 **Create `.vscode/extensions.json`:**
```json
{
  "recommendations": [
    "oxc.oxc-vscode",
    "bradlc.vscode-tailwindcss",
    "vitest.explorer",
    "ms-playwright.playwright",
    "lokalise.i18n-ally",
    "editorconfig.editorconfig"
  ]
}
```

📄 **Create `.vscode/launch.json`** (from the Next.js debugging recipe):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "pnpm dev"
    },
    {
      "name": "Next.js: client-side (Chrome)",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000"
    },
    {
      "name": "Vitest: current file",
      "type": "node",
      "request": "launch",
      "autoAttachChildProcesses": true,
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceRoot}/node_modules/vitest/vitest.mjs",
      "args": ["run", "--project", "unit", "${relativeFile}"],
      "console": "integratedTerminal"
    }
  ],
  "compounds": [
    {
      "name": "Next.js: full stack",
      "configurations": ["Next.js: server-side", "Next.js: client-side (Chrome)"]
    }
  ]
}
```

📄 **Create `.vscode/tasks.json`:**
```json
{
  "version": "2.0.0",
  "tasks": [
    { "label": "dev", "type": "shell", "command": "pnpm dev", "isBackground": true, "problemMatcher": [] },
    { "label": "typecheck", "type": "shell", "command": "pnpm typecheck", "problemMatcher": "$tsc" },
    { "label": "test", "type": "shell", "command": "pnpm test", "group": "test", "problemMatcher": [] },
    { "label": "check", "type": "shell", "command": "pnpm check", "group": "build", "problemMatcher": [] }
  ]
}
```

### ✅ Verify
1. Open the folder in VS Code → a popup suggests installing the recommended extensions.
2. Mess up the formatting of a `.tsx` file and save → it's auto-formatted.
3. Run **Run and Debug → Next.js: full stack**, set a breakpoint in `page.tsx`, reload → it hits.
4. `pnpm format:check` still passes (the JSON files are formatted).

### Commit & merge
```bash
pnpm format && pnpm check:agents
git add -A
git commit -m "chore: add shared vscode settings, tasks and debug configs"
git switch main
git merge --no-ff --no-edit chore/s0-t13-vscode
git branch -d chore/s0-t13-vscode
```

---

## 🎫 S0-T14 — GitHub Actions CI baseline

**Branch:** `ci/s0-t14-github-actions` · **Story:** US-009 · **3 SP**

> 🎯 From now on, the safety net isn't your laptop — it's CI. We also publish the repo to GitHub in this ticket.

### 0. Publish the repo (once)

```bash
gh repo create saas-boilerplate --private --source=. --remote=origin --push
# (use --public if this is the open-source template)
```
`main` is now on GitHub. Continue on a branch:
```bash
git switch -c ci/s0-t14-github-actions
mkdir -p .github/workflows
```

### 1. The workflow

📄 **Create `.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

env:
  # Valid dummy values so the build passes env validation (no secrets needed for CI)
  NEXT_PUBLIC_APP_URL: http://localhost:3000
  NEXT_PUBLIC_APP_NAME: SaaS Boilerplate

jobs:
  quality:
    name: Quality (types, lint, format, knip)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4          # reads "packageManager" from package.json
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm knip
      - run: pnpm check:env
      - run: pnpm check:agents

  test:
    name: Tests (unit + browser)
    runs-on: ubuntu-latest
    timeout-minutes: 15
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
      - run: pnpm test
      - run: pnpm test:browser

  build:
    name: Build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Cache Next.js build
        uses: actions/cache@v4
        with:
          path: .next/cache
          key: nextjs-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ hashFiles('src/**') }}
          restore-keys: nextjs-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
      - run: pnpm build

  commitlint:
    name: Commit messages
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: wagoid/commitlint-github-action@v6
        with:
          configFile: commitlint.config.mjs
```

> 🔎 **Security hygiene:** `permissions: contents: read` is least-privilege; `concurrency` cancels superseded runs; every job has a `timeout-minutes`. Actions are pinned to major versions here; Dependabot (next ticket) keeps them current. Hardening step for later: pin to full commit SHAs.

### 2. Badge

📄 **Edit `README.md`** — add under the title (replace `OWNER`):
```markdown
[![CI](https://github.com/OWNER/saas-boilerplate/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/saas-boilerplate/actions/workflows/ci.yml)
```

### ✅ Verify (this ticket is verified **on GitHub**)
```bash
git add -A
git commit -m "ci: add github actions pipeline for quality, tests and build"
git push -u origin ci/s0-t14-github-actions
gh pr create --fill --base main
gh pr checks --watch
```
All four jobs must be green. If one fails, fix on the branch and push again (never "fix" CI by weakening a check).

Intentional-failure test (recommended): push a commit with a lint error to the branch → `quality` fails → revert it.

### Merge (via PR)
```bash
gh pr merge --merge --delete-branch     # merge commit, like our local --no-ff
git switch main && git pull
```

---

## 🎫 S0-T15 — Dependabot & repository hygiene

**Branch:** `chore/s0-t15-repo-hygiene` · **Story:** US-009 · **2 SP**

```bash
git switch -c chore/s0-t15-repo-hygiene
```

### 1. Dependabot

📄 **Create `.github/dependabot.yml`:**
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    commit-message:
      prefix: "chore(deps)"
    groups:
      minor-and-patch:
        update-types: [minor, patch]
    open-pull-requests-limit: 10

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
    commit-message:
      prefix: "ci(deps)"
```
> 🔎 Grouping minor+patch updates into one PR keeps noise low; **majors stay separate** because they deserve individual attention. Since we pin exact versions, Dependabot's PRs are the *only* way versions move — and CI validates each.

### 2. Community & security files

📄 **Create `SECURITY.md`:**
```markdown
# Security Policy

## Reporting a vulnerability
Please **do not** open a public issue. Email security@example.com (replace) or use
GitHub's "Report a vulnerability" button under the Security tab.
We aim to acknowledge reports within 72 hours.

## Supported versions
Only the latest release receives security fixes.
```

📄 **Create `CODE_OF_CONDUCT.md`:**
```markdown
# Code of Conduct

This project follows the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Report unacceptable behaviour to conduct@example.com (replace).
```

📄 **Create `.github/ISSUE_TEMPLATE/bug_report.md`:**
```markdown
---
name: Bug report
about: Something isn't working
labels: bug
---

**What happened?**

**Steps to reproduce**

**Expected behaviour**

**Environment** (OS, Node, pnpm, browser)
```

📄 **Create `.github/ISSUE_TEMPLATE/feature_request.md`:**
```markdown
---
name: Feature request
about: Suggest an improvement
labels: enhancement
---

**Problem this solves**

**Proposed solution**
```

📄 **Create `.github/pull_request_template.md`:**
```markdown
## What does this PR do?

## How was it verified?

## Checklist
- [ ] `pnpm check` passes locally
- [ ] Tests added/updated
- [ ] Docs updated (`docs/`, `AGENTS.md`, `06-project-state.md` if needed)
- [ ] Conventional commit messages
- [ ] No secrets committed
```

### 3. Real README (quick start)

📄 **Replace `README.md`** (keep your CI badge line):
`````markdown
# SaaS Boilerplate

[![CI](https://github.com/OWNER/saas-boilerplate/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/saas-boilerplate/actions/workflows/ci.yml)

Production-ready SaaS starter: **Next.js 16 · React 19 · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui**.

> 🚧 Under construction — see `docs/roadmap/` for the plan and progress.

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env.local   # optional; .env.development already has safe defaults
pnpm dev
```
Open http://localhost:3000.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm check` | Types, lint, format, knip, tests — run before every PR |
| `pnpm commit` | Interactive conventional commit |
| `pnpm analyze` | Bundle analysis |

## Docs
- Roadmap & sprints: `docs/roadmap/`
- Architecture decisions: `docs/adr/`
- Guides: `docs/guides/`
- AI agents: `AGENTS.md`
`````

### 4. Protect `main` (GitHub UI — can't be committed)

Repo → **Settings → Branches → Add branch ruleset** (or classic protection) for `main`:
- ✅ Require a pull request before merging
- ✅ Require status checks: `Quality (types, lint, format, knip)`, `Tests (unit + browser)`, `Build`, `Commit messages`
- ✅ Require branches to be up to date
- ✅ Require linear history *(only if you merge with squash/rebase — skip it if you keep `--no-ff` merge commits)*
- ✅ Automatically delete head branches (Settings → General)
- Allowed merge types: **Merge commit** (and/or squash)

> ℹ️ After this, local `git merge` into `main` + `git push` will be rejected — from now on, **every ticket goes through a PR**: `git push -u origin <branch>` → `gh pr create --fill` → wait for green → `gh pr merge --merge --delete-branch`.

### ✅ Verify
```bash
pnpm format && pnpm check
git add -A
git commit -m "chore: add dependabot, security policy and community files"
git push -u origin chore/s0-t15-repo-hygiene
gh pr create --fill --base main
gh pr checks --watch                  # all green
```
Then on GitHub: **Insights → Dependency graph → Dependabot** shows it's enabled (first PRs appear within a week, or trigger manually from that page).

### Merge
```bash
gh pr merge --merge --delete-branch
git switch main && git pull
```

---

## 🏁 Sprint 0 — Definition of Done

Run through this on a **fresh clone** to prove nothing depends on your machine:

```bash
cd "$TEMP" && git clone git@github.com:OWNER/saas-boilerplate.git sprint0-check && cd sprint0-check
# (cmd.exe: cd %TEMP% && git clone … )
corepack enable
pnpm install
pnpm check
pnpm dev     # → http://localhost:3000
```

- [ ] `pnpm install && pnpm dev` works on a clean clone (≤ 5 min)
- [ ] `pnpm check` exits 0 (types, lint, format, knip, env guard, agent files, unit + browser tests)
- [ ] Missing env var ⇒ boot fails with a readable message
- [ ] A lint error in a staged file blocks the commit
- [ ] A non-conventional commit message is rejected
- [ ] `pnpm test` and `pnpm test:browser` are green
- [ ] `pnpm analyze` produces a report
- [ ] `pnpm check:agents` passes; a fresh agent session finds `pnpm check` on its own
- [ ] PR CI shows 4 green jobs; branch protection requires them
- [ ] Dependabot enabled
- [ ] No ESLint / Prettier / Husky anywhere (`ls -a`, `package.json`)
- [ ] ADR stubs 001–013 committed; pinned versions recorded
- [ ] All 15 tickets ticked in `docs/roadmap/sprint-00-foundation.md`

```bash
git log --first-parent --oneline
# one merge line per ticket S0-T01 … S0-T15
```

### 📝 Update the project state
Edit `docs/roadmap/06-project-state.md`:
- **Last completed sprint:** Sprint 0 · **Current sprint:** Sprint 1
- Paste pinned versions (from `docs/adr/013-pinned-versions.md`)
- **Commands available:** the scripts table from the README
- **Environment variables:** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME` (Sprint 0)
- **Known issues / deviations:** anything you changed vs. this tutorial (e.g. `commitlint.config.mjs`, Oxfmt/Ultracite differences, Vitest browser API names)

Commit it through a PR (`docs/s0-state-update`), then tag:
```bash
git tag -a v0.0.1 -m "chore: sprint 0 foundation complete"
git push origin v0.0.1
```

---

## 🧯 Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| `pnpm: command not found` | `corepack enable && corepack prepare pnpm@latest --activate` |
| "Ignored build scripts" warning on install | pnpm blocks postinstall by default → `pnpm approve-builds` (review the list) |
| `pnpm install --frozen-lockfile` fails in CI | You changed `package.json` without committing the updated `pnpm-lock.yaml` |
| Build fails in CI but works locally | Missing `NEXT_PUBLIC_*` in the workflow `env:` block |
| Hooks don't run | `pnpm exec lefthook install`; check `ls .git/hooks` |
| Commit rejected unexpectedly | Read the commitlint message; use `pnpm commit` |
| `Cannot find module '@/…'` in Vitest | Alias missing in `vitest.config.ts` (`resolve.alias`) |
| Browser tests can't launch Chromium | `pnpm exec playwright install chromium` (CI: `--with-deps`) |
| Tailwind classes not applied in browser tests | `tests/browser-setup.ts` must import `@/styles/global.css` |
| `ultracite init` overwrote files | `git restore` what you didn't want; keep only lint/format config |
| Oxfmt/Oxlint option rejected | Check `--help` and the current docs; options differ between releases — record it in `06-project-state.md` |
| 🪟 `corepack enable` → `EPERM` | Run Cmder as Administrator (or `corepack enable --install-directory "%USERPROFILE%\bin"`) |
| 🪟 `'VAR' is not recognized as an internal or external command` | A script used `VAR=value cmd` → wrap with `cross-env` |
| 🪟 `bash: syntax error near unexpected token '('` | Unquoted route folder like `(marketing)` → quote the path: `"src/app/(marketing)"` |
| 🪟 `git add` warns "LF will be replaced by CRLF" | `git config --global core.autocrlf false`, then `git add --renormalize .` |
| 🪟 `Filename too long` | `git config --global core.longpaths true` and move the repo closer to `C:\` |
| 🪟 `EBUSY` / `EPERM` during install | Antivirus or OneDrive is locking files → move repo to `C:\dev`, exclude it from scanning, close editors/dev servers, retry |
| 🪟 `nvm use` says "access denied" | nvm-windows needs an Administrator terminal |
| 🪟 Port 3000 still busy after Ctrl+C | `netstat -ano \| findstr :3000` → `taskkill /PID <pid> /F` |
| 🪟 Arrow-key prompts garbled in Cmder | Use the non-interactive flags shown in Step 0, or run the command in Windows Terminal once |

---

## ➡️ Next

Sprint 0 complete → continue with **Sprint 1 — Data layer, App shell, i18n, Forms, Errors** (`docs/roadmap/sprint-01-data-shell-i18n.md`). Its tutorial section follows the same format: one branch per ticket, verify, merge.
