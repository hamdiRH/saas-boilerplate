```bash
pnpm knip
```

Typical first-run findings and the right fix:

| Finding | Fix |
| --- | --- |
| Unused dependency (e.g. a leftover scaffold package) | `pnpm remove <pkg>` |
| Unused devDependency that **is** used by config | add to `ignoreDependencies` **with a comment** |
| Unused file | delete it |
| Unused export in non-UI code | delete the export or its code |

Record any recurring false positives in `docs/guides/knip.md`: 📄 **Create `docs/guides/knip.md`:**

```markdown
# Knip notes

Run: `pnpm knip`

## Known false positives

| Item                   | Why it's ignored                              |
| ---------------------- | --------------------------------------------- |
| `tw-animate-css`       | Imported from CSS, invisible to Knip          |
| `src/components/ui/**` | shadcn primitives export more than we consume |
```
