'use client';

import { useId } from 'react';
import type { ComponentProps } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import { FieldMessage } from '@/components/forms/field-message';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type TextFieldProps = { name: string; label: string } & Omit<ComponentProps<typeof Input>, 'name'>;

export function TextField({ name, label, ...inputProps }: TextFieldProps) {
  const { control } = useFormContext();
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <Input
            {...inputProps}
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
