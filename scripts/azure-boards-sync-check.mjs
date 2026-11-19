#!/usr/bin/env node
/**
 * Azure Boards <-> GitHub sync check (S2.3-T02).
 *
 * Why work items stay "New": `AB#123` alone only LINKS a work item. The state changes only when a keyword or a
 * state name sits right before it AND the pull request is merged into the default branch:
 *     Fixes AB#123        -> first "Resolved" state, else first "Done"/"Closed" state of the process
 *     Committed AB#123    -> exactly that state (any state name of the work item type works: Approved, Done...)
 *
 * Modes:
 *   node scripts/azure-boards-sync-check.mjs                    audit: reads your merged PRs and says, per work item,
 *                                                                what Azure should have done and what it did
 *   node scripts/azure-boards-sync-check.mjs --ticket=S2.3-T02  only the PRs that mention this ticket's work item
 *   node scripts/azure-boards-sync-check.mjs --id=123           inspect one work item (state + GitHub links)
 *   node scripts/azure-boards-sync-check.mjs --demo             live example: creates a throwaway PBI and two throwaway
 *                                                                PRs ("Committed AB#id", then "Fixes AB#id"), merges them
 *                                                                and shows the state moving. Asks before touching anything.
 * Options: --org=<name> --project=<name> --repo=<owner/name> --limit=<n> --demo-keywords=Committed,Fixes --yes --keep
 *
 * Needs Node 20+, a PAT (Work Items: Read; demo also: Read, write & manage), and the GitHub CLI (`gh auth login`) for
 * the audit and the demo. No dependency. The PAT comes from AZURE_DEVOPS_EXT_PAT or is typed (hidden); it is only sent
 * to dev.azure.com and never written anywhere.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * @typedef {{ name: string, category?: string }} WorkItemState
 * @typedef {{ kind: 'keyword' | 'state' | 'category' | 'unknown' | 'none', target: string | null }} Intent
 * @typedef {{ 'System.WorkItemType'?: string, 'System.Title'?: string, 'System.State'?: string }} WorkItemFields
 * @typedef {{ rel?: string, url?: string, attributes?: { name?: string } }} WorkItemRelation
 * @typedef {{ id?: number | string, name?: string, category?: string, fields?: WorkItemFields }} ApiValue
 * @typedef {{
 *   id?: number | string,
 *   message?: string,
 *   value?: ApiValue[],
 *   workItems?: { id: number | string }[],
 *   fields?: WorkItemFields,
 *   relations?: WorkItemRelation[]
 * }} ApiData
 * @typedef {{ id: number | string, type: string, title: string, state: string, links: string[], prLinks: number }} WorkItem
 * @typedef {{ number: number, title?: string, body?: string, baseRefName: string, commits?: { messageHeadline?: string, messageBody?: string }[] }} PullRequest
 * @typedef {{ ok: boolean, out: string, err: string }} CommandResult
 */

const cliArgs = process.argv.slice(2);
/** @param {string} name CLI flag name to check. */
const flag = (name) => cliArgs.includes(`--${name}`);
/** @param {string} name CLI option name to read. */
const option = (name) => {
  const hit = cliArgs.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};
const API_BASE = process.env.AZDO_BASE_URL ?? 'https://dev.azure.com';

// ---------------------------------------------------------------------------
// Console
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
  // Node's Writable interface requires its callback-based write contract.
  // eslint-disable-next-line promise/prefer-await-to-callbacks
  write(chunk, encoding, callback) {
    if (!muted) {
      process.stdout.write(chunk, encoding);
    }
    // eslint-disable-next-line promise/prefer-await-to-callbacks
    callback();
  },
});
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
/** @param {string} q Prompt text. @param {string} [fallback] Default answer. */
const ask = async (q, fallback = '') => {
  const response = await rl.question(`  ? ${q}${fallback ? dim(` [${fallback}]`) : ''}: `);
  const answer = response.trim();
  return answer || fallback;
};
/** @param {string} q Prompt text. */
async function askSecret(q) {
  process.stdout.write(`  ? ${q}: `);
  muted = true;
  try {
    const response = await rl.question('');
    return response.trim();
  } finally {
    muted = false;
    process.stdout.write('\n');
  }
}
/** @param {string} q Confirmation prompt. @param {boolean} [def] Default answer. */
const confirm = async (q, def = true) => {
  if (flag('yes')) {
    return true;
  }
  const response = await rl.question(`  ? ${q} ${def ? '[Y/n]' : '[y/N]'} `);
  const answer = response.trim().toLowerCase();
  return answer === '' ? def : answer.startsWith('y');
};
/** @param {number} n Step number. @param {string} title Step title. */
const step = (n, title) => console.log(`\n${bold(`━━ ${n}. ${title}`)}`);
/** @param {string} m Success message. */
const ok = (m) => console.log(`  ${green('✔')} ${m}`);
/** @param {string} m Informational message. */
const info = (m) => console.log(`  ${dim('•')} ${m}`);
/** @param {string} m Warning message. */
const warn = (m) => console.log(`  ${yellow('⚠')} ${m}`);
/** @param {string} m Failure message. */
const fail = (m) => console.log(`  ${red('✖')} ${m}`);

// ---------------------------------------------------------------------------
// Azure DevOps REST
// ---------------------------------------------------------------------------
const state = { org: '', orgUrl: '', project: '', auth: '' };
const enc = encodeURIComponent;
/**
 * @param {string} method HTTP method.
 * @param {string} requestPath Azure DevOps API path.
 * @param {{ body?: unknown, patch?: boolean, allow?: number[] }} [options] Request options.
 * @returns {Promise<{ status: number, data: ApiData | null }>} Response status and parsed data.
 */
async function api(method, requestPath, { body, patch = false, allow = [] } = {}) {
  const url = `${state.orgUrl}/${requestPath}${requestPath.includes('?') ? '&' : '?'}api-version=7.1`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: state.auth,
      Accept: 'application/json',
      'Content-Type': patch ? 'application/json-patch+json' : 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (
    response.status === 401 ||
    response.status === 203 ||
    (response.headers.get('content-type') ?? '').includes('text/html')
  ) {
    throw new Error(
      'Azure DevOps rejected the token (check the PAT, its scopes and the organization name).',
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
    throw new Error(
      `${method} ${requestPath.split('?')[0]} → ${response.status} ${data?.message ?? text.slice(0, 160)}`,
    );
  }
  return { status: response.status, data };
}

/** @type {Map<string, WorkItemState[]>} */
const statesCache = new Map();
/**
 * Workflow states of a work item type, in process order.
 * @param {string} type Azure DevOps work item type.
 * @returns {Promise<WorkItemState[]>} States in process order.
 */
async function statesOf(type) {
  if (!statesCache.has(type)) {
    const { data } = await api(
      'GET',
      `${enc(state.project)}/_apis/wit/workitemtypes/${enc(type)}/states`,
    );
    const states = (data?.value ?? []).map((value) => {
      if (typeof value.name !== 'string') {
        throw new TypeError(`Azure DevOps returned a state without a name for ${type}.`);
      }
      return { name: value.name, category: value.category };
    });
    statesCache.set(type, states);
  }
  const states = statesCache.get(type);
  if (!states) {
    throw new Error(`Could not load workflow states for ${type}.`);
  }
  return states;
}

/**
 * @param {WorkItemState[]} states States to search.
 * @param {...string} categories State categories in priority order.
 * @returns {string | null} First matching state name.
 */
const firstInCategory = (states, ...categories) => {
  for (const category of categories) {
    const hit = states.find((s) => s.category?.toLowerCase() === category.toLowerCase());
    if (hit) {
      return hit.name;
    }
  }
  return null;
};

/**
 * Interpret the word written before AB#<id>.
 * @param {string} word State name or transition keyword.
 * @param {WorkItemState[]} states Available states.
 * @returns {Intent} Interpreted transition.
 */
function interpret(word, states) {
  const w = word.toLowerCase();
  if (/^fix(?:es|ed)?$/u.test(w)) {
    const target = firstInCategory(states, 'Resolved', 'Completed');
    return { kind: 'keyword', target };
  }
  const byName = states.find((s) => s.name.toLowerCase() === w);
  if (byName) {
    return { kind: 'state', target: byName.name };
  }
  const byCategory = firstInCategory(states, word);
  if (byCategory) {
    return { kind: 'category', target: byCategory };
  }
  return { kind: 'unknown', target: null };
}

/** @param {string | number} id Azure work item ID. @returns {Promise<WorkItem | null>} Work item details, if found. */
async function getItem(id) {
  const { data } = await api('GET', `_apis/wit/workitems/${id}?$expand=relations`, {
    allow: [404],
  });
  const fields = data?.fields;
  if (!fields) {
    return null;
  }
  const type = fields['System.WorkItemType'];
  const title = fields['System.Title'];
  const itemState = fields['System.State'];
  if (typeof type !== 'string' || typeof title !== 'string' || typeof itemState !== 'string') {
    return null;
  }
  const links = (data.relations ?? [])
    .filter(
      (r) =>
        r.rel === 'ArtifactLink' && /github/iu.test(`${r.attributes?.name ?? ''} ${r.url ?? ''}`),
    )
    .map((r) => r.attributes?.name ?? 'GitHub link');
  return {
    id,
    type,
    title,
    state: itemState,
    links,
    prLinks: links.filter((l) => /pull request/iu.test(l)).length,
  };
}

// ---------------------------------------------------------------------------
// Shell helpers (git, gh)
// ---------------------------------------------------------------------------
/**
 * @param {string} cmd Executable to run.
 * @param {string[]} cmdArgs Arguments passed to the executable.
 * @param {string} [cwd] Working directory, if any.
 * @returns {CommandResult} Command status and output.
 */
function run(cmd, cmdArgs, cwd) {
  const result = spawnSync(cmd, cmdArgs, { encoding: 'utf-8', cwd });
  return {
    ok: result.status === 0,
    out: (result.stdout ?? '').trim(),
    err: (result.stderr ?? '').trim(),
  };
}
/** @param {...string} args GitHub CLI arguments. */
const gh = (...args) => run('gh', args);
/**
 * @param {string | undefined} cwd Working directory.
 * @param {...string} args Git arguments.
 */
const git = (cwd, ...args) => run('git', args, cwd);

/** @returns {{ repo: string, defaultBranch: string } | null} GitHub repository information. */
function repoInfo() {
  let repo = option('repo');
  if (!repo) {
    const view = gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner');
    repo = view.ok ? view.out : '';
  }
  if (!repo) {
    return null;
  }
  const branch = gh(
    'repo',
    'view',
    repo,
    '--json',
    'defaultBranchRef',
    '-q',
    '.defaultBranchRef.name',
  );
  return { repo, defaultBranch: branch.ok && branch.out ? branch.out : 'main' };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
async function connect() {
  step(1, 'Connection');
  state.org =
    (option('org') ?? (await ask('Azure DevOps organization name', 'uzumaki26')))
      .split('/')
      .toReversed()
      .find((segment) => segment.length > 0) ?? '';
  state.project = option('project') ?? (await ask('Project name', 'Next Boilerplate'));
  state.orgUrl = `${API_BASE}/${enc(state.org)}`;
  const pat =
    process.env.AZURE_DEVOPS_EXT_PAT ||
    (await askSecret('Personal Access Token (hidden; or set AZURE_DEVOPS_EXT_PAT)'));
  if (!pat) {
    throw new Error('A PAT is required.');
  }
  state.auth = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
  const { data } = await api('GET', `_apis/projects/${enc(state.project)}`, { allow: [404] });
  if (!data?.id) {
    throw new Error(`Project "${state.project}" not found in ${state.orgUrl}.`);
  }
  ok(`Azure DevOps: ${state.org} / ${state.project}`);
}

async function showRules() {
  step(2, 'Which words can move a work item in this project');
  const typeStates = await Promise.all(
    ['Product Backlog Item', 'Task'].map(async (type) => ({
      type,
      states: await statesOf(type),
    })),
  );
  for (const { type, states } of typeStates) {
    if (states.length === 0) {
      warn(`${type}: states not readable`);
      continue;
    }
    const fixes = firstInCategory(states, 'Resolved', 'Completed');
    console.log(
      `  ${bold(type)}: ${states.map((s) => `${s.name}${dim(`(${s.category})`)}`).join(' → ')}`,
    );
    console.log(
      `     "Fixes AB#id" → ${fixes ?? 'nothing (no Resolved/Completed state)'}   ·   "${states.map((s) => s.name).join(' / ')} AB#id" → that exact state`,
    );
  }
  console.log(
    dim(
      '     Rules: the word must come right before AB#<id>; it is read in the PR title/description (and commit messages);',
    ),
  );
  console.log(
    dim(
      '     the state only changes when the PR is merged into the default branch; a plain AB#<id> only creates a link.',
    ),
  );
}

const PR_FIELDS = 'number,title,body,baseRefName,mergedAt,url,commits';

/** @param {PullRequest} pr GitHub pull request. @returns {string} Text fields searched for work item references. */
function mentions(pr) {
  const parts = [
    pr.title ?? '',
    pr.body ?? '',
    ...(pr.commits ?? []).map((c) => `${c.messageHeadline ?? ''}\n${c.messageBody ?? ''}`),
  ];
  return parts.join('\n');
}

/** @param {string} text Pull request and commit text to scan. @returns {Map<string, string>} Work item IDs and adjacent transition words. */
function extractReferences(text) {
  /** @type {Map<string, string>} */
  const found = new Map();
  for (const match of text.matchAll(
    /(?:(?<word>[A-Za-z][A-Za-z-]*)[ \t]*:?[ \t]+)?AB#(?<id>\d+)/gu,
  )) {
    const id = match.groups?.id;
    if (!id) {
      continue;
    }
    const word = match.groups?.word ?? '';
    const previous = found.get(id);
    if (!previous || (word && !previous)) {
      found.set(id, word);
    }
  }
  return found;
}

/**
 * Check one work item reference against its pull request and report any mismatch.
 * @param {PullRequest} pr Pull request containing the reference.
 * @param {string} id Work item ID.
 * @param {string} word Transition word immediately before the reference.
 * @param {string} defaultBranch Repository default branch.
 * @param {string[]} problems Accumulator for actionable failures.
 * @returns {Promise<boolean>} Whether the expected transition occurred.
 */
async function auditReference(pr, id, word, defaultBranch, problems) {
  const label = `PR #${pr.number} → AB#${id}`;
  const item = await getItem(id);
  if (!item) {
    fail(`${label}: work item not found in this project`);
    problems.push(`${label}: work item does not exist in "${state.project}".`);
    return false;
  }
  const states = await statesOf(item.type);
  const intent = word ? interpret(word, states) : { kind: 'none', target: null };
  const head = `${label} ${dim(`"${item.title.slice(0, 42)}" · ${item.state} · ${item.prLinks} PR link(s)`)}`;
  const onDefault = pr.baseRefName === defaultBranch;
  if (item.prLinks === 0 && item.links.length === 0) {
    fail(`${head}: the PR is NOT linked to the work item`);
    problems.push(
      `${label}: no GitHub link on the work item. Azure Boards app not installed/authorized for this repo, wrong project, or AB# typed differently.`,
    );
    return false;
  }
  if (intent.kind === 'none') {
    warn(`${head}: only "AB#${id}" with no word before it → linked, but Azure changes nothing`);
    problems.push(
      `${label}: no state word. Write "Committed AB#${id}" or "Fixes AB#${id}" in the PR description.`,
    );
    return false;
  }
  if (intent.kind === 'unknown') {
    warn(
      `${head}: "${word} AB#${id}" → "${word}" is not a keyword or a ${item.type} state, ignored`,
    );
    problems.push(
      `${label}: "${word}" is ignored. Valid for a ${item.type}: Fixes, ${states.map((s) => s.name).join(', ')}.`,
    );
    return false;
  }
  if (!intent.target) {
    warn(`${head}: "${word}" has no matching state in this process`);
    problems.push(`${label}: "${word}" matches no ${item.type} state.`);
    return false;
  }
  if (!onDefault) {
    warn(
      `${head}: merged into "${pr.baseRefName}", not the default branch "${defaultBranch}" → no state change`,
    );
    problems.push(`${label}: state transitions only apply when merging into ${defaultBranch}.`);
    return false;
  }
  if (item.state === intent.target) {
    ok(`${head}: "${word}" → ${intent.target} ✔ moved`);
    return true;
  }
  fail(`${head}: expected ${intent.target} but it is ${item.state}`);
  problems.push(
    `${label}: expected "${intent.target}", found "${item.state}". Either it was changed later by hand, Azure is still processing (wait a few minutes), or the work item is not the first one in a list ("Fixes AB#1, AB#2" only moves AB#1; repeat the word for each).`,
  );
  return false;
}

/** @param {string} ticket Backlog ticket identifier. @returns {Promise<Set<string>>} Matching Azure work item IDs. */
async function workItemIdsForTicket(ticket) {
  const query = await api('POST', `${enc(state.project)}/_apis/wit/wiql`, {
    body: {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Title] CONTAINS '${ticket.replaceAll("'", "''")}'`,
    },
  });
  const ids = new Set((query.data?.workItems ?? []).map((workItem) => String(workItem.id)));
  info(`Ticket ${ticket} → work item ${[...ids].join(', ') || 'not found'}`);
  return ids;
}

async function audit() {
  step(3, 'Audit of your merged pull requests');
  const repo = repoInfo();
  if (!repo) {
    warn(
      'GitHub CLI not available or not logged in (`gh auth login`), so PRs cannot be read. Use --id=<work item id> instead.',
    );
    return;
  }
  const list = gh(
    'pr',
    'list',
    '--repo',
    repo.repo,
    '--state',
    'merged',
    '--limit',
    option('limit') ?? '30',
    '--json',
    PR_FIELDS,
  );
  if (!list.ok) {
    warn(`gh pr list failed: ${list.err}`);
    return;
  }
  /** @type {PullRequest[]} */
  const prs = JSON.parse(list.out || '[]');
  const ticket = option('ticket');
  const wantedIds = ticket ? await workItemIdsForTicket(ticket) : null;
  let total = 0;
  let good = 0;
  /** @type {string[]} */
  const problems = [];
  for (const pr of prs) {
    const references = extractReferences(mentions(pr));
    for (const [id, word] of references) {
      if (wantedIds && !wantedIds.has(id)) {
        continue;
      }
      total += 1;
      // eslint-disable-next-line no-await-in-loop -- Keep Azure lookups serial to avoid API bursts.
      if (await auditReference(pr, id, word, repo.defaultBranch, problems)) {
        good += 1;
      }
    }
  }
  console.log(
    `\n  ${total} reference(s) in ${prs.length} merged PR(s): ${green(`${good} moved as expected`)}, ${problems.length > 0 ? red(`${problems.length} problem(s)`) : '0 problems'}`,
  );
  for (const p of problems) {
    console.log(`   - ${p}`);
  }
  if (total === 0) {
    info('No AB# found in the last merged PRs (title, description, commit messages).');
  }
}

/** @param {string} id Work item ID from the command line. */
async function inspect(id) {
  step(3, `Work item ${id}`);
  const item = await getItem(id);
  if (!item) {
    fail('Not found in this project.');
    return;
  }
  console.log(`  #${item.id} ${item.type} · ${bold(item.state)} · ${item.title}`);
  if (item.links.length === 0) {
    fail(
      'No GitHub link at all → the integration is not receiving this reference (check the GitHub connection and the AB# spelling).',
    );
  } else {
    ok(`GitHub links: ${item.links.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Live demo
// ---------------------------------------------------------------------------
/**
 * @param {string} label Description printed while waiting.
 * @param {() => Promise<boolean | undefined>} check Condition to poll.
 * @param {number} [timeoutMs] Maximum wait duration.
 * @returns {Promise<boolean | null>} True when the condition matches, otherwise null on timeout.
 */
async function waitFor(label, check, timeoutMs = 240_000) {
  const started = Date.now();
  process.stdout.write(`  … waiting for ${label}`);
  while (Date.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop -- Polls must complete one at a time.
    const value = await check();
    if (value) {
      process.stdout.write(` ${green('done')} (${Math.round((Date.now() - started) / 1000)}s)\n`);
      return true;
    }
    process.stdout.write('.');
    // eslint-disable-next-line no-await-in-loop -- Wait between sequential polling attempts.
    await sleep(8000);
  }
  process.stdout.write(` ${red('timeout')}\n`);
  return null;
}

/** @returns {Promise<number>} ID of the created throwaway work item. */
async function createDemoWorkItem() {
  const created = await api(
    'POST',
    `${enc(state.project)}/_apis/wit/workitems/$${enc('Product Backlog Item')}`,
    {
      patch: true,
      body: [
        {
          op: 'add',
          path: '/fields/System.Title',
          value: `ZZ Sync demo ${new Date().toISOString().slice(0, 16)} (safe to delete)`,
        },
        { op: 'add', path: '/fields/System.Tags', value: 'sync-demo' },
      ],
    },
  );
  const id = created.data?.id;
  if (typeof id !== 'number') {
    throw new TypeError('Azure DevOps did not return the throwaway work item ID.');
  }
  ok(`Throwaway PBI #${id} created (state: New)`);
  return id;
}

/**
 * Create and push a demo branch, then open its pull request.
 * @param {string} keyword Transition keyword to place before the work item reference.
 * @param {number} round Demo round number.
 * @param {number} id Throwaway work item ID.
 * @param {string} repo GitHub repository name.
 * @param {string} defaultBranch Repository default branch.
 * @param {string} branch Temporary branch name.
 * @param {string} worktree Temporary worktree path.
 * @returns {string} Created pull request number.
 */
function createDemoPullRequest(keyword, round, id, repo, defaultBranch, branch, worktree) {
  git(undefined, 'fetch', 'origin', defaultBranch);
  const added = git(
    undefined,
    'worktree',
    'add',
    '-b',
    branch,
    worktree,
    `origin/${defaultBranch}`,
  );
  if (!added.ok) {
    throw new Error(`git worktree: ${added.err}`);
  }
  // --no-verify: an empty throwaway commit, so the local hooks have nothing to check.
  const committed = git(
    worktree,
    'commit',
    '--allow-empty',
    '--no-verify',
    '-m',
    'chore(config): azure boards sync demo',
    '-m',
    `AB#${id}`,
  );
  if (!committed.ok) {
    throw new Error(`git commit: ${committed.err}`);
  }
  const pushed = git(worktree, 'push', '--no-verify', '-u', 'origin', branch);
  if (!pushed.ok) {
    throw new Error(`git push: ${pushed.err}`);
  }
  const opened = gh(
    'pr',
    'create',
    '--repo',
    repo,
    '--base',
    defaultBranch,
    '--head',
    branch,
    '--title',
    `chore(config): azure boards sync demo ${round}`,
    '--body',
    `${keyword} AB#${id}\n\nThrowaway pull request created by azure-boards-sync-check.`,
  );
  if (!opened.ok) {
    throw new Error(`gh pr create: ${opened.err}`);
  }
  const number = opened.out
    .split('\n')
    .at(-1)
    ?.match(/(?<number>\d+)\s*$/u)?.groups?.number;
  if (!number) {
    throw new Error('GitHub CLI did not return the created pull request number.');
  }
  ok(`PR #${number} opened with "${keyword} AB#${id}" in its description`);
  return number;
}

/** @param {number} id Work item ID to check. @returns {Promise<boolean>} Whether a GitHub PR link appeared. */
async function waitForDemoLink(id) {
  const linked = await waitFor('Azure to link the PR to the work item', async () => {
    const item = await getItem(id);
    return Boolean(item && item.prLinks > 0);
  });
  if (!linked) {
    fail(
      'The PR was never linked. The Azure Boards GitHub app is not connected to this repo/project. Fix that first (Project settings → GitHub connections).',
    );
    return false;
  }
  const linkedItem = await getItem(id);
  ok(
    `Link created. The state is still "${linkedItem?.state ?? 'unknown'}": nothing moves until the merge.`,
  );
  return true;
}

/**
 * Merge a demo pull request or wait for the user to merge it manually.
 * @param {string} number Pull request number.
 * @param {string} repo GitHub repository.
 * @param {string} defaultBranch Repository default branch.
 */
async function mergeDemoPullRequest(number, repo, defaultBranch) {
  const merged = gh('pr', 'merge', number, '--repo', repo, '--merge');
  if (merged.ok) {
    ok(`PR #${number} merged into ${defaultBranch}`);
    return;
  }
  warn(
    `Could not merge automatically (${merged.err.split('\n')[0]}). Merge PR #${number} in the GitHub UI.`,
  );
  await rl.question('  ⏸  Press Enter after merging... ');
}

/**
 * Wait for the transition associated with a demo keyword.
 * @param {string} keyword Transition keyword.
 * @param {WorkItemState[]} pbiStates PBI workflow states.
 * @param {number} id Work item ID.
 * @returns {Promise<boolean>} Whether the state transition succeeded.
 */
async function verifyDemoState(keyword, pbiStates, id) {
  const expected = interpret(keyword, pbiStates).target;
  if (!expected) {
    throw new Error(`"${keyword}" has no matching state for this project.`);
  }
  const moved = await waitFor(`the work item to become "${expected}"`, async () => {
    const item = await getItem(id);
    return item?.state === expected;
  });
  if (moved) {
    ok(`Work item #${id} → ${bold(expected)}  ✔ the sync works`);
    return true;
  }
  const now = await getItem(id);
  fail(
    `Still "${now?.state}" after 4 minutes. Typical causes: the PR was linked but the merge target is not the default branch, a branch rule changed the merge, or the Azure Boards app lacks access to this repo.`,
  );
  return false;
}

/** @param {string} branch Temporary branch to remove. @param {string} worktree Temporary worktree to remove. */
function cleanupDemoBranch(branch, worktree) {
  git(undefined, 'worktree', 'remove', '--force', worktree);
  rmSync(worktree, { recursive: true, force: true });
  git(undefined, 'branch', '-D', branch);
  git(undefined, 'push', 'origin', '--delete', branch);
}

/**
 * Run one serial keyword demonstration.
 * @param {string} keyword Transition keyword.
 * @param {number} round Demo round number.
 * @param {number} id Throwaway work item ID.
 * @param {string} repo GitHub repository.
 * @param {string} defaultBranch Repository default branch.
 * @param {WorkItemState[]} pbiStates PBI workflow states.
 * @returns {Promise<boolean>} Whether this demo round succeeded.
 */
async function runDemoRound(keyword, round, id, repo, defaultBranch, pbiStates) {
  console.log(`\n  ${bold(`Round ${round}: "${keyword} AB#${id}"`)}`);
  const branch = `chore/azure-sync-demo-${Date.now()}-${round}`;
  const worktree = mkdtempSync(path.join(tmpdir(), 'azure-sync-'));
  try {
    const number = createDemoPullRequest(keyword, round, id, repo, defaultBranch, branch, worktree);
    const linked = await waitForDemoLink(id);
    await mergeDemoPullRequest(number, repo, defaultBranch);
    const moved = await verifyDemoState(keyword, pbiStates, id);
    return linked && moved;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    cleanupDemoBranch(branch, worktree);
  }
}

async function demo() {
  step(3, 'Live example');
  const repoData = repoInfo();
  if (!repoData || !git(process.cwd(), 'rev-parse', '--is-inside-work-tree').ok) {
    fail('Run this from your repository, with the GitHub CLI logged in (`gh auth login`).');
    return;
  }
  const { repo, defaultBranch } = repoData;
  const keywords = (option('demo-keywords') ?? 'Committed,Fixes')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const pbiStates = await statesOf('Product Backlog Item');
  const invalidKeyword = keywords.find(
    (keyword) => interpret(keyword, pbiStates).kind === 'unknown',
  );
  if (invalidKeyword) {
    fail(
      `"${invalidKeyword}" is neither Fixes nor a PBI state (${pbiStates.map((s) => s.name).join(', ')}).`,
    );
    return;
  }
  console.log(
    `  This will: create a throwaway PBI, then for each of [${keywords.join(', ')}] open an EMPTY pull request on ${repo},`,
  );
  console.log(
    `  merge it into ${defaultBranch} (one empty merge commit each), and watch the work item state change.`,
  );
  if (!(await confirm('Go ahead?', false))) {
    return;
  }

  const id = await createDemoWorkItem();
  let allGood = true;
  for (const [index, keyword] of keywords.entries()) {
    // eslint-disable-next-line no-await-in-loop -- Each round merges before the next PR is created.
    const succeeded = await runDemoRound(keyword, index + 1, id, repo, defaultBranch, pbiStates);
    allGood &&= succeeded;
  }

  console.log(
    `\n  ${allGood ? green('Result: the GitHub → Azure Boards state sync works.') : red('Result: something is not working, see the messages above.')}`,
  );
  if (
    !flag('keep') &&
    (await confirm(`Delete the throwaway PBI #${id}? (it goes to the recycle bin)`))
  ) {
    await api('DELETE', `_apis/wit/workitems/${id}`);
    ok(`PBI #${id} deleted`);
  } else {
    info(`PBI #${id} kept. Tag: sync-demo.`);
  }
}

async function main() {
  console.log(bold('\nAzure Boards ↔ GitHub sync check'));
  try {
    await connect();
    await showRules();
    if (flag('demo')) {
      await demo();
    } else {
      const itemId = option('id');
      await (itemId ? inspect(itemId) : audit());
    }
  } finally {
    rl.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(red(`\nStopped: ${error instanceof Error ? error.message : String(error)}`));
  rl.close();
  process.exit(1);
}
