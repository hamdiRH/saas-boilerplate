'use client';

import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/libs/auth-client';
import { clearPwaData } from '@/libs/pwa/register';

interface Props {
  user: { name: string; email: string };
}

function initials(name: string) {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function UserMenu({ user }: Props) {
  const t = useTranslations('auth.userMenu');
  const router = useRouter();

  async function signOut() {
    // invalidates the session server-side and clears the cookie
    await authClient.signOut();
    // Nothing from this session may stay readable on a shared device.
    await clearPwaData();
    router.replace('/');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t('menuLabel')}>
        <Avatar className="size-8">
          <AvatarFallback>{initials(user.name) || '?'}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <p className="text-muted-foreground text-xs">{t('signedInAs')}</p>
            <p className="truncate text-sm font-medium">{user.email}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>{t('signOut')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
