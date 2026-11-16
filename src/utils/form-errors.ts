import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import type { ActionError } from '@/utils/action';

/** Puts field errors under their inputs; returns the key for a form-level error (or null). */
export function applyActionError<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: ActionError,
): string | null {
  if (!error.fieldErrors) {
    return error.messageKey;
  }

  for (const [field, keys] of Object.entries(error.fieldErrors) as [string, string[]][]) {
    const [key] = keys;
    if (key) {
      form.setError(field as Path<T>, { message: key });
    }
  }
  return null;
}
