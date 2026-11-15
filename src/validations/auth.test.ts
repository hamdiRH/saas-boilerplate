import { describe, expect, it } from 'vitest';

import { signInSchema, signUpSchema } from './auth';

const valid = {
  confirmPassword: 'Str0ng-Passw0rd',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  password: 'Str0ng-Passw0rd',
};

const messagesFor = (input: unknown, field: string) => {
  const result = signUpSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.filter((i) => i.path[0] === field).map((i) => i.message);
};

describe('signUpSchema', () => {
  it('accepts valid input', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects short, simple and mismatching passwords with translation keys', () => {
    expect(
      messagesFor({ ...valid, confirmPassword: 'Short1', password: 'Short1' }, 'password'),
    ).toContain('validation.passwordMin');
    expect(
      messagesFor(
        { ...valid, confirmPassword: 'alllowercase123', password: 'alllowercase123' },
        'password',
      ),
    ).toContain('validation.passwordComplexity');
    expect(
      messagesFor({ ...valid, confirmPassword: 'Different-Passw0rd' }, 'confirmPassword'),
    ).toEqual(['validation.passwordMismatch']);
  });

  it('rejects invalid email and short name', () => {
    expect(messagesFor({ ...valid, email: 'nope' }, 'email')).toEqual(['validation.email']);
    expect(messagesFor({ ...valid, name: 'A' }, 'name')).toEqual(['validation.nameMin']);
  });
});

it('signInSchema only requires a non-empty password (no policy leak at sign-in)', () => {
  expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
});
