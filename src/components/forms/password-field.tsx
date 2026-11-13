'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ComponentProps } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import { FieldMessage } from '@/components/forms/field-message';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type PasswordFieldProps = { name: string; label: string } & Omit<
  ComponentProps<typeof Input>,
  'name' | 'type'
>;

export function PasswordField({ name, label, ...props }: PasswordFieldProps) {
  const t = useTranslations('common');
  const { control } = useFormContext();
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              {...props}
              {...field}
              id={id}
              type={visible ? 'text' : 'password'}
              className="flex-1"
              aria-invalid={fieldState.invalid}
              aria-describedby={fieldState.invalid ? `${id}-error` : undefined}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={visible ? t('hidePassword') : t('showPassword')}
              aria-pressed={visible}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
          <FieldMessage id={`${id}-error`} error={fieldState.error} />
        </Field>
      )}
    />
  );
}
