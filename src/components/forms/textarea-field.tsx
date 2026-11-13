'use client';

import { useId } from 'react';
import type { ComponentProps } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import { FieldMessage } from '@/components/forms/field-message';
import { Field, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';

type TextareaFieldProps = { name: string; label: string } & Omit<
  ComponentProps<typeof Textarea>,
  'name'
>;

export function TextareaField({ name, label, ...props }: TextareaFieldProps) {
  const { control } = useFormContext();
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Textarea
            {...props}
            {...field}
            id={id}
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.invalid ? `${id}-error` : undefined}
          />
          <FieldMessage id={`${id}-error`} error={fieldState.error} />
        </Field>
      )}
    />
  );
}
