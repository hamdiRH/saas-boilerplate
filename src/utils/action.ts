import { z } from 'zod';

import { AppError } from '@/libs/errors';
import { getLogger } from '@/libs/logger';

interface ActionError {
  code: string;
  /** Full i18n key, e.g. "errors.validation" */
  messageKey: string;
  /** Field → list of i18n keys (Zod messages) */
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

type MaybePromise<T> = T | Promise<T>;

/**
 * Wraps a server-side handler: validates input with Zod, maps known errors to
 * typed results, logs and hides unknown errors.
 */
export function createAction<S extends z.ZodType, R>(
  schema: S,
  handler: (input: z.output<S>) => MaybePromise<R>,
): (raw: unknown) => Promise<ActionResult<Awaited<R>>> {
  return async (raw: unknown): Promise<ActionResult<Awaited<R>>> => {
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
      if (error instanceof AppError) {
        return { error: { code: error.code, messageKey: error.messageKey }, ok: false };
      }

      // Unknown error: log details server-side, return a generic result to the client
      getLogger('app').error('Unhandled error in server action', { error });
      return { error: { code: 'INTERNAL', messageKey: 'errors.internal' }, ok: false };
    }
  };
}
