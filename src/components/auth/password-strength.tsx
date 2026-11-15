'use client';

import { useTranslations } from 'next-intl';
import { useWatch } from 'react-hook-form';

import { cn } from '@/utils/cn';
import { scorePassword } from '@/utils/password-strength';

const LABELS = ['veryWeak', 'weak', 'fair', 'good', 'strong'] as const;
const COLORS = [
  'bg-destructive',
  'bg-destructive',
  'bg-yellow-500',
  'bg-green-500',
  'bg-green-600',
] as const;

export function PasswordStrength({ name }: { name: string }) {
  const t = useTranslations('auth.signUp');
  const value = useWatch({ name }) as string | undefined;
  const score = scorePassword(value ?? '');

  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn('h-1 flex-1 rounded', index < score ? COLORS[score] : 'bg-muted')}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {t('strengthLabel')}: {t(`strength.${LABELS[score]}`)}
      </p>
    </div>
  );
}
