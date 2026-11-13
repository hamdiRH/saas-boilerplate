import { AppError } from './app-error';
import type { ErrorInit } from './app-error';

export class NotFoundError extends AppError {
  constructor(init: ErrorInit = {}) {
    super({
      code: 'NOT_FOUND',
      httpStatus: 404,
      messageKey: 'errors.notFound',
      ...init,
    });
    this.name = 'NotFoundError';
  }
}
