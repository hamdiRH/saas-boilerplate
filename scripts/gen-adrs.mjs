// scripts/gen-adrs.mjs — one-off: creates ADR stubs 001–012 from the architecture doc.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const TITLES = [
  "PostgreSQL-first; SQLite/MySQL deferred",
  "Better Auth as the authentication framework",
  "proxy.ts is optimistic only; DAL is authoritative",
  "Server Actions for app mutations; Route Handlers for external surface",
  "Tenant scoping via tenantDb helper (RLS evaluated)",
  "Lefthook with lint-staged and Commitlint",
  "Oxlint (Ultracite) and Oxfmt replace ESLint and Prettier",
  "All integrations optional via adapters and env",
  "Playwright snapshot visual regression",
  "Locale routing as-needed with [locale] segment",
  "Semantic Release with Conventional Commits",
  "Resend behind an EmailTransport abstraction",
];

mkdirSync("docs/adr", { recursive: true });
const today = new Date().toISOString().slice(0, 10);

TITLES.forEach((title, index) => {
  const n = String(index + 1).padStart(3, "0");
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const file = `docs/adr/${n}-${slug}.md`;
  if (existsSync(file)) return; // never overwrite
  writeFileSync(
    file,
    `# ADR-${n} — ${title}\n\n- **Status:** accepted\n- **Date:** ${today}\n\n## Context\nSee \`docs/roadmap/02-architecture.md\` §14.\n\n## Decision\n${title}.\n\n## Consequences\n_Fill in details when the related sprint is implemented._\n`,
  );
});

console.log("✅ ADR stubs created in docs/adr");
