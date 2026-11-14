import { describe, expect, it } from 'vitest';

import { buildSignInRedirect, isProtectedPath, localizedPath, splitLocale } from './route-guard';

describe('splitLocale', () => {
  it('detects a locale prefix', () => {
    expect(splitLocale('/fr/dashboard/x')).toEqual({ locale: 'fr', path: '/dashboard/x' });
    expect(splitLocale('/fr')).toEqual({ locale: 'fr', path: '/' });
  });
  it('falls back to the default locale', () => {
    expect(splitLocale('/dashboard')).toEqual({ locale: 'en', path: '/dashboard' });
    expect(splitLocale('/')).toEqual({ locale: 'en', path: '/' });
    expect(splitLocale('/dashboard/')).toEqual({ locale: 'en', path: '/dashboard' });
  });
});

describe('isProtectedPath', () => {
  it('protects dashboard and admin trees only', () => {
    expect(isProtectedPath('/dashboard')).toBe(true);
    expect(isProtectedPath('/dashboard/account/profile')).toBe(true);
    expect(isProtectedPath('/admin')).toBe(true);
    expect(isProtectedPath('/dashboards')).toBe(false);
    expect(isProtectedPath('/sign-in')).toBe(false);
    expect(isProtectedPath('/')).toBe(false);
  });
});

describe('buildSignInRedirect', () => {
  it('keeps the visitor’s language and encodes the callback', () => {
    expect(buildSignInRedirect('/dashboard', '?tab=1')).toBe(
      '/sign-in?callbackUrl=%2Fdashboard%3Ftab%3D1',
    );
    expect(buildSignInRedirect('/fr/dashboard', '')).toBe(
      '/fr/sign-in?callbackUrl=%2Ffr%2Fdashboard',
    );
  });
});

it('localizedPath omits the prefix for the default locale', () => {
  expect(localizedPath('en', '/sign-in')).toBe('/sign-in');
  expect(localizedPath('fr', '/sign-in')).toBe('/fr/sign-in');
  expect(localizedPath('fr', '/')).toBe('/fr');
});
