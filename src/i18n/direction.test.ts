import { expect, it } from 'vitest';

import { getDirection } from './direction';

it('returns rtl only for right-to-left locales', () => {
  expect(getDirection('ar')).toBe('rtl');
  expect(getDirection('en')).toBe('ltr');
  expect(getDirection('fr')).toBe('ltr');
});
