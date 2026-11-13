import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { MobileNav } from '@/components/layout/mobile-nav';
import type { NavLink } from '@/components/layout/mobile-nav';
import { Button } from '@/components/ui/button';

import { ThemeToggle } from './theme-toggle';

const SiteHeader = () => {
  const t = useTranslations();
  const links: readonly NavLink[] = [
    { href: '/', label: t('nav.home') },
    { href: '/contact', label: t('nav.contact') },
  ];
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href={'/' as Route} className="font-semibold">
          {t('common.appName')}
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
          <LocaleSwitcher />
          <ThemeToggle />
          <Button variant="ghost" size="sm">
            <Link href="/sign-in">{t('nav.signIn')}</Link>
          </Button>
          <Button size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-up">{t('nav.getStarted')}</Link>
          </Button>
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  );
};

export { SiteHeader };
