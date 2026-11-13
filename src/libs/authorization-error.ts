import { AppError } from './app-error';
import type { ErrorInit } from './app-error';

export class AuthorizationError extends AppError {
  constructor(init: ErrorInit = {}) {
    super({
      code: 'FORBIDDEN',
      httpStatus: 403,
      messageKey: 'errors.forbidden',
      ...init,
    });
    this.name = 'AuthorizationError';
  }
}
