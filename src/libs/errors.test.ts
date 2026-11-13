import { describe, expect, it } from 'vitest';

import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors';

describe('AppError hierarchy', () => {
  const errorMappings = [
    [new ValidationError(), 400, 'VALIDATION_ERROR', 'errors.validation'],
    [new AuthenticationError(), 401, 'UNAUTHENTICATED', 'errors.unauthenticated'],
    [new AuthorizationError(), 403, 'FORBIDDEN', 'errors.forbidden'],
    [new NotFoundError(), 404, 'NOT_FOUND', 'errors.notFound'],
    [new ConflictError(), 409, 'CONFLICT', 'errors.conflict'],
    [new RateLimitError(), 429, 'RATE_LIMITED', 'errors.rateLimited'],
    [new ExternalServiceError(), 502, 'EXTERNAL_SERVICE', 'errors.external'],
  ] as const;

  for (const [error, status, code, key] of errorMappings) {
    it(`${error.name} maps to status ${status} / code ${code} / key ${key}`, () => {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.httpStatus).toBe(status);
      expect(error.code).toBe(code);
      expect(error.messageKey).toBe(key);
      expect(error.name).toBe(error.constructor.name);
    });
  }

  it('keeps developer detail out of the user-facing key and preserves the cause', () => {
    const cause = new Error('db exploded: password=hunter2');
    const error = new ExternalServiceError({ cause, message: 'Neon timeout' });
    expect(error.expose).toBe(false);
    expect(error.messageKey).toBe('errors.external');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('ExternalServiceError');
  });

  it('carries field errors on ValidationError', () => {
    const error = new ValidationError({ fieldErrors: { email: ['validation.email'] } });
    expect(error.fieldErrors?.email).toEqual(['validation.email']);
  });
});
