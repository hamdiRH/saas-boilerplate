import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

import { MobileNav } from '@/components/layout/mobile-nav';
import type { NavLink } from '@/components/layout/mobile-nav';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { requireSession } from '@/data/session';
import { Link } from '@/i18n/navigation';

async function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  // cached per request; pages call it too
  const { user } = await requireSession();
  const t = await getTranslations();

  const links: readonly NavLink[] = [
    { href: '/dashboard', label: t('nav.dashboard') },
    { href: '/dashboard/account/profile', label: t('nav.account') },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-e p-4 md:block">
        <p className="mb-6 font-semibold">{t('common.appName')}</p>
        <nav className="flex flex-col gap-2 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <MobileNav links={links} />
          <span className="text-muted-foreground text-sm">{t('nav.workspace')}</span>
          <div className="ms-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu user={{ email: user.email, name: user.name }} />
          </div>
        </header>
        <main id="main" className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function AppLayoutFallback() {
  return (
    <div className="flex min-h-screen" aria-hidden="true">
      <aside className="hidden w-60 shrink-0 border-e p-4 md:block">
        <Skeleton className="mb-6 h-5 w-32" />
        <Skeleton className="h-8 w-full" />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center border-b px-4">
          <Skeleton className="h-4 w-24" />
        </header>
        <main className="flex-1 p-6">
          <Skeleton className="h-8 w-40" />
        </main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppLayoutFallback />}>
      <AuthenticatedAppLayout>{children}</AuthenticatedAppLayout>
    </Suspense>
  );
}
