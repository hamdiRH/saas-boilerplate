import { z } from 'zod';

import { AppError, ValidationError } from '@/libs/errors';
import { getLogger } from '@/libs/logger';

export interface ActionError {
  code: string;
  /** Full i18n key, e.g. "errors.validation" */
  messageKey: string;
  /** Field → list of i18n keys (Zod messages) */
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

type MaybePromise<T> = T | Promise<T>;

export interface ActionOptions {
  /**
   * Runs BEFORE input validation. Throw an AppError (e.g. `getSessionOrThrow`) to reject the call,
   * so anonymous callers learn nothing about the input schema.
   */
  guard?: () => MaybePromise<unknown>;
}

function toErrorResult(error: unknown): { ok: false; error: ActionError } {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        messageKey: error.messageKey,
        ...(error instanceof ValidationError && error.fieldErrors
          ? { fieldErrors: error.fieldErrors }
          : {}),
      },
      ok: false,
    };
  }

  // Unknown error: log details server-side, return a generic result to the client
  getLogger('app').error('Unhandled error in server action', { error });
  return { error: { code: 'INTERNAL', messageKey: 'errors.internal' }, ok: false };
}

/**
 * Wraps a server-side handler: optionally runs a guard first, validates input with Zod,
 * maps known errors to typed results, logs and hides unknown errors.
 */
export function createAction<S extends z.ZodType, R>(
  schema: S,
  handler: (input: z.output<S>) => MaybePromise<R>,
  options: ActionOptions = {},
): (raw: unknown) => Promise<ActionResult<Awaited<R>>> {
  return async (raw: unknown): Promise<ActionResult<Awaited<R>>> => {
    try {
      await options.guard?.();
    } catch (error) {
      return toErrorResult(error);
    }

    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      // 🔍 Zod 4: z.flattenError(error). (Zod 3: parsed.error.flatten())
      const { fieldErrors } = z.flattenError(parsed.error);

      return {
        error: {
          code: 'VALIDATION_ERROR',
          fieldErrors: fieldErrors as Record<string, string[]>,
          messageKey: 'errors.validation',
        },
        ok: false,
      };
    }

    try {
      return { data: await handler(parsed.data), ok: true };
    } catch (error) {
      return toErrorResult(error);
    }
  };
}
