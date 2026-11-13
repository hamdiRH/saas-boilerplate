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
  'Collect the commit description',
  'Stage and commit changes',
  'Push branch to origin',
  'Create pull request',
  'Wait for GitHub PR checks',
  'Verify required CI checks',
  'Merge pull request',
  'Switch to main and pull latest changes',
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
    if (char === '\uFE0F') {
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
  const print = status === 'PASS' ? console.log : console.error;

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
/*  Run state + final summary                                                 */
/* -------------------------------------------------------------------------- */

const scriptStartedAt = Date.now();
const results = [];
let branchName = '';
let prUrl = '';

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

  const notes = rows.filter(
    (row) => row.message && (row.status === 'WARN' || row.status === 'FAIL'),
  );

  if (notes.length > 0) {
    console.log('');
    console.log(style.bold('  Details'));

    for (const note of notes) {
      const { emoji, color } = STATUS[note.status];
      console.log(`  ${color(`${USE_EMOJI ? `${emoji} ` : ''}Step ${note.step} · ${note.label}`)}`);

      for (const line of note.message.split('\n')) {
        console.log(style.dim(`     ${line}`));
      }
    }
  }

  console.log('');
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
    await action();
    stopSpinner();

    const result = { label, seconds: seconds(), status: 'PASS', step };
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

    const result = {
      label,
      message: error instanceof Error ? error.message : String(error),
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
  const phase = (action, options) => {
    phaseNumber += 1;
    return runPhase(PHASES[phaseNumber - 1], action, { ...options, step: phaseNumber });
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

  let commitMessage;
  await phase(
    async () => {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        commitMessage = await readline.question(
          'Commit description (for example, feat(auth): add sign-in): ',
        );
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

      await run('git', ['commit', '-m', commitMessage.trim()]);
    },
    { detail: 'git add -A && git commit' },
  );

  await phase(() => run('git', ['push', '-u', 'origin', branchName]), {
    detail: `git push -u origin ${branchName}`,
  });

  await phase(
    async () => {
      const output = await run('gh', ['pr', 'create', '--fill', '--base', 'main'], {
        captureOutput: true,
      });
      prUrl = output.match(/https?:\/\/\S+/gu)?.at(-1) ?? '';
    },
    { detail: 'gh pr create --fill --base main' },
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
