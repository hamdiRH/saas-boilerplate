# Working with AI coding agents

`AGENTS.md` is the single source of truth. Other files only point to it:

| Tool            | File                              |
| --------------- | --------------------------------- |
| Claude Code     | `CLAUDE.md` (+ `.claude/`)        |
| Codex, OpenCode | `AGENTS.md`                       |
| Cursor          | `.cursor/rules/project.mdc`       |
| GitHub Copilot  | `.github/copilot-instructions.md` |

After changing commands or conventions, update `AGENTS.md` and run `pnpm check:agents`.
