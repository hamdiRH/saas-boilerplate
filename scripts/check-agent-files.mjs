// scripts/check-agent-files.mjs
// Ensures agent instruction files exist and that every `pnpm <script>` mentioned
// in AGENTS.md really exists in package.json.
import { existsSync, readFileSync } from 'node:fs';

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

for (const match of agents.matchAll(/`pnpm (?<name>[a-z][a-z:-]*)/gu)) {
  const { name } = match.groups;
  if (!PNPM_BUILTINS.has(name) && !(name in scripts)) {
    console.error(`❌ AGENTS.md mentions "pnpm ${name}" but package.json has no such script`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log('✅ Agent instruction files are consistent.');
