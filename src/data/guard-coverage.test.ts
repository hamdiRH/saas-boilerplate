import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Every route group the proxy treats as protected (see PROTECTED_PREFIXES in route-guard.ts).
const PROTECTED_ROOTS = [
  path.join('src', 'app', '[locale]', '(app)'),
  path.join('src', 'app', '[locale]', '(admin)'),
];

describe.each(PROTECTED_ROOTS)('%s', (root) => {
  it('every page calls requireSession() itself', () => {
    const pages = (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => file.endsWith('page.tsx'))
      .map((file) => path.join(root, file));

    expect(pages.length).toBeGreaterThan(0);

    const unguarded = pages.filter(
      (file) => !/require(?:Session|Admin)\(/u.test(readFileSync(file, 'utf-8')),
    );

    // Layouts are NOT re-rendered on client navigations — a layout-only guard is not a guard.
    expect(unguarded, `Pages without a guard:\n${unguarded.join('\n')}`).toEqual([]);
  });
});
