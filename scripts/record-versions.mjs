// scripts/record-versions.mjs — writes docs/adr/013-pinned-versions.md
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const run = (cmd) => execSync(cmd, { encoding: "utf-8" }).trim();
const today = new Date().toISOString().slice(0, 10);

const body = [
  "# ADR-013 — Pinned versions",
  "",
  "- **Status:** accepted",
  `- **Date:** ${today}`,
  "",
  "```text",
  `node ${run("node -v")}`,
  `pnpm ${run("pnpm -v")}`,
  run("pnpm list --depth 0"),
  "```",
  "",
].join("\n");

writeFileSync("docs/adr/013-pinned-versions.md", body);
console.log("✅ docs/adr/013-pinned-versions.md written");
