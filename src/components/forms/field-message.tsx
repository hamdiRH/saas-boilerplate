'use client';

import { useTranslations } from 'next-intl';
import type { FieldError as RhfFieldError } from 'react-hook-form';

import { FieldError } from '@/components/ui/field';

interface FieldMessageProps {
  /** `fieldState.error` from RHF's Controller. */
  error?: RhfFieldError;
  /** Id referenced by the input's `aria-describedby`. */
  id?: string;
}

/** Renders the field error, translating the Zod message key. Place right after the control, inside <Field>. */
export function FieldMessage({ error, id }: FieldMessageProps) {
  const t = useTranslations();

  if (!error?.message) {
    return null;
  }

  const key = error.message;
  return (
    <FieldError id={id}>
      {t.has(key as never) ? t(key as never) : t('validation.invalid')}
    </FieldError>
  );
}
