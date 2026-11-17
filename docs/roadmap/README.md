# Roadmap

The delivery plan for the SaaS boilerplate. One file per sprint, plus this index and the live state file.

> The original roadmap files (`01`–`05` and the per-sprint backlog files) were not committed to this repository. Sprints 0–2 are documented by their tutorials in [`docs/tutorial/`](../tutorial/) and by [`06-project-state.md`](06-project-state.md). Files for Sprint 2.3 and later are written in the format described in §4.

## 1. How to use these files

1. Read [`06-project-state.md`](06-project-state.md): what exists today.
2. Open the sprint file for the sprint you are working on.
3. Work its tickets in the order given by the sprint's dependency graph. One ticket = one branch = one PR.
4. At the end of the sprint, update the state file.

## 2. Sprint index

| Sprint | Title | Status | Backlog file | Tutorial |
| --- | --- | --- | --- | --- |
| 0 | Foundation & Tooling | Done | `sprint-00-foundation.md` (not in repo) | [tutorial](../tutorial/sprint-00-tutorial.md) |
| 1 | Data Layer, App Shell, i18n, Forms, Errors | Done | `sprint-01-data-shell-i18n.md` (not in repo) | [tutorial](../tutorial/sprint-01-tutorial.md) |
| 2 | Authentication Core (Better Auth) | Done | `sprint-02-auth-core.md` (not in repo) | [tutorial](../tutorial/sprint-02-tutorial.md) |
| 2.3 | Azure DevOps Integration (infrastructure) | Planned | `sprint-02.3-azure-devops.md` | after backlog approval |
| 2.6 | PWA & Service Worker Infrastructure | Planned | `sprint-02.6-pwa.md` | after backlog approval |
| 3 | Advanced Authentication (Magic Links, Social, Passkeys, MFA) | Planned | `sprint-03-auth-advanced.md` (not in repo) | [tutorial](../tutorial/sprint-03-tutorial.md) |
| 4 | Multi-tenancy, RBAC, Admin & Impersonation | Planned | `sprint-04-tenancy-rbac-admin.md` (not in repo) | [tutorial](../tutorial/sprint-04-tutorial.md) |
| 5 | Quality & Testing Maturity | Planned | `sprint-05-quality-testing.md` (not in repo) | [tutorial](../tutorial/sprint-05-tutorial.md) |
| 6 | Observability, Security & Analytics | Planned | `sprint-06-observability-security.md` (not in repo) | [tutorial](../tutorial/sprint-06-tutorial.md) |
| 7 | SEO, Marketing, i18n Sync, Performance & Accessibility | Planned | `sprint-07-seo-marketing-perf.md` (not in repo) | [tutorial](../tutorial/sprint-07-tutorial.md) |
| 8 | Release Engineering, Documentation, Deployment & Launch | Planned | `sprint-08-release-launch.md` (not in repo) | [tutorial](../tutorial/sprint-08-tutorial.md) |

Sprints 2.3 and 2.6 are infrastructure sprints inserted before Sprint 3. They do not change the application's architecture or the Sprint 3 scope.

## 3. Definition of done

A ticket is done when all of these hold:

- `pnpm check` is green (typecheck, lint, format, knip, env and agent-file checks, unit and component tests).
- New logic has unit tests, new client components have browser-mode tests, new user flows have E2E tests.
- Every acceptance criterion of the ticket is verified, not assumed.
- User-facing strings exist in both `en.json` and `fr.json`.
- Docs are updated: the relevant guide, an ADR for any architectural decision, and `06-project-state.md` at the end of the sprint.
- The PR is reviewed, CI is green, and it is merged into `main` with conventional commits.
- Nothing from the "Ask first" list in `AGENTS.md` happened without explicit approval.

## 4. Backlog file format (Sprint 2.3 onward)

- File name: `sprint-<NN[.N]>-<slug>.md`. Ticket IDs: `S<sprint>-T<nn>` (for example `S2.3-T01`).
- Each sprint file has: goal, inspection summary, dependency graph and execution order, risks and prerequisites, decisions needing approval, then one section per ticket.
- Each ticket has: priority (P0 essential, P1 important, P2 optional), estimated effort, dependencies, objective, user story where it fits, implementation tasks as checkboxes, test requirements, measurable acceptance criteria, and a ticket-level definition of done.
- Branch names: `<type>/s<sprint>-t<nn>-<slug>` (for example `ci/s2.3-t03-azure-pipelines-ci`).
