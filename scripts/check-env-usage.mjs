// scripts/check-env-usage.mjs
// Fails if process.env is read anywhere except the env module and config files.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ALLOWED = new Set(["src/libs/env.ts"]);
const offenders = [];

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (/\.(?:ts|tsx|js|jsx|mjs)$/u.test(full)) {
      const rel = full.split(path.sep).join("/");
      if (
        !ALLOWED.has(rel) &&
        /process\.env/u.test(readFileSync(full, "utf-8"))
      ) {
        offenders.push(rel);
      }
    }
  }
};

walk("src");

if (offenders.length > 0) {
  console.error(
    `❌ process.env used outside src/libs/env.ts:\n  ${offenders.join("\n  ")}`
  );
  process.exit(1);
}
console.log("✅ No stray process.env usage.");
