# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 2.3 — Azure DevOps Integration (infrastructure)

> Companion to `docs/roadmap/sprint-02.3-azure-devops.md`. Every `S2.3-Txx` section is one ticket. Follow them **in the order shown here**.

🪟 **Windows + Cmder:** use the **Git Bash tab**. Bash syntax and Node scripts only. Windows-specific notes are marked 🪟.

> ⚠️ **About this sprint.** Most of it happens in the Azure DevOps web UI, not in code. Azure DevOps changes its screens and a few YAML/CLI details between releases. Where a name or option may have drifted, the step says **🔍 Verify against docs**. Trust the official Microsoft docs over this tutorial and record deviations in `docs/roadmap/06-project-state.md`.

> 🛑 **Golden rules (from the backlog).** GitHub stays the single source of truth. Nobody commits to Azure Repos. `.github/workflows/*` is **not** edited. No secret is ever committed. Exactly one deployer per environment.

---

## 📋 What you will have at the end

- An **Azure DevOps** organization and a private **Scrum** project with iterations, areas and a seeded backlog
- **GitHub ↔ Azure Boards** linking (`AB#123` in a PR or commit shows up on the work item)
- An **Azure Pipelines CI** that runs the same gates as GitHub CI (`pnpm typecheck … build`, unit tests, browser tests, e2e)
- A **gated CD pipeline** for _one_ environment, with a migration gate and a `/api/health` smoke test (switched off until you turn it on)
- A **one-way Azure Repos backup** of GitHub, updated automatically
- A guide (`docs/guides/azure-devops.md`), an ADR and a proven end-to-end scenario

## 🔢 Ticket order used in this tutorial

| Order | Ticket | Why |
| --- | --- | --- |
| 1 | **S2.3-T01** Organization, project, Scrum | Everything else needs the project |
| 2 | **S2.3-T02** GitHub ↔ Boards | Cheap, and every later PR can be linked |
| 3 | **S2.3-T03** Azure Pipelines CI | CD builds on its conventions |
| 4 | **S2.3-T05** Azure Repos backup | Independent of CD; do it while the pipeline is warm |
| 5 | **S2.3-T04** Azure Pipelines CD | Needs CI (T03) |
| 6 | **S2.3-T06** Documentation and validation | Needs everything |

### Decisions applied (approved with the backlog)

| ID | Decision taken |
| --- | --- |
| D1 | Project `saas-boilerplate`, **private**, **Scrum**, iterations named after the repo sprints |
| D2 | Azure CD owns **staging only**. Production stays with the Sprint 8 workflow. Deploy is **off** until you enable it |
| D3 | Add a minimal `GET /api/health` in T04 |
| D4 | Azure CI runs on `main` and PRs, **not** a required check. GitHub CI stays the merge gate |
| D5 | Epic = SaaS Boilerplate, Feature = sprint, PBI = ticket (`S2.3-T01 …`), Task = checklist group |
| D6 | Backup: `main` + tags on every push, plus a weekly sync of all branches |
| D7 | GitHub App service connection; the backup uses the pipeline's `System.AccessToken`. **No PAT in GitHub** |
| D8 | `AGENTS.md` and the state file are updated in T06 |

---

## 🔀 Git workflow (PR-based, same as earlier sprints)

```bash
git switch main && git pull
git switch -c <type>/s2.3-tXX-<slug>
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

Allowed commit scopes: `deps, auth, db, i18n, ui, ci, docs, tests, config, org, admin, seo, obs, sec`. Pipelines use `ci`, guides use `docs`. Each ticket ends with a **🚢 Ship** line.

---

## ✅ Before you start

```bash
git switch main && git pull
pnpm install
pnpm check              # Sprint 2 (and the audit fixes) must be green
```

You also need:

- A Microsoft account that can create an Azure DevOps organization
- Admin rights on the GitHub repository (to install the two GitHub Apps)
- Optional for T04: a Vercel project you are willing to use for **staging**, and its token (never commit it)

Set **Current sprint: Sprint 2.3** in `docs/roadmap/06-project-state.md`.

---

## 🎫 S2.3-T01 — Organization, project and Scrum configuration

Branch: `docs/s2.3-t01-azure-devops-setup` · Commit: `docs(docs): add Azure DevOps setup guide stub`

### 1. Create the organization and the project (web UI)

Organizations cannot be created from the CLI, so start in the browser.

1. Go to <https://dev.azure.com> and sign in. Create an **organization** (for example `nexora-dev`).
2. **New project** → name `saas-boilerplate`, visibility **Private**, **Advanced** → version control **Git**, work item process **Scrum**.
3. Open **Organization settings → Billing** and **Parallel jobs**. Write down what you see (free Microsoft-hosted parallel jobs, private or public project). 🔍 Verify: the free grant for new organizations may require a request form. If hosted pipelines will not start later, this is why.

> 💡 Public projects have different limits from private ones. We keep the project private (D1), because the repository's work items and pipelines contain internal planning.

### 2. Install the Azure DevOps CLI (optional, speeds up seeding)

```bash
# Azure CLI first (see the Microsoft install page for your OS), then:
az extension add --name azure-devops
az login
az devops configure --defaults organization=https://dev.azure.com/<YOUR_ORG> project=saas-boilerplate
```

🪟 On Windows, install the Azure CLI with the MSI and run the commands from Git Bash. If you would rather not install it, every step below can be done in the UI.

### 3. Iterations (one per repo sprint)

```bash
az boards iteration project create --name "Sprint 2.3"
az boards iteration project create --name "Sprint 2.6"
for n in 3 4 5 6 7 8; do az boards iteration project create --name "Sprint $n"; done
```

🔍 Verify: the CLI creates iterations under the project root. Then open **Project settings → Project configuration → Iterations**, set dates (two weeks per sprint is a sensible default), and add the iterations to the team under **Team configuration → Iterations**.

### 4. Areas

```bash
for a in Auth Database CI-CD PWA UI Docs; do az boards area project create --name "$a"; done
```

### 5. Seed the backlog

Seed the Epic and Features first, then one PBI per ticket of Sprints 2.3 and 2.6. The PBI **title** carries the repo ticket ID so commits and Boards stay traceable (D5).

```bash
az boards work-item create --type "Epic" --title "SaaS Boilerplate"
az boards work-item create --type "Feature" --title "Sprint 2.3 — Azure DevOps Integration" --iteration "saas-boilerplate\\Sprint 2.3"
az boards work-item create --type "Feature" --title "Sprint 2.6 — PWA & Service Worker" --iteration "saas-boilerplate\\Sprint 2.6"

az boards work-item create --type "Product Backlog Item" \
  --title "S2.3-T01 Azure DevOps organization, project & Scrum configuration" \
  --iteration "saas-boilerplate\\Sprint 2.3" --area "saas-boilerplate\\CI-CD" \
  --fields "Microsoft.VSTS.Common.AcceptanceCriteria=Project exists, private, Scrum; iterations and areas exist; backlog seeded"
```

Repeat for the other PBIs (T02–T06 of Sprint 2.3, T01–T07 and T09 of Sprint 2.6; T08 stays in a later sprint). Copy each ticket's **acceptance criteria** from the sprint files. In the web UI, link each PBI to its Feature (**Add link → Parent**). 🔍 Verify: the work item type names (`Product Backlog Item`) and field names depend on the Scrum template; the CLI errors tell you the right ones.

> ✅ Tip: tag PBIs `P0`, `P1`, `P2` to match the sprint files, and create one query per sprint (**Boards → Queries**).

### 6. Permissions and variable groups

1. **Project settings → Permissions**: keep yourself as the only Project Administrator. Add viewers as **Stakeholder** (free) if needed.
2. **Pipelines → Library → + Variable group**:
   - `saas-boilerplate-ci` (non-secret). Variables: `NEXT_PUBLIC_APP_URL = http://localhost:3000`, `NEXT_PUBLIC_APP_NAME = SaaS Boilerplate`.
   - `saas-boilerplate-cd` (**empty for now**). Under **Security**, restrict who can use and edit it to yourself. Real secrets are added in T04 and marked secret.

> 🔐 `BETTER_AUTH_SECRET` for CI is a dummy and lives in the pipeline YAML (same as the GitHub CI). It is **not** a real secret. Production values never go in the CI group.

### 7. Guide stub

Create `docs/guides/azure-devops.md`:

```markdown
# Azure DevOps

> Status: Sprint 2.3 in progress. Completed in S2.3-T06.

## Organization and project

- Organization: `<YOUR_ORG>` · Project: `saas-boilerplate` (private, Scrum)
- Parallel jobs available: <fill in from Billing>
- Expected monthly cost: <fill in, expected: free tier>

## Work item mapping

Epic → "SaaS Boilerplate" · Feature → one per sprint · PBI → one per ticket (`S2.3-T01 …`) · Task → checklist group.

## Iterations and areas

Iterations: Sprint 2.3, 2.6, 3 … 8. Areas: Auth, Database, CI-CD, PWA, UI, Docs.
```

Add a link in `docs/README.md`. Run `pnpm check:agents` because it verifies paths.

### ✅ Verify

- [ ] Project is **private**, process **Scrum** (Project settings → Overview)
- [ ] Iterations `Sprint 2.3` … `Sprint 8` and the six area paths exist
- [ ] 1 Epic, Features per sprint, and the PBIs of Sprints 2.3/2.6 exist with acceptance criteria
- [ ] Only you can edit the `saas-boilerplate-cd` group
- [ ] Parallel-job availability and expected cost are written in the guide
- [ ] `git diff` contains no token, tenant ID or secret

### 🚢 Ship

```bash
pnpm check
git switch -c docs/s2.3-t01-azure-devops-setup
git add -A && git commit -m "docs(docs): add Azure DevOps setup guide stub"
```

---

## 🎫 S2.3-T02 — GitHub ↔ Azure Boards integration

Branch: `docs/s2.3-t02-boards-linking` · Commit: `docs(docs): document AB# work item linking`

### 1. Connect GitHub to Azure Boards

1. In Azure DevOps: **Project settings → Boards → GitHub connections → Connect your GitHub account** (choose **GitHub App** / OAuth as offered).
2. Install the **Azure Boards** GitHub App on `hamdiRH/saas-boilerplate` only (least privilege: select the single repository, not "all repositories").
3. Back in Azure DevOps, select the repository and **Save**.

🔍 Verify: the exact button names change. The docs page is "Connect Azure Boards to GitHub".

### 2. The linking convention

- In the **PR description** (and optionally the PR title): `AB#123`
- In a **commit body or footer** (never the header, so commitlint is unaffected): `AB#123`
- Word + `AB#123` such as `Fixes AB#123` in a PR description moves the item according to the Boards GitHub connection rules when the PR merges. 🔍 Verify the exact keywords and resulting states in the Microsoft docs and configure them to match your Scrum states.

Example commit:

```text
ci(ci): add Azure Pipelines CI

Runs the same gates as GitHub CI on Azure.

AB#142
```

### 3. Update the docs (no workflow changes)

Add to `CONTRIBUTING.md` a short **Linking work items** section with the rules above. In `.github/pull_request_template.md`, add one line under the checklist:

```markdown
- [ ] Linked work item (optional): `AB#<id>`
```

> Linking is **optional**. An unlinked PR still merges normally (acceptance criterion).

### 4. Prove it

```bash
git switch -c docs/s2.3-t02-boards-linking
# edit CONTRIBUTING.md and the PR template
git add -A
git commit -m "docs(docs): document AB# work item linking" -m "AB#<id of S2.3-T02>"
git push -u origin docs/s2.3-t02-boards-linking
gh pr create --fill --base main --body "Links the work item. Fixes AB#<id of S2.3-T02>"
```

Open the PBI in Azure Boards: the PR appears under **Development** within a few minutes. The commit hook (Lefthook + commitlint) must accept the footer **without** `--no-verify`.

### ✅ Verify

- [ ] PR with `AB#id` shows under **Development** on that work item
- [ ] Commit with `AB#id` in the footer is linked and passes the hooks
- [ ] Merging the PR moves the item as configured
- [ ] An unlinked PR still merges
- [ ] `git diff main --stat` shows **no** change under `.github/workflows/`

### 🚢 Ship

```bash
pnpm check
gh pr checks --watch && gh pr merge --merge --delete-branch
```

---

## 🎫 S2.3-T03 — Azure Pipelines CI

Branch: `ci/s2.3-t03-azure-pipelines-ci` · Commit: `ci(ci): add Azure Pipelines CI`

### 1. Install the Azure Pipelines GitHub App

In Azure DevOps: **Pipelines → Create Pipeline → GitHub (YAML)**. Authorize the **Azure Pipelines** GitHub App for `hamdiRH/saas-boilerplate` only (single repository). This creates the service connection (D7). Stop at "Configure" until the YAML below is on `main`, or point the pipeline at the branch that contains it.

### 2. Shared steps template

Create `azure-pipelines/templates/setup-node-pnpm.yml`. One template keeps CI and CD identical.

```yaml
# azure-pipelines/templates/setup-node-pnpm.yml
# Node comes from .nvmrc; pnpm from the "packageManager" field via Corepack.
steps:
  - task: NodeTool@0
    displayName: Use Node from .nvmrc
    inputs:
      versionSource: fromFile
      versionFilePath: .nvmrc

  - script: |
      corepack enable
      pnpm --version
      node --version
    displayName: Enable Corepack (pnpm from packageManager)

  - script: pnpm config set store-dir $(Pipeline.Workspace)/.pnpm-store
    displayName: Point the pnpm store at a cacheable folder

  - task: Cache@2
    displayName: Cache pnpm store
    inputs:
      key: 'pnpm | "$(Agent.OS)" | pnpm-lock.yaml'
      restoreKeys: |
        pnpm | "$(Agent.OS)"
      path: $(Pipeline.Workspace)/.pnpm-store

  - script: pnpm install --frozen-lockfile
    displayName: Install dependencies
```

🪟 These steps run on Linux agents. Nothing here is Windows-specific, and the repository rule "cross-platform scripts only" still applies to anything these commands call.

### 3. The CI pipeline

Create `azure-pipelines/ci.yml`:

```yaml
# azure-pipelines/ci.yml
# Secondary CI. GitHub Actions stays the merge gate (decision D4).
trigger:
  branches:
    include: [main]

pr:
  branches:
    include: [main]
  autoCancel: true

pool:
  vmImage: ubuntu-latest

variables:
  # CI only: lets a production build use the embedded DB and the console email transport.
  # NEVER set this in a CD file or on a real deployment.
  ALLOW_LOCAL_SERVICES: 'true'
  NEXT_PUBLIC_APP_URL: http://localhost:3000
  NEXT_PUBLIC_APP_NAME: SaaS Boilerplate
  # Dummy value, same as .github/workflows/ci.yml. Not a secret.
  BETTER_AUTH_SECRET: ci-only-secret-ci-only-secret-0123456789

stages:
  - stage: Quality
    displayName: Quality
    jobs:
      - job: quality
        displayName: Types, lint, format, knip, checks, unit tests
        timeoutInMinutes: 15
        steps:
          - template: templates/setup-node-pnpm.yml
          - script: pnpm typecheck
            displayName: typecheck
          - script: pnpm lint
            displayName: lint
          - script: pnpm format:check
            displayName: format:check
          - script: pnpm knip
            displayName: knip
          - script: pnpm check:env
            displayName: check:env
          - script: pnpm check:agents
            displayName: check:agents
          - script: pnpm db:check
            displayName: db:check
          - script: pnpm test
            displayName: unit tests

      - job: build
        displayName: Build
        timeoutInMinutes: 20
        steps:
          - template: templates/setup-node-pnpm.yml
          - task: Cache@2
            displayName: Cache Next.js build cache
            inputs:
              key: 'nextjs | "$(Agent.OS)" | pnpm-lock.yaml | src/**'
              restoreKeys: |
                nextjs | "$(Agent.OS)" | pnpm-lock.yaml
              path: .next/cache
          - script: pnpm build
            displayName: build

  - stage: Browser
    displayName: Browser and E2E
    dependsOn: Quality
    jobs:
      - job: browser
        displayName: Component tests and E2E
        timeoutInMinutes: 30
        steps:
          - template: templates/setup-node-pnpm.yml
          - task: Cache@2
            displayName: Cache Playwright browsers
            inputs:
              key: 'playwright | "$(Agent.OS)" | pnpm-lock.yaml'
              path: $(HOME)/.cache/ms-playwright
          - script: pnpm exec playwright install --with-deps chromium
            displayName: Install Chromium
          - script: pnpm test:browser
            displayName: component tests (browser mode)
          - script: pnpm e2e
            displayName: e2e
          - task: PublishPipelineArtifact@1
            displayName: Publish Playwright report
            condition: failed()
            inputs:
              targetPath: playwright-report
              artifact: playwright-report
              publishLocation: pipeline
```

Notes on the choices:

- **Same commands as GitHub CI** (`pnpm …`), never different tools, so the two systems cannot drift (risk R2).
- `autoCancel: true` cancels superseded PR runs.
- Secrets are **not** exposed to fork PRs by default for GitHub-hosted repos. Do not add secret variables to this file (R5). 🔍 Verify the fork-PR setting under the pipeline's **Triggers → Pull request validation**.
- Dependabot PRs trigger this pipeline too (D4). If they add noise, restrict `pr:` with `paths:` or exclude their branches.
- Test result publishing (JUnit) is skipped on purpose: adding a reporter might mean a new dependency. If Vitest's built-in `junit` reporter works for you, add `--reporter=junit --outputFile=...` and a `PublishTestResults@2` step. 🔍 Verify first.

### 4. Create the pipeline in the UI

**Pipelines → New pipeline → GitHub → select the repo → Existing Azure Pipelines YAML file → `/azure-pipelines/ci.yml`**. Name it `saas-boilerplate-ci`. In **Triggers**, leave PR validation on, and do **not** make it a required status check in GitHub (D4).

### 5. Prove the gates work

```bash
# 1) A clean branch: pipeline must go green
git switch -c ci/s2.3-t03-azure-pipelines-ci
git add -A && git commit -m "ci(ci): add Azure Pipelines CI" -m "AB#<id of S2.3-T03>"
git push -u origin ci/s2.3-t03-azure-pipelines-ci && gh pr create --fill --base main

# 2) A throwaway branch with a deliberate type error: pipeline must go RED
git switch -c ci/s2.3-t03-probe
echo 'export const probe: number = "not a number";' > src/probe.ts
git add -A && git commit -m "test(tests): deliberate type error" && git push -u origin ci/s2.3-t03-probe
```

Do the same with a lint error and a failing unit test, then **delete the probe branch and close its PR**. Never merge probes.

### ✅ Verify

- [ ] A push to `main` and a PR each start exactly **one** run
- [ ] The run executes every command above and is green on the current `main`
- [ ] A type error, a lint error and a failing test each make a run red
- [ ] The log prints Node and pnpm versions equal to `.nvmrc` and `packageManager`
- [ ] A second run restores the pnpm cache (log shows a cache hit) and is faster
- [ ] `ALLOW_LOCAL_SERVICES` appears **only** in `azure-pipelines/ci.yml`
- [ ] `.github/workflows/*` untouched, no new dependency
- [ ] Record the CI durations in `docs/guides/azure-devops.md`

### 🚢 Ship

```bash
pnpm check
```

---

## 🎫 S2.3-T05 — Azure Repos one-way backup

Branch: `ci/s2.3-t05-azure-repos-backup` · Commit: `ci(ci): add Azure Repos one-way backup pipeline`

### 1. Create the backup repository

**Repos → New repository** → name `saas-boilerplate-backup`, **no README** (it must be empty).

### 2. Make it read-only for humans

1. **Project settings → Repositories → `saas-boilerplate-backup` → Security.** Remove **Contribute**, **Force push** and **Bypass policies** from every user and group, including yours.
2. Give **only** the build identity `saas-boilerplate Build Service (<YOUR_ORG>)` the **Contribute** permission on this repository. This is what lets the pipeline's own token push (D7). No PAT, nothing stored in GitHub.
3. Add a branch policy on `main` of the backup repo if you want an extra guard.

🔍 Verify: the identity name depends on the "project-scoped build service" settings. Search for `Build Service` in the security dialog.

### 3. The backup pipeline

Create `azure-pipelines/backup.yml`:

```yaml
# azure-pipelines/backup.yml
# One-way backup: GitHub (source of truth) -> Azure Repos. Never the other way round.
trigger:
  branches:
    include: [main]
  tags:
    include: ['v*']

pr: none

schedules:
  - cron: '0 3 * * 1' # weekly, Monday 03:00 UTC: all branches (decision D6)
    displayName: Weekly full sync
    branches:
      include: [main]
    always: true

pool:
  vmImage: ubuntu-latest

resources:
  repositories:
    - repository: backup
      type: git
      name: saas-boilerplate/saas-boilerplate-backup

variables:
  BACKUP_URL: https://dev.azure.com/<YOUR_ORG>/saas-boilerplate/_git/saas-boilerplate-backup

steps:
  - checkout: self
    fetchDepth: 0
    persistCredentials: false

  - bash: |
      set -euo pipefail
      git config user.name "azure-backup"
      git config user.email "azure-backup@users.noreply.local"

      # Make sure every GitHub branch and tag is present locally.
      git fetch origin '+refs/heads/*:refs/remotes/origin/*' --tags --prune

      AUTH="AUTHORIZATION: bearer $SYSTEM_ACCESSTOKEN"
      git remote add backup "$BACKUP_URL"

      if [ "$BUILD_REASON" = "Schedule" ]; then
        echo "Full sync: all branches and tags"
        git -c http.extraheader="$AUTH" push backup \
          'refs/remotes/origin/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
      else
        echo "Incremental: main and tags"
        git -c http.extraheader="$AUTH" push backup \
          'refs/remotes/origin/main:refs/heads/main' 'refs/tags/*:refs/tags/*'
      fi
    displayName: Push to Azure Repos (fast-forward only)
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)

  - bash: |
      set -euo pipefail
      SRC=$(git rev-parse origin/main)
      DST=$(git -c http.extraheader="AUTHORIZATION: bearer $SYSTEM_ACCESSTOKEN" ls-remote backup refs/heads/main | cut -f1)
      echo "GitHub main: $SRC"
      echo "Backup main: $DST"
      test "$SRC" = "$DST"
    displayName: Verify both remotes agree on main
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)
```

Why it is safe (risk R4):

- **No `--force`, no `--mirror`, no `--prune`.** A diverged backup makes `git push` fail loudly instead of rewriting history.
- It runs from the **GitHub** repo resource, so a push to the backup repo cannot trigger it (no loop).
- The token is the pipeline's own `System.AccessToken`, scoped by the permissions you set in step 2.

🔍 Verify: for a GitHub-hosted repo, YAML `schedules` and `tags` triggers are supported, but confirm in your run that the schedule fires. Also check that the **Build Service** may access the repository resource without extra "Allow" prompts on the first run (approve it once if Azure asks).

### 4. Create the pipeline, then test

Create a pipeline named `saas-boilerplate-backup` from `/azure-pipelines/backup.yml`. Run it manually once, then:

```bash
# 1) A new commit on main must show up in the backup
git switch main && git pull
git commit --allow-empty -m "chore(config): backup probe" && git push
# 2) A tag must sync
git tag v0.0.0-backup-probe && git push origin v0.0.0-backup-probe
# 3) A human push to the backup must be rejected
git clone https://dev.azure.com/<YOUR_ORG>/saas-boilerplate/_git/saas-boilerplate-backup /tmp/backup-check
cd /tmp/backup-check && git commit --allow-empty -m "should fail" && git push   # expect: rejected
```

Delete the probe tag on both remotes afterwards (`git push origin :refs/tags/v0.0.0-backup-probe`; delete it in Azure Repos from the UI).

### 5. Restore rehearsal (do it once)

```bash
git clone https://dev.azure.com/<YOUR_ORG>/saas-boilerplate/_git/saas-boilerplate-backup restore-check
cd restore-check && git log --oneline | head -3 && git rev-parse main
# compare with: git ls-remote https://github.com/hamdiRH/saas-boilerplate refs/heads/main
```

To restore GitHub from the backup: create an empty GitHub repository, then `git push --mirror <new-github-url>` **from the clone**, and re-install the GitHub Apps and secrets. Write these steps into the guide.

### ✅ Verify

- [ ] A push to GitHub `main` appears in the backup within 10 minutes with the **same SHA**
- [ ] Tags are synced; the weekly run syncs all branches
- [ ] A human push to the backup is rejected
- [ ] A forced divergence fails the job and leaves backup history untouched (test once on a scratch branch)
- [ ] No PAT is stored anywhere in GitHub
- [ ] The restore rehearsal worked

### 🚢 Ship

```bash
pnpm check
git add -A && git commit -m "ci(ci): add Azure Repos one-way backup pipeline" -m "AB#<id of S2.3-T05>"
```

---

## 🎫 S2.3-T04 — Azure Pipelines CD (staging, gated, off by default)

Branch: `ci/s2.3-t04-azure-pipelines-cd` · Commits: `feat(config): add health endpoint` then `ci(ci): add Azure Pipelines CD`

> ⚠️ **Read this before writing YAML.** The repository has **no deploy workflow, no `vercel.json` and no `/api/health` yet** (Sprint 8 plans them). So this ticket builds a pipeline that is **safe by default**: it builds once, publishes the artifact, and the deploy stage only runs when you set `DEPLOY_ENABLED=true` in the restricted variable group. That is decision D2 option (c) with a ready path to option (a).

### 1. The ownership matrix (write it first, get it approved)

Put this table in `docs/guides/azure-devops.md`. **Exactly one deployer per environment.**

| Environment | Owner | Trigger |
| --- | --- | --- |
| Preview | Vercel Git integration | Every PR / branch push |
| Staging | **Azure CD** (this ticket) | Successful CI on `main`, then approval |
| Production | Sprint 8 GitHub deploy workflow (not built yet) | Release tag + approval |

> If you later want Azure to own production, or Vercel to stop deploying `main`, change the matrix **and** add the Vercel `git.deploymentEnabled` setting for `main` in the same PR. Never leave two systems deploying the same environment (risk R1).

### 2. A health endpoint (decision D3)

`src/app/api/health/route.ts`:

```ts
import { connection } from 'next/server';

/**
 * Liveness probe used by deployment smoke tests.
 * Public on purpose: no auth, no database call, no secrets, no internals.
 */
export async function GET() {
  // 🔍 Verify: with cacheComponents a route handler that touches no request data can be
  // prerendered at build time. connection() makes this one run per request.
  await connection();
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
```

`src/app/api/health/route.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

describe('GET /api/health', () => {
  it('returns ok without leaking details', async () => {
    const { GET } = await import('./route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
```

Make sure the proxy does not redirect it: the matcher already excludes `api` (`src/proxy.ts`). Run the test:

```bash
pnpm test src/app/api/health
```

### 3. Secrets (only in the restricted group)

In **Pipelines → Library → `saas-boilerplate-cd`**, add **secret** variables (lock icon): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `STAGING_URL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`, and a plain `DEPLOY_ENABLED = false`.

> 🔐 `ALLOW_LOCAL_SERVICES` must **not** exist in this group or in the CD file. Production-mode env validation (`DATABASE_URL`, a real email transport) must pass for the build, and that is exactly the point.
>
> 🔍 Staging should use its **own** Neon branch and its own `BETTER_AUTH_SECRET`, never production values.

### 4. Environments and approvals

**Pipelines → Environments → New** → `staging`. Open it → **Approvals and checks** → add **Approvals** (yourself) and an **Exclusive lock** (so two runs never deploy at once).

### 5. The CD pipeline

`azure-pipelines/cd.yml`:

```yaml
# azure-pipelines/cd.yml
# Builds once, publishes the build, deploys STAGING only when DEPLOY_ENABLED=true.
# No ALLOW_LOCAL_SERVICES here, by design.
trigger: none # started by the "ci" pipeline completing on main (see resources below)

resources:
  pipelines:
    - pipeline: ci
      source: saas-boilerplate-ci
      trigger:
        branches:
          include: [main]

pool:
  vmImage: ubuntu-latest

variables:
  - group: saas-boilerplate-cd
  # 🔍 Pin the version you tested. Do not use "latest" in a gated deploy.
  - name: VERCEL_CLI_VERSION
    value: '<PINNED_VERSION>'

stages:
  - stage: Build
    jobs:
      - job: build
        displayName: Build for staging
        steps:
          - template: templates/setup-node-pnpm.yml
          - script: pnpm build
            displayName: Build (production mode, real env validation)
            env:
              NEXT_PUBLIC_APP_NAME: Nexora
              NEXT_PUBLIC_APP_URL: $(NEXT_PUBLIC_APP_URL)
              DATABASE_URL: $(DATABASE_URL)
              BETTER_AUTH_SECRET: $(BETTER_AUTH_SECRET)
              EMAIL_TRANSPORT: resend
              RESEND_API_KEY: $(RESEND_API_KEY)
              EMAIL_FROM: $(EMAIL_FROM)
          - task: PublishPipelineArtifact@1
            displayName: Publish build info
            inputs:
              targetPath: .next/BUILD_ID
              artifact: build-id
              publishLocation: pipeline

  - stage: Staging
    displayName: Deploy staging
    dependsOn: Build
    condition: and(succeeded(), eq(variables['DEPLOY_ENABLED'], 'true'))
    jobs:
      - deployment: staging
        displayName: Staging (approval + exclusive lock)
        environment: staging
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - template: templates/setup-node-pnpm.yml

                # 1) Migration gate: abort BEFORE traffic switches if it fails.
                - script: pnpm db:migrate
                  displayName: Apply migrations (direct connection)
                  env:
                    DATABASE_URL_UNPOOLED: $(DATABASE_URL_UNPOOLED)
                    DATABASE_URL: $(DATABASE_URL)

                # 2) Deploy. 🔍 Verify these flags against the current Vercel CLI docs.
                - script: |
                    set -euo pipefail
                    npx --yes vercel@$(VERCEL_CLI_VERSION) pull --yes --environment=preview --token "$VERCEL_TOKEN"
                    npx --yes vercel@$(VERCEL_CLI_VERSION) build --token "$VERCEL_TOKEN"
                    URL=$(npx --yes vercel@$(VERCEL_CLI_VERSION) deploy --prebuilt --token "$VERCEL_TOKEN")
                    echo "##vso[task.setvariable variable=DEPLOY_URL]$URL"
                  displayName: Deploy (not production)
                  env:
                    VERCEL_TOKEN: $(VERCEL_TOKEN)
                    VERCEL_ORG_ID: $(VERCEL_ORG_ID)
                    VERCEL_PROJECT_ID: $(VERCEL_PROJECT_ID)

                # 3) Smoke test: fail the run if the new deployment is not healthy.
                - script: |
                    set -euo pipefail
                    for i in 1 2 3 4 5 6; do
                      code=$(curl -s -o /dev/null -w '%{http_code}' "$DEPLOY_URL/api/health" || true)
                      echo "attempt $i -> $code"
                      [ "$code" = "200" ] && exit 0
                      sleep 10
                    done
                    echo "Health check failed"; exit 1
                  displayName: Smoke test /api/health
```

What each part guarantees:

- **One deployment per merge:** CD is triggered only by the CI pipeline finishing on `main`; the exclusive lock blocks parallel runs; the stage is skipped unless `DEPLOY_ENABLED=true`.
- **Fail early:** migrations run before the deploy step; a failed migration or health check fails the run and nothing is promoted.
- **No secrets in logs:** variables marked secret are masked. Never `echo` them.
- **Rollback:** redeploy the previous good build (re-run the previous successful pipeline run, or promote the previous Vercel deployment). Migrations follow expand/contract, so the previous version still works against the new schema.

🔍 Verify: `DEPLOY_URL` is the unique deployment URL, which can sit behind Vercel's deployment protection. If the smoke test gets 401/403, use a protection-bypass token or a custom staging domain.

### 6. Prove it (in this order)

1. Merge with `DEPLOY_ENABLED=false`: the Build stage runs, the Staging stage is **skipped**.
2. Set `DEPLOY_ENABLED=true`, run again: approval is requested, the migration gate and deploy run, the smoke test passes.
3. Break the health check on purpose (return 500 on a scratch branch): the run fails and nothing is promoted.
4. Follow the rollback runbook and time it (target: under 10 minutes).

### ✅ Verify

- [ ] The ownership matrix is in the guide; each environment has one deployer
- [ ] One merge to `main` creates exactly **one** staging deployment
- [ ] A failed migration or failed health check stops the run
- [ ] The approval gate blocks the deploy stage until approved
- [ ] No secret in logs or in the repository; `ALLOW_LOCAL_SERVICES` absent from `cd.yml`
- [ ] `/api/health` is 200, unauthenticated, no DB call, no sensitive data
- [ ] Rollback runbook written and rehearsed

### 🚢 Ship

```bash
pnpm check
git add src/app/api/health && git commit -m "feat(config): add health endpoint" -m "AB#<id of S2.3-T04>"
git add azure-pipelines docs && git commit -m "ci(ci): add Azure Pipelines CD" -m "AB#<id of S2.3-T04>"
```

If this changes the Sprint 8 plan, add `docs/adr/014-…` in the same PR.

---

## 🎫 S2.3-T06 — Documentation and end-to-end validation

Branch: `docs/s2.3-t06-azure-devops-docs` · Commit: `docs(docs): document Azure DevOps delivery and validate end to end`

### 1. Finish the guide

`docs/guides/azure-devops.md` must contain: an architecture diagram, the setup steps, variable groups (names only), permissions, the **ownership matrix**, runbooks (rollback, restore, rotate credentials), troubleshooting, and cost notes. Suggested diagram:

```text
GitHub (source of truth)
  ├─ PR / push ─► GitHub Actions CI  (merge gate)
  ├─ PR / push ─► Azure Pipelines CI (secondary signal)
  ├─ AB#123     ─► Azure Boards       (planning)
  ├─ main/tags  ─► Azure Pipelines backup ─► Azure Repos (read-only copy)
  └─ main       ─► Azure Pipelines CD ─► Staging (approval, migration gate, smoke test)
```

Troubleshooting to include: "No hosted parallelism has been purchased or granted" (request the free grant), a `pnpm` version mismatch (Corepack), and a backup push rejected as non-fast-forward (investigate; never force).

### 2. Update the repository docs (decision D8)

- `README.md` (CI/CD section), `CONTRIBUTING.md`, `docs/README.md`
- `AGENTS.md`: add one structure line, for example `azure-pipelines/   Azure Pipelines YAML (CI, CD, backup)`. `pnpm check:agents` verifies that every path in the file exists.
- `docs/roadmap/06-project-state.md`: pipelines, variable groups (**names only**), environments, new files, decisions taken
- `docs/adr/014-azure-devops-secondary-delivery.md` (use `docs/adr/0000-template.md`): GitHub is the source of truth; Azure is planning, secondary CI, one-way backup and staging CD only

### 3. The end-to-end scenario (record evidence in the guide)

1. Create a PBI in Boards.
2. Branch `ci/s2.3-…`, commit with `AB#<id>` in the footer, open a PR.
3. **GitHub CI** and **Azure CI** both go green.
4. Merge. The PBI moves state.
5. Azure CD runs once (approve it), the smoke test passes. (With `DEPLOY_ENABLED=false` the stage is skipped, and that also counts as a pass for this step.)
6. The backup shows the same SHA as GitHub `main`.

Then compare GitHub CI and Azure CI durations and any result differences, and write them down.

### 4. Close the sprint

- Tick the checkboxes in `docs/roadmap/sprint-02.3-azure-devops.md`
- Set the Sprint 2.3 row in `docs/roadmap/README.md` to **Done**
- Close the sprint in Boards

### ✅ Verify

- [ ] The scenario completes from a clean checkout with no manual fix-ups, with evidence stored
- [ ] Exactly one deployment (or one skipped stage) for that merge; none from another path
- [ ] `pnpm check:agents` and `pnpm check` are green
- [ ] Every link in the guide resolves; every path exists with exact casing
- [ ] A person who has not seen the project can follow the guide (dry read)

### 🚢 Ship

```bash
pnpm check
git add -A && git commit -m "docs(docs): document Azure DevOps delivery and validate end to end" -m "AB#<id of S2.3-T06>"
```

---

## 🏁 Wrap-up

```bash
git switch main && git pull
pnpm check
git tag v0.1.1-azure-devops && git push --tags     # optional: tags also sync to the backup
```

Update `docs/roadmap/06-project-state.md`:

- **Last completed sprint:** Sprint 2.3 · **Current sprint:** Sprint 2.6
- **Added:** Azure Boards linking, `saas-boilerplate-ci`, `saas-boilerplate-cd`, `saas-boilerplate-backup` pipelines, `staging` environment, `/api/health`
- **Deviations:** anything you changed from this tutorial (record the real Azure UI names you saw)
- **Measured:** CI duration on Azure vs GitHub, rollback time, backup lag

Then continue with **Sprint 2.6** (`docs/tutorial/sprint-02.6-tutorial.md`).
