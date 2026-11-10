@AGENTS.md

## Claude Code specifics

- Use plan mode for tasks touching more than 3 files.
- Prefer the slash commands in `.claude/commands/`:
  - `/verify` — run the full check suite and report
  - `/sprint` — load the current sprint file and continue
- Verify library APIs against current official docs before using them.
