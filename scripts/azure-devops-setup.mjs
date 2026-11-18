#!/usr/bin/env node
// @ts-nocheck -- CLI JSON and process values are deliberately validated at runtime.
/**
 * Sprint 2.3 / S2.3-T01 — Azure DevOps setup, driven from the terminal.
 *
 * What it does for you (idempotent: safe to re-run, it skips what already exists):
 *   - asks for the organization, project, team and a few names
 *   - pauses with exact instructions for the steps that only exist in the web UI
 *   - signs in to Azure DevOps with a PAT (no `az login`, no Azure subscription needed)
 *   - creates iterations (+ team + optional dates), areas, Epic, Features, PBIs and links them
 *   - creates the two variable groups
 *   - writes docs/guides/azure-devops.md and links it from docs/README.md
 *
 * Usage:   node scripts/azure-devops-setup.mjs
 * Options: --org=<name> --project=<name> --backlog=<file.json> --no-open
 *
 * No dependency: only Node built-ins and the Azure CLI (+ its azure-devops extension).
 * The PAT is typed into `az devops login` itself. This script never sees or stores it.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

const ROOT = path.resolve(import.meta.dirname, '..');
const IS_WIN = process.platform === 'win32';
const cliArgs = process.argv.slice(2);

// ---------------------------------------------------------------------------
// Backlog definition (edit here, or pass --backlog=<file.json> to add more PBIs)
// ---------------------------------------------------------------------------
const SPRINTS = [
  'Sprint 2.3',
  'Sprint 2.6',
  'Sprint 3',
  'Sprint 4',
  'Sprint 5',
  'Sprint 6',
  'Sprint 7',
  'Sprint 8',
];
const AREAS = ['Auth', 'Database', 'CI-CD', 'PWA', 'UI', 'Docs'];

const EPIC_TITLE = 'SaaS Boilerplate';

// ASCII hyphen on purpose: a Windows console can garble an em dash in a command line.
const FEATURES = [
  { sprint: 'Sprint 2.3', title: 'Sprint 2.3 - Azure DevOps Integration' },
  { sprint: 'Sprint 2.6', title: 'Sprint 2.6 - PWA & Service Worker' },
];

/** `feature` is the sprint name of the parent Feature above. */
const PBIS = [
  {
    id: 'S2.3-T01',
    title: 'Azure DevOps organization, project & Scrum configuration',
    feature: 'Sprint 2.3',
    area: 'CI-CD',
    criteria:
      'Project exists, private, Scrum; iterations and areas exist; backlog seeded; only you can edit the cd variable group; parallel-job availability and expected cost written in the guide; no token, tenant ID or secret in git diff',
  },
  {
    id: 'S2.3-T02',
    title: 'GitHub to Azure Boards integration',
    feature: 'Sprint 2.3',
    area: 'CI-CD',
    criteria:
      'PR with AB#id shows under Development on the work item; commit with AB#id in the footer is linked and passes the hooks; merging the PR moves the item as configured; an unlinked PR still merges; no change under .github/workflows',
  },
  {
    id: 'S2.3-T03',
    title: 'Azure Pipelines CI',
    feature: 'Sprint 2.3',
    area: 'CI-CD',
    criteria:
      'A push to main and a PR each start exactly one run; run executes every gate and is green on current main; a type error, a lint error and a failing test each make a run red; log prints Node and pnpm versions equal to .nvmrc and packageManager; second run restores the pnpm cache; ALLOW_LOCAL_SERVICES only in azure-pipelines/ci.yml; .github/workflows untouched and no new dependency; CI durations recorded in the guide',
  },
  {
    id: 'S2.3-T04',
    title: 'Azure Pipelines CD (staging, gated, off by default)',
    feature: 'Sprint 2.3',
    area: 'CI-CD',
    criteria:
      'Ownership matrix in the guide with one deployer per environment; one merge to main creates exactly one staging deployment; a failed migration or failed health check stops the run; approval gate blocks the deploy stage until approved; no secret in logs or repository and no ALLOW_LOCAL_SERVICES in cd.yml; /api/health is 200, unauthenticated, no DB call, no sensitive data; rollback runbook written and rehearsed',
  },
  {
    id: 'S2.3-T05',
    title: 'Azure Repos one-way backup',
    feature: 'Sprint 2.3',
    area: 'CI-CD',
    criteria:
      'A push to GitHub main appears in the backup within 10 minutes with the same SHA; tags are synced and the weekly run syncs all branches; a human push to the backup is rejected; a forced divergence fails the job and leaves backup history untouched; no PAT stored anywhere in GitHub; restore rehearsal worked',
  },
  {
    id: 'S2.3-T06',
    title: 'Documentation and end-to-end validation',
    feature: 'Sprint 2.3',
    area: 'Docs',
    criteria:
      'Scenario completes from a clean checkout with evidence stored; exactly one deployment or one skipped stage for that merge; pnpm check:agents and pnpm check are green; every link in the guide resolves and every path exists with exact casing; a person who has not seen the project can follow the guide',
  },
  // Sprint 2.6 PBIs (T01-T07 and T09): add them here or in a --backlog JSON file, same shape:
  // { id: 'S2.6-T01', title: '...', feature: 'Sprint 2.6', area: 'PWA', criteria: '...' },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const paint = (code, text) => `\u001B[${code}m${text}\u001B[0m`;
const bold = (t) => paint('1', t);
const green = (t) => paint('32', t);
const yellow = (t) => paint('33', t);
const red = (t) => paint('31', t);
const dim = (t) => paint('2', t);

const rl = createInterface({ input: process.stdin, output: process.stdout });

const flag = (name) => cliArgs.includes(`--${name}`);
const option = (name) => {
  const hit = cliArgs.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

async function ask(question, fallback = '') {
  const suffix = fallback ? dim(` [${fallback}]`) : '';
  const response = await rl.question(`  ? ${question}${suffix}: `);
  const answer = response.trim();
  return answer || fallback;
}

async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const response = await rl.question(`  ? ${question} ${hint} `);
  const answer = response.trim().toLowerCase();
  return answer === '' ? defaultYes : answer.startsWith('y');
}

const step = (n, title) => console.log(`\n${bold(`━━ ${n}. ${title}`)}`);
const ok = (msg) => console.log(`  ${green('✔')} ${msg}`);
const skip = (msg) => console.log(`  ${dim('•')} ${dim(msg)}`);
const warn = (msg) => console.log(`  ${yellow('⚠')} ${msg}`);
const fail = (msg) => console.log(`  ${red('✖')} ${msg}`);

function openUrl(url) {
  if (flag('no-open')) {
    return;
  }
  let cmd;
  let cmdArgs;
  if (IS_WIN) {
    cmd = 'cmd';
    cmdArgs = ['/c', 'start', '', url];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    cmdArgs = [url];
  } else {
    cmd = 'xdg-open';
    cmdArgs = [url];
  }
  spawnSync(cmd, cmdArgs, { stdio: 'ignore' });
}

/** Pause for something that can only be done in the Azure DevOps web UI. */
async function manualStep({ title, lines, url }) {
  console.log(`\n  ${yellow('✋ ACTION NEEDED IN AZURE DEVOPS')} — ${bold(title)}`);
  for (const line of lines) {
    console.log(`     • ${line}`);
  }
  if (url) {
    console.log(`     ↳ ${url}`);
    openUrl(url);
  }
  await rl.question(`\n  ⏸  Press Enter when it is done... `);
}

const winQuote = (value) => `"${String(value).replaceAll('"', '\\"')}"`;

/** Run a command without a shell on POSIX; through cmd.exe on Windows (az and pnpm are .cmd files). */
function run(cmd, cmdArgs, { inherit = false } = {}) {
  const options = {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  };
  const result = IS_WIN
    ? spawnSync([cmd, ...cmdArgs.map(winQuote)].join(' '), { ...options, shell: true })
    : spawnSync(cmd, cmdArgs, options);
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

const state = { org: '', orgUrl: '', project: '', team: '' };

/** Azure DevOps CLI call with explicit org/project. Returns { ok, data, error }. */
function ado(commandArgs, { project = true } = {}) {
  const full = [...commandArgs, '--org', state.orgUrl, '--detect', 'false'];
  if (project) {
    full.push('--project', state.project);
  }
  full.push('-o', 'json');
  const result = run('az', full);
  if (!result.ok) {
    const lines = result.stderr
      .trim()
      .split('\n')
      .filter((l) => l && !l.startsWith('WARNING'));
    return { ok: false, data: null, error: lines.at(-1) ?? 'unknown error' };
  }
  let data = null;
  try {
    data = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  } catch {
    data = null;
  }
  return { ok: true, data, error: '' };
}

const alreadyThere = (error) => /already|exist|duplicate/iu.test(error);

function configuredDefault(key) {
  const result = run('az', ['devops', 'configure', '--list']);
  const line = result.stdout.split('\n').find((l) => l.trim().startsWith(`${key} =`));
  return line ? line.split('=').slice(1).join('=').trim() : '';
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
function checkTools() {
  step(0, 'Checking tools');
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    fail(`Node ${process.versions.node} found, Node 20+ is required.`);
    process.exit(1);
  }
  ok(`Node ${process.versions.node}`);

  if (!run('az', ['--version']).ok) {
    fail(
      'Azure CLI not found. Install it (Windows: MSI from https://aka.ms/installazurecliwindows), then re-run.',
    );
    process.exit(1);
  }
  ok('Azure CLI found');

  if (run('az', ['extension', 'show', '--name', 'azure-devops', '-o', 'none']).ok) {
    // Extension is already installed.
  } else {
    const added = run('az', ['extension', 'add', '--name', 'azure-devops', '--yes']);
    if (!added.ok) {
      fail(
        'Could not install the azure-devops extension: run `az extension add --name azure-devops`.',
      );
      process.exit(1);
    }
  }
  ok('azure-devops extension installed');
}

async function collectInputs() {
  step(1, 'Your values');
  const orgInput =
    option('org') ??
    (await ask(
      'Azure DevOps organization name',
      configuredDefault('organization').split('/').pop(),
    ));
  state.org = orgInput.split('/').findLast((segment) => segment.length > 0) ?? '';
  if (!state.org) {
    fail('An organization name is required.');
    process.exit(1);
  }
  state.orgUrl = `https://dev.azure.com/${state.org}`;
  state.project =
    option('project') ??
    (await ask('Project name', configuredDefault('project') || 'Next Boilerplate'));
  state.team = await ask('Default team name', `${state.project} Team`);
  state.groupPrefix = await ask('Variable group prefix', 'saas-boilerplate');
  state.appName = await ask('NEXT_PUBLIC_APP_NAME for CI', 'SaaS Boilerplate');
  state.firstSprint = await ask(
    'Start date of Sprint 2.3 (YYYY-MM-DD, empty = set dates later in the UI)',
    '',
  );
  state.weeks = Number(await ask('Sprint length in weeks', '2')) || 2;
  console.log(`\n  Organization: ${bold(state.orgUrl)}\n  Project:      ${bold(state.project)}`);
  if (!(await confirm('Continue with these values?'))) {
    process.exit(0);
  }
}

async function ensureProject() {
  step(2, 'Organization, project and sign-in');

  if (
    !(await confirm('Do the organization AND the project already exist (private, Scrum)?', false))
  ) {
    // eslint-disable-next-line no-await-in-loop -- Authentication requires sequential prompts.
    await manualStep({
      title: 'Create the organization and the project',
      lines: [
        `Sign in with your Microsoft account and create the organization "${state.org}" (skip if it exists).`,
        `New project → name "${state.project}", visibility Private.`,
        'Advanced → Version control: Git, Work item process: Scrum.',
        'Create.',
      ],
      url: 'https://dev.azure.com',
    });
  }

  // Sign in with a PAT (a personal account without an Azure subscription cannot use `az login`).
  for (;;) {
    if (ado(['devops', 'project', 'list'], { project: false }).ok) {
      ok('Azure DevOps CLI is authenticated');
      break;
    }
    // eslint-disable-next-line no-await-in-loop -- Authentication requires sequential prompts.
    await manualStep({
      title: 'Create a Personal Access Token (PAT)',
      lines: [
        'Top right: User settings → Personal access tokens → + New Token.',
        `Name "cli-setup", Organization "${state.org}", expiration 30-90 days, Custom defined → Show all scopes.`,
        'Tick: Work Items = Read, write & manage · Project and Team = Read · Variable Groups = Read, create & manage · Build = Read & execute · Code = Read & write.',
        'Create, then COPY the token now (shown once). Never commit it.',
        'The next prompt is `az devops login`: paste the token there (nothing is echoed).',
      ],
      url: `${state.orgUrl}/_usersSettings/tokens`,
    });
    run('az', ['devops', 'login', '--organization', state.orgUrl], { inherit: true });
    if (ado(['devops', 'project', 'list'], { project: false }).ok) {
      continue;
    }
    if (
      // eslint-disable-next-line no-await-in-loop -- Confirmation determines whether this retry loop continues.
      !(await confirm(
        'Sign-in still failing (wrong org name, or token without scopes?). Try again?',
      ))
    ) {
      process.exit(1);
    }
  }

  // Check the project exists and is private + Scrum.
  for (;;) {
    const shown = ado(['devops', 'project', 'show']);
    if (shown.ok) {
      const template = shown.data?.capabilities?.processTemplate?.templateName ?? 'unknown';
      const visibility = shown.data?.visibility ?? 'unknown';
      ok(`Project "${state.project}" found (process: ${template}, visibility: ${visibility})`);
      if (template !== 'Scrum' || visibility !== 'private') {
        warn(
          'The tutorial expects Scrum + private. Fix it in Project settings → Overview, or recreate the project.',
        );
        // eslint-disable-next-line no-await-in-loop -- Confirmation determines whether this retry loop continues.
        if (!(await confirm('Continue anyway?', false))) {
          process.exit(1);
        }
      }
      break;
    }
    fail(`Project "${state.project}" not found in ${state.orgUrl}: ${shown.error}`);
    // eslint-disable-next-line no-await-in-loop -- Project setup requires sequential prompts.
    await manualStep({
      title: 'Create the project',
      lines: [`Name exactly "${state.project}", Private, Git, Scrum.`],
      url: `${state.orgUrl}`,
    });
  }

  run('az', [
    'devops',
    'configure',
    '--defaults',
    `organization=${state.orgUrl}`,
    `project=${state.project}`,
  ]);
  ok('CLI defaults saved (organization and project)');
}

async function checkBilling() {
  step(3, 'Parallel jobs and cost (for the guide)');
  await manualStep({
    title: 'Note what Azure DevOps grants you',
    lines: [
      'Organization settings → Billing: note the expected monthly cost (free tier = 0).',
      'Organization settings → Pipelines → Parallel jobs: note the free Microsoft-hosted jobs (private projects).',
      'If it shows 0 hosted jobs, a free grant request form is needed before hosted pipelines can run.',
    ],
    url: `${state.orgUrl}/_settings/buildqueue?_a=concurrentJobs`,
  });
  state.parallel = await ask(
    'Parallel jobs available (e.g. "1 hosted, 1800 min/month" or "0, grant requested")',
    'to fill in',
  );
  state.cost = await ask('Expected monthly cost', 'free tier');
}

function flatten(nodes, out = []) {
  for (const node of nodes ?? []) {
    out.push(node);
    flatten(node.children, out);
  }
  return out;
}

function listNodes(kind) {
  const result = ado(['boards', kind, 'project', 'list', '--depth', '3']);
  if (!result.ok) {
    return [];
  }
  const { data } = result;
  return flatten(Array.isArray(data) ? data : [data]);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function ensureIterations() {
  step(4, 'Iterations');
  const existing = new Set(listNodes('iteration').map((n) => n.name));
  for (const name of SPRINTS) {
    if (existing.has(name)) {
      skip(`${name} already exists`);
      continue;
    }
    const created = ado(['boards', 'iteration', 'project', 'create', '--name', name]);
    if (created.ok || alreadyThere(created.error)) {
      ok(`${name} created`);
    } else {
      fail(`${name}: ${created.error}`);
    }
  }

  const nodes = listNodes('iteration');

  // Optional dates, one block per sprint, back to back.
  if (/^\d{4}-\d{2}-\d{2}$/u.test(state.firstSprint)) {
    for (const [index, name] of SPRINTS.entries()) {
      const node = nodes.find((n) => n.name === name);
      if (!node?.path) {
        continue;
      }
      const start = addDays(state.firstSprint, index * state.weeks * 7);
      const finish = addDays(start, state.weeks * 7 - 1);
      const updated = ado([
        'boards',
        'iteration',
        'project',
        'update',
        '--path',
        node.path,
        '--start-date',
        start,
        '--finish-date',
        finish,
      ]);
      if (updated.ok) {
        ok(`${name}: ${start} → ${finish}`);
      } else {
        warn(
          `${name}: dates not set (${updated.error}). Set them in Project settings → Iterations.`,
        );
      }
    }
  }

  // Add the iterations to the team so they show in the team backlog.
  const teams = ado(['devops', 'team', 'list']);
  const teamNames = (teams.data ?? []).map((t) => t.name);
  if (teams.ok && !teamNames.includes(state.team)) {
    warn(`Team "${state.team}" not found. Teams: ${teamNames.join(', ')}`);
    state.team = await ask('Team name to use', teamNames[0] ?? state.team);
  }
  for (const name of SPRINTS) {
    const node = nodes.find((n) => n.name === name);
    if (!node?.identifier) {
      continue;
    }
    const added = ado([
      'boards',
      'iteration',
      'team',
      'add',
      '--id',
      node.identifier,
      '--team',
      state.team,
    ]);
    if (added.ok) {
      ok(`${name} added to team "${state.team}"`);
    } else if (alreadyThere(added.error)) {
      skip(`${name} already in the team`);
    } else {
      warn(
        `${name}: not added to the team (${added.error}). Do it in Team configuration → Iterations.`,
      );
    }
  }
}

function ensureAreas() {
  step(5, 'Areas');
  const existing = new Set(listNodes('area').map((n) => n.name));
  for (const name of AREAS) {
    if (existing.has(name)) {
      skip(`${name} already exists`);
      continue;
    }
    const created = ado(['boards', 'area', 'project', 'create', '--name', name]);
    if (created.ok || alreadyThere(created.error)) {
      ok(`${name} created`);
    } else {
      fail(`${name}: ${created.error}`);
    }
  }
}

const wiqlQuote = (value) => String(value).replaceAll("'", "''");

function findItem(type, title) {
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${wiqlQuote(state.project)}' AND [System.WorkItemType] = '${type}' AND [System.Title] = '${wiqlQuote(title)}'`;
  const result = ado(['boards', 'query', '--wiql', wiql]);
  return result.ok && Array.isArray(result.data) ? (result.data[0]?.id ?? null) : null;
}

const created = [];

function ensureItem({ type, title, iteration, area, criteria }) {
  const found = findItem(type, title);
  if (found) {
    skip(`${type} #${found} already exists: ${title}`);
    created.push({ id: found, type, title });
    return found;
  }
  const itemArgs = ['boards', 'work-item', 'create', '--type', type, '--title', title];
  if (iteration) {
    itemArgs.push('--iteration', `${state.project}\\${iteration}`);
  }
  if (area) {
    itemArgs.push('--area', `${state.project}\\${area}`);
  }
  if (criteria) {
    itemArgs.push('--fields', `Microsoft.VSTS.Common.AcceptanceCriteria=${criteria}`);
  }
  const result = ado(itemArgs);
  if (!result.ok || !result.data?.id) {
    fail(`${type} "${title}": ${result.error}`);
    return null;
  }
  ok(`${type} #${result.data.id} created: ${title}`);
  created.push({ id: result.data.id, type, title });
  return result.data.id;
}

function linkParent(childId, parentId) {
  if (!childId || !parentId) {
    return;
  }
  const result = ado(
    [
      'boards',
      'work-item',
      'relation',
      'add',
      '--id',
      String(childId),
      '--relation-type',
      'parent',
      '--target-id',
      String(parentId),
    ],
    { project: false },
  );
  if (result.ok) {
    ok(`#${childId} linked under #${parentId}`);
  } else if (alreadyThere(result.error)) {
    skip(`#${childId} already linked under #${parentId}`);
  } else {
    warn(`#${childId} → #${parentId}: ${result.error}. Link it in the UI (Add link → Parent).`);
  }
}

function seedBacklog() {
  step(6, 'Backlog (Epic → Features → PBIs)');
  const extra = option('backlog');
  const pbis = [...PBIS];
  if (extra) {
    const file = path.resolve(ROOT, extra);
    if (existsSync(file)) {
      pbis.push(...JSON.parse(readFileSync(file, 'utf-8')));
    } else {
      warn(`--backlog file not found: ${file}`);
    }
  }

  const epicId = ensureItem({ type: 'Epic', title: EPIC_TITLE });
  const featureIds = new Map();
  for (const feature of FEATURES) {
    const id = ensureItem({ type: 'Feature', title: feature.title, iteration: feature.sprint });
    featureIds.set(feature.sprint, id);
    linkParent(id, epicId);
  }
  for (const pbi of pbis) {
    const sprint = pbi.feature;
    const id = ensureItem({
      type: 'Product Backlog Item',
      title: `${pbi.id} ${pbi.title}`,
      iteration: sprint,
      area: pbi.area,
      criteria: pbi.criteria,
    });
    linkParent(id, featureIds.get(sprint));
  }
}

function ensureVariableGroups() {
  step(7, 'Variable groups');
  const groups = [
    {
      name: `${state.groupPrefix}-ci`,
      variables: [
        'NEXT_PUBLIC_APP_URL=http://localhost:3000',
        `NEXT_PUBLIC_APP_NAME=${state.appName}`,
      ],
    },
    // Empty in spirit: real secrets are added in T04. One plain variable is required to create a group.
    { name: `${state.groupPrefix}-cd`, variables: ['DEPLOY_ENABLED=false'] },
  ];
  for (const group of groups) {
    const existing = ado(['pipelines', 'variable-group', 'list', '--group-name', group.name]);
    if (existing.ok && Array.isArray(existing.data) && existing.data.length > 0) {
      skip(`${group.name} already exists`);
      continue;
    }
    const result = ado([
      'pipelines',
      'variable-group',
      'create',
      '--name',
      group.name,
      '--variables',
      ...group.variables,
      '--authorize',
      'true',
    ]);
    if (result.ok) {
      ok(`${group.name} created`);
    } else {
      fail(`${group.name}: ${result.error}`);
      warn(
        'Create it by hand: Pipelines → Library → + Variable group (the PAT may lack the Variable Groups scope).',
      );
    }
  }
}

async function permissions() {
  step(8, 'Permissions and variable-group security');
  await manualStep({
    title: `Lock the "${state.groupPrefix}-cd" variable group`,
    lines: [
      `Open "${state.groupPrefix}-cd" → Security.`,
      'Remove every user and group except yourself, and give only yourself User + Administrator.',
      'Real secrets will be added later in T04 and marked secret (lock icon).',
    ],
    url: `${state.orgUrl}/${encodeURIComponent(state.project)}/_library?itemType=VariableGroups`,
  });
  await manualStep({
    title: 'Check project permissions',
    lines: [
      'Project settings → Permissions: you are the only Project Administrator.',
      'Add viewers as Stakeholder (free) if needed.',
    ],
    url: `${state.orgUrl}/${encodeURIComponent(state.project)}/_settings/permissions`,
  });
}

async function writeGuide() {
  step(9, 'Guide stub');
  const guidePath = path.resolve(ROOT, 'docs/guides/azure-devops.md');
  if (existsSync(guidePath)) {
    skip('docs/guides/azure-devops.md already exists (not overwritten)');
  } else {
    mkdirSync(path.dirname(guidePath), { recursive: true });
    writeFileSync(
      guidePath,
      `# Azure DevOps

> Status: Sprint 2.3 in progress. Completed in S2.3-T06.

## Organization and project

- Organization: \`${state.org}\` · Project: \`${state.project}\` (private, Scrum)
- Parallel jobs available: ${state.parallel}
- Expected monthly cost: ${state.cost}

## Work item mapping

Epic → "${EPIC_TITLE}" · Feature → one per sprint · PBI → one per ticket (\`S2.3-T01 …\`) · Task → checklist group.

## Iterations and areas

Iterations: ${SPRINTS.map((s) => s.replace('Sprint ', '')).join(', ')} (prefixed "Sprint"). Areas: ${AREAS.join(', ')}.
`,
    );
    ok('docs/guides/azure-devops.md written');
  }

  const readmePath = path.resolve(ROOT, 'docs/README.md');
  if (!existsSync(readmePath)) {
    warn('docs/README.md not found: add the link to the guide yourself.');
  } else if (readFileSync(readmePath, 'utf-8').includes('guides/azure-devops.md')) {
    skip('docs/README.md already links the guide');
  } else {
    appendFileSync(readmePath, '\n- [Azure DevOps](guides/azure-devops.md)\n');
    ok('Link added at the end of docs/README.md (move it where you like)');
  }

  if (await confirm('Run `pnpm check:agents` now?')) {
    const result = run('pnpm', ['check:agents'], { inherit: true });
    if (result.ok) {
      ok('pnpm check:agents passed');
    } else {
      warn('pnpm check:agents failed: read its message (usually a missing path in AGENTS.md).');
    }
  }
}

function summary() {
  console.log(`\n${bold('━━ Done')}\n`);
  console.log(bold('  Work items'));
  for (const item of created) {
    console.log(`   #${String(item.id).padEnd(4)} ${item.type.padEnd(21)} ${item.title}`);
  }
  console.log(`
  ${bold('Next')}
   1. Check: ${state.orgUrl}/${encodeURIComponent(state.project)}/_backlogs
   2. Commit the guide (no token, no tenant ID in the diff):
        git add -A
        git commit -m "docs(docs): add Azure DevOps setup guide stub" -m "AB#<id of S2.3-T01 above>"
   3. Tick the T01 "Verify" checklist in the tutorial.
`);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(bold('\nAzure DevOps setup — S2.3-T01'));
  console.log(dim('Safe to re-run: existing items are skipped.'));
  try {
    checkTools();
    await collectInputs();
    await ensureProject();
    await checkBilling();
    await ensureIterations();
    await ensureAreas();
    await seedBacklog();
    await ensureVariableGroups();
    await permissions();
    await writeGuide();
    summary();
  } finally {
    rl.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    red(`\nUnexpected error: ${error instanceof Error ? error.message : String(error)}`),
  );
  rl.close();
  process.exit(1);
}
