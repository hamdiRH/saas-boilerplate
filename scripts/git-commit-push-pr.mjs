import { execFile } from 'node:child_process';
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
const TOTAL_PHASES = 9;
const execFileAsync = promisify(execFile);

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

export const runPhase = async (label, action, { continueOnError = false } = {}) => {
  const startedAt = Date.now();
  console.log(`\n==> ${label}`);

  try {
    await action();
    console.log(`[PASS] ${label} (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null) {
      if ('stdout' in error && typeof error.stdout === 'string' && error.stdout) {
        process.stdout.write(error.stdout);
      }

      if ('stderr' in error && typeof error.stderr === 'string' && error.stderr) {
        process.stderr.write(error.stderr);
      }
    }

    const status = continueOnError ? 'WARN' : 'FAIL';
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[${status}] ${label} (${((Date.now() - startedAt) / 1000).toFixed(1)}s): ${message}`,
    );

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

  if (!captureOutput && stdout) {
    process.stdout.write(stdout);
  }

  if (stderr) {
    process.stderr.write(stderr);
  }

  return stdout;
};

const main = async () => {
  let phaseNumber = 0;
  const phase = (label, action, options) => {
    phaseNumber += 1;
    return runPhase(`[${phaseNumber}/${TOTAL_PHASES}] ${label}`, action, options);
  };
  let branch = '';

  await phase('Validate the current branch', async () => {
    const branchOutput = await run('git', ['branch', '--show-current'], {
      captureOutput: true,
    });
    branch = branchOutput.trim();

    if (!branch) {
      throw new Error('Could not determine the current Git branch.');
    }

    if (branch === 'main') {
      throw new Error('Refusing to create a PR from main. Switch to a ticket branch.');
    }
  });

  let commitMessage;
  await phase('Collect the commit description', async () => {
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
  });

  await phase('Stage and commit changes', async () => {
    await run('git', ['add', '-A']);

    const stagedFilesOutput = await run('git', ['diff', '--cached', '--name-only'], {
      captureOutput: true,
    });

    if (!stagedFilesOutput.trim()) {
      throw new Error('There are no staged changes to commit.');
    }

    await run('git', ['commit', '-m', commitMessage.trim()]);
  });

  await phase('Push branch to origin', () => run('git', ['push', '-u', 'origin', branch]));
  await phase('Create pull request', () => run('gh', ['pr', 'create', '--fill', '--base', 'main']));

  const checksWatchPassed = await phase(
    'Wait for GitHub PR checks',
    async () => {
      await delay(5000);
      await run('gh', ['pr', 'checks', '--watch']);
    },
    { continueOnError: true },
  );

  const checksPassed = await phase(
    'Verify required CI checks',
    async () => {
      const checksOutput = await run('gh', ['pr', 'checks', '--json', 'name,bucket'], {
        captureOutput: true,
      });
      assertRequiredChecksPassed(JSON.parse(checksOutput));
    },
    { continueOnError: true },
  );

  if (!checksWatchPassed || !checksPassed) {
    console.warn(
      'One or more CI check steps reported a problem. Continuing to the merge attempt; GitHub branch protection may block it.',
    );
  }

  await phase('Merge pull request', () => run('gh', ['pr', 'merge', '--merge', '--delete-branch']));
  await phase('Switch to main and pull latest changes', async () => {
    await run('git', ['switch', 'main']);
    await run('git', ['pull']);
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    await main();
  } catch (error) {
    console.error(`[STOP] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
