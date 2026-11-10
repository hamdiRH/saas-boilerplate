# Contributing

## Workflow

1. One ticket = one branch (`feat/…`, `chore/…`, `docs/…`, `ci/…`).
2. Run `pnpm check` before opening a PR.
3. Squash/merge only when CI is green.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by Commitlint.

Format: `type(scope): subject` — e.g. `feat(auth): add magic link sign-in`.

Use `pnpm commit` for an interactive prompt.
