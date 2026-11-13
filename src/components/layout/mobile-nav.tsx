'use client';

import { Menu } from 'lucide-react';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Link } from '@/i18n/navigation';

export interface NavLink {
  href: string;
  label: string;
}

const MobileNav = ({ links }: { links: readonly NavLink[] }) => {
  const [open, setOpen] = useState(false);
  const t = useTranslations('common');
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('openMenu')}>
            <Menu className="size-5" />
          </Button>
        }
      />
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>{t('menu')}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-4 p-4">
          {links.map((link) => (
            <Link key={link.href} href={link.href as Route} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
};

export { MobileNav };
