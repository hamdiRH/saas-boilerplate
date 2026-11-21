'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/utils/cn';

const ITEMS = [
  { href: '/dashboard/account/profile', key: 'profile' },
  { href: '/dashboard/account/security', key: 'security' },
  { href: '/dashboard/account/notifications', key: 'notifications' },
  { href: '/dashboard/account/pwa', key: 'pwa' },
] as const;

export function AccountNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm',
            pathname === item.href
              ? 'border-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground border-transparent',
          )}
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}
