import type { Route } from 'next';
import Link from 'next/link';

import { MobileNav } from '@/components/layout/mobile-nav';
import type { NavLink } from '@/components/layout/mobile-nav';
import { Button } from '@/components/ui/button';

const links: readonly NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/contact', label: 'Contact' },
];

const SiteHeader = () => (
  <header className="border-b">
    <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
      <Link href="/" className="font-semibold">
        SaaS Boilerplate
      </Link>

      <nav className="hidden items-center gap-6 text-sm md:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href as Route}
            className="text-muted-foreground hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm">
          <Link href={'/sign-in' as Route}>Sign in</Link>
        </Button>
        <Button size="sm" className="hidden sm:inline-flex">
          <Link href={'/sign-up' as Route}>Get started</Link>
        </Button>
        <MobileNav links={links} />
      </div>
    </div>
  </header>
);

export { SiteHeader };
export default SiteHeader;
