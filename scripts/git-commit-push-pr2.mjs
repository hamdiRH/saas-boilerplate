import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const REQUIRED_CHECKS = [
  'Quality (types, lint, format, knip)',
  'Tests (unit + browser)',
  'Build',
  'Commit messages',
];
const PHASES = [
  'Validate the current branch',
  'Find the ticket and describe the commit',
  'Stage and commit changes',
  'Push branch to origin',
  'Create pull request',
  'Wait for GitHub PR checks',
  'Verify required CI checks',
  'Merge pull request',
  'Switch to main and pull latest changes',
  'Sync the Azure Boards ticket',
];
const TOTAL_PHASES = PHASES.length;
const execFileAsync = promisify(execFile);

/* -------------------------------------------------------------------------- */
/*  Terminal UI (zero dependencies)                                           */
/*  - NO_COLOR disables colors, NO_EMOJI disables emojis, FORCE_COLOR forces  */
/*    colors when the output is piped.                                        */
/* -------------------------------------------------------------------------- */

const IS_TTY = Boolean(process.stdout.isTTY);
const USE_COLOR = !process.env.NO_COLOR && (IS_TTY || Boolean(process.env.FORCE_COLOR));
const USE_EMOJI = USE_COLOR && process.env.NO_EMOJI === undefined;
const WIDTH = 62;
const BAR_SIZE = 30;
const ESC = String.fromCodePoint(27);
const ANSI_PATTERN = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, 'gu');

/**
 * @param {string} open ANSI opening code.
 * @param {string} close ANSI closing code.
 * @returns {(text: unknown) => string} Function that paints text.
 */
const paint = (open, close) => (text) =>
  USE_COLOR ? `${ESC}[${open}m${text}${ESC}[${close}m` : String(text);

const style = {
  bannerGreen: paint('1;97;42', '0'),
  bannerRed: paint('1;97;41', '0'),
  bold: paint('1', '22'),
  cyan: paint('36', '39'),
  dim: paint('2', '22'),
  green: paint('32', '39'),
  red: paint('31', '39'),
  yellow: paint('33', '39'),
};

const STATUS = {
  FAIL: { color: style.red, emoji: '❌' },
  PASS: { color: style.green, emoji: '✅' },
  SKIP: { color: style.dim, emoji: '➖' },
  WARN: { color: style.yellow, emoji: '⚠️' },
};

/**
 * @typedef {'FAIL' | 'PASS' | 'SKIP' | 'WARN'} PhaseStatus
 * @typedef {{ label: string, message?: string, seconds: number, status: PhaseStatus, step?: number }} PhaseResult
 * @typedef {{ label: string, message?: string, seconds: number | null, status: PhaseStatus, step?: number }} SummaryRow
 * @typedef {{ id: number, fields?: Record<string, unknown> }} AzureWorkItem
 * @typedef {{ rel?: string, url?: string }} AzureRelation
 * @typedef {{ value?: AzureWorkItem[], workItems?: Array<{ id: number }>, relations?: AzureRelation[] }} AzureResponse
 * @typedef {{
 *   area: string,
 *   commit: string,
 *   criteria: string[],
 *   finalState?: string,
 *   id: number,
 *   state: string,
 *   ticket?: string,
 *   title: string,
 *   type: string,
 *   url: string
 * }} WorkItem
 */

/** @param {string} text ANSI-formatted text to clean. */
const stripAnsi = (text) => String(text).replaceAll(ANSI_PATTERN, '');

// Emojis take two terminal columns, variation selectors take none.
/** @param {string} text Text to measure in terminal columns. */
const visibleWidth = (text) => {
  let width = 0;
  for (const char of stripAnsi(text)) {
    if (char === '\uFE0F') {
      continue;
    }
    width += /\p{Extended_Pictographic}/u.test(char) ? 2 : 1;
  }
  return width;
};

/** @param {string} text Text to pad. @param {number} width Target width. */
const padRight = (text, width) => `${text}${' '.repeat(Math.max(0, width - visibleWidth(text)))}`;
/** @param {string} text Text to pad. @param {number} width Target width. */
const padLeft = (text, width) => `${' '.repeat(Math.max(0, width - visibleWidth(text)))}${text}`;
/** @param {number} seconds Duration in seconds. */
const formatSeconds = (seconds) => `${seconds.toFixed(1)}s`;

/**
 * @param {string} text Banner text.
 * @param {(text: string) => string} paintBanner Banner color function.
 */
const banner = (text, paintBanner) => {
  const line = `  ${text}`;
  const blank = ' '.repeat(WIDTH + 2);
  return [paintBanner(blank), paintBanner(padRight(line, WIDTH + 2)), paintBanner(blank)].join(
    '\n',
  );
};

/** @param {string} content Text to place inside the box. */
const boxLine = (content) => `${style.cyan('│')}${padRight(content, WIDTH)}${style.cyan('│')}`;

/** @param {number} step Step number. @param {string} title Step title. */
const printStepHeader = (step, title) => {
  const done = step - 1;
  const filled = Math.round((done / TOTAL_PHASES) * BAR_SIZE);
  const bar = style.green('█'.repeat(filled)) + style.dim('░'.repeat(BAR_SIZE - filled));

  console.log('');
  console.log(style.cyan(`╭${'─'.repeat(WIDTH)}╮`));
  console.log(boxLine(`  ${style.bold(`STEP ${step}/${TOTAL_PHASES}`)}   ${style.bold(title)}`));
  console.log(boxLine(`  ${bar}   ${style.dim(`${done}/${TOTAL_PHASES} done`)}`));
  console.log(style.cyan(`╰${'─'.repeat(WIDTH)}╯`));
};

/** @param {PhaseResult} result Result to print. */
const printResultLine = ({ status, step, label, seconds, message }) => {
  const { emoji, color } = STATUS[status];
  const icon = USE_EMOJI ? emoji : color(`[${status}]`);
  const prefix = typeof step === 'number' ? style.dim(`[${step}/${TOTAL_PHASES}] `) : '';
  const left = `${icon} ${prefix}${label}`;
  const right = style.dim(formatSeconds(seconds));
  const gap = Math.max(1, WIDTH + 2 - visibleWidth(left) - visibleWidth(right));
  const print = status === 'PASS' || status === 'SKIP' ? console.log : console.error;

  print(`${left}${' '.repeat(gap)}${right}`);

  if (message && status !== 'PASS') {
    print(color(`   ${message.split('\n')[0]}`));
  }
};

const SPINNER_FRAMES = [...'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'];
let quiet = false;
const resetQuietMode = () => {
  quiet = false;
};

// An action returns this to report "nothing to do" instead of a pass.
const SKIPPED = Symbol('skipped');

if (IS_TTY) {
  process.on('exit', () => process.stdout.write(`${ESC}[?25h`));
  process.on('SIGINT', () => {
    process.stdout.write(`${ESC}[?25h\n`);
    process.exit(130);
  });
}

/** @param {string} text Spinner label. */
const startSpinner = (text) => {
  if (!IS_TTY) {
    return resetQuietMode;
  }

  const startedAt = Date.now();
  let frame = 0;
  quiet = true;
  process.stdout.write(`${ESC}[?25l`);

  const render = () => {
    const elapsed = formatSeconds((Date.now() - startedAt) / 1000);
    const symbol = style.cyan(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
    frame += 1;
    process.stdout.write(`\r${ESC}[2K  ${symbol} ${text} ${style.dim(elapsed)}`);
  };

  render();
  const timer = setInterval(render, 80);

  return () => {
    clearInterval(timer);
    resetQuietMode();
    process.stdout.write(`\r${ESC}[2K${ESC}[?25h`);
  };
};

/* -------------------------------------------------------------------------- */
/*  Run state + final summary                                                 */
/* -------------------------------------------------------------------------- */

const scriptStartedAt = Date.now();
/** @type {PhaseResult[]} */
const results = [];
let branchName = '';
let prUrl = '';
/** Azure Boards ticket for this branch (undefined when none, or with --no-azure). */
/** @type {WorkItem | undefined} */
let workItem;
/** @type {string[]} */
const boardNotes = [];

/** @param {SummaryRow[]} rows Summary rows to render. */
const printSummaryTable = (rows) => {
  console.log(
    style.dim(
      `  ${padRight('#', 4)}${padRight('Step', 40)}${padRight('Status', 10)}${padLeft('Time', 7)}`,
    ),
  );
  console.log(style.dim(`  ${'─'.repeat(WIDTH - 2)}`));

  for (const row of rows) {
    const { emoji, color } = STATUS[row.status];
    const statusCell = color(USE_EMOJI ? `${emoji} ${row.status}` : row.status);
    const timeCell = row.seconds === null ? '–' : formatSeconds(row.seconds);

    console.log(
      `  ${padRight(String(row.step), 4)}${padRight(row.label, 40)}${padRight(statusCell, 10)}${padLeft(timeCell, 7)}`,
    );
  }
};

/** @param {SummaryRow[]} rows Summary rows to inspect. */
const printSummaryNotes = (rows) => {
  const notes = rows.filter(
    (row) => row.message && (row.status === 'WARN' || row.status === 'FAIL'),
  );

  if (notes.length > 0) {
    console.log('');
    console.log(style.bold('  Details'));

    for (const note of notes) {
      if (!note.message) {
        continue;
      }

      const { emoji, color } = STATUS[note.status];
      console.log(`  ${color(`${USE_EMOJI ? `${emoji} ` : ''}Step ${note.step} · ${note.label}`)}`);

      for (const line of note.message.split('\n')) {
        console.log(style.dim(`     ${line}`));
      }
    }
  }

  if (boardNotes.length > 0) {
    console.log('');
    console.log(style.bold('  Azure Boards'));

    for (const note of boardNotes) {
      console.log(style.dim(`     ${note}`));
    }
  }
};

/** @param {unknown} [failure] Failure that ended the workflow, if any. */
const printSummary = (failure) => {
  const failed = failure !== undefined;
  const total = (Date.now() - scriptStartedAt) / 1000;
  const failedResult = results.find((result) => result.status === 'FAIL');
  /** @type {SummaryRow[]} */
  const rows = PHASES.map(
    (label, index) =>
      results.find((result) => result.step === index + 1) ?? {
        label,
        seconds: null,
        status: 'SKIP',
        step: index + 1,
      },
  );

  console.log('\n');

  if (failed) {
    const where = failedResult
      ? `FAILED at step ${failedResult.step}/${TOTAL_PHASES}   ${failedResult.label}`
      : 'FAILED';
    console.log(
      banner(`${USE_EMOJI ? '❌' : 'x'}  ${where}   ·   ${formatSeconds(total)}`, style.bannerRed),
    );
  } else {
    console.log(
      banner(
        `${USE_EMOJI ? '✅' : 'v'}  ALL DONE   Pull request merged into main   ·   ${formatSeconds(total)}`,
        style.bannerGreen,
      ),
    );
  }

  console.log('');

  if (failed) {
    const reason =
      failedResult?.message ?? (failure instanceof Error ? failure.message : String(failure));
    console.log(`  ${style.red('Reason')}   ${reason.split('\n')[0]}`);
  }

  if (prUrl) {
    console.log(`  ${style.dim('PR')}       ${style.cyan(prUrl)}`);
  }

  if (branchName) {
    console.log(`  ${style.dim('Branch')}   ${branchName} → main`);
  }

  if (workItem) {
    const finalState = workItem.finalState ?? workItem.state ?? '?';
    console.log(
      `  ${style.dim('Ticket')}   AB#${workItem.id} ${workItem.title} ${style.dim(`(${finalState})`)}`,
    );
  }

  console.log('');
  printSummaryTable(rows);
  printSummaryNotes(rows);
  console.log('');
};

/* -------------------------------------------------------------------------- */
/*  Azure Boards (REST, no dependency)                                        */
/*  Needs AZURE_DEVOPS_EXT_PAT (Work Items: Read, write & manage). Without it */
/*  the script still works and only asks you for the AB# number.              */
/*  Options: --no-azure  --no-board-update  --ticket=S2.3-T02  --state=...    */
/*           --state=done (default, "Fixes AB#id") | committed | approved |    */
/*           none (plain "AB#id": link only, no state change)                  */
/* -------------------------------------------------------------------------- */

const cliArgs = process.argv.slice(2);
/** @param {string} name Flag name without the leading dashes. */
const hasFlag = (name) => cliArgs.includes(`--${name}`);
/** @param {string} name Option name without the leading dashes. */
const optionValue = (name) =>
  cliArgs.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const AZURE = {
  base: process.env.AZDO_BASE_URL ?? 'https://dev.azure.com',
  org: process.env.AZDO_ORG ?? 'uzumaki26',
  pat: process.env.AZURE_DEVOPS_EXT_PAT ?? '',
  project: process.env.AZDO_PROJECT ?? 'Next Boilerplate',
};
const AZURE_FIELDS = [
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.AreaPath',
  'System.Description',
  'Microsoft.VSTS.Common.AcceptanceCriteria',
];
const BRANCH_TYPES = new Set([
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
]);
/** @type {Record<string, string>} */
const AREA_SCOPES = {
  auth: 'auth',
  'ci-cd': 'ci',
  database: 'db',
  docs: 'docs',
  i18n: 'i18n',
  observability: 'obs',
  pwa: 'ui',
  security: 'sec',
  seo: 'seo',
  tenancy: 'org',
  testing: 'tests',
  tooling: 'config',
  ui: 'ui',
};

const azureEnabled = () => !hasFlag('no-azure');
const azureReady = () => azureEnabled() && Boolean(AZURE.pat);
const boardUpdates = () => azureReady() && !hasFlag('no-board-update');
/** @param {unknown} error Error value to stringify. */
const errorText = (error) => (error instanceof Error ? error.message : String(error));

/** Keyword written before AB#id in the PR description. '' = link only. */
const prKeyword = () => {
  const state = (optionValue('state') ?? 'done').trim().toLowerCase();
  if (state === 'none') {
    return '';
  }
  if (state === 'done' || state === 'fixes') {
    return 'Fixes';
  }
  return state.charAt(0).toUpperCase() + state.slice(1);
};

/** State the work item should have once the PR is merged (undefined = no change expected). */
const expectedState = () => {
  const keyword = prKeyword();
  if (!keyword) {
    return;
  }
  return keyword === 'Fixes' ? 'Done' : keyword;
};

/**
 * @param {string} method HTTP method.
 * @param {string} apiPath Azure DevOps API path.
 * @param {{ body?: unknown, patch?: boolean }} [options] Request options.
 * @returns {Promise<AzureResponse | null>} Parsed Azure response, or null for an empty response.
 */
const azureApi = async (method, apiPath, { body, patch = false } = {}) => {
  const separator = apiPath.includes('?') ? '&' : '?';
  const response = await fetch(
    `${AZURE.base}/${encodeURIComponent(AZURE.org)}/${apiPath}${separator}api-version=7.1`,
    {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Authorization: `Basic ${Buffer.from(`:${AZURE.pat}`).toString('base64')}`,
        'Content-Type': patch ? 'application/json-patch+json' : 'application/json',
      },
      method,
      signal: AbortSignal.timeout(20_000),
    },
  );
  const text = await response.text();

  if (
    response.status === 401 ||
    response.status === 203 ||
    (response.headers.get('content-type') ?? '').includes('text/html')
  ) {
    throw new Error('Azure DevOps rejected the token (check AZURE_DEVOPS_EXT_PAT and its scopes).');
  }

  if (!response.ok) {
    throw new Error(
      `Azure DevOps ${method} ${apiPath.split('?')[0]} → ${response.status} ${text.slice(0, 120)}`,
    );
  }

  return text ? JSON.parse(text) : null;
};

const projectPath = () => encodeURIComponent(AZURE.project);

/** @param {string} text HTML-encoded value to decode. */
const decodeHtml = (text) =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .trim();

/**
 * @param {AzureWorkItem} raw Azure Boards response.
 * @param {string | undefined} ticket Branch ticket, if available.
 */
const toWorkItem = (raw, ticket) => {
  const fields = raw.fields ?? {};
  const description = String(fields['System.Description'] ?? '');
  const criteriaHtml = String(fields['Microsoft.VSTS.Common.AcceptanceCriteria'] ?? '');
  const commit = description
    .match(/<b>Commit:<\/b>\s*[^<]+/u)?.[0]
    .replace(/^<b>Commit:<\/b>\s*/u, '');

  return {
    area:
      String(fields['System.AreaPath'] ?? '')
        .split('\\')
        .at(-1) ?? '',
    commit: commit ? decodeHtml(commit) : '',
    criteria: [...criteriaHtml.matchAll(/<li>[\s\S]*?<\/li>/gu)].map((match) =>
      decodeHtml(match[0].slice(4, -5)),
    ),
    id: raw.id,
    state: String(fields['System.State'] ?? ''),
    ticket,
    title: String(fields['System.Title'] ?? '').replace(/^S[\d.]+-T\d+\s+/iu, ''),
    type: String(fields['System.WorkItemType'] ?? ''),
    url: `${AZURE.base}/${encodeURIComponent(AZURE.org)}/${projectPath()}/_workitems/edit/${raw.id}`,
  };
};

/**
 * @param {number[]} ids Work item IDs to fetch.
 * @returns {Promise<AzureWorkItem[]>} Retrieved work items.
 */
const fetchWorkItems = async (ids) => {
  if (ids.length === 0) {
    return [];
  }
  const batch = await azureApi('POST', '_apis/wit/workitemsbatch', {
    body: { fields: AZURE_FIELDS, ids },
  });
  return batch?.value ?? [];
};

/** @param {string} branch Branch name to parse. */
const ticketFromBranch = (branch) => {
  const match = branch.match(/^[a-z]+\/s\d+(?:\.\d+)?-t\d+(?=-|$)/iu)?.[0];
  return match?.slice(match.indexOf('/') + 1).toUpperCase();
};

/** @param {string} branch Branch name to parse. */
const typeFromBranch = (branch) => {
  const prefix = branch.split('/')[0] ?? '';
  return BRANCH_TYPES.has(prefix) ? prefix : 'chore';
};

/** @param {string} ticket Azure Boards ticket identifier. */
const findWorkItem = async (ticket) => {
  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Product Backlog Item' AND [System.Title] CONTAINS '${ticket}'`;
  const result = await azureApi('POST', `${projectPath()}/_apis/wit/wiql`, { body: { query } });
  const ids = (result?.workItems ?? []).map((item) => item.id);
  const prefix = new RegExp(`^${ticket.replaceAll('.', '\\.')}\\s`, 'iu');
  const workItems = await fetchWorkItems(ids);
  const match = workItems.find((raw) => prefix.test(String(raw.fields?.['System.Title'] ?? '')));
  return match ? toWorkItem(match, ticket) : undefined;
};

/**
 * @param {number} id Work item ID.
 * @param {string} state New work item state.
 */
const setWorkItemState = (id, state) =>
  azureApi('PATCH', `_apis/wit/workitems/${id}?suppressNotifications=true`, {
    body: [{ op: 'add', path: '/fields/System.State', value: state }],
    patch: true,
  });

/** @param {number} id Work item ID to query. */
const currentState = async (id) => {
  const [raw] = await fetchWorkItems([id]);
  return String(raw?.fields?.['System.State'] ?? '');
};

/** Sets every child Task that is not Done to Done. Returns how many were changed. */
/** @param {number} id Parent work item ID. */
const closeChildTasks = async (id) => {
  const parent = await azureApi('GET', `_apis/wit/workitems/${id}?$expand=relations`);
  const childIds = (parent?.relations ?? [])
    .filter((relation) => relation.rel === 'System.LinkTypes.Hierarchy-Forward')
    .map((relation) => Number(relation.url?.split('/').at(-1)))
    .filter(Number.isInteger);
  const childWorkItems = await fetchWorkItems(childIds);
  const tasks = childWorkItems.filter(
    (raw) =>
      raw.fields?.['System.WorkItemType'] === 'Task' && raw.fields?.['System.State'] !== 'Done',
  );
  await Promise.all(tasks.map((task) => setWorkItemState(task.id, 'Done')));
  return tasks.length;
};

const suggestCommitHeader = () => {
  if (!workItem?.title) {
    return '';
  }
  if (workItem.commit) {
    return workItem.commit;
  }
  const scope = AREA_SCOPES[(workItem.area ?? '').toLowerCase()];
  const title = workItem.title.charAt(0).toLowerCase() + workItem.title.slice(1);
  return `${typeFromBranch(branchName)}${scope ? `(${scope})` : ''}: ${title}`;
};

/** @param {string} summary Commit description to include in the PR body. */
const buildPrBody = (summary) => {
  const item = workItem;
  if (!item) {
    throw new Error('Cannot build a pull request body without an Azure work item.');
  }

  const keyword = prKeyword();
  const lines = [
    '## Summary',
    '',
    item.title || summary,
    '',
    '## Work item',
    '',
    `${keyword ? `${keyword} ` : ''}AB#${item.id}`,
    `[${item.ticket ?? 'Azure Boards'}](${item.url})`,
  ];

  if (item.criteria.length > 0) {
    lines.push(
      '',
      '## Acceptance criteria',
      '',
      ...item.criteria.map((criterion) => `- [ ] ${criterion}`),
    );
  }

  return lines.join('\n');
};

/** Finds the work item (REST) or asks for its AB# number. Mutates `workItem`. */
/** @param {import('node:readline/promises').Interface} readline Interactive terminal input. */
const resolveWorkItem = async (readline) => {
  if (!azureEnabled()) {
    return;
  }

  const ticket = optionValue('ticket')?.toUpperCase() ?? ticketFromBranch(branchName);

  if (!AZURE.pat) {
    console.log(
      style.yellow('  AZURE_DEVOPS_EXT_PAT is not set: no automatic lookup, no board updates.'),
    );
  } else if (ticket) {
    try {
      workItem = await findWorkItem(ticket);
    } catch (error) {
      console.log(style.yellow(`  Azure lookup failed: ${errorText(error)}`));
    }

    if (!workItem) {
      console.log(style.yellow(`  No Azure work item found for ${ticket}.`));
    }
  } else {
    console.log(style.yellow('  No ticket id (like S2.3-T01) in the branch name.'));
  }

  if (workItem) {
    console.log(
      `  ${style.dim('Ticket')}  AB#${workItem.id} ${workItem.title} ${style.dim(`(${workItem.state})`)}`,
    );
    return;
  }

  const response = await readline.question('Azure work item number (AB#, Enter to skip): ');
  const typed = response.trim().replace(/^AB#/iu, '');

  if (!/^\d+$/u.test(typed)) {
    return;
  }

  const id = Number(typed);
  try {
    const [raw] = AZURE.pat ? await fetchWorkItems([id]) : [];
    workItem = raw
      ? toWorkItem(raw, ticket)
      : {
          area: '',
          commit: '',
          criteria: [],
          id,
          state: '',
          ticket,
          title: '',
          type: '',
          url: `${AZURE.base}/${encodeURIComponent(AZURE.org)}/${projectPath()}/_workitems/edit/${id}`,
        };
  } catch (error) {
    console.log(style.yellow(`  Could not read AB#${id}: ${errorText(error)}`));
    workItem = {
      area: '',
      commit: '',
      criteria: [],
      id,
      state: '',
      ticket,
      title: '',
      type: '',
      url: `${AZURE.base}/${encodeURIComponent(AZURE.org)}/${projectPath()}/_workitems/edit/${id}`,
    };
  }
};

/* -------------------------------------------------------------------------- */
/*  Checks + helpers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * @param {unknown} checks The check response returned by GitHub CLI.
 */
export const assertRequiredChecksPassed = (checks) => {
  if (!Array.isArray(checks)) {
    throw new TypeError('GitHub returned an invalid checks response.');
  }

  const errors = [];

  for (const requiredName of REQUIRED_CHECKS) {
    const matches = checks.filter((check) => {
      if (typeof check !== 'object' || check === null || !('name' in check)) {
        return false;
      }

      return (
        typeof check.name === 'string' &&
        (check.name === requiredName || check.name.endsWith(`/ ${requiredName}`))
      );
    });

    if (matches.length !== 1) {
      errors.push(`${requiredName}: expected one check, found ${matches.length}.`);
      continue;
    }

    const [check] = matches;
    if (
      typeof check !== 'object' ||
      check === null ||
      !('bucket' in check) ||
      check.bucket !== 'pass'
    ) {
      errors.push(`${requiredName}: check did not pass.`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Required CI checks are not all green:\n${errors.join('\n')}`);
  }
};

/**
 * Runs one phase with a step banner, an optional spinner and a result line.
 *
 * @param {string} label Phase title.
 * @param {() => Promise<unknown>} action Work to run.
 * @param {{ continueOnError?: boolean, step?: number, detail?: string, spinner?: boolean }} [options] Phase display and error-handling options.
 */
export const runPhase = async (
  label,
  action,
  { continueOnError = false, step, detail, spinner = true } = {},
) => {
  const startedAt = Date.now();
  const seconds = () => (Date.now() - startedAt) / 1000;

  if (typeof step === 'number') {
    printStepHeader(step, label);
  } else {
    console.log(`\n==> ${label}`);
  }

  const stopSpinner = spinner ? startSpinner(detail ?? 'Working…') : resetQuietMode;

  try {
    const outcome = await action();
    stopSpinner();

    /** @type {PhaseStatus} */
    const status = outcome === SKIPPED ? 'SKIP' : 'PASS';
    const result = {
      label,
      message: undefined,
      seconds: seconds(),
      status,
      step,
    };
    results.push(result);
    printResultLine(result);
    return true;
  } catch (error) {
    stopSpinner();

    if (typeof error === 'object' && error !== null) {
      if ('stdout' in error && typeof error.stdout === 'string' && error.stdout) {
        process.stdout.write(error.stdout);
      }

      if ('stderr' in error && typeof error.stderr === 'string' && error.stderr) {
        process.stderr.write(error.stderr);
      }
    }

    /** @type {PhaseStatus} */
    const status = continueOnError ? 'WARN' : 'FAIL';
    const result = {
      label,
      message: error instanceof Error ? error.message : String(error),
      seconds: seconds(),
      status,
      step,
    };
    results.push(result);
    printResultLine(result);

    if (continueOnError) {
      return false;
    }

    throw error;
  }
};

/**
 * @param {string} command Executable to run.
 * @param {string[]} args Arguments passed to the executable.
 * @param {{ captureOutput?: boolean }} [options] Command options.
 */
const run = async (command, args, { captureOutput = false } = {}) => {
  const { stdout, stderr } = await execFileAsync(command, args, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (!captureOutput && !quiet && stdout) {
    process.stdout.write(stdout);
  }

  if (!quiet && stderr) {
    process.stderr.write(stderr);
  }

  return stdout;
};

// Streams the command output live (used for `gh pr checks --watch`).
/** @param {string} command @param {string[]} args */
const runLive = async (command, args) => {
  const child = spawn(command, args, { stdio: 'inherit' });
  const [code] = await once(child, 'close');

  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${code}.`);
  }
};

/* -------------------------------------------------------------------------- */
/*  Main flow                                                                 */
/* -------------------------------------------------------------------------- */

const main = async () => {
  let phaseNumber = 0;
  /**
   * @param {() => Promise<unknown>} action Work for the phase.
   * @param {{ continueOnError?: boolean, detail?: string, spinner?: boolean }} [options] Phase display and error-handling options.
   */
  const phase = (action, options) => {
    phaseNumber += 1;
    const title = PHASES[phaseNumber - 1];
    if (!title) {
      throw new Error(`Unknown workflow phase ${phaseNumber}.`);
    }

    return runPhase(title, action, { ...options, step: phaseNumber });
  };

  console.log(style.bold(`\nGit → PR → merge   ${style.dim(`${TOTAL_PHASES} steps`)}`));

  await phase(
    async () => {
      const branchOutput = await run('git', ['branch', '--show-current'], {
        captureOutput: true,
      });
      branchName = branchOutput.trim();

      if (!branchName) {
        throw new Error('Could not determine the current Git branch.');
      }

      if (branchName === 'main') {
        throw new Error('Refusing to create a PR from main. Switch to a ticket branch.');
      }
    },
    { detail: 'git branch --show-current' },
  );

  let commitMessage = '';
  await phase(
    async () => {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        await resolveWorkItem(readline);

        const suggestion = suggestCommitHeader();
        if (suggestion) {
          console.log(`  ${style.dim('Suggested')}  ${style.cyan(suggestion)}`);
        }

        const answerText = await readline.question(
          suggestion
            ? 'Commit message (Enter = suggested): '
            : 'Commit description (for example, feat(auth): add sign-in): ',
        );
        const answer = answerText.trim();
        commitMessage = answer || suggestion || '';
      } finally {
        readline.close();
      }

      if (!commitMessage.trim()) {
        throw new Error('Commit description cannot be empty.');
      }
    },
    { spinner: false },
  );

  await phase(
    async () => {
      await run('git', ['add', '-A']);

      const stagedFilesOutput = await run('git', ['diff', '--cached', '--name-only'], {
        captureOutput: true,
      });

      if (!stagedFilesOutput.trim()) {
        throw new Error('There are no staged changes to commit.');
      }

      const commitArgs = ['commit', '-m', commitMessage.trim()];
      if (workItem) {
        // Footer only links the commit; the PR description is what moves the state.
        commitArgs.push('-m', `AB#${workItem.id}`);
      }
      await run('git', commitArgs);
    },
    { detail: 'git add -A && git commit' },
  );

  await phase(() => run('git', ['push', '-u', 'origin', branchName]), {
    detail: `git push -u origin ${branchName}`,
  });

  await phase(
    async () => {
      const prArgs = workItem
        ? ['--title', commitMessage.trim(), '--body', buildPrBody(commitMessage.trim())]
        : ['--fill'];
      const output = await run('gh', ['pr', 'create', ...prArgs, '--base', 'main'], {
        captureOutput: true,
      });
      prUrl = output.match(/https?:\/\/\S+/gu)?.at(-1) ?? '';

      // Work has started: show it as in progress on the board until the merge.
      const notStarted = ['New', 'Approved'].includes(workItem?.state ?? '');
      if (workItem && boardUpdates() && notStarted && expectedState() !== 'Committed') {
        try {
          await setWorkItemState(workItem.id, 'Committed');
          workItem.state = 'Committed';
        } catch (error) {
          boardNotes.push(`Could not move AB#${workItem.id} to Committed: ${errorText(error)}`);
        }
      }
    },
    { detail: 'gh pr create --base main' },
  );

  const checksWatchPassed = await phase(
    async () => {
      if (prUrl) {
        console.log(`  ${style.dim('PR')}  ${style.cyan(prUrl)}`);
      }

      console.log(style.dim('  Waiting 5s for GitHub to register the checks…'));
      await delay(5000);
      await runLive('gh', ['pr', 'checks', '--watch']);
    },
    { continueOnError: true, spinner: false },
  );

  const checksPassed = await phase(
    async () => {
      const checksOutput = await run('gh', ['pr', 'checks', '--json', 'name,bucket'], {
        captureOutput: true,
      });
      assertRequiredChecksPassed(JSON.parse(checksOutput));
    },
    { continueOnError: true, detail: 'gh pr checks --json name,bucket' },
  );

  if (!checksWatchPassed || !checksPassed) {
    console.warn(
      style.yellow(
        '\nOne or more CI check steps reported a problem. Continuing to the merge attempt; GitHub branch protection may block it.',
      ),
    );
  }

  await phase(() => run('gh', ['pr', 'merge', '--merge', '--delete-branch']), {
    detail: 'gh pr merge --merge --delete-branch',
  });

  await phase(
    async () => {
      await run('git', ['switch', 'main']);
      await run('git', ['pull']);
    },
    { detail: 'git switch main && git pull' },
  );

  await phase(
    async () => {
      const target = expectedState();
      if (!workItem || !boardUpdates() || !target) {
        return SKIPPED;
      }

      // Azure applies "Fixes AB#id" a few seconds after the merge.
      let moved = false;
      for (let attempt = 0; attempt < 18 && !moved; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop -- Poll sequentially and wait before retrying.
        moved = (await currentState(workItem.id)) === target;
        if (!moved) {
          // eslint-disable-next-line no-await-in-loop -- Wait between sequential polling attempts.
          await delay(5000);
        }
      }

      if (!moved) {
        await setWorkItemState(workItem.id, target);
        boardNotes.push(
          `Azure did not move AB#${workItem.id} to ${target} within 90s, so the script set it directly. Check the GitHub connection: node scripts/azure-boards-sync-check.mjs`,
        );
      }

      workItem.finalState = target;

      if (target === 'Done') {
        const closed = await closeChildTasks(workItem.id);
        if (closed > 0) {
          boardNotes.push(`${closed} child task(s) of AB#${workItem.id} set to Done.`);
        }
      }
    },
    { continueOnError: true, detail: 'waiting for Azure Boards…' },
  );
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    await main();
    printSummary();
  } catch (error) {
    printSummary(error);
    process.exitCode = 1;
  }
}
