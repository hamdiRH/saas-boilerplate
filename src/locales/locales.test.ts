import { expect, it } from 'vitest';

import en from './en.json';
import fr from './fr.json';

function flatten(value: unknown, prefix = ''): string[] {
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      flatten(child, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

it('has exactly the same keys in every locale', () => {
  expect(flatten(fr).toSorted()).toEqual(flatten(en).toSorted());
});
