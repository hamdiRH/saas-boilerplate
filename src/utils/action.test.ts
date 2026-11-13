import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConflictError } from '@/libs/errors';

import { createAction } from './action';

const schema = z.object({ email: z.email({ message: 'validation.email' }) });
describe('createAction', () => {
  it('returns data for valid input', async () => {
    const action = createAction(schema, ({ email }) => ({ echoed: email }));

    expect(await action({ email: 'a@b.co' })).toEqual({ data: { echoed: 'a@b.co' }, ok: true });
  });

  it('returns translated-key field errors for invalid input and never runs the handler', async () => {
    let called = false;
    const action = createAction(schema, () => {
      called = true;
    });

    const result = await action({ email: 'nope' });

    expect(called).toBe(false);
    expect(result).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fieldErrors: { email: ['validation.email'] } },
      ok: false,
    });
  });

  it('maps AppError to its code and message key', async () => {
    const action = createAction(schema, () => {
      throw new ConflictError();
    });
    expect(await action({ email: 'a@b.co' })).toEqual({
      error: { code: 'CONFLICT', messageKey: 'errors.conflict' },
      ok: false,
    });
  });

  it('hides unknown errors behind INTERNAL', async () => {
    const action = createAction(schema, () => {
      throw new Error('secret db detail');
    });
    const result = await action({ email: 'a@b.co' });

    expect(result).toEqual({
      error: { code: 'INTERNAL', messageKey: 'errors.internal' },
      ok: false,
    });
    expect(JSON.stringify(result)).not.toContain('secret db detail');
  });
});
