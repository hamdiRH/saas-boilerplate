import { describe, expect, it } from 'vitest';

import { assertRequiredChecksPassed } from '../scripts/git-commit-push-pr.mjs';

const passingChecks = [
  { bucket: 'pass', name: 'Quality (types, lint, format, knip)' },
  { bucket: 'pass', name: 'Tests (unit + browser)' },
  { bucket: 'pass', name: 'Build' },
  { bucket: 'pass', name: 'Commit messages' },
];

describe('assertRequiredChecksPassed', () => {
  it('accepts all four passing CI jobs', () => {
    expect(() => assertRequiredChecksPassed(passingChecks)).not.toThrow();
  });

  it('rejects a failed job', () => {
    const checks = passingChecks.map((check) =>
      check.name === 'Build' ? { ...check, bucket: 'fail' } : check,
    );

    expect(() => assertRequiredChecksPassed(checks)).toThrow('Build: check did not pass.');
  });

  it('rejects a missing job', () => {
    expect(() => assertRequiredChecksPassed(passingChecks.slice(0, 3))).toThrow(
      'Commit messages: expected one check, found 0.',
    );
  });
});
