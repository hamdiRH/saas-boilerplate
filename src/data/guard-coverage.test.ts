import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

const PROTECTED_ROOT = path.join('src', 'app', '[locale]', '(app)');

it('every page under (app) calls requireSession() itself', () => {
  const pages = (readdirSync(PROTECTED_ROOT, { recursive: true }) as string[])
    .filter((file) => file.endsWith('page.tsx'))
    .map((file) => path.join(PROTECTED_ROOT, file));

  expect(pages.length).toBeGreaterThan(0);

  const unguarded = pages.filter(
    (file) => !/require(?:Session|Admin)\(/u.test(readFileSync(file, 'utf-8')),
  );

  // Layouts are NOT re-rendered on client navigations — a layout-only guard is not a guard.
  expect(unguarded, `Pages without a guard:\n${unguarded.join('\n')}`).toEqual([]);
});
