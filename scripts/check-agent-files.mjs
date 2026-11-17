// scripts/check-agent-files.mjs
// Ensures agent instruction files exist and that every `pnpm <script>` mentioned
// in AGENTS.md really exists in package.json.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const REQUIRED = [
  'AGENTS.md',
  'CLAUDE.md',
  '.claude/settings.json',
  '.cursor/rules/project.mdc',
  '.github/copilot-instructions.md',
];

const PNPM_BUILTINS = new Set([
  'install',
  'add',
  'remove',
  'dlx',
  'exec',
  'run',
  'i',
  'create',
  'approve-builds',
  'update',
  'up',
  'list',
]);

let failed = false;

for (const file of REQUIRED) {
  if (!existsSync(file)) {
    console.error(`❌ Missing ${file}`);
    failed = true;
  }
}

const scripts = JSON.parse(readFileSync('package.json', 'utf-8')).scripts ?? {};
const agents = readFileSync('AGENTS.md', 'utf-8');

for (const match of agents.matchAll(/`pnpm (?<name>[a-z][a-z0-9:-]*)/gu)) {
  const { name } = match.groups;
  if (!PNPM_BUILTINS.has(name) && !(name in scripts)) {
    console.error(`❌ AGENTS.md mentions "pnpm ${name}" but package.json has no such script`);
    failed = true;
  }
}

// Case-sensitive existence check. fs.existsSync is case-insensitive on Windows/macOS, which is how
// `src/libs/Env.ts` once survived in the docs while the real file is `env.ts` (breaks on Linux CI).
const existsExact = (path) => {
  let current = '.';
  for (const part of path.split('/')) {
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return false;
    }
    if (!entries.includes(part)) {
      return false;
    }
    current = `${current}/${part}`;
  }
  return true;
};

const candidates = (reference) => {
  if (reference.startsWith('@/')) {
    const base = `src/${reference.slice(2)}`;
    return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base];
  }
  return [reference];
};

// Backticked file references: `src/…/file.ext`, `scripts/…`, `docs/…` and `@/…` import specifiers.
const FILE_REFERENCE =
  /`(?<ref>(?:(?:src|scripts|docs)\/[\w./-]+\.(?:tsx?|mjs|md|json|mdc)|@\/[\w./-]+))`/gu;

for (const match of agents.matchAll(FILE_REFERENCE)) {
  const { ref } = match.groups;
  if (!candidates(ref).some((candidate) => existsExact(candidate))) {
    console.error(`❌ AGENTS.md references "${ref}" but no such file exists (check the casing)`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log('✅ Agent instruction files are consistent.');
