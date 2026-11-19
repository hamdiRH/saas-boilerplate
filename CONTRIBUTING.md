# Contributing

## Workflow

1. One ticket = one branch (`feat/…`, `chore/…`, `docs/…`, `ci/…`).
2. Run `pnpm check` before opening a PR.
3. Squash/merge only when CI is green.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by Commitlint.

Format: `type(scope): subject` — e.g. `feat(auth): add magic link sign-in`.

Use `pnpm commit` for an interactive prompt.

## Linking work items

- Put `AB#<id>` in the PR description (and optionally the PR title).
- Put `AB#<id>` in a commit body or footer, never in the header, so commitlint is unaffected.
- `Fixes AB#<id>` in a PR description moves the work item when the PR merges.
- Linking is optional: an unlinked PR still merges normally. EOF echo '- [ ] Linked work item (optional): `AB#<id>`' >> .github/pull_request_template.md
