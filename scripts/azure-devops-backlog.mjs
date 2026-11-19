#!/usr/bin/env node
/**
 * Azure DevOps backlog sync: sprints 0 to 8 (+ 2.3 and 2.6), team settings, Features, PBIs and Tasks.
 *
 * What it does (idempotent: re-running skips what exists and only fills the gaps):
 *   1. creates the areas and the sprint iterations (with dates) from scripts/azure-devops-backlog.json
 *   2. fixes the TEAM settings that make Boards / Backlogs / Sprints show your items:
 *      backlog iteration, area path (+ sub-areas), Epic/Feature/PBI levels, and the sprints selected for the team
 *   3. creates Epic -> Feature (one per sprint) -> PBI (one per ticket) -> Task (one per tutorial step)
 *      with priority (P0/P1/P2), effort (story points), acceptance criteria and links
 *   4. marks everything in the completed sprints (0, 1, 2) as Done
 *
 * Usage:   node scripts/azure-devops-backlog.mjs
 * Options: --org=<name> --project=<name> --team=<name>
 *          --dry-run          read only: show what would be created, change nothing
 *          --tasks=steps|none one Task per tutorial step (default) or PBIs only
 *          --only=3,4         only these sprints (names or numbers)
 *          --yes              do not ask for confirmation
 *          --data=<file>      another backlog file (default: azure-devops-backlog.json next to this script)
 *
 * Needs Node 20+ and a PAT. No dependency. The PAT is read from AZURE_DEVOPS_EXT_PAT or typed (hidden),
 * is only sent to dev.azure.com, and is never written anywhere.
 * PAT scopes: Work Items = Read, write & manage; Project and Team = Read.
 * You must also be Project Administrator (areas/iterations) and a team admin (team settings).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * @typedef {'P0' | 'P1' | 'P2'} Priority
 * @typedef {'done' | 'planned'} SprintStatus
 * @typedef {{ name: string, start: string, finish: string, status: SprintStatus, feature: string }} Sprint
 * @typedef {{
 *   id: string, sprint: string, featureSprint: string, title: string, story: string, sp: number,
 *   priority: Priority, area: string, branch: string, commit: string, source: string,
 *   criteria: string[], tasks: string[], tags: string[]
 * }} BacklogItem
 * @typedef {{ epic: string, areas: string[], sprints: Sprint[], pbis: BacklogItem[] }} BacklogData
 * @typedef {{
 *   'System.Id'?: number,
 *   'System.Title'?: string,
 *   'System.WorkItemType'?: string,
 *   'System.State'?: string
 * }} WorkItemFields
 * @typedef {{ id?: string | number, name?: string, fields?: WorkItemFields }} ApiValue
 * @typedef {{
 *   startDate?: string,
 *   finishDate?: string
 * }} IterationAttributes
 * @typedef {{ name: string, identifier?: string, children?: ClassificationNode[], attributes?: IterationAttributes }} ClassificationNode
 * @typedef {{
 *   id?: string | number,
 *   identifier?: string,
 *   message?: string,
 *   children?: ClassificationNode[],
 *   workItems?: { id: number }[],
 *   value?: ApiValue[]
 * }} ApiData
 * @typedef {{ id: number, state: string }} WorkItemEntry
 * @typedef {{
 *   epicOrFeature: Map<string, WorkItemEntry>,
 *   pbi: Map<string, WorkItemEntry>,
 *   task: Map<string, WorkItemEntry>
 * }} WorkItemIndex
 */

const HERE = import.meta.dirname;
const cliArgs = process.argv.slice(2);
/** @param {string} name CLI flag name to check. */
const flag = (name) => cliArgs.includes(`--${name}`);
/** @param {string} name CLI option name to read. */
const option = (name) => {
  const hit = cliArgs.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const DRY_RUN = flag('dry-run');
const TASK_MODE = option('tasks') ?? 'steps';
const API_BASE = process.env.AZDO_BASE_URL ?? 'https://dev.azure.com';
const DATA_FILE = path.resolve(HERE, option('data') ?? 'azure-devops-backlog.json');
const ONLY = option('only')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => (s.toLowerCase().startsWith('sprint') ? s : `Sprint ${s}`));

// ---------------------------------------------------------------------------
// Console helpers
// ---------------------------------------------------------------------------
/** @param {string} code ANSI color code. @param {string} text Text to colorize. */
const paint = (code, text) => `\u001B[${code}m${text}\u001B[0m`;
/** @param {string} t Text to bold. */
const bold = (t) => paint('1', t);
/** @param {string} t Text to color green. */
const green = (t) => paint('32', t);
/** @param {string} t Text to color yellow. */
const yellow = (t) => paint('33', t);
/** @param {string} t Text to color red. */
const red = (t) => paint('31', t);
/** @param {string} t Text to dim. */
const dim = (t) => paint('2', t);

let muted = false;
const output = new Writable({
  // Node's Writable interface is callback-based, so this method must use its callback contract.
  // eslint-disable-next-line promise/prefer-await-to-callbacks
  write(chunk, encoding, callback) {
    if (!muted) {
      process.stdout.write(chunk, encoding);
    }
    // Node's Writable contract requires invoking this callback.
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    callback();
  },
});
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});

/** @param {string} question Prompt text. @param {string} [fallback] Default answer. */
async function ask(question, fallback = '') {
  const suffix = fallback ? dim(` [${fallback}]`) : '';
  const response = await rl.question(`  ? ${question}${suffix}: `);
  const answer = response.trim();
  return answer || fallback;
}

/** @param {string} question Prompt text. */
async function askSecret(question) {
  process.stdout.write(`  ? ${question}: `);
  muted = true;
  try {
    const response = await rl.question('');
    return response.trim();
  } finally {
    muted = false;
    process.stdout.write('\n');
  }
}

/** @param {string} question Confirmation prompt. @param {boolean} [defaultYes] Default choice. */
async function confirm(question, defaultYes = true) {
  const response = await rl.question(`  ? ${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `);
  const answer = response.trim().toLowerCase();
  return answer === '' ? defaultYes : answer.startsWith('y');
}

/** @param {number} n Step number. @param {string} title Step title. */
const step = (n, title) => console.log(`\n${bold(`━━ ${n}. ${title}`)}`);
/** @param {string} msg Success message. */
const ok = (msg) => console.log(`  ${green('✔')} ${msg}`);
/** @param {string} msg Skip message. */
const skip = (msg) => console.log(`  ${dim('•')} ${dim(msg)}`);
/** @param {string} msg Warning message. */
const warn = (msg) => console.log(`  ${yellow('⚠')} ${msg}`);
/** @param {string} msg Failure message. */
const fail = (msg) => console.log(`  ${red('✖')} ${msg}`);

// ---------------------------------------------------------------------------
// REST client
// ---------------------------------------------------------------------------
const state = { org: '', orgUrl: '', project: '', team: '', auth: '' };
const stats = { created: 0, updated: 0, existing: 0, failed: 0 };
/** @type {string[]} */
const failures = [];
let fakeId = 0;

const enc = encodeURIComponent;
const projectPath = () => enc(state.project);
const teamPath = () => `${projectPath()}/${enc(state.team)}`;

/**
 * Run a team configuration request and report actionable failures.
 * @param {string} label Description of the update.
 * @param {() => Promise<unknown>} fn Request to perform.
 */
async function attemptTeamUpdate(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warn(`${label}: ${message}. Set it in Project settings → Team configuration.`);
  }
}

class ApiError extends Error {
  /** @param {string} message Error message. @param {number} status HTTP status. */
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Retry transient Azure DevOps responses without issuing overlapping requests.
 * @param {string} url Request URL.
 * @param {RequestInit} request Request options.
 * @returns {Promise<Response>} Response after the retry policy completes.
 */
async function fetchWithRetry(url, request) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- Retry only after the previous response is known.
    const response = await fetch(url, request);
    if (!((response.status === 429 || response.status >= 502) && attempt < 6)) {
      return response;
    }
    const wait = Number(response.headers.get('retry-after')) || attempt * 2;
    // eslint-disable-next-line no-await-in-loop -- Backoff is required before the next retry.
    await sleep(wait * 1000);
  }
  throw new Error('Azure DevOps request retry limit reached.');
}

/**
 * @param {string} method HTTP method.
 * @param {string} requestPath Azure DevOps API path.
 * @param {{ body?: unknown, patch?: boolean, allow?: number[] }} [options] Request options.
 * @returns {Promise<{ status: number, data: ApiData | null }>} Response status and parsed data.
 */
async function api(method, requestPath, { body, patch = false, allow = [] } = {}) {
  const url = `${state.orgUrl}/${requestPath}${requestPath.includes('?') ? '&' : '?'}api-version=7.1`;
  const response = await fetchWithRetry(url, {
    method,
    headers: {
      Authorization: state.auth,
      Accept: 'application/json',
      'Content-Type': patch ? 'application/json-patch+json' : 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const isHtml = (response.headers.get('content-type') ?? '').includes('text/html');
  if (response.status === 401 || response.status === 203 || isHtml) {
    throw new ApiError(
      'Azure DevOps rejected the token (check the PAT, its scopes and the organization name).',
      401,
    );
  }
  /** @type {ApiData | null} */
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok && !allow.includes(response.status)) {
    throw new ApiError(
      `${method} ${requestPath.split('?')[0]} → ${response.status} ${data?.message ?? text.slice(0, 160)}`,
      response.status,
    );
  }
  return { status: response.status, data };
}

/** @param {Record<string, unknown>} fields Work item fields to add. */
const fieldOps = (fields) =>
  Object.entries(fields).map(([key, value]) => ({ op: 'add', path: `/fields/${key}`, value }));
/** @type {Record<Priority, number>} */
const priorityNumber = { P0: 1, P1: 2, P2: 3 };
/** @param {string} text Text to escape for Azure DevOps HTML fields. */
const esc = (text) =>
  String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
/** @returns {BacklogData} Parsed sprint and backlog configuration. */
function loadData() {
  /** @type {BacklogData} */
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  const known = new Set(data.sprints.map((s) => s.name));
  for (const name of ONLY ?? []) {
    if (!known.has(name)) {
      fail(`Unknown sprint "${name}". Known: ${[...known].join(', ')}`);
      process.exit(1);
    }
  }
  return data;
}

async function collectInputs() {
  step(1, 'Your values');
  state.org =
    (option('org') ?? (await ask('Azure DevOps organization name')))
      .split('/')
      .toReversed()
      .find((segment) => segment.length > 0) ?? '';
  state.project = option('project') ?? (await ask('Project name', 'Next Boilerplate'));
  state.team = option('team') ?? (await ask('Team name', `${state.project} Team`));
  if (!state.org) {
    fail('An organization name is required.');
    process.exit(1);
  }
  state.orgUrl = `${API_BASE}/${enc(state.org)}`;
  const pat =
    process.env.AZURE_DEVOPS_EXT_PAT ||
    (await askSecret('Personal Access Token (hidden; or set AZURE_DEVOPS_EXT_PAT)'));
  if (!pat) {
    fail('A PAT is required (Work Items: Read, write & manage · Project and Team: Read).');
    process.exit(1);
  }
  state.auth = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;

  const { data } = await api('GET', `_apis/projects/${projectPath()}`, { allow: [404] });
  if (!data?.id) {
    fail(`Project "${state.project}" not found in ${state.orgUrl}.`);
    process.exit(1);
  }
  ok(
    `Connected to ${state.org} / ${state.project}${DRY_RUN ? dim('  (dry run: nothing will be changed)') : ''}`,
  );
}

/** @param {BacklogData} data Backlog configuration to check against existing areas. */
async function ensureAreas(data) {
  step(2, 'Areas');
  const { data: root } = await api(
    'GET',
    `${projectPath()}/_apis/wit/classificationnodes/areas?$depth=3`,
  );
  const have = new Set((root?.children ?? []).map((n) => n.name));
  for (const name of data.areas) {
    if (have.has(name)) {
      skip(`${name} already exists`);
    } else if (DRY_RUN) {
      ok(`would create area ${name}`);
    } else {
      // eslint-disable-next-line no-await-in-loop -- Keep area creation serial to avoid bursts against the API.
      await api('POST', `${projectPath()}/_apis/wit/classificationnodes/areas`, {
        body: { name },
        allow: [409],
      });
      ok(`${name} created`);
    }
  }
}

/** Returns Map(sprint name -> iteration identifier) and the root node. */
/** @param {BacklogData} data Sprint and iteration configuration to synchronize. */
async function ensureIterations(data) {
  step(3, 'Sprints (iterations and dates)');
  const iterationPath = `${projectPath()}/_apis/wit/classificationnodes/iterations`;
  const { data: root } = await api('GET', `${iterationPath}?$depth=3`);
  const byName = new Map((root?.children ?? []).map((n) => [n.name, n]));
  /** @type {Map<string, string>} */
  const identifiers = new Map();
  for (const sprint of data.sprints) {
    const attributes = {
      startDate: `${sprint.start}T00:00:00Z`,
      finishDate: `${sprint.finish}T00:00:00Z`,
    };
    const existing = byName.get(sprint.name);
    if (!existing) {
      if (DRY_RUN) {
        ok(`would create ${sprint.name} (${sprint.start} → ${sprint.finish})`);
        identifiers.set(sprint.name, `dry-${sprint.name}`);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop -- Later iterations depend on the result of each request.
      const created = await api('POST', iterationPath, { body: { name: sprint.name, attributes } });
      const identifier = created.data?.identifier;
      if (typeof identifier !== 'string') {
        throw new TypeError(
          `Azure DevOps did not return an iteration identifier for ${sprint.name}.`,
        );
      }
      identifiers.set(sprint.name, identifier);
      ok(`${sprint.name} created (${sprint.start} → ${sprint.finish})`);
      continue;
    }
    if (!existing.identifier) {
      throw new TypeError(`Azure DevOps did not return an identifier for ${sprint.name}.`);
    }
    identifiers.set(sprint.name, existing.identifier);
    const sameDates =
      existing.attributes?.startDate?.slice(0, 10) === sprint.start &&
      existing.attributes?.finishDate?.slice(0, 10) === sprint.finish;
    if (sameDates) {
      skip(`${sprint.name} already set (${sprint.start} → ${sprint.finish})`);
    } else if (DRY_RUN) {
      ok(`would set dates of ${sprint.name} (${sprint.start} → ${sprint.finish})`);
    } else {
      // eslint-disable-next-line no-await-in-loop -- Keep iteration updates serial and rate-limit friendly.
      await api('PATCH', `${iterationPath}/${enc(sprint.name)}`, {
        body: { name: sprint.name, attributes },
      });
      ok(`${sprint.name} dates set (${sprint.start} → ${sprint.finish})`);
    }
  }
  const rootIdentifier = root?.identifier;
  if (!rootIdentifier) {
    throw new Error('Azure DevOps did not return the root iteration identifier.');
  }
  return { identifiers, rootIdentifier };
}

/**
 * @param {Map<string, string>} identifiers Sprint names and iteration identifiers.
 * @param {string} rootIdentifier Root iteration identifier.
 */
async function configureTeam(identifiers, rootIdentifier) {
  step(4, `Team settings for "${state.team}" (this is what fills Boards, Backlogs and Sprints)`);
  const base = `${teamPath()}/_apis/work/teamsettings`;
  const check = await api('GET', base, { allow: [404] });
  if (check.status === 404) {
    const teams = await api('GET', `_apis/projects/${projectPath()}/teams`);
    fail(
      `Team "${state.team}" not found. Teams: ${(teams.data?.value ?? []).map((t) => t.name).join(', ')}`,
    );
    process.exit(1);
  }
  if (DRY_RUN) {
    ok(
      'would set backlog iteration, area path (with sub-areas), backlog levels, and select the sprints',
    );
    return;
  }
  await attemptTeamUpdate('Backlog iteration = project root, current sprint as default', () =>
    api('PATCH', base, {
      body: {
        backlogIteration: rootIdentifier,
        defaultIterationMacro: '@currentIteration',
        backlogVisibilities: {
          'Microsoft.EpicCategory': true,
          'Microsoft.FeatureCategory': true,
          'Microsoft.RequirementCategory': true,
        },
      },
    }),
  );
  await attemptTeamUpdate(`Team area = "${state.project}" including sub-areas`, () =>
    api('PATCH', `${base}/teamfieldvalues`, {
      body: {
        defaultValue: state.project,
        values: [{ value: state.project, includeChildren: true }],
      },
    }),
  );
  const selected = await api('GET', `${base}/iterations`);
  const already = new Set((selected.data?.value ?? []).map((i) => i.id));
  for (const [name, id] of identifiers) {
    if (already.has(id)) {
      skip(`${name} already selected for the team`);
    } else {
      // eslint-disable-next-line no-await-in-loop -- Team iteration selections are applied in sequence.
      await attemptTeamUpdate(`${name} selected for the team`, () =>
        api('POST', `${base}/iterations`, { body: { id }, allow: [409] }),
      );
    }
  }
}

async function loadExistingItems() {
  const wiql = await api('POST', `${projectPath()}/_apis/wit/wiql`, {
    body: {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] <> 'Removed'`,
    },
  });
  const ids = (wiql.data?.workItems ?? []).map((w) => w.id);
  /** @type {ApiValue[]} */
  const items = [];
  for (let i = 0; i < ids.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop -- Keep batches ordered and avoid concurrent API bursts.
    const batch = await api('POST', '_apis/wit/workitemsbatch', {
      body: {
        ids: ids.slice(i, i + 200),
        fields: ['System.Id', 'System.Title', 'System.WorkItemType', 'System.State'],
      },
    });
    items.push(...(batch.data?.value ?? []));
  }
  /** @type {WorkItemIndex} */
  const index = {
    epicOrFeature: new Map(),
    pbi: new Map(),
    task: new Map(),
  };
  for (const item of items) {
    if (!item.fields || typeof item.id !== 'number') {
      continue;
    }
    const {
      'System.Title': title,
      'System.WorkItemType': type,
      'System.State': itemState,
    } = item.fields;
    if (typeof title !== 'string' || typeof type !== 'string' || typeof itemState !== 'string') {
      continue;
    }
    const entry = { id: item.id, state: itemState };
    if (type === 'Epic' || type === 'Feature') {
      index.epicOrFeature.set(`${type}|${title}`, entry);
    } else if (type === 'Product Backlog Item') {
      const ticketId = title.match(/^(?<ticket>S[\d.]+-T\d+)\s/u)?.groups?.ticket;
      if (ticketId) {
        index.pbi.set(ticketId, entry);
      }
    } else if (type === 'Task') {
      index.task.set(title, entry);
    }
  }
  return index;
}

/**
 * @param {string} type Azure DevOps work item type.
 * @param {Record<string, unknown>} fields Work item fields to create.
 * @param {number | undefined} parentId Parent work item identifier, if any.
 * @returns {Promise<number>} Created work item identifier.
 */
async function createItem(type, fields, parentId) {
  if (DRY_RUN) {
    fakeId -= 1;
    return fakeId;
  }
  const ops = fieldOps(fields);
  if (parentId && parentId > 0) {
    ops.push({
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'System.LinkTypes.Hierarchy-Reverse',
        url: `${state.orgUrl}/${projectPath()}/_apis/wit/workItems/${parentId}`,
      },
    });
  }
  const { data } = await api(
    'POST',
    `${projectPath()}/_apis/wit/workitems/$${enc(type)}?suppressNotifications=true`,
    { body: ops, patch: true },
  );
  if (typeof data?.id !== 'number') {
    throw new TypeError(`Azure DevOps did not return the created work item ID for ${type}.`);
  }
  return data.id;
}

/**
 * @param {number} id Work item identifier.
 * @param {Record<string, unknown>} fields Fields to update.
 */
async function patchItem(id, fields) {
  if (DRY_RUN || id < 0) {
    return;
  }
  await api('PATCH', `_apis/wit/workitems/${id}?suppressNotifications=true`, {
    body: fieldOps(fields),
    patch: true,
  });
}

/**
 * @template T
 * @param {string} label Work item label used in error output.
 * @param {() => Promise<T>} fn Operation to guard.
 * @returns {Promise<T | null>} Operation result, or null if the operation failed.
 */
async function guarded(label, fn) {
  try {
    return await fn();
  } catch (error) {
    stats.failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${label}: ${message}`);
    fail(`${label}: ${message}`);
    return null;
  }
}

/**
 * @param {WorkItemIndex} index Existing work item index.
 * @param {'Epic' | 'Feature'} type Work item type to create.
 * @param {string} title Work item title.
 * @param {Record<string, unknown>} fields Additional fields to set.
 * @param {number | undefined} parentId Parent work item identifier, if any.
 * @returns {Promise<WorkItemEntry | null>} Existing or created work item.
 */
async function ensureEpicOrFeature(index, type, title, fields, parentId) {
  const found = index.epicOrFeature.get(`${type}|${title}`);
  if (found) {
    stats.existing += 1;
    skip(`${type} #${found.id} already exists: ${title}`);
    return found;
  }
  const id = await guarded(`${type} "${title}"`, () =>
    createItem(type, { 'System.Title': title, ...fields }, parentId),
  );
  if (id === null) {
    return null;
  }
  stats.created += 1;
  ok(`${type} ${DRY_RUN ? '(dry run)' : `#${id}`} created: ${title}`);
  const entry = { id, state: 'New' };
  index.epicOrFeature.set(`${type}|${title}`, entry);
  return entry;
}

/**
 * @param {BacklogData} data Backlog configuration.
 * @param {WorkItemIndex} index Existing work items.
 */
function plan(data, index) {
  const sprints = data.sprints.filter((s) => !ONLY || ONLY.includes(s.name));
  const names = new Set(sprints.map((s) => s.name));
  const pbis = data.pbis.filter((p) => names.has(p.featureSprint));
  let newPbis = 0;
  let newTasks = 0;
  for (const pbi of pbis) {
    if (!index.pbi.has(pbi.id)) {
      newPbis += 1;
    }
    if (TASK_MODE === 'steps') {
      const titles = taskTitles(pbi);
      newTasks += titles.filter((t) => !index.task.has(t)).length;
    }
  }
  return { sprints, pbis, newPbis, newTasks };
}

/** @param {BacklogItem} pbi Backlog item whose task titles are generated. */
const taskTitles = (pbi) => [
  ...pbi.tasks.map((t, i) => `${pbi.id} · ${i + 1}. ${t}`),
  `${pbi.id} · Verify and ship (PR merged)`,
];

/**
 * @param {BacklogData} data Backlog configuration to synchronize.
 * @param {WorkItemIndex} index Existing work items.
 */
async function syncBacklog(data, index) {
  step(5, 'Epic, Features, PBIs and Tasks');
  const { sprints, pbis, newPbis, newTasks } = plan(data, index);
  console.log(
    `  Plan: ${newPbis} new PBIs, ${newTasks} new Tasks, ${pbis.length - newPbis} PBIs already there (priority, effort and tags get refreshed).`,
  );
  if (!DRY_RUN && !flag('yes') && !(await confirm('Create them now?'))) {
    console.log('  Stopped. Nothing created.');
    return;
  }

  const epic = await ensureEpicOrFeature(index, 'Epic', data.epic, {}, undefined);

  for (const sprint of sprints) {
    console.log(
      `\n  ${bold(sprint.name)} ${dim(`(${sprint.start} → ${sprint.finish}, ${sprint.status})`)}`,
    );
    const isDone = sprint.status === 'done';
    // eslint-disable-next-line no-await-in-loop -- Feature creation must precede its PBIs.
    const feature = await ensureEpicOrFeature(
      index,
      'Feature',
      sprint.feature,
      {
        'System.IterationPath': `${state.project}\\${sprint.name}`,
        'System.AreaPath': state.project,
      },
      epic?.id,
    );
    if (!feature) {
      continue;
    }

    for (const pbi of pbis.filter((p) => p.featureSprint === sprint.name)) {
      // eslint-disable-next-line no-await-in-loop -- PBI and task creation is dependency-ordered.
      await guarded(pbi.id, async () => {
        const iteration = pbi.sprint ? `${state.project}\\${pbi.sprint}` : state.project;
        const refresh = {
          'Microsoft.VSTS.Common.Priority': priorityNumber[pbi.priority] ?? 2,
          'System.Tags': [...pbi.tags, ...(pbi.story ? [pbi.story] : [])].join('; '),
          ...(pbi.sp ? { 'Microsoft.VSTS.Scheduling.Effort': pbi.sp } : {}),
        };
        let entry = index.pbi.get(pbi.id);
        if (entry) {
          stats.existing += 1;
          // eslint-disable-next-line no-await-in-loop -- Refresh each existing work item before moving on.
          await patchItem(entry.id, refresh);
        } else {
          const criteria = `<ul>${pbi.criteria.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
          const description = `<p><b>Ticket:</b> ${esc(pbi.id)}${pbi.story ? ` · <b>Story:</b> ${esc(pbi.story)}` : ''}${pbi.sp ? ` · <b>${pbi.sp} SP</b>` : ''}<br>${pbi.branch ? `<b>Branch:</b> ${esc(pbi.branch)}<br>` : ''}${pbi.commit ? `<b>Commit:</b> ${esc(pbi.commit)}<br>` : ''}<b>Tutorial:</b> ${esc(pbi.source)}</p>`;
          // eslint-disable-next-line no-await-in-loop -- Create the PBI before creating its child tasks.
          const id = await createItem(
            'Product Backlog Item',
            {
              'System.Title': `${pbi.id} ${pbi.title}`,
              'System.AreaPath': `${state.project}\\${pbi.area}`,
              'System.IterationPath': iteration,
              'System.Description': description,
              'Microsoft.VSTS.Common.AcceptanceCriteria': criteria,
              ...refresh,
            },
            feature.id,
          );
          entry = { id, state: 'New' };
          index.pbi.set(pbi.id, entry);
          stats.created += 1;
        }

        let taskCount = 0;
        if (TASK_MODE === 'steps') {
          for (const title of taskTitles(pbi)) {
            let task = index.task.get(title);
            if (task) {
              stats.existing += 1;
            } else {
              // eslint-disable-next-line no-await-in-loop -- Create child tasks in the configured order.
              const id = await createItem(
                'Task',
                {
                  'System.Title': title,
                  'System.AreaPath': `${state.project}\\${pbi.area}`,
                  'System.IterationPath': iteration,
                },
                entry.id,
              );
              task = { id, state: 'To Do' };
              index.task.set(title, task);
              stats.created += 1;
            }
            taskCount += 1;
            if (isDone && task.state !== 'Done') {
              // eslint-disable-next-line no-await-in-loop -- Mark tasks complete before processing the next one.
              await patchItem(task.id, { 'System.State': 'Done' });
              task.state = 'Done';
            }
          }
        }
        if (isDone && entry.state !== 'Done') {
          // eslint-disable-next-line no-await-in-loop -- Complete the PBI after its tasks are updated.
          await patchItem(entry.id, { 'System.State': 'Done' });
          entry.state = 'Done';
        }
        ok(
          `${pbi.id} ${pbi.priority} ${pbi.title}${taskCount ? dim(` (${taskCount} tasks)`) : ''}${isDone ? dim(' · Done') : ''}`,
        );
      });
    }
    if (isDone && feature.state !== 'Done') {
      // eslint-disable-next-line no-await-in-loop -- Complete the feature after its PBIs are processed.
      await guarded(`${sprint.feature} state`, async () => {
        // eslint-disable-next-line no-await-in-loop -- Feature completion follows child work item updates.
        await patchItem(feature.id, { 'System.State': 'Done' });
        feature.state = 'Done';
      });
    }
  }
}

function summary() {
  const team = enc(state.team);
  const base = `${state.orgUrl}/${projectPath()}`;
  console.log(
    `\n${bold('━━ Done')}  created ${stats.created} · already there ${stats.existing} · failed ${stats.failed}${DRY_RUN ? '  (dry run)' : ''}`,
  );
  if (failures.length > 0) {
    console.log(red('\n  Failures (re-run the script to retry them):'));
    for (const line of failures.slice(0, 20)) {
      console.log(`   - ${line}`);
    }
  }
  console.log(`
  Open:
   Boards:   ${base}/_boards/board/t/${team}/Backlog%20items
   Backlog:  ${base}/_backlogs/backlog/${team}/Backlog%20items
   Sprints:  ${base}/_sprints/taskboard/${team}/${projectPath()}/Sprint%202.3
  If a view is still empty, pick the sprint in the view's top-right selector and hard-refresh (Ctrl+F5).
`);
}

async function main() {
  console.log(bold('\nAzure DevOps backlog sync'));
  console.log(dim('Safe to re-run: existing items are skipped, gaps are filled.'));
  try {
    const data = loadData();
    await collectInputs();
    await ensureAreas(data);
    const { identifiers, rootIdentifier } = await ensureIterations(data);
    await configureTeam(identifiers, rootIdentifier);
    const index = await loadExistingItems();
    await syncBacklog(data, index);
    summary();
  } finally {
    rl.close();
  }
  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(red(`\nStopped: ${error instanceof Error ? error.message : String(error)}`));
  rl.close();
  process.exit(1);
}
