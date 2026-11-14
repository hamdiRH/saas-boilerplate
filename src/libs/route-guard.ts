import { routing } from '@/i18n/routing';

const PROTECTED_PREFIXES = ['/dashboard', '/admin'] as const;
const locales: readonly string[] = routing.locales;

/** "/fr/dashboard/x" → { locale: "fr", path: "/dashboard/x" }; "/dashboard" → { locale: "en", path: "/dashboard" } */
export function splitLocale(pathname: string): { locale: string; path: string } {
  const [, first, ...rest] = pathname.split('/');
  if (first && locales.includes(first)) {
    const path = `/${rest.join('/')}`.replace(/\/+$/u, '');
    return { locale: first, path: path === '' ? '/' : path };
  }
  const path = pathname.replace(/\/+$/u, '');
  return { locale: routing.defaultLocale, path: path === '' ? '/' : path };
}

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function localizedPath(locale: string, path: string): string {
  if (locale === routing.defaultLocale) {
    return path;
  }
  return `/${locale}${path === '/' ? '' : path}`;
}

/** Where to send an unauthenticated visitor, remembering where they wanted to go. */
export function buildSignInRedirect(pathname: string, search: string): string {
  const { locale } = splitLocale(pathname);
  return `${localizedPath(locale, '/sign-in')}?callbackUrl=${encodeURIComponent(pathname + search)}`;
}
