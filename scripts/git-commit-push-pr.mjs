import { execFile } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';

const REQUIRED_CHECKS = [
  'Quality (types, lint, format, knip)',
  'Tests (unit + browser)',
  'Build',
  'Commit messages',
];
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
  const branchOutput = await run('git', ['branch', '--show-current'], {
    captureOutput: true,
  });
  const branch = branchOutput.trim();

  if (!branch) {
    throw new Error('Could not determine the current Git branch.');
  }

  if (branch === 'main') {
    throw new Error('Refusing to create a PR from main. Switch to a ticket branch.');
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let commitMessage;

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

  await run('git', ['add', '-A']);

  const stagedFilesOutput = await run('git', ['diff', '--cached', '--name-only'], {
    captureOutput: true,
  });
  const stagedFiles = stagedFilesOutput.trim();

  if (!stagedFiles) {
    throw new Error('There are no staged changes to commit.');
  }

  await run('git', ['commit', '-m', commitMessage.trim()]);
  await run('git', ['push', '-u', 'origin', branch]);
  await run('gh', ['pr', 'create', '--fill', '--base', 'main']);
  await run('gh', ['pr', 'checks', '--watch']);

  const checksOutput = await run('gh', ['pr', 'checks', '--json', 'name,bucket'], {
    captureOutput: true,
  });
  assertRequiredChecksPassed(JSON.parse(checksOutput));

  await run('gh', ['pr', 'merge', '--merge', '--delete-branch']);
  await run('git', ['switch', 'main']);
  await run('git', ['pull']);
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    await main();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'stderr' in error) {
      process.stderr.write(String(error.stderr));
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
