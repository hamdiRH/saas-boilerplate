# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 2.3 — Azure DevOps Integration (infrastructure)

> Companion to `docs/roadmap/sprint-02.3-azure-devops.md`. Every `S2.3-Txx` section is one ticket. Follow them **in the order shown here**.

🪟 **Windows + Cmder:** use the **Git Bash tab** for every command in this tutorial (the `wid` helper, `$(...)` and heredocs only work in bash). Windows-specific notes are marked 🪟.

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
| D1 | Project **`Next Boilerplate`** (organization `uzumaki26`), **private**, **Scrum**, iterations named after the repo sprints |
| D2 | Azure CD owns **staging only**. Production stays with the Sprint 8 workflow. Deploy is **off** until you enable it |
| D3 | Add a minimal `GET /api/health` in T04 |
| D4 | Azure CI runs on `main` and PRs, **not** a required check. GitHub CI stays the merge gate |
| D5 | Epic = SaaS Boilerplate, Feature = sprint, PBI = ticket (`S2.3-T01 …`), Task = checklist group |
| D6 | Backup: `main` + tags on every push, plus a weekly sync of all branches |
| D7 | GitHub App service connection; the backup uses the pipeline's `System.AccessToken`. **No PAT in GitHub** |
| D8 | `AGENTS.md` and the state file are updated in T06 |

### Real values used in this run (deviations from the original text)

- Organization: `uzumaki26` · Project: `Next Boilerplate` (with a space; in URLs it is `Next%20Boilerplate`)
- The Microsoft account (`@live.fr`) has **no Azure subscription**, so `az login` is not needed. We use `az devops login` with a **PAT** instead (T01 step 2).
- Every `az boards` command gets `--detect false` (the repo remote is GitHub, not Azure Repos, so auto-detect only prints a warning).
- Iteration and area paths in work items are `Next Boilerplate\Sprint 2.3` and `Next Boilerplate\CI-CD`: **single backslash**, and **no** `Iteration\` or `Area\` segment.
- Areas must exist **before** a work item uses them (TF401347 otherwise).

---

## 🔀 Git workflow (PR-based, same as earlier sprints)

Every ticket below starts with a **🌿 Start** block and ends with a **🚢 Ship** block, both ready to paste. The generic shape is:

```bash
git switch main && git pull
git switch -c <type>/s2.3-tXX-<slug>
# … work, then verify …
pnpm check
git add -A
git commit -m "<type>(<scope>): <message>" -m "AB#<id>"
git push -u origin <branch>
gh pr create --fill --base main
gh pr checks --watch
gh pr merge --merge --delete-branch
git switch main && git pull
```

Allowed commit scopes: `deps, auth, db, i18n, ui, ci, docs, tests, config, org, admin, seo, obs, sec`. Pipelines use `ci`, guides use `docs`.

### The `wid` helper (finds a work item id by title)

Paste this once **per Git Bash tab**. It lets every commit and PR below carry the right `AB#` number automatically.

```bash
wid() { az boards query --wiql "SELECT [System.Id] FROM WorkItems WHERE [System.Title] CONTAINS '$1'" --query "[0].id" -o tsv --detect false | tr -d '\r'; }
```

Test it after the backlog is seeded: `wid S2.3-T01` prints a number.

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

### 🌿 Start

```bash
git switch main && git pull
git switch -c docs/s2.3-t01-azure-devops-setup
```

(Already on this branch? Skip it, `git switch -c` would say the branch exists.)

### 1. Create the organization and the project (web UI)

Organizations cannot be created from the CLI, so start in the browser.

1. Go to <https://dev.azure.com> and sign in. Create the **organization** `uzumaki26`.
2. **New project** → name `Next Boilerplate`, visibility **Private**, **Advanced** → version control **Git**, work item process **Scrum**.
3. Open **Organization settings → Billing** and **Parallel jobs**. Write down what you see (free Microsoft-hosted parallel jobs, private or public project). 🔍 Verify: the free grant for new organizations may require a request form. If hosted pipelines will not start later, this is why.

> 💡 Public projects have different limits from private ones. We keep the project private (D1), because the repository's work items and pipelines contain internal planning.

### 2. Install the Azure DevOps CLI and sign in with a PAT

A personal Microsoft account without an Azure subscription cannot use `az login` (it prints `[]` and saves nothing). Azure DevOps does not need it.

**Create the PAT (web UI):** <https://dev.azure.com/uzumaki26/_usersSettings/tokens> → **+ New Token** → name `cli-nextjs-boilerplate`, organization `uzumaki26`, expiration 30–90 days, **Custom defined** → **Show all scopes** → tick **Work Items: Read, write & manage**, **Code: Read & write**, **Build: Read & execute**, **Project and Team: Read** → **Create** → **copy it now** (shown once). Never commit it.

```bash
az extension add --name azure-devops
az devops login --organization https://dev.azure.com/uzumaki26      # paste the PAT when asked
az devops configure --defaults organization=https://dev.azure.com/uzumaki26 project="Next Boilerplate"
az devops configure --list                                           # check the defaults
```

🪟 Install the Azure CLI with the MSI and run the commands from Git Bash. If you would rather not install it, every step below can be done in the UI.

### 3. Iterations (one per repo sprint)

`Sprint 2.3` may already exist (the first command errors with "already exists": ignore it).

```bash
az boards iteration project create --name "Sprint 2.3" --detect false
az boards iteration project create --name "Sprint 2.6" --detect false
az boards iteration project create --name "Sprint 3" --detect false
az boards iteration project create --name "Sprint 4" --detect false
az boards iteration project create --name "Sprint 5" --detect false
az boards iteration project create --name "Sprint 6" --detect false
az boards iteration project create --name "Sprint 7" --detect false
az boards iteration project create --name "Sprint 8" --detect false
```

Add them to the team so they show in the team backlog:

```bash
az devops team list --detect false -o table
for id in $(az boards iteration project list --path "\\Next Boilerplate\\Iteration" --depth 1 --query "children[].identifier" -o tsv --detect false | tr -d '\r'); do az boards iteration team add --id "$id" --team "Next Boilerplate Team" --detect false -o none; done
```

🔍 Verify: use the team name printed by `az devops team list` if it is not `Next Boilerplate Team`. Then open **Project settings → Project configuration → Iterations** and set dates (two weeks per sprint is a sensible default). If the loop fails, do it in the UI under **Team configuration → Iterations**.

### 4. Areas (must exist before the backlog is seeded)

```bash
az boards area project create --name "Auth" --detect false
az boards area project create --name "Database" --detect false
az boards area project create --name "CI-CD" --detect false
az boards area project create --name "PWA" --detect false
az boards area project create --name "UI" --detect false
az boards area project create --name "Docs" --detect false
az boards area project list --depth 2 --detect false -o table
```

### 5. Seed the backlog

The PBI **title** carries the repo ticket ID so commits and Boards stay traceable (D5). Everything below is copy-paste: it creates the Epic and the Features, one PBI per ticket, and links each PBI to its Feature and each Feature to the Epic.

#### 5.1 The `pbi` helper

Paste once per Git Bash tab. Arguments: title, iteration, area, parent Feature id, acceptance criteria.

```bash
pbi() { id=$(az boards work-item create --type "Product Backlog Item" --title "$1" --iteration "Next Boilerplate\\$2" --area "Next Boilerplate\\$3" --fields "Microsoft.VSTS.Common.AcceptanceCriteria=$5" --query id -o tsv --detect false | tr -d '\r'); az boards work-item relation add --id "$id" --relation-type parent --target-id "$4" --detect false -o none; echo "PBI $id  $1"; }
```

#### 5.2 Epic and Features

```bash
EPIC=$(az boards work-item create --type "Epic" --title "SaaS Boilerplate" --query id -o tsv --detect false | tr -d '\r')
F23=$(az boards work-item create --type "Feature" --title "Sprint 2.3 — Azure DevOps Integration" --iteration "Next Boilerplate\\Sprint 2.3" --query id -o tsv --detect false | tr -d '\r')
F26=$(az boards work-item create --type "Feature" --title "Sprint 2.6 — PWA & Service Worker" --iteration "Next Boilerplate\\Sprint 2.6" --query id -o tsv --detect false | tr -d '\r')
az boards work-item relation add --id "$F23" --relation-type parent --target-id "$EPIC" --detect false -o none
az boards work-item relation add --id "$F26" --relation-type parent --target-id "$EPIC" --detect false -o none
echo "EPIC=$EPIC F23=$F23 F26=$F26"
```

> ♻️ Already created the Epic or a Feature earlier? Do **not** run the line that creates it again. Set the variable instead, for example `EPIC=5` or `F23=$(wid "Sprint 2.3 — Azure DevOps Integration")`, and run the rest.

#### 5.3 PBIs of Sprint 2.3 (T01–T06)

```bash
pbi "S2.3-T01 Azure DevOps organization, project & Scrum configuration" "Sprint 2.3" "CI-CD" "$F23" "Project exists, private, Scrum; iterations and areas exist; backlog seeded; only you can edit the cd variable group; parallel-job availability and expected cost written in the guide; no token, tenant ID or secret in git diff"
pbi "S2.3-T02 GitHub to Azure Boards integration" "Sprint 2.3" "CI-CD" "$F23" "PR with AB#id shows under Development on the work item; commit with AB#id in the footer is linked and passes the hooks; merging the PR moves the item as configured; an unlinked PR still merges; no change under .github/workflows"
pbi "S2.3-T03 Azure Pipelines CI" "Sprint 2.3" "CI-CD" "$F23" "A push to main and a PR each start exactly one run; run executes every gate and is green on current main; a type error, a lint error and a failing test each make a run red; log prints Node and pnpm versions equal to .nvmrc and packageManager; second run restores the pnpm cache; ALLOW_LOCAL_SERVICES only in azure-pipelines/ci.yml; .github/workflows untouched and no new dependency; CI durations recorded in the guide"
pbi "S2.3-T04 Azure Pipelines CD (staging, gated, off by default)" "Sprint 2.3" "CI-CD" "$F23" "Ownership matrix in the guide with one deployer per environment; one merge to main creates exactly one staging deployment; a failed migration or failed health check stops the run; approval gate blocks the deploy stage until approved; no secret in logs or repository and no ALLOW_LOCAL_SERVICES in cd.yml; /api/health is 200, unauthenticated, no DB call, no sensitive data; rollback runbook written and rehearsed"
pbi "S2.3-T05 Azure Repos one-way backup" "Sprint 2.3" "CI-CD" "$F23" "A push to GitHub main appears in the backup within 10 minutes with the same SHA; tags are synced and the weekly run syncs all branches; a human push to the backup is rejected; a forced divergence fails the job and leaves backup history untouched; no PAT stored anywhere in GitHub; restore rehearsal worked"
pbi "S2.3-T06 Documentation and end-to-end validation" "Sprint 2.3" "Docs" "$F23" "Scenario completes from a clean checkout with evidence stored; exactly one deployment or one skipped stage for that merge; pnpm check:agents and pnpm check are green; every link in the guide resolves and every path exists with exact casing; a person who has not seen the project can follow the guide"
```

#### 5.4 PBIs of Sprint 2.6 (T01–T07 and T09; T08 stays in a later sprint)

Use the same `pbi` helper with `"$F26"`, area `PWA` (or `UI` / `Docs` where it fits), and **the title and acceptance criteria copied from `docs/roadmap/sprint-02.6-*.md`**. One line per ticket:

```bash
# pbi "S2.6-T01 <title from the sprint file>" "Sprint 2.6" "PWA" "$F26" "<acceptance criteria from the sprint file, one line, no double quotes>"
# pbi "S2.6-T02 …" "Sprint 2.6" "PWA" "$F26" "…"
# … T03, T04, T05, T06, T07, T09
```

> ⏳ The Sprint 2.6 titles and criteria are not in this file. Paste the sprint file into the chat and these lines get generated for you.

#### 5.5 Check the result

```bash
az boards query --wiql "SELECT [System.Id],[System.WorkItemType],[System.Title],[System.IterationPath] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.Id]" --detect false -o table
wid S2.3-T01
```

> ✅ Tip: tag PBIs `P0`, `P1`, `P2` to match the sprint files (add `--fields "System.Tags=P0"` in the `pbi` helper or tag them in the UI), and create one query per sprint (**Boards → Queries**).
>
> 🔍 Verify: the work item type names (`Product Backlog Item`) and field names depend on the Scrum template. If the CLI rejects one, the error prints the right name.

### 6. Permissions and variable groups

1. **Project settings → Permissions**: keep yourself as the only Project Administrator. Add viewers as **Stakeholder** (free) if needed.
2. **Pipelines → Library → + Variable group**:
   - `saas-boilerplate-ci` (non-secret). Variables: `NEXT_PUBLIC_APP_URL = http://localhost:3000`, `NEXT_PUBLIC_APP_NAME = SaaS Boilerplate`.
   - `saas-boilerplate-cd` (**empty for now**). Under **Security**, restrict who can use and edit it to yourself. Real secrets are added in T04 and marked secret.

> 🔐 `BETTER_AUTH_SECRET` for CI is a dummy and lives in the pipeline YAML (same as the GitHub CI). It is **not** a real secret. Production values never go in the CI group.

### 7. Guide stub

```bash
mkdir -p docs/guides
cat > docs/guides/azure-devops.md <<'EOF'
# Azure DevOps

> Status: Sprint 2.3 in progress. Completed in S2.3-T06.

## Organization and project

- Organization: `uzumaki26` · Project: `Next Boilerplate` (private, Scrum)
- Parallel jobs available: <fill in from Billing>
- Expected monthly cost: <fill in, expected: free tier>

## Work item mapping

Epic → "SaaS Boilerplate" · Feature → one per sprint · PBI → one per ticket (`S2.3-T01 …`) · Task → checklist group.

## Iterations and areas

Iterations: Sprint 2.3, 2.6, 3 … 8. Areas: Auth, Database, CI-CD, PWA, UI, Docs.
EOF
```

Add a link in `docs/README.md` (the line below appends it at the end; move it where you like), then run the path check:

```bash
echo '- [Azure DevOps](guides/azure-devops.md)' >> docs/README.md
pnpm check:agents
```

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
git add -A
git commit -m "docs(docs): add Azure DevOps setup guide stub" -m "AB#$(wid S2.3-T01)"
git push -u origin docs/s2.3-t01-azure-devops-setup
gh pr create --fill --base main --body "Seeds the Azure DevOps project. Fixes AB#$(wid S2.3-T01)"
gh pr checks --watch
gh pr merge --merge --delete-branch
git switch main && git pull
```

---

## 🎫 S2.3-T02 — GitHub ↔ Azure Boards integration

### 🌿 Start

```bash
git switch main && git pull
git switch -c docs/s2.3-t02-boards-linking
```

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

Append a **Linking work items** section to `CONTRIBUTING.md` and one checklist line to the PR template:

```bash
cat >> CONTRIBUTING.md <<'EOF'

## Linking work items

- Put `AB#<id>` in the PR description (and optionally the PR title).
- Put `AB#<id>` in a commit body or footer, never in the header, so commitlint is unaffected.
- `Fixes AB#<id>` in a PR description moves the work item when the PR merges.
- Linking is optional: an unlinked PR still merges normally.
EOF
echo '- [ ] Linked work item (optional): `AB#<id>`' >> .github/pull_request_template.md
```

> The PR template line lands at the end of the file. Move it under the checklist if you prefer.

### 4. Prove it

```bash
git add -A
git commit -m "docs(docs): document AB# work item linking" -m "AB#$(wid S2.3-T02)"
git push -u origin docs/s2.3-t02-boards-linking
gh pr create --fill --base main --body "Links the work item. Fixes AB#$(wid S2.3-T02)"
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
gh pr checks --watch
gh pr merge --merge --delete-branch
git switch main && git pull
```

---

## 🎫 S2.3-T03 — Azure Pipelines CI

### 🌿 Start

```bash
git switch main && git pull
git switch -c ci/s2.3-t03-azure-pipelines-ci
mkdir -p azure-pipelines/templates
```

### 1. Install the Azure Pipelines GitHub App

In Azure DevOps: **Pipelines → Create Pipeline → GitHub (YAML)**. Authorize the **Azure Pipelines** GitHub App for `hamdiRH/saas-boilerplate` only (single repository). This creates the service connection (D7). Stop at "Configure" until the YAML below is on `main`, or point the pipeline at the branch that contains it.

### 2. Shared steps template

One template keeps CI and CD identical.

```bash
cat > azure-pipelines/templates/setup-node-pnpm.yml <<'EOF'
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
EOF
```

🪟 These steps run on Linux agents. Nothing here is Windows-specific, and the repository rule "cross-platform scripts only" still applies to anything these commands call.

### 3. The CI pipeline

```bash
cat > azure-pipelines/ci.yml <<'EOF'
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
EOF
```

Notes on the choices:

- **Same commands as GitHub CI** (`pnpm …`), never different tools, so the two systems cannot drift (risk R2).
- `autoCancel: true` cancels superseded PR runs.
- Secrets are **not** exposed to fork PRs by default for GitHub-hosted repos. Do not add secret variables to this file (R5). 🔍 Verify the fork-PR setting under the pipeline's **Triggers → Pull request validation**.
- Dependabot PRs trigger this pipeline too (D4). If they add noise, restrict `pr:` with `paths:` or exclude their branches.
- Test result publishing (JUnit) is skipped on purpose: adding a reporter might mean a new dependency. If Vitest's built-in `junit` reporter works for you, add `--reporter=junit --outputFile=...` and a `PublishTestResults@2` step. 🔍 Verify first.

### 4. Commit and push the pipeline files

```bash
pnpm check
git add -A
git commit -m "ci(ci): add Azure Pipelines CI" -m "AB#$(wid S2.3-T03)"
git push -u origin ci/s2.3-t03-azure-pipelines-ci
gh pr create --fill --base main --body "Adds Azure Pipelines CI. Fixes AB#$(wid S2.3-T03)"
```

### 5. Create the pipeline in the UI

**Pipelines → New pipeline → GitHub → select the repo → Existing Azure Pipelines YAML file → branch `ci/s2.3-t03-azure-pipelines-ci` (or `main` after the merge) → `/azure-pipelines/ci.yml`**. Name it `saas-boilerplate-ci`. In **Triggers**, leave PR validation on, and do **not** make it a required status check in GitHub (D4).

### 6. Prove the gates work (probe branches, never merged)

The probe commits break the rules on purpose, so the pre-commit and pre-push hooks would stop them. `--no-verify` is used **only here**, only on probe branches.

```bash
# Probe 1: type error
git switch main && git pull
git switch -c ci/s2.3-t03-probe-types
echo 'export const probe: number = "not a number";' > src/probe.ts
git add -A && git commit --no-verify -m "test(tests): deliberate type error"
git push --no-verify -u origin ci/s2.3-t03-probe-types
gh pr create --fill --base main

# Probe 2: lint error
git switch main
git switch -c ci/s2.3-t03-probe-lint
echo 'debugger;' > src/probe.ts
git add -A && git commit --no-verify -m "test(tests): deliberate lint error"
git push --no-verify -u origin ci/s2.3-t03-probe-lint
gh pr create --fill --base main

# Probe 3: failing unit test
git switch main
git switch -c ci/s2.3-t03-probe-test
printf "import { expect, it } from 'vitest';\nit('fails on purpose', () => { expect(1).toBe(2); });\n" > src/probe.test.ts
git add -A && git commit --no-verify -m "test(tests): deliberate failing test"
git push --no-verify -u origin ci/s2.3-t03-probe-test
gh pr create --fill --base main
```

Every probe run must go **red** in Azure Pipelines. Then clean up, and never merge a probe:

```bash
git switch ci/s2.3-t03-azure-pipelines-ci
gh pr close ci/s2.3-t03-probe-types --delete-branch
gh pr close ci/s2.3-t03-probe-lint --delete-branch
gh pr close ci/s2.3-t03-probe-test --delete-branch
git branch -D ci/s2.3-t03-probe-types ci/s2.3-t03-probe-lint ci/s2.3-t03-probe-test
```

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
gh pr checks --watch
gh pr merge --merge --delete-branch
git switch main && git pull
```

---

## 🎫 S2.3-T05 — Azure Repos one-way backup

### 🌿 Start

```bash
git switch main && git pull
git switch -c ci/s2.3-t05-azure-repos-backup
```

### 1. Create the backup repository

**Repos → New repository** → name `saas-boilerplate-backup`, **no README** (it must be empty).

### 2. Make it read-only for humans

1. **Project settings → Repositories → `saas-boilerplate-backup` → Security.** Remove **Contribute**, **Force push** and **Bypass policies** from every user and group, including yours.
2. Give **only** the build identity `Next Boilerplate Build Service (uzumaki26)` the **Contribute** permission on this repository. This is what lets the pipeline's own token push (D7). No PAT, nothing stored in GitHub.
3. Add a branch policy on `main` of the backup repo if you want an extra guard.

🔍 Verify: the identity name depends on the "project-scoped build service" settings. Search for `Build Service` in the security dialog.

### 3. The backup pipeline

```bash
cat > azure-pipelines/backup.yml <<'EOF'
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
      name: Next Boilerplate/saas-boilerplate-backup

variables:
  BACKUP_URL: https://dev.azure.com/uzumaki26/Next%20Boilerplate/_git/saas-boilerplate-backup

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
EOF
```

Why it is safe (risk R4):

- **No `--force`, no `--mirror`, no `--prune`.** A diverged backup makes `git push` fail loudly instead of rewriting history.
- It runs from the **GitHub** repo resource, so a push to the backup repo cannot trigger it (no loop).
- The token is the pipeline's own `System.AccessToken`, scoped by the permissions you set in step 2.

🔍 Verify: for a GitHub-hosted repo, YAML `schedules` and `tags` triggers are supported, but confirm in your run that the schedule fires. Also check that the **Build Service** may access the repository resource without extra "Allow" prompts on the first run (approve it once if Azure asks).

### 4. Commit, push and open the PR

```bash
pnpm check
git add -A
git commit -m "ci(ci): add Azure Repos one-way backup pipeline" -m "AB#$(wid S2.3-T05)"
git push -u origin ci/s2.3-t05-azure-repos-backup
gh pr create --fill --base main --body "Adds the one-way backup. Fixes AB#$(wid S2.3-T05)"
```

### 5. Create the pipeline, then test

In the UI create a pipeline named `saas-boilerplate-backup` from `/azure-pipelines/backup.yml` (point it at this branch until the PR is merged) and run it manually once. Then:

```bash
# 1) A new commit on main must show up in the backup (after the PR is merged)
git switch main && git pull
git commit --allow-empty -m "chore(config): backup probe" && git push
# 2) A tag must sync
git tag v0.0.0-backup-probe && git push origin v0.0.0-backup-probe
# 3) A human push to the backup must be rejected
git clone https://dev.azure.com/uzumaki26/Next%20Boilerplate/_git/saas-boilerplate-backup /tmp/backup-check
cd /tmp/backup-check && git commit --allow-empty -m "should fail" && git push   # expect: rejected
cd -
```

Delete the probe tag on GitHub afterwards (and in Azure Repos from the UI):

```bash
git push origin :refs/tags/v0.0.0-backup-probe
git tag -d v0.0.0-backup-probe
```

### 6. Restore rehearsal (do it once)

```bash
git clone https://dev.azure.com/uzumaki26/Next%20Boilerplate/_git/saas-boilerplate-backup /tmp/restore-check
cd /tmp/restore-check && git log --oneline | head -3 && git rev-parse main
git ls-remote https://github.com/hamdiRH/saas-boilerplate refs/heads/main     # compare the two SHAs
cd -
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
gh pr checks --watch
gh pr merge --merge --delete-branch
git switch main && git pull
```

---

## 🎫 S2.3-T04 — Azure Pipelines CD (staging, gated, off by default)

### 🌿 Start

```bash
git switch main && git pull
git switch -c ci/s2.3-t04-azure-pipelines-cd
mkdir -p src/app/api/health
```

> ⚠️ **Read this before writing YAML.** The repository has **no deploy workflow, no `vercel.json` and no `/api/health` yet** (Sprint 8 plans them). So this ticket builds a pipeline that is **safe by default**: it builds once, publishes the artifact, and the deploy stage only runs when you set `DEPLOY_ENABLED=true` in the restricted variable group. That is decision D2 option (c) with a ready path to option (a).

### 1. The ownership matrix (write it first, get it approved)

Put this table in `docs/guides/azure-devops.md`. **Exactly one deployer per environment.**

```bash
cat >> docs/guides/azure-devops.md <<'EOF'

## Ownership matrix

| Environment | Owner | Trigger |
| --- | --- | --- |
| Preview | Vercel Git integration | Every PR / branch push |
| Staging | **Azure CD** | Successful CI on `main`, then approval |
| Production | Sprint 8 GitHub deploy workflow (not built yet) | Release tag + approval |
EOF
```

> If you later want Azure to own production, or Vercel to stop deploying `main`, change the matrix **and** add the Vercel `git.deploymentEnabled` setting for `main` in the same PR. Never leave two systems deploying the same environment (risk R1).

### 2. A health endpoint (decision D3)

```bash
cat > src/app/api/health/route.ts <<'EOF'
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
EOF

cat > src/app/api/health/route.test.ts <<'EOF'
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
EOF

pnpm test src/app/api/health
```

Make sure the proxy does not redirect it: the matcher already excludes `api` (`src/proxy.ts`).

### 3. Secrets (only in the restricted group)

In **Pipelines → Library → `saas-boilerplate-cd`**, add **secret** variables (lock icon): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `STAGING_URL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`, and a plain `DEPLOY_ENABLED = false`.

> 🔐 `ALLOW_LOCAL_SERVICES` must **not** exist in this group or in the CD file. Production-mode env validation (`DATABASE_URL`, a real email transport) must pass for the build, and that is exactly the point.
>
> 🔍 Staging should use its **own** Neon branch and its own `BETTER_AUTH_SECRET`, never production values.

### 4. Environments and approvals

**Pipelines → Environments → New** → `staging`. Open it → **Approvals and checks** → add **Approvals** (yourself) and an **Exclusive lock** (so two runs never deploy at once).

### 5. The CD pipeline

Replace `<PINNED_VERSION>` with the Vercel CLI version you tested (run `npx vercel --version`), never `latest`.

```bash
cat > azure-pipelines/cd.yml <<'EOF'
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
EOF
```

What each part guarantees:

- **One deployment per merge:** CD is triggered only by the CI pipeline finishing on `main`; the exclusive lock blocks parallel runs; the stage is skipped unless `DEPLOY_ENABLED=true`.
- **Fail early:** migrations run before the deploy step; a failed migration or health check fails the run and nothing is promoted.
- **No secrets in logs:** variables marked secret are masked. Never `echo` them.
- **Rollback:** redeploy the previous good build (re-run the previous successful pipeline run, or promote the previous Vercel deployment). Migrations follow expand/contract, so the previous version still works against the new schema.

🔍 Verify: `DEPLOY_URL` is the unique deployment URL, which can sit behind Vercel's deployment protection. If the smoke test gets 401/403, use a protection-bypass token or a custom staging domain.

Create the pipeline in the UI (**New pipeline → GitHub → Existing YAML → `/azure-pipelines/cd.yml`**), name it `saas-boilerplate-cd`.

### 6. Prove it (in this order)

1. Merge with `DEPLOY_ENABLED=false`: the Build stage runs, the Staging stage is **skipped**.
2. Set `DEPLOY_ENABLED=true`, run again: approval is requested, the migration gate and deploy run, the smoke test passes.
3. Break the health check on purpose (return 500 on a scratch branch, never merged): the run fails and nothing is promoted.
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
git add src/app/api/health
git commit -m "feat(config): add health endpoint" -m "AB#$(wid S2.3-T04)"
git add azure-pipelines docs
git commit -m "ci(ci): add Azure Pipelines CD" -m "AB#$(wid S2.3-T04)"
git push -u origin ci/s2.3-t04-azure-pipelines-cd
gh pr create --fill --base main --body "Adds the gated staging CD and /api/health. Fixes AB#$(wid S2.3-T04)"
gh pr checks --watch
gh pr merge --merge --delete-branch
git switch main && git pull
```

If this changes the Sprint 8 plan, add `docs/adr/014-…` in the same PR.

---

## 🎫 S2.3-T06 — Documentation and end-to-end validation

### 🌿 Start

```bash
git switch main && git pull
git switch -c docs/s2.3-t06-azure-devops-docs
```

### 1. Finish the guide

`docs/guides/azure-devops.md` must contain: an architecture diagram, the setup steps, variable groups (names only), permissions, the **ownership matrix**, runbooks (rollback, restore, rotate credentials), troubleshooting, and cost notes. Append the diagram and the troubleshooting list:

````bash
cat >> docs/guides/azure-devops.md <<'EOF'

## Architecture

```text
GitHub (source of truth)
  ├─ PR / push ─► GitHub Actions CI  (merge gate)
  ├─ PR / push ─► Azure Pipelines CI (secondary signal)
  ├─ AB#123     ─► Azure Boards       (planning)
  ├─ main/tags  ─► Azure Pipelines backup ─► Azure Repos (read-only copy)
  └─ main       ─► Azure Pipelines CD ─► Staging (approval, migration gate, smoke test)
````

## Troubleshooting

- "No hosted parallelism has been purchased or granted": request the free grant from Microsoft.
- `pnpm` version mismatch: Corepack reads the `packageManager` field, check it matches the lockfile.
- Backup push rejected as non-fast-forward: investigate the divergence, never force. EOF

````

> The nested code fence above breaks some Markdown viewers. If yours does, open the file and fix the fence by hand (use four backticks for the outer one).

Then fill in the rest by hand: setup steps, variable groups (names only), permissions, the rollback / restore / rotate-credentials runbooks, CI durations and cost notes.

### 2. Update the repository docs (decision D8)

- `README.md` (CI/CD section), `CONTRIBUTING.md`, `docs/README.md`
- `AGENTS.md`: add one structure line. `pnpm check:agents` verifies that every path in the file exists.
- `docs/roadmap/06-project-state.md`: pipelines, variable groups (**names only**), environments, new files, decisions taken
- `docs/adr/014-azure-devops-secondary-delivery.md` (use `docs/adr/0000-template.md`): GitHub is the source of truth; Azure is planning, secondary CI, one-way backup and staging CD only

```bash
echo 'azure-pipelines/   Azure Pipelines YAML (CI, CD, backup)' >> AGENTS.md
cp docs/adr/0000-template.md docs/adr/014-azure-devops-secondary-delivery.md
pnpm check:agents
````

(Move the `AGENTS.md` line into the structure list, and fill in the ADR.)

### 3. The end-to-end scenario (record evidence in the guide)

1. Create a PBI in Boards.
2. Branch `ci/s2.3-…`, commit with `AB#<id>` in the footer, open a PR.
3. **GitHub CI** and **Azure CI** both go green.
4. Merge. The PBI moves state.
5. Azure CD runs once (approve it), the smoke test passes. (With `DEPLOY_ENABLED=false` the stage is skipped, and that also counts as a pass for this step.)
6. The backup shows the same SHA as GitHub `main`:

```bash
git ls-remote https://github.com/hamdiRH/saas-boilerplate refs/heads/main
git ls-remote https://dev.azure.com/uzumaki26/Next%20Boilerplate/_git/saas-boilerplate-backup refs/heads/main
```

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
git add -A
git commit -m "docs(docs): document Azure DevOps delivery and validate end to end" -m "AB#$(wid S2.3-T06)"
git push -u origin docs/s2.3-t06-azure-devops-docs
gh pr create --fill --base main --body "Documents Azure DevOps and validates it end to end. Fixes AB#$(wid S2.3-T06)"
gh pr checks --watch
gh pr merge --merge --delete-branch
git switch main && git pull
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
