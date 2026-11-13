import { AppError } from './app-error';
import type { ErrorInit } from './app-error';

export class ConflictError extends AppError {
  constructor(init: ErrorInit = {}) {
    super({
      code: 'CONFLICT',
      httpStatus: 409,
      messageKey: 'errors.conflict',
      ...init,
    });
    this.name = 'ConflictError';
  }
}
