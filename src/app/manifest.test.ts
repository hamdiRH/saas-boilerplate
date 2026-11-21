import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { APPLE_TOUCH_ICON, PWA_ICONS } from '@/libs/pwa/brand';

import manifest from './manifest';

const publicDir = path.join(process.cwd(), 'public');

/** Case-exact check: Linux is case-sensitive even if the developer's machine is not. */
function existsExact(publicPath: string): boolean {
  const relative = publicPath.replace(/^\//u, '');
  const directory = path.dirname(relative);
  const file = path.basename(relative);
  const folder = path.join(publicDir, directory);
  return existsSync(folder) && readdirSync(folder).includes(file);
}

describe('web app manifest', () => {
  const value = manifest();

  it('has the fields browsers need to offer installation', () => {
    expect(value.name).toBeTruthy();
    expect(value.short_name).toBeTruthy();
    expect(value.start_url).toBe('/?source=pwa');
    expect(value.display).toBe('standalone');
    expect(value.scope).toBe('/');
    expect(value.theme_color).toBe('#635BFF');
    expect(value.background_color).toBe('#0F172A');
  });

  it('keeps the short name short enough for a home screen', () => {
    expect(value.short_name?.length).toBeLessThanOrEqual(12);
  });

  it('declares 192, 512 and a maskable icon', () => {
    const icons = value.icons ?? [];
    expect(icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any')).toBe(true);
    expect(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true);
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('only references icon files that exist, with exact casing', () => {
    for (const icon of [...PWA_ICONS, { src: APPLE_TOUCH_ICON }]) {
      expect(existsExact(icon.src), icon.src).toBe(true);
    }
  });
});
