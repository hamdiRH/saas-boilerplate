import { describe, expect, it, vi } from 'vitest';

import { assertRequiredChecksPassed, runPhase } from '../scripts/git-commit-push-pr.mjs';

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

describe('runPhase', () => {
  it('continues after a failed non-blocking phase', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const succeeded = await runPhase(
        'Wait for GitHub PR checks',
        () => {
          throw new Error('A check failed');
        },
        { continueOnError: true },
      );

      expect(succeeded).toBe(false);
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] Wait for GitHub PR checks'),
      );
    } finally {
      errorLog.mockRestore();
    }
  });
});
