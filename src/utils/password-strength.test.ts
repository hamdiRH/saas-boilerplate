import { expect, it } from 'vitest';

import { scorePassword } from './password-strength';

it('scores weak to strong', () => {
  expect(scorePassword('')).toBe(0);
  expect(scorePassword('aaaaaaaaaaaaaaaa')).toBe(0);
  expect(scorePassword('short')).toBe(0);
  expect(scorePassword('Str0ngPassw0rd')).toBeGreaterThanOrEqual(3);
  expect(scorePassword('Str0ng-Passw0rd-Is-Long!')).toBe(4);
});
