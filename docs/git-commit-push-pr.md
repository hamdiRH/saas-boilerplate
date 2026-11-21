# `git-commit-push-pr.mjs` — Guide

One command to go from "I changed files" to "merged PR + Azure ticket Done".

```bash
node scripts/git-commit-push-pr.mjs [options]
```

Add a pnpm shortcut in `package.json`:

```json
"scripts": { "ship": "node scripts/git-commit-push-pr.mjs" }
```

Then: `pnpm ship`, `pnpm ship --base=staging`, `pnpm ship --dry-run`.

---

## 1. Prerequisites (one time)

| What                  | How                                        |
| --------------------- | ------------------------------------------ |
| Node 20+              | `node -v`                                  |
| Git                   | `git --version`                            |
| GitHub CLI, logged in | `gh auth login` then `gh auth status`      |
| `origin` remote       | `git remote -v`                            |
| Azure PAT (optional)  | scope **Work Items: Read, write & manage** |

Set the PAT for the current terminal (Git Bash / Cmder):

```bash
export AZURE_DEVOPS_EXT_PAT="your-pat"
```

To keep it: add that line to `~/.bashrc`. Optional overrides: `AZDO_ORG` (default `uzumaki26`), `AZDO_PROJECT` (default `Next Boilerplate`).

Without the PAT the script still works: it just asks you for the `AB#` number and cannot update the board.

---

## 2. Branch naming (so the ticket is found automatically)

```
<type>/<ticket>-<short-name>
```

Examples: `feat/s2-t05-pwa`, `docs/s2.3-t02-boards-linking`, `fix/s1-t03-login-bug`.

The ticket (`S2.3-T02`) is read from the branch name and looked up in Azure. The script **refuses to run on the default branch** (`main`):

```bash
git switch -c docs/s2.3-t02-boards-linking
```

---

## 3. The 12 steps

| # | Step | What happens |
| --- | --- | --- |
| 1 | Check environment | git, gh, login, remote, branch, unfinished merge/rebase |
| 2 | Choose target branch | asks (default `main`), checks it exists, finds existing PRs |
| 3 | Ticket + commit message | reads Azure ticket, suggests the message |
| 4 | Stage and commit | `git add -A`, secret/large-file guard, commit with `AB#id` footer |
| 5 | Sync with target | merges `origin/<base>` if you are behind, conflict helper |
| 6 | Push | `git push -u origin <branch>` |
| 7 | Create/update PR | title, body (summary, `Fixes AB#id`, acceptance criteria); ticket → Committed |
| 8 | Wait for checks | `gh pr checks --watch` |
| 9 | Verify required checks | the 4 required CI checks must be green |
| 10 | Merge | `gh pr merge --delete-branch` (+ conflict/draft/protection handling) |
| 11 | Back to target | `git switch <base> && git pull --ff-only` |
| 12 | Sync Azure ticket | waits for Azure to set Done (90 s), else sets it itself; closes child tasks |

Any step already done is detected and skipped on re-run.

---

## 4. All flags

| Flag | Meaning | Default |
| --- | --- | --- |
| `--base=<branch>` | PR target branch; no question asked | asked, default = repo default branch |
| `--message="<msg>"` | Commit message; no question asked | asked, suggested from the Azure ticket |
| `--allow-empty` | Permit an empty commit when nothing changed | asked |
| `--draft` | Create the PR as draft (it will offer to mark ready before merging) | off |
| `--no-merge` | Stop after the PR is created/updated (no CI wait, no merge) | off |
| `--merge-method=merge\|squash\|rebase` | How to merge | `merge` |
| `--merge-anyway` | Merge even if required checks are red | off (asks, default no) |
| `--yes` | Never ask; take default answers (risky ones stay "no") | off |
| `--dry-run` | Show what would happen, change nothing | off |
| `--no-azure` | Ignore Azure completely | off |
| `--no-board-update` | Read the ticket but never change its state | off |
| `--ticket=S2.3-T02` | Ticket id when the branch name has none | from branch |
| `--state=done\|committed\|approved\|none` | Word before `AB#id` in the PR: `done` → `Fixes AB#id` (ticket becomes Done), `committed` → `Committed AB#id`, `none` → link only | `done` |
| `--help` | Print help |  |

Environment: `NO_COLOR=1` (no colors), `NO_EMOJI=1`, `FORCE_COLOR=1`.

---

## 5. Scenarios

### 5.1 Normal ticket, everything default

```bash
git switch -c docs/s2.3-t02-boards-linking
# ...edit files...
node scripts/git-commit-push-pr.mjs
```

Press Enter on every question: target `main`, suggested commit message, merge, ticket Done.

### 5.2 Preview first (recommended the first time)

```bash
node scripts/git-commit-push-pr.mjs --dry-run
```

Asks the same questions, changes nothing, prints "(dry run) would: …".

### 5.3 PR to `staging` instead of `main`

```bash
node scripts/git-commit-push-pr.mjs --base=staging
```

or answer `staging` to the first question. The script warns that Azure only reacts to merges into the default branch, so **it sets the ticket state itself** after the merge.

### 5.4 Fully automatic (no questions)

```bash
node scripts/git-commit-push-pr.mjs --yes --base=main --message="feat(ui): add install button"
```

Risky questions (merge with red CI, conflicts, secret files) stay "no" and stop with a clear message.

### 5.5 Open the PR but merge later

```bash
node scripts/git-commit-push-pr.mjs --no-merge
```

Or as a draft: `--draft --no-merge`. Later, run the script again: it reuses the PR, waits for checks and merges.

### 5.6 Squash merge

```bash
node scripts/git-commit-push-pr.mjs --merge-method=squash
```

Keep `Fixes AB#id` in the PR description (it is, automatically) so Azure still moves the ticket.

### 5.7 Nothing to commit

Three cases:

| Situation | Result |
| --- | --- |
| Uncommitted changes | committed normally |
| No changes but commits ahead of the target | those commits are used as they are |
| No changes, no commits ahead | asks "Create an empty commit anyway?" (or `--allow-empty`); if you say no it stops and explains. If the branch was already merged it tells you to start a new branch |

```bash
node scripts/git-commit-push-pr.mjs --allow-empty --message="chore: trigger CI"
```

### 5.8 A PR already exists on this branch

| Existing PR            | Choices offered                                               |
| ---------------------- | ------------------------------------------------------------- |
| Open, same target      | use it · close it and create a new one · abort                |
| Open, different target | keep it (use its target) · retarget it to your choice · abort |
| Closed (not merged)    | create a new PR · reopen it · abort                           |
| Merged                 | informs you, creates a new PR for the new commits             |
| Open but without `AB#` | offers to add the work item to its description                |

### 5.9 Your branch is behind `main` (conflicts)

The script says "Your branch is N commits behind origin/main" (and "it conflicts with it" if so) and offers to merge it. If there are conflicts:

1. It lists the conflicted files.
2. Open them, keep the right code, delete the `<<<<<<<`, `=======`, `>>>>>>>` lines (VS Code: Accept Current / Incoming / Both). You do **not** need `git add`.
3. Back in the terminal choose:
   - `c` continue (it re-checks for leftover markers, stages, commits the merge)
   - `l` list the files again
   - `m` open `git mergetool`
   - `a` abort the merge (nothing is changed on GitHub)

The same helper is used when the push is rejected (someone pushed on your branch) and when GitHub reports a conflict at merge time. With `--yes` conflicts cannot be solved: the script aborts the merge and tells you to run it without `--yes`.

### 5.10 CI checks are red

The script asks "Merge anyway?" (default **no**). If you answer no it stops and keeps the PR open. Fix, push, re-run: the PR is reused.

```bash
node scripts/git-commit-push-pr.mjs --merge-anyway     # skips the question
```

### 5.11 Branch protection blocks the merge

It offers **auto-merge**: GitHub merges by itself when checks and reviews are satisfied. The final banner then says "Auto-merge enabled". The Azure step is skipped (the merge has not happened yet); re-run later or check the board.

### 5.12 Draft PR

Before merging it asks "Mark it ready for review?" and runs `gh pr ready`.

### 5.13 Risky files staged

`.env*`, `*.pem`, `*.key`, SSH keys, `credentials`/`secrets` files, or any file > 5 MB:

- `u` unstage them and commit the rest (default)
- `k` commit them anyway
- `a` abort

### 5.14 Branch name has no ticket

```bash
node scripts/git-commit-push-pr.mjs --ticket=S2.3-T02
```

or type the `AB#` number when asked (Enter to skip). No ticket at all: PR is created without a work item section.

### 5.15 Azure token missing or expired

- No PAT: warning, then asks for the `AB#` number; board not updated.
- Expired/wrong PAT: "Azure DevOps rejected the token" with the fix; run again with `--no-azure` to continue without it.

### 5.16 Update the board manually after the fact

```bash
az boards work-item update --id <id> --state "Done" --detect false
```

### 5.17 Re-run after a failure

Always safe. Read the **Problem / Fix** lines in the final summary, fix, run the same command again. Committed, pushed and PR-created steps are detected and skipped.

---

## 6. Ticket state flow

| Moment | State |
| --- | --- |
| PR opened | `New`/`Approved` → **Committed** (set by the script) |
| PR merged into default branch | **Done** (Azure applies `Fixes AB#id`; script waits up to 90 s, then sets it) |
| After Done | child Tasks set to Done |

Use `--state=committed` to merge without closing the ticket (multi-PR tickets), or `--state=none` to link only.

---

## 7. Errors you may see

| Message | Fix |
| --- | --- |
| You are not logged in to GitHub | `gh auth login` |
| Refusing to create a PR from main | `git switch -c feat/s1-t01-name` |
| The target branch "x" does not exist on origin | pick one from the list shown |
| Not on a branch (detached HEAD) | create a branch |
| A rebase is in progress | `git rebase --continue` or `--abort` |
| A Git hook rejected the commit/push | fix what the hook printed, re-run |
| The commit message was rejected by commitlint | use `type(scope): subject` |
| Push rejected (non-fast-forward) | re-run: it offers to merge origin's commits |
| Branch protection / merge blocked | accept auto-merge, or satisfy the reviews/checks |
| Network problem | check connection/VPN, re-run |
| Needs an answer but terminal input is closed | run in an interactive terminal or use `--yes` + explicit flags |

---

## 8. Quick recipes

```bash
pnpm ship                                         # normal
pnpm ship --dry-run                               # preview
pnpm ship --base=staging                          # PR to staging
pnpm ship --draft --no-merge                      # open a draft, merge later
pnpm ship --yes --message="fix(auth): token"      # no questions
pnpm ship --merge-method=squash                   # squash merge
pnpm ship --no-azure                              # GitHub only
```
