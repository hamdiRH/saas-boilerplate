import type { Route } from 'next';
import { useTranslations } from 'next-intl';

import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { MobileNav } from '@/components/layout/mobile-nav';
import type { NavLink } from '@/components/layout/mobile-nav';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

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
        <Link href="/" className="font-semibold">
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
          {/* Links styled as buttons: a <button> must never wrap an <a>. */}
          <Link href="/sign-in" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
            {t('nav.signIn')}
          </Link>
          <Link
            href="/sign-up"
            className={`${buttonVariants({ size: 'sm' })} hidden sm:inline-flex`}
          >
            {t('nav.getStarted')}
          </Link>
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  );
};

export { SiteHeader };
