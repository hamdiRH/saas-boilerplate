'use client';

import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';

export function SubmitButton({
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'type' | 'disabled'>) {
  const {
    formState: { isSubmitting },
  } = useFormContext();

  return (
    <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} {...props}>
      {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}
