import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { MobileNav } from '@/components/layout/mobile-nav';
import type { NavLink } from '@/components/layout/mobile-nav';

const links: readonly NavLink[] = [{ href: '/dashboard', label: 'Dashboard' }];

const AppLayout = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen">
    <aside className="hidden w-60 shrink-0 border-e p-4 md:block">
      <p className="mb-6 font-semibold">SaaS Boilerplate</p>
      <nav className="flex flex-col gap-2 text-sm">
        {links.map((link) => (
          <Link key={link.href} href={link.href as Route} className="hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <MobileNav links={links} />
        <span className="text-muted-foreground text-sm">Workspace</span>
      </header>
      <main id="main" className="flex-1 p-6">
        {children}
      </main>
    </div>
  </div>
);

export default AppLayout;
