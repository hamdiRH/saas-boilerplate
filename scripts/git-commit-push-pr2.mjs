#!/usr/bin/env node
/* eslint-disable complexity, logical-assignment-operators, max-classes-per-file, no-await-in-loop, no-nested-ternary, no-useless-return, prefer-array-find, prefer-destructuring, prefer-named-capture-group, promise/avoid-new, promise/param-names, unicorn/no-await-expression-member */
/**
 * Git → PR → merge, with Azure Boards ticket handling.
 *
 *   node scripts/git-commit-push-pr.mjs [options]
 *
 * What it handles for you:
 *   - asks for the target branch (default: the repo default branch, for example main; or staging...)
 *   - empty commits: nothing to commit → reuses the commits already on the branch, or asks to allow an empty one
 *   - an existing PR on the same branch: reuse it, retarget it, reopen it, or replace it
 *   - behind/conflicting target branch: merges it in and walks you through the conflicts
 *   - red CI: asks before merging; draft PRs; protected branches (auto-merge)
 *   - Azure Boards: ticket found from the branch name, commit message and PR body filled in, board updated
 *   - every error explained in plain words with the command that fixes it
 * Safe to re-run after any failure: finished steps are detected and skipped.
 *
 * Options
 *   --base=<branch>         target branch of the PR (otherwise asked)
 *   --message="<msg>"       commit message (otherwise asked; suggested from the Azure ticket)
 *   --allow-empty           allow an empty commit when there is nothing to commit
 *   --draft                 create the PR as a draft
 *   --no-merge              stop once the PR is created/updated (no CI wait, no merge)
 *   --merge-method=<m>      merge (default) | squash | rebase
 *   --merge-anyway          merge even when the required CI checks are not all green
 *   --yes                   never ask: take the default answer (risky questions stay "no" unless a flag allows them)
 *   --dry-run               show what would happen, change nothing
 *   --no-azure              ignore Azure Boards entirely
 *   --no-board-update       read the Azure ticket but never change its state
 *   --ticket=S2.3-T02       ticket id when the branch name does not contain it
 *   --state=done|committed|approved|none   word written before AB#id in the PR (default done = "Fixes")
 *   --help                  this text
 *
 * Azure needs AZURE_DEVOPS_EXT_PAT (Work Items: Read, write & manage); AZDO_ORG / AZDO_PROJECT override the defaults.
 * Colors: NO_COLOR disables them, NO_EMOJI disables emojis, FORCE_COLOR forces colors when piped.
 */
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
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
  'Check the environment and the branch',
  'Choose the target branch',
  'Find the ticket and describe the commit',
  'Stage and commit changes',
  'Sync the branch with the target',
  'Push branch to origin',
  'Create or update the pull request',
  'Wait for GitHub PR checks',
  'Verify required CI checks',
  'Merge pull request',
  'Switch to the target branch and pull',
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

const paint = (open, close) => (text) =>
  USE_COLOR ? `${ESC}[${open}m${text}${ESC}[${close}m` : String(text);

const style = {
  bannerGreen: paint('1;97;42', '0'),
  bannerRed: paint('1;97;41', '0'),
  bannerYellow: paint('1;30;43', '0'),
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

const stripAnsi = (text) => String(text).replaceAll(ANSI_PATTERN, '');

// Emojis take two terminal columns, variation selectors take none.
const visibleWidth = (text) => {
  let width = 0;
  for (const char of stripAnsi(text)) {
    if (char === '️') {
      continue;
    }
    width += /\p{Extended_Pictographic}/u.test(char) ? 2 : 1;
  }
  return width;
};

const padRight = (text, width) => `${text}${' '.repeat(Math.max(0, width - visibleWidth(text)))}`;
const padLeft = (text, width) => `${' '.repeat(Math.max(0, width - visibleWidth(text)))}${text}`;
const formatSeconds = (seconds) => `${seconds.toFixed(1)}s`;

const banner = (text, paintBanner) => {
  const line = `  ${text}`;
  const blank = ' '.repeat(WIDTH + 2);
  return [paintBanner(blank), paintBanner(padRight(line, WIDTH + 2)), paintBanner(blank)].join(
    '\n',
  );
};

const boxLine = (content) => `${style.cyan('│')}${padRight(content, WIDTH)}${style.cyan('│')}`;

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

const printResultLine = ({ status, step, label, seconds, message }) => {
  const { emoji, color } = STATUS[status];
  const icon = USE_EMOJI ? emoji : color(`[${status}]`);
  const prefix = typeof step === 'number' ? style.dim(`[${step}/${TOTAL_PHASES}] `) : '';
  const left = `${icon} ${prefix}${label}`;
  const right = style.dim(formatSeconds(seconds));
  const gap = Math.max(1, WIDTH + 2 - visibleWidth(left) - visibleWidth(right));
  const print = status === 'PASS' || status === 'SKIP' ? console.log : console.error;

  print(`${left}${' '.repeat(gap)}${right}`);

  if (message && status !== 'PASS' && status !== 'SKIP') {
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
/*  Options                                                                   */
/* -------------------------------------------------------------------------- */

const cliArgs = process.argv.slice(2);
const hasFlag = (name) => cliArgs.includes(`--${name}`);
const optionValue = (name) =>
  cliArgs.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const DRY_RUN = hasFlag('dry-run');
const ASSUME_YES = hasFlag('yes');

/* -------------------------------------------------------------------------- */
/*  Errors: every failure becomes "what happened" + "how to fix it"           */
/* -------------------------------------------------------------------------- */

/** An error the user can act on: a clear message plus the commands/steps that fix it. */
class UserError extends Error {
  constructor(message, hints = []) {
    super(message);
    this.name = 'UserError';
    this.hints = hints;
  }
}

/** A failed child process, with what it printed. */
class CommandError extends Error {
  constructor(command, args, cause) {
    const stderr = String(cause?.stderr ?? '');
    const stdout = String(cause?.stdout ?? '');
    const firstLine = (stderr || stdout || cause?.message || '').trim().split('\n').find(Boolean);
    super(`${command} ${args.join(' ')} failed${firstLine ? `: ${firstLine}` : ''}`);
    this.name = 'CommandError';
    this.command = command;
    this.args = args;
    this.stderr = stderr;
    this.stdout = stdout;
    this.code = cause?.code;
  }
}

const lastLines = (text, count = 2) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-count)
    .join(' · ');

const COMMIT_HINT = 'Use the form type(scope): subject, for example feat(auth): add sign-in.';

/**
 * Translates any error into { title, hints, detail }.
 *
 * @param {unknown} error The thrown value.
 */
const explain = (error) => {
  if (error instanceof UserError) {
    return { detail: '', hints: error.hints, title: error.message };
  }

  const command = error?.command ?? '';
  const args = error?.args ?? [];
  const text = `${error?.stderr ?? ''}\n${error?.stdout ?? ''}\n${error?.message ?? ''}`;
  const detail = lastLines(`${error?.stderr ?? ''}\n${error?.stdout ?? ''}`) || '';
  const during = (verb) => command === 'git' && args.includes(verb);
  const rule = (title, ...hints) => ({ detail, hints, title });

  if (error?.code === 'ENOENT') {
    return command === 'gh'
      ? rule(
          'The GitHub CLI (gh) is not installed or not in your PATH.',
          'Install it from https://cli.github.com, then run `gh auth login`.',
        )
      : rule(
          `"${command || 'A required program'}" is not installed or not in your PATH.`,
          'Install Git from https://git-scm.com/downloads and reopen the terminal.',
        );
  }
  if (/not logged in|gh auth login|authentication required|HTTP 401|Bad credentials/iu.test(text)) {
    return rule(
      'GitHub CLI is not logged in (or its token expired).',
      'Run `gh auth login`, then run this script again.',
    );
  }
  if (/GH006|GH013|protected branch|push declined due to repository rule/iu.test(text)) {
    return rule(
      'GitHub refused the push because of a branch protection rule.',
      'Never push directly to a protected branch: push your feature branch and merge through the PR.',
      'Check where you are with `git branch --show-current`.',
    );
  }
  if (/non-fast-forward|fetch first|failed to push some refs|\[rejected\]/iu.test(text)) {
    return rule(
      'Push rejected: origin has commits that your branch does not have.',
      'Run this script again: it offers to merge them in for you.',
      'Or by hand: `git pull --no-rebase origin <your-branch>`, fix any conflict, then push.',
    );
  }
  if (
    /Permission denied \(publickey\)|Could not read from remote repository|Authentication failed|unable to access .* (401|403)/iu.test(
      text,
    )
  ) {
    return rule(
      'Git cannot access the remote repository (credentials or permissions).',
      'Run `gh auth login` then `gh auth setup-git`, or check your SSH key.',
      'Make sure your account has write access to this repository.',
    );
  }
  if (
    /Could not resolve host|Failed to connect|Connection (timed out|reset|refused)|network is unreachable|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|TLS|SSL|fetch failed|timeout/iu.test(
      text,
    )
  ) {
    return rule(
      'Network problem: GitHub or Azure DevOps cannot be reached.',
      'Check your internet connection, VPN or proxy, then run the script again.',
    );
  }
  if (/API rate limit exceeded|secondary rate limit/iu.test(text)) {
    return rule('GitHub rate limit reached.', 'Wait a few minutes, then run the script again.');
  }
  if (
    during('commit') &&
    /commitlint|subject may not be empty|type may not be empty|header must not be longer|subject must not|scope must be|type must be/iu.test(
      text,
    )
  ) {
    return rule(
      'The commit message was rejected by commitlint.',
      COMMIT_HINT,
      'Fix the message and run the script again (your changes stay staged).',
    );
  }
  if (
    (during('commit') || during('push')) &&
    /hook|lint-staged|lefthook|husky|pre-commit|pre-push|✖|error TS|eslint/iu.test(text)
  ) {
    return rule(
      `A Git hook rejected the ${during('commit') ? 'commit' : 'push'}.`,
      'Read the messages printed above: they say what to fix (lint, types, format...).',
      'Fix it, then run this script again: it picks up where it stopped.',
    );
  }
  if (/CONFLICT|Automatic merge failed|merge conflict/iu.test(text)) {
    return rule(
      'Merge conflict.',
      'Run the script again and choose to resolve the conflicts when asked, or resolve them by hand and commit.',
    );
  }
  if (
    /would be overwritten by (merge|checkout)|Please commit your changes or stash them/iu.test(text)
  ) {
    return rule(
      'You have local changes that would be overwritten.',
      'Commit them, or stash them with `git stash`, then run the script again.',
    );
  }
  if (/refusing to merge unrelated histories/iu.test(text)) {
    return rule(
      'The two branches have no common history.',
      'Check that you are on the right branch and that the target branch is the right one.',
    );
  }
  if (/divergent branches|Not possible to fast-forward|cannot fast-forward/iu.test(text)) {
    return rule(
      'Your local branch and origin have diverged.',
      'Run `git pull --no-rebase` and fix any conflict, then run the script again.',
    );
  }
  if (/No commits between|head branch is the same as base|must be different/iu.test(text)) {
    return rule(
      'The branch has no changes compared with the target branch, so there is nothing to put in a PR.',
      'Make and commit a change first.',
    );
  }
  if (/already exists/iu.test(text) && /pull request/iu.test(text)) {
    return rule(
      'A pull request already exists for this branch.',
      'Run the script again: it will offer to reuse it.',
    );
  }
  if (
    /not mergeable|base branch policy|required status check|review required|Merging is blocked|is not in the correct state/iu.test(
      text,
    )
  ) {
    return rule(
      'GitHub blocks the merge (branch protection: required checks or reviews).',
      'Open the PR and look at the "Merging is blocked" box to see what is missing.',
      'Or run the script again and choose auto-merge when asked.',
    );
  }
  if (
    /Resource not accessible by|Must have admin rights|HTTP 403|HTTP 404|Could not resolve to a Repository/iu.test(
      text,
    )
  ) {
    return rule(
      'GitHub says you do not have permission for this action (or the repository was not found).',
      'Check that you are logged in to the right account: `gh auth status`.',
      'You need write access to the repository.',
    );
  }
  if (/couldn't find remote ref|Could not find remote branch/iu.test(text)) {
    return rule(
      'That branch does not exist on origin.',
      'Check the name with `git ls-remote --heads origin`.',
    );
  }
  if (/not a git repository/iu.test(text)) {
    return rule('This folder is not a Git repository.', 'Run the script from your project folder.');
  }
  if (/readline was closed|stdin/iu.test(text)) {
    return rule(
      'The script needs an answer but the terminal input is closed.',
      'Run it in an interactive terminal, or pass --yes with explicit options.',
    );
  }

  const title =
    error instanceof CommandError
      ? `Command failed: ${command} ${args.join(' ')}`
      : (error?.message ?? String(error));
  return { detail, hints: [], title };
};

/* -------------------------------------------------------------------------- */
/*  Run state + final summary                                                 */
/* -------------------------------------------------------------------------- */

const scriptStartedAt = Date.now();
const results = [];
let branchName = '';
let baseName = 'main';
let prUrl = '';
/** Azure Boards ticket for this branch (undefined when none, or with --no-azure). */
let workItem;
const boardNotes = [];
const ctx = {
  autoMerge: false,
  checksOk: true,
  commitMessage: '',
  defaultBranch: 'main',
  emptyCommit: false,
  hasChanges: false,
  merged: false,
  pr: undefined,
  prNumber: undefined,
  prTitle: '',
  repo: '',
};

const printSummary = (failure) => {
  const failed = failure !== undefined;
  const total = (Date.now() - scriptStartedAt) / 1000;
  const failedResult = results.find((result) => result.status === 'FAIL');
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
  } else if (DRY_RUN) {
    console.log(
      banner(
        `${USE_EMOJI ? '🔍' : '?'}  DRY RUN   nothing was changed   ·   ${formatSeconds(total)}`,
        style.bannerYellow,
      ),
    );
  } else if (ctx.merged) {
    console.log(
      banner(
        `${USE_EMOJI ? '✅' : 'v'}  ALL DONE   Pull request merged into ${baseName}   ·   ${formatSeconds(total)}`,
        style.bannerGreen,
      ),
    );
  } else {
    const what = ctx.autoMerge
      ? 'Auto-merge enabled, GitHub will merge when ready'
      : 'Pull request ready, not merged';
    console.log(
      banner(
        `${USE_EMOJI ? '✅' : 'v'}  DONE   ${what}   ·   ${formatSeconds(total)}`,
        style.bannerGreen,
      ),
    );
  }

  console.log('');

  if (failed) {
    const info = explain(failedResult?.error ?? failure);
    console.log(`  ${style.red('Problem')}  ${info.title}`);

    for (const [index, hint] of info.hints.entries()) {
      console.log(`  ${index === 0 ? style.yellow('Fix') : '   '}      ${hint}`);
    }

    if (info.detail) {
      console.log(`  ${style.dim('Detail')}   ${style.dim(info.detail)}`);
    }

    console.log(
      style.dim('  Fix the cause, then run the script again: finished steps are skipped.'),
    );
  }

  if (prUrl) {
    console.log(`  ${style.dim('PR')}       ${style.cyan(prUrl)}`);
  }

  if (branchName) {
    console.log(`  ${style.dim('Branch')}   ${branchName} → ${baseName}`);
  }

  if (workItem) {
    const finalState = workItem.finalState ?? workItem.state ?? '?';
    console.log(
      `  ${style.dim('Ticket')}   AB#${workItem.id} ${workItem.title} ${style.dim(`(${finalState})`)}`,
    );
  }

  console.log('');
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

  const notes = rows.filter((row) => row.message && row.status === 'WARN');

  if (notes.length > 0) {
    console.log('');
    console.log(style.bold('  Warnings'));

    for (const note of notes) {
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

  console.log('');
};

/* -------------------------------------------------------------------------- */
/*  Prompts (one short readline per question, so output from child processes  */
/*  like `gh pr checks --watch` never competes with an open input stream)     */
/* -------------------------------------------------------------------------- */

const readAnswer = async (prompt) => {
  const readline = createInterface({ input: process.stdin, output: process.stdout });

  const closed = new Promise((_, reject) => {
    readline.once('close', () => reject(new Error('readline was closed')));
  });

  try {
    return (await Promise.race([readline.question(prompt), closed])).trim();
  } catch {
    throw new UserError('The script needs an answer but the terminal input is closed.', [
      'Run it in an interactive terminal, or pass --yes together with explicit options (--base, --message...).',
    ]);
  } finally {
    readline.close();
  }
};

const ask = async (question, fallback = '') => {
  if (ASSUME_YES) {
    return fallback;
  }
  const suffix = fallback ? style.dim(` [${fallback}]`) : '';
  return (await readAnswer(`  ? ${question}${suffix}: `)) || fallback;
};

/** `assumeYes` is the answer given by --yes (risky questions keep it false). */
const confirm = async (question, { defaultYes = false, assumeYes = defaultYes } = {}) => {
  if (ASSUME_YES) {
    return assumeYes;
  }
  const answer = (
    await readAnswer(`  ? ${question} ${style.dim(defaultYes ? '[Y/n]' : '[y/N]')} `)
  ).toLowerCase();
  return answer === '' ? defaultYes : answer.startsWith('y');
};

const choose = async (question, choices, defaultKey) => {
  console.log(`  ? ${question}`);
  for (const { key, label } of choices) {
    console.log(
      `      ${style.cyan(`[${key}]`)} ${label}${key === defaultKey ? style.dim('  (default)') : ''}`,
    );
  }
  if (ASSUME_YES) {
    return defaultKey;
  }

  for (;;) {
    const answer = (await readAnswer('    choice: ')).toLowerCase() || defaultKey;
    if (choices.some(({ key }) => key === answer)) {
      return answer;
    }
    console.log(
      style.yellow(`    Please answer with one of: ${choices.map(({ key }) => key).join(', ')}`),
    );
  }
};

/* -------------------------------------------------------------------------- */
/*  Azure Boards (REST, no dependency)                                        */
/*  Needs AZURE_DEVOPS_EXT_PAT (Work Items: Read, write & manage). Without it */
/*  the script still works and only asks you for the AB# number.              */
/* -------------------------------------------------------------------------- */

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
const CONVENTIONAL =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([\w./-]+\))?!?: \S/u;
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
    throw new UserError('Azure DevOps rejected the token.', [
      'Check AZURE_DEVOPS_EXT_PAT (not expired, scope "Work Items: Read, write & manage") and AZDO_ORG.',
      'To continue without Azure: add --no-azure.',
    ]);
  }

  if (!response.ok) {
    throw new Error(
      `Azure DevOps ${method} ${apiPath.split('?')[0]} → ${response.status} ${text.slice(0, 120)}`,
    );
  }

  return text ? JSON.parse(text) : null;
};

const projectPath = () => encodeURIComponent(AZURE.project);

const decodeHtml = (text) =>
  text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .trim();

const workItemUrl = (id) =>
  `${AZURE.base}/${encodeURIComponent(AZURE.org)}/${projectPath()}/_workitems/edit/${id}`;

const bareWorkItem = (id, ticket) => ({
  area: '',
  commit: '',
  criteria: [],
  id,
  state: '',
  ticket,
  title: '',
  type: '',
  url: workItemUrl(id),
});

const toWorkItem = (raw, ticket) => {
  const fields = raw.fields ?? {};
  const description = String(fields['System.Description'] ?? '');
  const criteriaHtml = String(fields['Microsoft.VSTS.Common.AcceptanceCriteria'] ?? '');
  const commitMatch = description.match(/<b>Commit:<\/b>\s*([^<]+)/u);

  return {
    area: String(fields['System.AreaPath'] ?? '')
      .split('\\')
      .at(-1),
    commit: commitMatch ? decodeHtml(commitMatch[1]) : '',
    criteria: [...criteriaHtml.matchAll(/<li>(.*?)<\/li>/gsu)].map((match) => decodeHtml(match[1])),
    id: raw.id,
    state: String(fields['System.State'] ?? ''),
    ticket,
    title: String(fields['System.Title'] ?? '').replace(/^S[\d.]+-T\d+\s+/iu, ''),
    type: String(fields['System.WorkItemType'] ?? ''),
    url: workItemUrl(raw.id),
  };
};

const fetchWorkItems = async (ids) => {
  if (ids.length === 0) {
    return [];
  }
  const batch = await azureApi('POST', '_apis/wit/workitemsbatch', {
    body: { fields: AZURE_FIELDS, ids },
  });
  return batch?.value ?? [];
};

const ticketFromBranch = (branch) =>
  branch.match(/^[a-z]+\/(s\d+(?:\.\d+)?-t\d+)(?:-|$)/iu)?.[1]?.toUpperCase();

const typeFromBranch = (branch) => {
  const prefix = branch.split('/')[0];
  return BRANCH_TYPES.has(prefix) ? prefix : 'chore';
};

const findWorkItem = async (ticket) => {
  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Product Backlog Item' AND [System.Title] CONTAINS '${ticket}'`;
  const result = await azureApi('POST', `${projectPath()}/_apis/wit/wiql`, { body: { query } });
  const ids = (result?.workItems ?? []).map((item) => item.id);
  const prefix = new RegExp(`^${ticket.replaceAll('.', '\\.')}\\s`, 'iu');
  const match = (await fetchWorkItems(ids)).find((raw) =>
    prefix.test(String(raw.fields?.['System.Title'] ?? '')),
  );
  return match ? toWorkItem(match, ticket) : undefined;
};

const setWorkItemState = (id, state) =>
  azureApi('PATCH', `_apis/wit/workitems/${id}?suppressNotifications=true`, {
    body: [{ op: 'add', path: '/fields/System.State', value: state }],
    patch: true,
  });

const currentState = async (id) => {
  const [raw] = await fetchWorkItems([id]);
  return String(raw?.fields?.['System.State'] ?? '');
};

/** Sets every child Task that is not Done to Done. Returns how many were changed. */
const closeChildTasks = async (id) => {
  const parent = await azureApi('GET', `_apis/wit/workitems/${id}?$expand=relations`);
  const childIds = (parent?.relations ?? [])
    .filter((relation) => relation.rel === 'System.LinkTypes.Hierarchy-Forward')
    .map((relation) => Number(relation.url.split('/').at(-1)))
    .filter(Number.isInteger);
  let closed = 0;

  for (const raw of await fetchWorkItems(childIds)) {
    const isOpenTask =
      raw.fields?.['System.WorkItemType'] === 'Task' && raw.fields?.['System.State'] !== 'Done';
    if (isOpenTask) {
      await setWorkItemState(raw.id, 'Done');
      closed += 1;
    }
  }

  return closed;
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

const workItemSection = () => {
  const keyword = prKeyword();
  return [
    '## Work item',
    '',
    `${keyword ? `${keyword} ` : ''}AB#${workItem.id}`,
    `[${workItem.ticket ?? 'Azure Boards'}](${workItem.url})`,
  ].join('\n');
};

const buildPrBody = (summary) => {
  const lines = ['## Summary', '', workItem.title || summary, '', workItemSection()];

  if (workItem.criteria.length > 0) {
    lines.push(
      '',
      '## Acceptance criteria',
      '',
      ...workItem.criteria.map((criterion) => `- [ ] ${criterion}`),
    );
  }

  return lines.join('\n');
};

/** Finds the work item (REST) or asks for its AB# number. Mutates `workItem`. */
const resolveWorkItem = async () => {
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
      console.log(style.yellow(`  Azure lookup failed: ${explain(error).title}`));
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

  const typed = (await ask('Azure work item number (AB#, Enter to skip)')).replace(/^AB#/iu, '');

  if (!/^\d+$/u.test(typed)) {
    return;
  }

  const id = Number(typed);
  try {
    const [raw] = AZURE.pat ? await fetchWorkItems([id]) : [];
    workItem = raw ? toWorkItem(raw, ticket) : bareWorkItem(id, ticket);
  } catch (error) {
    console.log(style.yellow(`  Could not read AB#${id}: ${explain(error).title}`));
    workItem = bareWorkItem(id, ticket);
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

    const result = {
      label,
      seconds: seconds(),
      status: outcome === SKIPPED ? 'SKIP' : 'PASS',
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

    const info = explain(error);
    const result = {
      error,
      label,
      message: [info.title, ...info.hints.map((hint) => `→ ${hint}`)].join('\n'),
      seconds: seconds(),
      status: continueOnError ? 'WARN' : 'FAIL',
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

/** Runs a program and throws a CommandError when it fails. */
const run = async (command, args, { captureOutput = false } = {}) => {
  try {
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
  } catch (error) {
    throw new CommandError(command, args, error);
  }
};

/** Runs a program and reports instead of throwing: { ok, stdout, stderr, code }. */
const tryRun = async (command, args) => {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return { code: 0, ok: true, stderr, stdout };
  } catch (error) {
    return {
      code: error?.code,
      error: new CommandError(command, args, error),
      ok: false,
      stderr: String(error?.stderr ?? ''),
      stdout: String(error?.stdout ?? ''),
    };
  }
};

const git = async (...args) => (await run('git', args, { captureOutput: true })).trim();
const gh = async (...args) => (await run('gh', args, { captureOutput: true })).trim();
const ghJson = async (...args) => JSON.parse((await gh(...args)) || 'null');

// Streams the command output live (used for `gh pr checks --watch`).
const runLive = async (command, args) => {
  const child = spawn(command, args, { stdio: 'inherit' });
  const [code] = await once(child, 'close');

  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${code}.`);
  }
};

const gitPath = async (name) => path.resolve(await git('rev-parse', '--git-path', name));

const unmergedFiles = async () =>
  (await git('diff', '--name-only', '--diff-filter=U')).split('\n').filter(Boolean);

const shortList = (items, max = 12) =>
  items.length <= max
    ? items.map((item) => `      ${item}`).join('\n')
    : `${items
        .slice(0, max)
        .map((item) => `      ${item}`)
        .join('\n')}\n      … and ${items.length - max} more`;

const dryRunStep = (...lines) => {
  for (const line of lines) {
    console.log(`  ${style.dim('(dry run) would:')} ${line}`);
  }
  return SKIPPED;
};

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/* -------------------------------------------------------------------------- */
/*  Conflicts: merge a ref into the branch and walk the user through them     */
/* -------------------------------------------------------------------------- */

const hasConflictMarkers = (files) =>
  files.filter((file) => {
    try {
      return /^(<{7}|={7}|>{7})( |$)/mu.test(readFileSync(file, 'utf-8'));
    } catch {
      return false;
    }
  });

const resolveConflicts = async (what) => {
  for (;;) {
    const files = await unmergedFiles();
    console.log(
      style.yellow(`\n  ⚠ Merge conflict: ${plural(files.length, 'file')} need your decision.`),
    );
    console.log(shortList(files));
    console.log(
      style.dim(
        '  In each file keep the right code and delete the <<<<<<< ======= >>>>>>> lines (VS Code: "Accept Current / Incoming / Both").',
      ),
    );

    const answer = await choose(
      `When the conflicts of ${what} are resolved:`,
      [
        { key: 'c', label: 'continue (I resolved them)' },
        { key: 'l', label: 'list the files again' },
        { key: 'm', label: 'open `git mergetool` (if you configured one)' },
        { key: 'a', label: 'abort the merge and stop' },
      ],
      'c',
    );

    if (ASSUME_YES) {
      await tryRun('git', ['merge', '--abort']);
      throw new UserError(
        `Merge conflicts in ${plural(files.length, 'file')}: --yes cannot resolve them.`,
        ['Run the script again without --yes to resolve them step by step.'],
      );
    }

    if (answer === 'a') {
      await tryRun('git', ['merge', '--abort']);
      throw new UserError(`You aborted the merge of ${what}.`, [
        'Nothing was changed on GitHub. Run the script again when you are ready to resolve the conflicts.',
      ]);
    }

    if (answer === 'l') {
      continue;
    }

    if (answer === 'm') {
      await runLive('git', ['mergetool']).catch((error) =>
        console.log(style.yellow(`  ${errorText(error)}`)),
      );
    }

    // Editing a file does not stage it: judge by the conflict markers, then stage for the user.
    const open = hasConflictMarkers(files);

    if (open.length > 0) {
      console.log(
        style.yellow('\n  Still containing conflict markers (<<<<<<< / ======= / >>>>>>>):'),
      );
      console.log(shortList(open));
      continue;
    }

    await run('git', ['add', '-A', '--', ...files], { captureOutput: true });
    await run('git', ['commit', '--no-edit'], { captureOutput: true });
    console.log(style.green('  ✔ Conflicts resolved and merge committed.'));
    return;
  }
};

/** Merges `ref` (for example origin/main) into the current branch. */
const mergeRef = async (ref, what) => {
  const merged = await tryRun('git', ['merge', '--no-edit', ref]);

  if (merged.ok) {
    if (merged.stdout.trim()) {
      console.log(style.dim(`  ${lastLines(merged.stdout, 3)}`));
    }
    return;
  }

  if ((await unmergedFiles()).length === 0) {
    throw merged.error;
  }

  await resolveConflicts(what);
};

/** True when merging `ref` into HEAD would conflict (git ≥ 2.38; false when unknown). */
const wouldConflict = async (ref) => {
  const result = await tryRun('git', ['merge-tree', '--write-tree', '--name-only', 'HEAD', ref]);
  return !result.ok && result.code === 1;
};

const behindCount = async (ref) => Number(await git('rev-list', '--count', `HEAD..${ref}`));
const aheadCount = async (ref) => Number(await git('rev-list', '--count', `${ref}..HEAD`));

/* -------------------------------------------------------------------------- */
/*  Pull request helpers                                                      */
/* -------------------------------------------------------------------------- */

const PR_FIELDS = 'number,state,baseRefName,title,url,isDraft,mergedAt,closedAt,body';

const listBranchPrs = async (branch) =>
  (await ghJson(
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'all',
    '--limit',
    '20',
    '--json',
    PR_FIELDS,
  )) ?? [];

const prNumberFromUrl = (url) => Number(url.match(/\/pull\/(\d+)/u)?.[1]);

const waitForMergeability = async (number) => {
  let state;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    state = await ghJson(
      'pr',
      'view',
      String(number),
      '--json',
      'state,isDraft,mergeable,mergeStateStatus,baseRefName',
    );
    if (state?.mergeable !== 'UNKNOWN') {
      break;
    }
    await delay(3000);
  }

  return state;
};

const watchChecks = async (number) => {
  console.log(style.dim('  Waiting 5s for GitHub to register the checks…'));
  await delay(5000);
  await runLive('gh', ['pr', 'checks', String(number), '--watch']);
};

const remoteBranches = async () =>
  (await git('ls-remote', '--heads', 'origin'))
    .split('\n')
    .map((line) => line.split('refs/heads/')[1])
    .filter(Boolean);

/* -------------------------------------------------------------------------- */
/*  Phases                                                                    */
/* -------------------------------------------------------------------------- */

const checkEnvironment = async () => {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    throw new UserError(`Node ${process.versions.node} is too old.`, ['Install Node 20 or newer.']);
  }

  await run('git', ['--version'], { captureOutput: true });
  await run('gh', ['--version'], { captureOutput: true });

  const auth = await tryRun('gh', ['auth', 'status']);
  if (!auth.ok) {
    throw new UserError('You are not logged in to GitHub.', [
      'Run `gh auth login`, then run this script again.',
    ]);
  }

  const inside = await tryRun('git', ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) {
    throw new UserError('This folder is not a Git repository.', [
      'Open a terminal in your project folder first.',
    ]);
  }

  const origin = await tryRun('git', ['remote', 'get-url', 'origin']);
  if (!origin.ok) {
    throw new UserError('This repository has no "origin" remote.', [
      'Add it: git remote add origin https://github.com/<owner>/<repo>.git',
    ]);
  }

  const repo = await tryRun('gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef']);
  if (!repo.ok) {
    throw new UserError(`GitHub repository not found, or no access (${origin.stdout.trim()}).`, [
      'Check that the remote URL is right and that you are logged in to the right account: `gh auth status`.',
    ]);
  }
  const repoInfo = JSON.parse(repo.stdout);
  ctx.repo = repoInfo.nameWithOwner;
  ctx.defaultBranch = repoInfo.defaultBranchRef?.name ?? 'main';

  branchName = await git('branch', '--show-current');
  if (!branchName) {
    throw new UserError('You are not on a branch (detached HEAD).', [
      'Create a ticket branch: git switch -c feat/s1-t01-short-name',
    ]);
  }
  if (branchName === ctx.defaultBranch) {
    throw new UserError(`Refusing to create a PR from ${ctx.defaultBranch}.`, [
      `Switch to a ticket branch first: git switch -c feat/s1-t01-short-name`,
      'Your uncommitted changes come with you.',
    ]);
  }

  if (existsSync(await gitPath('rebase-merge')) || existsSync(await gitPath('rebase-apply'))) {
    throw new UserError('A rebase is in progress.', [
      'Finish it with `git rebase --continue`, or cancel it with `git rebase --abort`.',
    ]);
  }

  console.log(`  ${style.dim('Repo')}    ${ctx.repo}   ${style.dim('Branch')}  ${branchName}`);

  // A previous run (or you) stopped in the middle of a merge: finish it first.
  if (existsSync(await gitPath('MERGE_HEAD'))) {
    console.log(style.yellow('  A merge is already in progress on this branch.'));
    if ((await unmergedFiles()).length > 0) {
      await resolveConflicts('the merge in progress');
    } else {
      await run('git', ['commit', '--no-edit'], { captureOutput: true });
      console.log(style.green('  ✔ Finished the merge in progress.'));
    }
  }
};

const handleExistingPrs = async () => {
  const prs = await listBranchPrs(branchName);
  const open = prs.filter((pr) => pr.state === 'OPEN');

  if (open.length > 0) {
    const [pr] = open;
    if (open.length > 1) {
      console.log(
        style.yellow(
          `  ${open.length} open PRs exist for this branch; using the newest one (#${pr.number}).`,
        ),
      );
    }
    console.log(
      `  Found open PR ${style.cyan(`#${pr.number}`)} for this branch → ${pr.baseRefName}: ${pr.title}`,
    );
    console.log(`  ${style.dim(pr.url)}`);

    if (pr.baseRefName === baseName) {
      const answer = await choose(
        'What do you want to do with it?',
        [
          { key: 'u', label: 'use it (push to it, wait for its checks, merge it)' },
          { key: 'r', label: 'close it and create a new PR' },
          { key: 'a', label: 'abort' },
        ],
        'u',
      );
      if (answer === 'a') {
        throw new UserError('Stopped: an open PR already exists for this branch.', [
          `PR: ${pr.url}`,
        ]);
      }
      if (answer === 'r') {
        await run(
          'gh',
          ['pr', 'close', String(pr.number), '--comment', 'Replaced by a new pull request.'],
          { captureOutput: true },
        );
        console.log(style.green(`  ✔ Closed #${pr.number}`));
        return;
      }
    } else {
      const answer = await choose(
        `That PR targets "${pr.baseRefName}", not "${baseName}".`,
        [
          { key: 'k', label: `keep it as is and use "${pr.baseRefName}" as the target` },
          { key: 'r', label: `retarget the PR to "${baseName}"` },
          { key: 'a', label: 'abort' },
        ],
        'k',
      );
      if (answer === 'a') {
        throw new UserError('Stopped: the existing PR has a different target branch.', [
          `PR: ${pr.url}`,
        ]);
      }
      if (answer === 'r') {
        await run('gh', ['pr', 'edit', String(pr.number), '--base', baseName], {
          captureOutput: true,
        });
        pr.baseRefName = baseName;
        console.log(style.green(`  ✔ #${pr.number} now targets ${baseName}`));
      } else {
        baseName = pr.baseRefName;
        await run('git', ['fetch', 'origin', baseName], { captureOutput: true });
      }
    }

    ctx.pr = pr;
    ctx.prNumber = pr.number;
    prUrl = pr.url;
    return;
  }

  const [latest] = prs;
  if (latest?.state === 'MERGED') {
    console.log(
      `  ${style.dim(`PR #${latest.number} from this branch was already merged on ${String(latest.mergedAt).slice(0, 10)}. A new PR will be created for the new commits.`)}`,
    );
  } else if (latest?.state === 'CLOSED') {
    console.log(
      `  PR #${latest.number} from this branch was closed without merging (${style.dim(latest.url)}).`,
    );
    const answer = await choose(
      'What do you want to do?',
      [
        { key: 'n', label: 'create a new PR' },
        { key: 'o', label: `reopen #${latest.number}` },
        { key: 'a', label: 'abort' },
      ],
      'n',
    );
    if (answer === 'a') {
      throw new UserError('Stopped: this branch has a closed PR.', [`PR: ${latest.url}`]);
    }
    if (answer === 'o') {
      await run('gh', ['pr', 'reopen', String(latest.number)], { captureOutput: true });
      console.log(style.green(`  ✔ Reopened #${latest.number}`));
      ctx.pr = { ...latest, state: 'OPEN' };
      ctx.prNumber = latest.number;
      prUrl = latest.url;
    }
  }
};

const chooseTargetBranch = async () => {
  const wanted = optionValue('base');
  let base = wanted ?? (await ask('Target branch for the pull request', ctx.defaultBranch));

  for (;;) {
    const found = await tryRun('git', ['ls-remote', '--exit-code', '--heads', 'origin', base]);

    if (found.ok) {
      break;
    }
    if (found.code !== 2) {
      throw found.error;
    }

    const branches = await remoteBranches();
    const hints = [
      `Branches on origin: ${branches.slice(0, 15).join(', ') || '(none)'}`,
      'Create it first: git push origin <source>:<new-branch>',
    ];
    if (wanted || ASSUME_YES) {
      throw new UserError(`The target branch "${base}" does not exist on origin.`, hints);
    }
    console.log(style.yellow(`  "${base}" does not exist on origin. ${hints[0]}`));
    base = await ask('Target branch', ctx.defaultBranch);
  }

  if (base === branchName) {
    throw new UserError(`The target branch cannot be your current branch (${branchName}).`, [
      'Choose another target branch.',
    ]);
  }

  baseName = base;
  await run('git', ['fetch', 'origin', baseName], { captureOutput: true });

  if (baseName !== ctx.defaultBranch) {
    console.log(
      style.yellow(
        `  Note: "${baseName}" is not the default branch (${ctx.defaultBranch}). Azure Boards only reacts to merges into ${ctx.defaultBranch}, so the script will update the ticket itself.`,
      ),
    );
  }

  await handleExistingPrs();
};

const describeCommit = async () => {
  ctx.hasChanges = Boolean((await git('status', '--porcelain')).trim());
  const ahead = await aheadCount(`origin/${baseName}`);
  const lastSubject = ahead > 0 ? await git('log', '-1', '--format=%s') : '';

  await resolveWorkItem();
  const suggestion = suggestCommitHeader();
  const given = optionValue('message')?.trim();

  const askForMessage = async (fallback) => {
    if (fallback) {
      console.log(`  ${style.dim('Suggested')}  ${style.cyan(fallback)}`);
    }

    for (;;) {
      const message =
        given ??
        (await ask(
          fallback
            ? 'Commit message (Enter = suggested)'
            : 'Commit message (for example, feat(auth): add sign-in)',
          fallback,
        ));

      if (!message) {
        if (given === undefined && !ASSUME_YES) {
          console.log(style.yellow('  The commit message cannot be empty.'));
          continue;
        }
        throw new UserError('A commit message is required.', [
          'Pass it with --message="feat(scope): subject".',
        ]);
      }

      if (!CONVENTIONAL.test(message)) {
        console.log(
          style.yellow(`  "${message}" is not in the form type(scope): subject. ${COMMIT_HINT}`),
        );
        console.log(style.dim('  The commit-msg hook will most likely reject it.'));
        if (given === undefined && !ASSUME_YES && !(await confirm('Use it anyway?'))) {
          continue;
        }
      }

      return message;
    }
  };

  if (ctx.hasChanges) {
    ctx.commitMessage = await askForMessage(suggestion);
    ctx.prTitle = ctx.commitMessage;
    return;
  }

  if (ahead > 0) {
    console.log(
      `  No uncommitted changes. The branch already has ${plural(ahead, 'commit')} ahead of ${baseName}: they will be used as they are.`,
    );
    ctx.prTitle = ctx.pr?.title ?? suggestion ?? lastSubject;
    ctx.prTitle = ctx.prTitle || lastSubject;
    return;
  }

  // Nothing to commit and nothing ahead of the target.
  const prs = await listBranchPrs(branchName);
  const merged = prs.find((pr) => pr.state === 'MERGED');
  console.log(
    style.yellow(`  Nothing to commit, and the branch has no commits ahead of ${baseName}.`),
  );

  const allow =
    hasFlag('allow-empty') ||
    (await confirm('Create an empty commit anyway (it lets you open a PR with no file changes)?'));

  if (!allow) {
    throw new UserError(
      `Nothing to commit and no commits ahead of ${baseName}: there is nothing to put in a PR.`,
      [
        merged
          ? `This branch was already merged by PR #${merged.number}. Start a new branch: git switch -c feat/<ticket>-<name>`
          : 'Make your changes first (check with `git status`).',
        'To create an empty commit on purpose: add --allow-empty.',
      ],
    );
  }

  ctx.emptyCommit = true;
  ctx.commitMessage = await askForMessage(suggestion || 'chore: empty commit');
  ctx.prTitle = ctx.commitMessage;
};

const SECRET_PATTERNS = [
  /(^|\/)\.env(\.(?!example$|sample$|template$)[^/]+)?$/iu,
  /\.(pem|key|p12|pfx)$/iu,
  /(^|\/)id_(rsa|ed25519|ecdsa)(\.pub)?$/u,
  /(^|\/)(credentials|secrets?)(\.json|\.ya?ml)?$/iu,
];
const LARGE_FILE_BYTES = 5 * 1024 * 1024;

const stageAndCommit = async () => {
  if (DRY_RUN) {
    return dryRunStep(
      ctx.hasChanges
        ? 'git add -A && git commit'
        : ctx.emptyCommit
          ? 'git commit --allow-empty'
          : 'skip (nothing to commit)',
    );
  }

  if (!ctx.hasChanges && !ctx.emptyCommit) {
    return SKIPPED;
  }

  if (ctx.hasChanges) {
    await run('git', ['add', '-A'], { captureOutput: true });

    let staged = (await git('diff', '--cached', '--name-only')).split('\n').filter(Boolean);
    const risky = [];

    for (const file of staged) {
      if (SECRET_PATTERNS.some((pattern) => pattern.test(file))) {
        risky.push(`${file}  (looks like a secret)`);
        continue;
      }
      const size = Number(
        await tryRun('git', ['cat-file', '-s', `:${file}`]).then((r) => r.stdout.trim() || 0),
      );
      if (size > LARGE_FILE_BYTES) {
        risky.push(`${file}  (${(size / 1024 / 1024).toFixed(1)} MB)`);
      }
    }

    if (risky.length > 0) {
      console.log(style.yellow('\n  ⚠ These staged files look risky:'));
      console.log(shortList(risky));
      const answer = await choose(
        'What do you want to do?',
        [
          { key: 'u', label: 'unstage them and commit the rest' },
          { key: 'k', label: 'commit them anyway' },
          { key: 'a', label: 'abort (nothing is committed)' },
        ],
        'u',
      );
      if (answer === 'a') {
        await tryRun('git', ['reset', '-q']);
        throw new UserError('Stopped before committing: risky files were staged.', [
          'Add the secret files to .gitignore, then run the script again.',
        ]);
      }
      if (answer === 'u') {
        const names = risky.map((entry) => entry.split('  (')[0]);
        await run('git', ['reset', '-q', '--', ...names], { captureOutput: true });
        staged = staged.filter((file) => !names.includes(file));
      }
    }

    if (staged.length === 0) {
      throw new UserError('Nothing is left to commit after unstaging.', [
        'Add the right files, then run the script again.',
      ]);
    }

    console.log(`  Committing ${plural(staged.length, 'file')}:`);
    console.log(shortList(staged, 15));
  }

  const commitArgs = ['commit', '-m', ctx.commitMessage.trim()];
  if (workItem) {
    // Footer only links the commit; the PR description is what moves the state.
    commitArgs.push('-m', `AB#${workItem.id}`);
  }
  if (ctx.emptyCommit) {
    commitArgs.push('--allow-empty');
  }
  await run('git', commitArgs);
};

const syncWithTarget = async () => {
  const ref = `origin/${baseName}`;
  const behind = await behindCount(ref);

  if (behind === 0) {
    console.log(`  Up to date with ${ref}.`);
    return SKIPPED;
  }

  const conflicts = await wouldConflict(ref);
  console.log(
    `  Your branch is ${plural(behind, 'commit')} behind ${ref}${conflicts ? style.yellow(' and it conflicts with it') : ''}.`,
  );

  if (DRY_RUN) {
    return dryRunStep(
      `git merge origin/${baseName}${conflicts ? ' (conflicts expected: you would be asked to resolve them)' : ''}`,
    );
  }

  const proceed = await confirm(
    `Merge ${ref} into ${branchName} now? (recommended: avoids conflicts in the PR)`,
    {
      defaultYes: true,
    },
  );

  if (!proceed) {
    console.log(style.yellow('  Skipped. GitHub may report conflicts when you merge.'));
    return SKIPPED;
  }

  await mergeRef(ref, ref);
};

const pushBranch = async () => {
  if (DRY_RUN) {
    return dryRunStep(`git push -u origin ${branchName}`);
  }

  const first = await tryRun('git', ['push', '-u', 'origin', branchName]);

  if (first.ok) {
    process.stdout.write(first.stdout);
    process.stderr.write(first.stderr);
    return;
  }

  const rejected = /non-fast-forward|fetch first|\[rejected\]/iu.test(
    `${first.stderr}${first.stdout}`,
  );
  if (!rejected) {
    throw first.error;
  }

  console.log(
    style.yellow(
      `\n  origin/${branchName} has commits that you do not have (a previous run, or someone else).`,
    ),
  );
  const merge = await confirm(`Merge origin/${branchName} into your branch, then push?`, {
    defaultYes: true,
  });

  if (!merge) {
    throw first.error;
  }

  await run('git', ['fetch', 'origin', branchName], { captureOutput: true });
  await mergeRef(`origin/${branchName}`, `origin/${branchName}`);
  await run('git', ['push', '-u', 'origin', branchName]);
  return;
};

const createOrUpdatePr = async () => {
  if (DRY_RUN) {
    return dryRunStep(
      ctx.pr
        ? `reuse PR #${ctx.pr.number}`
        : `gh pr create --base ${baseName}${hasFlag('draft') ? ' --draft' : ''}`,
      workItem
        ? `write "${prKeyword() || 'AB#'} AB#${workItem.id}" in its description`
        : 'create it with the commit list as description',
    );
  }

  if (ctx.pr) {
    console.log(`  Using PR ${style.cyan(`#${ctx.pr.number}`)}: ${ctx.pr.url}`);

    if (workItem && !String(ctx.pr.body ?? '').includes(`AB#${workItem.id}`)) {
      const add = await confirm(
        `PR #${ctx.pr.number} does not mention AB#${workItem.id}. Add the work item to its description?`,
        {
          defaultYes: true,
        },
      );
      if (add) {
        const body = `${String(ctx.pr.body ?? '').trim()}\n\n${workItemSection()}`.trim();
        await run('gh', ['pr', 'edit', String(ctx.pr.number), '--body', body], {
          captureOutput: true,
        });
        console.log(style.green('  ✔ Description updated'));
      }
    }
  } else {
    const title = (ctx.prTitle || ctx.commitMessage).trim();
    const commits = await git('log', '--format=- %s', `origin/${baseName}..HEAD`);
    const body = workItem ? buildPrBody(title) : `## Summary\n\n${commits}`;
    const args = [
      'pr',
      'create',
      '--base',
      baseName,
      '--head',
      branchName,
      '--title',
      title,
      '--body',
      body,
    ];
    if (hasFlag('draft')) {
      args.push('--draft');
    }

    const created = await tryRun('gh', args);

    if (created.ok) {
      prUrl = created.stdout.match(/https?:\/\/\S+/gu)?.at(-1) ?? '';
      ctx.prNumber = prNumberFromUrl(prUrl);
    } else if (/already exists/iu.test(created.stderr)) {
      const [existing] = (await listBranchPrs(branchName)).filter((pr) => pr.state === 'OPEN');
      if (!existing) {
        throw created.error;
      }
      console.log(style.yellow(`  A PR already existed (#${existing.number}); using it.`));
      ctx.pr = existing;
      ctx.prNumber = existing.number;
      prUrl = existing.url;
    } else {
      throw created.error;
    }
  }

  // Work has started: show it as in progress on the board until the merge.
  const notStarted = ['New', 'Approved'].includes(workItem?.state ?? '');
  if (workItem && boardUpdates() && notStarted && expectedState() !== 'Committed') {
    try {
      await setWorkItemState(workItem.id, 'Committed');
      workItem.state = 'Committed';
    } catch (error) {
      boardNotes.push(`Could not move AB#${workItem.id} to Committed: ${explain(error).title}`);
    }
  }

  return;
};

const waitForChecks = async () => {
  if (DRY_RUN) {
    return dryRunStep(`gh pr checks ${ctx.prNumber ?? '<new PR>'} --watch`);
  }
  if (hasFlag('no-merge')) {
    return SKIPPED;
  }
  if (prUrl) {
    console.log(`  ${style.dim('PR')}  ${style.cyan(prUrl)}`);
  }
  await watchChecks(ctx.prNumber);
  return;
};

const verifyChecks = async () => {
  if (DRY_RUN) {
    return dryRunStep(`verify the ${REQUIRED_CHECKS.length} required checks are green`);
  }
  if (hasFlag('no-merge')) {
    return SKIPPED;
  }
  const output = await gh('pr', 'checks', String(ctx.prNumber), '--json', 'name,bucket');
  assertRequiredChecksPassed(JSON.parse(output));
  return;
};

const mergePr = async () => {
  if (DRY_RUN) {
    return dryRunStep(
      `gh pr merge --${optionValue('merge-method') ?? 'merge'} --delete-branch (after conflict/draft/branch-protection checks)`,
    );
  }
  if (hasFlag('no-merge')) {
    console.log(`  --no-merge: the PR is ready: ${style.cyan(prUrl)}`);
    return SKIPPED;
  }

  const method = optionValue('merge-method') ?? 'merge';
  if (!['merge', 'squash', 'rebase'].includes(method)) {
    throw new UserError(`Unknown merge method "${method}".`, [
      'Use --merge-method=merge, squash or rebase.',
    ]);
  }
  const number = String(ctx.prNumber);

  if (!ctx.checksOk) {
    const proceed = await confirm('The required CI checks are not all green. Merge anyway?', {
      assumeYes: hasFlag('merge-anyway'),
      defaultYes: false,
    });
    if (!proceed && !hasFlag('merge-anyway')) {
      throw new UserError('Stopped before merging: the required CI checks are not all green.', [
        `The PR stays open: ${prUrl}`,
        'Fix the failures, push, then run the script again: it reuses this PR.',
        'To merge regardless: add --merge-anyway.',
      ]);
    }
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const state = await waitForMergeability(ctx.prNumber);

    if (state?.state === 'MERGED') {
      ctx.merged = true;
      console.log('  The PR is already merged.');
      return;
    }
    if (state?.state === 'CLOSED') {
      throw new UserError(`PR #${number} is closed.`, [
        `Reopen it: gh pr reopen ${number}`,
        'Then run the script again.',
      ]);
    }

    if (state?.isDraft) {
      const ready = await confirm(
        `PR #${number} is a draft. Mark it ready for review so it can be merged?`,
        { defaultYes: true },
      );
      if (!ready) {
        throw new UserError(`PR #${number} is a draft, so it cannot be merged.`, [
          `Mark it ready: gh pr ready ${number}`,
        ]);
      }
      await run('gh', ['pr', 'ready', number], { captureOutput: true });
    }

    const conflicting = state?.mergeable === 'CONFLICTING';
    const behind = state?.mergeStateStatus === 'BEHIND';

    if (conflicting || behind) {
      console.log(
        style.yellow(
          conflicting
            ? `\n  GitHub reports conflicts between ${branchName} and ${baseName}.`
            : `\n  ${baseName} moved on and the branch rules require an up-to-date branch.`,
        ),
      );
      await run('git', ['fetch', 'origin', baseName], { captureOutput: true });
      await mergeRef(`origin/${baseName}`, `origin/${baseName}`);
      await run('git', ['push', 'origin', branchName]);
      ctx.checksOk = true;
      try {
        await watchChecks(ctx.prNumber);
      } catch {
        ctx.checksOk = false;
      }
      continue;
    }

    const merged = await tryRun('gh', ['pr', 'merge', number, `--${method}`, '--delete-branch']);

    if (merged.ok) {
      ctx.merged = true;
      process.stdout.write(merged.stdout);
      return;
    }

    const text = `${merged.stderr}${merged.stdout}`;
    if (/conflict|not mergeable: the merge commit cannot be cleanly created/iu.test(text)) {
      continue;
    }

    if (
      /not mergeable|base branch policy|required status check|review required|Merging is blocked|is not in the correct state/iu.test(
        text,
      )
    ) {
      console.log(style.yellow(`\n  GitHub blocks the merge: ${lastLines(text, 1)}`));
      const auto = await confirm(
        'Enable auto-merge (GitHub merges by itself once the checks and reviews are satisfied)?',
        {
          defaultYes: true,
        },
      );
      if (auto) {
        await run('gh', ['pr', 'merge', number, `--${method}`, '--auto', '--delete-branch'], {
          captureOutput: true,
        });
        ctx.autoMerge = true;
        console.log(style.green('  ✔ Auto-merge enabled.'));
        return;
      }
    }

    throw merged.error;
  }

  throw new UserError(`Could not merge PR #${number} after 3 attempts.`, [
    `Open it and read the merge box: ${prUrl}`,
    'Then run the script again.',
  ]);
};

const switchToTarget = async () => {
  if (DRY_RUN) {
    return dryRunStep(`git switch ${baseName} && git pull --ff-only`);
  }
  if (!ctx.merged) {
    return SKIPPED;
  }
  await run('git', ['switch', baseName]);
  await run('git', ['pull', '--ff-only']);
  return;
};

const syncAzureBoard = async () => {
  const target = expectedState();
  if (!workItem || !boardUpdates() || !target) {
    return SKIPPED;
  }
  if (DRY_RUN) {
    return dryRunStep(`move AB#${workItem.id} to ${target} after the merge`);
  }
  if (!ctx.merged) {
    return SKIPPED;
  }

  if (baseName === ctx.defaultBranch) {
    // Azure applies "Fixes AB#id" a few seconds after the merge.
    let moved = false;
    for (let attempt = 0; attempt < 18 && !moved; attempt += 1) {
      moved = (await currentState(workItem.id)) === target;
      if (!moved) {
        await delay(5000);
      }
    }

    if (!moved) {
      await setWorkItemState(workItem.id, target);
      boardNotes.push(
        `Azure did not move AB#${workItem.id} to ${target} within 90s, so the script set it directly. Check the GitHub connection: node scripts/azure-boards-sync-check.mjs`,
      );
    }
  } else {
    await setWorkItemState(workItem.id, target);
    boardNotes.push(
      `Merged into ${baseName} (not ${ctx.defaultBranch}): AB#${workItem.id} set to ${target} by the script.`,
    );
  }

  workItem.finalState = target;

  if (target === 'Done') {
    const closed = await closeChildTasks(workItem.id);
    if (closed > 0) {
      boardNotes.push(`${closed} child task(s) of AB#${workItem.id} set to Done.`);
    }
  }

  return;
};

/* -------------------------------------------------------------------------- */
/*  Main flow                                                                 */
/* -------------------------------------------------------------------------- */

const HELP = `Git → PR → merge

Usage: node scripts/git-commit-push-pr.mjs [options]

  --base=<branch>         target branch of the PR (otherwise asked)
  --message="<msg>"       commit message (otherwise asked, suggested from the Azure ticket)
  --allow-empty           allow an empty commit when there is nothing to commit
  --draft                 create the PR as a draft
  --no-merge              stop once the PR is created/updated
  --merge-method=<m>      merge (default) | squash | rebase
  --merge-anyway          merge even when the required CI checks are not all green
  --yes                   never ask: take default answers (risky questions stay "no")
  --dry-run               show what would happen, change nothing
  --no-azure              ignore Azure Boards
  --no-board-update       read the Azure ticket but never change it
  --ticket=S2.3-T02       ticket id when the branch name has none
  --state=done|committed|approved|none   word before AB#id in the PR (default done = "Fixes")
`;

const main = async () => {
  if (hasFlag('help') || hasFlag('h')) {
    console.log(HELP);
    return;
  }

  let phaseNumber = 0;
  const phase = (action, options) => {
    phaseNumber += 1;
    return runPhase(PHASES[phaseNumber - 1], action, { ...options, step: phaseNumber });
  };

  console.log(
    style.bold(
      `\nGit → PR → merge   ${style.dim(`${TOTAL_PHASES} steps${DRY_RUN ? ' · dry run' : ''}`)}`,
    ),
  );

  await phase(checkEnvironment, { detail: 'checking git, gh and the branch' });
  await phase(chooseTargetBranch, { spinner: false });
  await phase(describeCommit, { spinner: false });
  await phase(stageAndCommit, { spinner: false });
  await phase(syncWithTarget, { spinner: false });
  await phase(pushBranch, { detail: 'git push' });
  await phase(createOrUpdatePr, { detail: 'gh pr create' });

  const checksWatchPassed = await phase(waitForChecks, { continueOnError: true, spinner: false });
  const checksPassed = await phase(verifyChecks, { continueOnError: true, detail: 'gh pr checks' });
  ctx.checksOk = checksWatchPassed && checksPassed;

  await phase(mergePr, { spinner: false });
  await phase(switchToTarget, { detail: 'git switch && git pull' });
  await phase(syncAzureBoard, { continueOnError: true, detail: 'waiting for Azure Boards…' });
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    await main();
    if (!hasFlag('help') && !hasFlag('h')) {
      printSummary();
    }
  } catch (error) {
    printSummary(error);
    process.exitCode = 1;
  }
}
