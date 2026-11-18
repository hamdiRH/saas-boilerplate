# Sprint 2.3 — Azure DevOps Integration (infrastructure)

> **Status:** planned, awaiting backlog approval. **Planning only:** this file creates no Azure resources, changes no GitHub Actions workflow and touches no application code. **Position:** after Sprint 2, before Sprint 3. It adds delivery infrastructure; it does not change the application architecture or the Sprint 3 scope.

## 1. Goal

Run project management, a secondary CI/CD pipeline and an off-GitHub backup on **Azure DevOps** while **GitHub stays the single source of truth** for code, reviews and merges.

- **Azure Boards:** Scrum backlog (Epic → Feature → PBI → Task → Bug), sprints as iterations, work items linked to commits and PRs.
- **Azure Pipelines:** CI that mirrors the GitHub quality gates, and CD that deploys **without ever duplicating a deployment** made by another path.
- **Azure Repos:** a one-way, read-only backup of GitHub. Nobody commits there.

## 2. Inspection summary

Facts verified in the repository (branch `fix/audit-sprint-2`, 2026-11-17):

| Area | Finding | Consequence for this sprint |
| --- | --- | --- |
| Source of truth | GitHub `hamdiRH/saas-boilerplate`, `main` + PRs, conventional commits enforced by Lefthook + commitlint (allowed scopes: deps, auth, db, i18n, ui, ci, docs, tests, config, org, admin, seo, obs, sec) | Work-item links must go in the commit **body/footer** or PR description (`AB#123`), never break the header rule |
| CI | `.github/workflows/ci.yml`: quality, test, build, commitlint, e2e; `security.yml`: audit, dependency review, CodeQL | Azure CI re-runs the same commands (`pnpm …`); it must not replace or edit these files |
| Toolchain | Node 22 (`.nvmrc`), **pnpm 12 only** (`packageManager` pin), Oxlint, Oxfmt, Knip, Vitest (unit + browser), Playwright | Pipeline needs Node from `.nvmrc`, pnpm via Corepack, Playwright Chromium for browser/e2e |
| Env | `src/libs/env.ts` validates env; `ALLOW_LOCAL_SERVICES` is **CI/e2e only**; production requires `DATABASE_URL` and a real email transport | CI pipeline sets `ALLOW_LOCAL_SERVICES=true`; the CD pipeline must **never** set it |
| Hosting | README documents **Vercel + Neon** and a gated deploy workflow, but **no deploy workflow, no `vercel.json`, no `docs/guides/deployment.md`, no Semantic Release config and no `/api/health` route exist yet** (planned for Sprint 8) | CD has nothing to hook into today: T04 must define the target and avoid colliding with Sprint 8 (see D2, D3) |
| Dependabot | npm weekly, actions monthly, commit prefix `chore(deps)` / `ci(deps)` | Dependabot PRs also trigger Azure CI if PR triggers are enabled; decide in D4 |
| Repo conventions | "Ask first": CI/release changes, dependencies. Cross-platform scripts, LF endings, case-sensitive paths | New files are Azure YAML + docs; no new dependency; every pipeline file path is case-exact |
| Agent files | `check:agents` verifies paths referenced in `AGENTS.md` | If `AGENTS.md` mentions `azure-pipelines/`, the path must exist |

## 3. Dependency graph and execution order

```text
T01 ─┬─► T02 ───────────────┐
     ├─► T03 ─► T04 ────────┼─► T06
     └─► T05 ───────────────┘
```

Order: **T01 → (T02 ∥ T03 ∥ T05) → T04 → T06.** T04 needs the CI pipeline (T03) because CD consumes its build artifact and conventions. T06 validates everything and writes the documentation.

| Ticket | Title | Priority | Effort | Depends on |
| --- | --- | --- | --- | --- |
| S2.3-T01 | Azure DevOps organization, project & Scrum configuration | P0 | 0.5–1 day | — |
| S2.3-T02 | GitHub ↔ Azure Boards integration | P0 | 0.5 day | T01 |
| S2.3-T03 | Azure Pipelines CI | P0 | 1–1.5 days | T01 |
| S2.3-T04 | Azure Pipelines CD / deployment | P1 | 1–2 days | T03 |
| S2.3-T05 | Azure Repos one-way backup sync | P1 | 0.5–1 day | T01 |
| S2.3-T06 | Documentation and end-to-end validation | P0 | 1 day | T02, T03, T04, T05 |

## 4. Prerequisites, risks and assumptions

### Prerequisites (owner: you)

- A Microsoft account / Entra tenant able to create an Azure DevOps organization.
- Permission to install the **Azure Pipelines** and **Azure Boards** GitHub Apps on `hamdiRH/saas-boilerplate` (repo admin).
- Parallel-job capacity for Microsoft-hosted agents. New organizations may have to **request the free grant**, and public vs private projects differ. **Verify the current terms in T01 before relying on them.**
- For CD only: the deployment target and its credentials (see D2). No credential is ever committed.

### Assumptions

- Repository stays on GitHub; `main` remains protected by GitHub rules, not Azure policies.
- Azure Pipelines runs on Microsoft-hosted `ubuntu-latest` agents.
- Work items use the **Scrum** process template, and one repo sprint equals one Azure iteration.

### Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | **Duplicate deployments** (Azure CD + Vercel Git integration + the Sprint 8 GitHub deploy workflow) | High | High | One deployment owner per environment, documented in a matrix (T04, D2); Azure CD may not touch an environment another path owns |
| R2 | Two CI systems drift (different commands or Node/pnpm versions) | Medium | Medium | Azure YAML calls only `pnpm` scripts from `package.json`; versions come from `.nvmrc` and `packageManager`; T06 compares results |
| R3 | No free parallel jobs, so pipelines queue or refuse to start | Medium | High | Check in T01; fallback is documented (self-hosted agent or request the grant) and does not block Boards/Repos tickets |
| R4 | Backup push loops or deletes history | Low | High | One-way, branch/tag allow-list, no force push, no `--mirror` with prune; Azure Repos branch policy blocks human pushes |
| R5 | Secrets leak through pipeline logs or forks | Medium | High | Variable groups / Key Vault with secret flags, no secrets on PR-from-fork builds, `ALLOW_LOCAL_SERVICES` only in CI |
| R6 | Commit-message linking conflicts with commitlint | Low | Low | `AB#` goes in the body/footer; verified in T02 |
| R7 | Cost surprises (extra users, parallel jobs, artifacts) | Low | Medium | Estimate and record in T01; stay within free tiers |
| R8 | Plan overlap with Sprint 8 (release engineering) | Medium | Medium | T04 scope limited to what D2 approves; Sprint 8 reuses or replaces it explicitly via ADR |

## 5. Decisions needing your approval

| ID | Decision | Recommendation |
| --- | --- | --- |
| **D1** | Azure organization/project names and visibility (public or private) | Project `saas-boilerplate`, **private**, Scrum process, 2-week iterations aligned to sprint numbers |
| **D2** | **Where CD deploys, and who owns each environment.** Options: (a) Azure deploys a **staging** environment only, production stays with the Sprint 8 GitHub workflow; (b) Azure becomes the only deployer and Vercel Git auto-deploy is disabled; (c) CD is a dry-run/artifact-only pipeline until Sprint 8 | **(a)** a deployment matrix with exactly one owner per environment; **(c) is the safe fallback** if no target exists yet |
| **D3** | A `/api/health` route is needed for post-deploy smoke tests but does not exist. Add it in T04 (small app change) or defer to Sprint 8 | Add a minimal, unauthenticated, no-DB `/api/health` in T04, with unit test and docs |
| **D4** | Azure CI triggers: `main` only, or `main` + PRs (including Dependabot); and whether Azure CI is a **required** check | `main` + PRs, **not required** at first; GitHub CI stays the merge gate |
| **D5** | Work-item mapping: Epic = "SaaS Boilerplate", Feature = sprint, PBI = ticket (`S2.3-T01`), Task = checklist group | Approve as written; ticket IDs go in PBI titles |
| **D6** | Backup scope: which refs sync, and cadence (on every push to `main` + tags vs scheduled) | `main` + tags on push, plus a weekly scheduled full sync of all branches |
| **D7** | Auth method between systems: Azure Pipelines GitHub App service connection; backup via the pipeline's own `System.AccessToken` or a PAT | App-based service connection; `System.AccessToken` with Contribute on the backup repo only. **No PAT in GitHub secrets** |
| **D8** | Edits to `AGENTS.md` / project-state to mention Azure | Yes, in T06 only. Needs your OK because they are agent instructions |

Out of scope: Azure Test Plans, Azure Artifacts feeds, Azure Boards-driven GitHub deployments, moving code or PR review off GitHub, any Azure infrastructure beyond the DevOps organization.

## 6. Tickets

Branch pattern: `ci/s2.3-t0N-<slug>` (docs-only tickets use `docs/…`). Commit scopes must come from the allowed list (`ci`, `docs`, `config`, `sec`).

---

### S2.3-T01 — Azure DevOps organization, project & Scrum configuration

- **Priority:** P0 · **Effort:** 0.5–1 day · **Depends on:** none
- **Objective:** a configured Azure DevOps project ready to receive the GitHub integration, pipelines and backup.
- **User story:** As the maintainer, I want a Scrum-configured Azure DevOps project so that I can plan and track every sprint of the boilerplate in one board.

**Tasks**

- [ ] Record decisions D1, D5 and the cost/parallel-job check (R3, R7) in `docs/guides/azure-devops.md` (stub created here, completed in T06).
- [ ] Create the organization and the private project `saas-boilerplate` with the **Scrum** process (manual, or by an approved script using the Azure DevOps CLI; credentials never stored in the repo).
- [ ] Create the **iteration tree**: `Sprint 2.3`, `Sprint 2.6`, `Sprint 3` … `Sprint 8`, with dates.
- [ ] Create the **area tree**: Auth, Database, CI-CD, PWA, UI, Docs.
- [ ] Create team, permissions and access levels (Basic for the maintainer, Stakeholder for viewers) and a least-privilege Build Service identity.
- [ ] Configure board columns, WIP limits, work-item tags (`P0`, `P1`, `P2`) and one query per sprint.
- [ ] Seed the backlog: Epic, one Feature per sprint, one PBI per ticket of Sprints 2.3 and 2.6 with the acceptance criteria copied from the sprint files.
- [ ] Create a variable group `saas-boilerplate-ci` (non-secret) and an empty, access-restricted `saas-boilerplate-cd` group.

**Tests / evidence:** screenshots or CLI output attached to the PBI; no automated test.

**Acceptance criteria**

- [ ] The project exists, is private, and uses the Scrum process (visible in Project settings → Overview).
- [ ] Iterations `Sprint 2.3` to `Sprint 8` and the six area paths exist.
- [ ] 1 Epic, one Feature per sprint, and 6 + 9 PBIs for Sprints 2.3/2.6 exist, each with title `S<sprint>-T<nn> …` and acceptance criteria filled.
- [ ] Only the maintainer can edit pipelines and the CD variable group.
- [ ] Parallel-job availability and expected monthly cost are written in the guide.
- [ ] No credential, token or tenant ID is committed to the repository.

**Definition of done:** acceptance criteria verified; guide stub merged (`docs` commit, `check` green); no secrets in the diff.

---

### S2.3-T02 — GitHub ↔ Azure Boards integration

- **Priority:** P0 · **Effort:** 0.5 day · **Depends on:** T01
- **Objective:** commits, branches and PRs on GitHub link to Azure Boards work items, and work-item state follows PR activity.
- **User story:** As a developer, I want a commit or PR mentioning `AB#123` to appear on that work item so that planning and code stay traceable.

**Tasks**

- [ ] Install the Azure Boards GitHub App on `hamdiRH/saas-boilerplate` and connect it to the project (least-privilege repository selection).
- [ ] Define the linking convention in `CONTRIBUTING.md` and the PR template: `AB#<id>` in the PR description and the commit **body/footer**; branch name keeps the repo's pattern.
- [ ] Add an optional `Work item: AB#` line to `.github/pull_request_template.md` (documentation change only; no workflow edit).
- [ ] Configure state transitions (for example PR opened → Active, merged → Resolved/Done) in the Boards GitHub connection settings.
- [ ] Verify commitlint accepts the footer on a throwaway branch.

**Tests:** a sandbox PR with a linked work item; `pnpm exec commitlint` on a sample message with the footer.

**Acceptance criteria**

- [ ] A PR whose description contains `AB#<id>` shows under **Development** on that work item within a few minutes.
- [ ] A commit with `AB#<id>` in its footer is linked and passes commitlint and the Lefthook hook (no `--no-verify`).
- [ ] Merging the PR moves the item to the configured state.
- [ ] Unlinked PRs still merge normally (linking is not mandatory).
- [ ] No GitHub workflow file was modified.

**Definition of done:** criteria verified on a real PR; `CONTRIBUTING.md` and PR template updated; `pnpm check` green.

---

### S2.3-T03 — Azure Pipelines CI

- **Priority:** P0 · **Effort:** 1–1.5 days · **Depends on:** T01
- **Objective:** an Azure pipeline that runs the same gates as GitHub CI from a GitHub-hosted repository.
- **User story:** As the maintainer, I want Azure CI results for every push and PR so that I have an independent second signal and a pipeline ready for CD.

**Tasks**

- [ ] Install the Azure Pipelines GitHub App and create a GitHub service connection (decision D7).
- [ ] Add `azure-pipelines/ci.yml` (and `azure-pipelines/templates/` for shared steps) using triggers from D4. Do **not** edit `.github/workflows/*`.
- [ ] Steps: Node from `.nvmrc`, `corepack enable` so `packageManager` selects pnpm 12, `pnpm install --frozen-lockfile`, then `typecheck`, `lint`, `format:check`, `knip`, `check:env`, `check:agents`, `db:check`, `test`, `build`.
- [ ] Browser tests and e2e job: install Playwright Chromium (cache `~/.cache/ms-playwright`), run `test:browser` and `e2e`; publish `playwright-report` and `test-results` on failure.
- [ ] Set the CI-only environment in the YAML: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`, a dummy `BETTER_AUTH_SECRET`, `ALLOW_LOCAL_SERVICES=true`.
- [ ] Cache pnpm store and `.next/cache` keyed on `pnpm-lock.yaml` / sources; publish test results (JUnit) if the Vitest reporter supports it without a new dependency.
- [ ] Concurrency/cancellation of superseded runs, job timeouts, and no secrets exposed to fork PRs.
- [ ] Add the pipeline to the project and name it `saas-boilerplate-ci`.

**Tests:** push a deliberately failing commit on a throwaway branch (type error, lint error) and confirm the pipeline fails; confirm it passes on a clean branch.

**Acceptance criteria**

- [ ] A push to `main` and a PR each trigger exactly one CI run (per D4).
- [ ] The run executes every command listed above and goes green on the current `main`.
- [ ] A type error, a lint error and a failing unit test each turn the run red.
- [ ] Node and pnpm versions printed in the log equal `.nvmrc` and `packageManager`.
- [ ] A second run with an unchanged lockfile restores the pnpm cache (log shows cache hit) and is measurably faster.
- [ ] `ALLOW_LOCAL_SERVICES` appears only in this pipeline, never in a CD file.
- [ ] No GitHub Actions file changed; no new dependency added.

**Definition of done:** pipeline green on `main`; durations recorded in the guide; YAML formatted by Oxfmt; `pnpm check` green.

---

### S2.3-T04 — Azure Pipelines CD / deployment

- **Priority:** P1 · **Effort:** 1–2 days · **Depends on:** T03 (and decision D2)
- **Objective:** a gated deployment pipeline that deploys exactly one environment, with a smoke test and a rollback path, and cannot collide with any other deployment path.
- **User story:** As the maintainer, I want a gated, observable deployment from Azure so that releases are repeatable and never deployed twice.

**Tasks**

- [ ] Write the **deployment ownership matrix** (environment × owner: Vercel Git integration, GitHub deploy workflow from Sprint 8, Azure CD) and get D2 approved before any YAML.
- [ ] Add `azure-pipelines/cd.yml`: triggered only by a successful CI run on `main` or by a version tag (per D2); build once, deploy that artifact.
- [ ] Define Azure **Environments** (`staging`, optionally `production`) with **approval checks** and an exclusive lock so two runs never deploy concurrently.
- [ ] Secrets only from the restricted variable group or Key Vault; `ALLOW_LOCAL_SERVICES` must be unset; production env validation (`DATABASE_URL`, real email transport) must pass.
- [ ] Migration gate: run `pnpm db:migrate` against the target **before** switching traffic, using `DATABASE_URL_UNPOOLED`; abort the deploy on failure.
- [ ] Add a minimal `GET /api/health` route (decision D3) with a unit test; use it as the post-deploy smoke test with retries and a timeout.
- [ ] Rollback path documented and rehearsed: redeploy the previous artifact/tag; migrations follow expand/contract so the previous version still works.
- [ ] If D2 selects option (c), the pipeline stops after publishing the build artifact and the deploy stage is a documented, disabled template.

**Tests:** unit test for `/api/health`; a deployment to staging; a deliberately broken health check proving the run fails and nothing is promoted.

**Acceptance criteria**

- [ ] The ownership matrix is in `docs/guides/azure-devops.md` and approved; each environment has exactly **one** deployer.
- [ ] One merge to `main` produces exactly **one** deployment of the target environment (check Azure run history and the host's deployment list).
- [ ] A failed migration or failed health check stops the run before traffic switches.
- [ ] The approval gate blocks the production-like stage until approved.
- [ ] No secret appears in logs (secrets masked) and none is stored in the repo.
- [ ] Rolling back restores the previous version in under 10 minutes by following the written runbook.
- [ ] `/api/health` returns 200 with no authentication, no database call and no sensitive data.

**Definition of done:** criteria verified on staging; runbook merged; `pnpm check` green; ADR added if it changes the Sprint 8 plan (`docs/adr/014-…`).

---

### S2.3-T05 — Azure Repos one-way backup sync

- **Priority:** P1 · **Effort:** 0.5–1 day · **Depends on:** T01
- **Objective:** an automatically updated, read-only copy of the GitHub repository in Azure Repos.
- **User story:** As the maintainer, I want a backup copy outside GitHub so that I can recover the code and history if GitHub is unavailable.

**Tasks**

- [ ] Create the empty Azure Repos repository `saas-boilerplate-backup`.
- [ ] Add a branch policy / permission set so only the pipeline identity can push; humans get read-only.
- [ ] Add `azure-pipelines/backup.yml`: trigger on pushes to `main` and tags, plus a weekly schedule for all branches (D6); fetch full history (`fetchDepth: 0`), push with the pipeline's `System.AccessToken` (D7).
- [ ] Never force push or prune; fail loudly on non-fast-forward so divergence is visible instead of overwritten.
- [ ] Guard against loops: the backup pipeline does not trigger on the backup repository.
- [ ] Document restore: how to clone from Azure Repos and re-create the GitHub repository.

**Tests:** push a commit to `main`, confirm it appears in Azure Repos; push a tag; simulate a diverged backup and confirm the job fails without rewriting history.

**Acceptance criteria**

- [ ] After a push to GitHub `main`, the same commit SHA is in the backup `main` within 10 minutes.
- [ ] Tags are synced; branch sync follows the D6 scope.
- [ ] `git rev-parse` of `main` is identical in both remotes after a run.
- [ ] A human push to the backup is rejected.
- [ ] A forced divergence fails the job and leaves backup history untouched.
- [ ] No PAT is stored in GitHub; the token used is scoped to the backup repo.
- [ ] The restore procedure was followed once to a scratch directory and works.

**Definition of done:** criteria verified; restore steps in the guide; `pnpm check` green.

---

### S2.3-T06 — Documentation and end-to-end validation

- **Priority:** P0 · **Effort:** 1 day · **Depends on:** T02, T03, T04, T05
- **Objective:** prove the whole chain works and leave a guide a new maintainer can follow.
- **User story:** As a new contributor, I want a single guide and a proven flow so that I can use Boards, Pipelines and the backup without guessing.

**Tasks**

- [ ] Complete `docs/guides/azure-devops.md`: architecture diagram, setup steps, variable groups, permissions, deployment ownership matrix, runbooks (rollback, restore, rotate credentials), troubleshooting, cost notes.
- [ ] Update `README.md` (CI/CD section), `CONTRIBUTING.md`, `docs/README.md`, `AGENTS.md` (structure line for `azure-pipelines/`, D8) and `docs/roadmap/06-project-state.md`.
- [ ] Run the **end-to-end scenario** below and record evidence.
- [ ] Verify the guard rails: no duplicate deployment, no secret exposure, GitHub still the only place code is merged.
- [ ] Compare GitHub CI and Azure CI results and timing; note differences.
- [ ] Write the ADR for the Azure DevOps role (`docs/adr/014-azure-devops-secondary-delivery.md`).
- [ ] Update the sprint file checkboxes and create `docs/roadmap/sprint-02.3-tutorial.md` (only after backlog approval).

**End-to-end scenario:** create a PBI → branch `ci/s2.3-…` → commit with `AB#<id>` → PR → GitHub CI and Azure CI both green → merge → Boards item moves → Azure CD deploys once (per D2) → smoke test passes → backup shows the same SHA.

**Acceptance criteria**

- [ ] The scenario completes from a clean checkout with no manual fix-ups, and evidence (links/screenshots) is stored in the guide.
- [ ] Exactly one deployment happened for that merge, and none from another path.
- [ ] `pnpm check:agents` and `pnpm check` pass with the updated docs.
- [ ] Every link in the new guide resolves; every path mentioned exists with exact casing.
- [ ] The state file lists Sprint 2.3 outputs: pipelines, variable groups (names only), environments, new files, decisions taken.
- [ ] A person who has not seen the project can reproduce setup from the guide (dry read by the maintainer).

**Definition of done:** all P0/P1 tickets verified; docs merged; ADR accepted; sprint closed in Boards and in `docs/roadmap/README.md`.

---

## 7. Test strategy summary

| Level | What | Where |
| --- | --- | --- |
| Unit | `/api/health` handler (T04) | Vitest |
| Pipeline | Failing-commit probes (type, lint, test) prove gates work | T03 |
| Integration | Linked PR → work item; backup SHA equality; migration gate abort | T02, T04, T05 |
| End-to-end | The full scenario in T06 | Manual with recorded evidence |
| Regression | `pnpm check` and GitHub CI stay green throughout; no workflow file diff | Every ticket |

## 8. Definition of done (sprint)

- All tickets meet their own DoD and the roadmap DoD (`README.md` §3).
- Decisions D1–D8 recorded; ADR 014 accepted.
- GitHub remains the only merge path; exactly one deployer per environment.
- No secret in the repository, logs or fork-PR builds.
- `docs/roadmap/06-project-state.md` updated.
