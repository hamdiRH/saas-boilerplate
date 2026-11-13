'use client';

import { useLocale, useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/utils/cn';

export function LocaleSwitcher() {
  const t = useTranslations('locale');
  const current = useLocale();
  // locale-less path, e.g. "/contact"
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex items-center gap-1 text-sm">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          lang={locale}
          hrefLang={locale}
          aria-label={t(locale)}
          aria-current={locale === current ? 'true' : undefined}
          className={cn(
            'rounded px-2 py-1 uppercase',
            locale === current
              ? 'bg-muted font-semibold'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {locale}
        </Link>
      ))}
    </nav>
  );
}
