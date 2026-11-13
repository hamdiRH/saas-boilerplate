import type { LogRecord } from '@logtape/logtape';
import { describe, expect, it, vi } from 'vitest';

import { REDACTED, redactValue, withRedaction } from './logger-redaction';

describe('redactValue', () => {
  it('masks sensitive keys at any depth, case-insensitively', () => {
    const input = {
      Password: 'hunter2',
      headers: { Authorization: 'Bearer x', cookie: 'sid=1' },
      nested: { accessToken: 'abc', list: [{ apiKey: 'k', name: 'n' }], ok: 1 },
      user: 'ada',
    };

    expect(redactValue(input)).toEqual({
      Password: REDACTED,
      headers: { Authorization: REDACTED, cookie: REDACTED },
      nested: { accessToken: REDACTED, list: [{ apiKey: REDACTED, name: 'n' }], ok: 1 },
      user: 'ada',
    });
  });

  it('leaves dates, errors and primitives untouched', () => {
    const date = new Date();
    const error = new Error('x');
    expect(redactValue(date)).toBe(date);
    expect(redactValue(error)).toBe(error);
    expect(redactValue(42)).toBe(42);
  });
});

describe('withRedaction', () => {
  it('passes a redacted copy to the wrapped sink', () => {
    const inner = vi.fn();
    const sink = withRedaction(inner);

    sink({
      category: ['app'],
      level: 'info',
      message: ['hi'],
      properties: { id: 1, password: 'p' },
      rawMessage: 'hi',
      timestamp: 0,
    } as LogRecord);

    expect(inner).toHaveBeenCalledOnce();
    expect(inner.mock.calls[0]?.[0].properties).toEqual({ id: 1, password: REDACTED });
  });
});
