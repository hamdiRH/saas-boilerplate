'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { revokeOtherSessions, revokeSession } from '@/actions/account';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SessionSummary } from '@/data/sessions';
import { useRouter } from '@/i18n/navigation';

export function SessionsList({ sessions }: { sessions: SessionSummary[] }) {
  const t = useTranslations('account.sessions');
  const tErrors = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: boolean; error?: { messageKey: string } }>) {
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        toast.success(t('revoked'));
        router.refresh();
      } else if (result.error) {
        toast.error(
          tErrors.has(result.error.messageKey as never)
            ? tErrors(result.error.messageKey as never)
            : tErrors('errors.internal'),
        );
      }
    });
  }

  const others = sessions.filter((item) => !item.current);

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-md border">
        {sessions.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                {item.device}
                {item.current ? <Badge variant="secondary">{t('current')}</Badge> : null}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {item.ip ? `${item.ip} · ` : ''}
                {t('lastActive', {
                  date: format.dateTime(new Date(item.updatedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
              </p>
            </div>
            {item.current ? null : (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => revokeSession({ sessionId: item.id }))}
              >
                {t('revoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {others.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => revokeOtherSessions())}
        >
          {t('revokeOthers')}
        </Button>
      )}
    </div>
  );
}
