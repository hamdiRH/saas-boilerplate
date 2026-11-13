import { AppError } from './app-error';
import type { ErrorInit } from './app-error';

export class AuthenticationError extends AppError {
  constructor(init: ErrorInit = {}) {
    super({
      code: 'UNAUTHENTICATED',
      httpStatus: 401,
      messageKey: 'errors.unauthenticated',
      ...init,
    });
    this.name = 'AuthenticationError';
  }
}
