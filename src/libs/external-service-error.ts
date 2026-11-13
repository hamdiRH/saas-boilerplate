import { AppError } from './app-error';
import type { ErrorInit } from './app-error';

export class ExternalServiceError extends AppError {
  constructor(init: ErrorInit = {}) {
    super({
      code: 'EXTERNAL_SERVICE',
      httpStatus: 502,
      messageKey: 'errors.external',
      ...init,
    });
    this.name = 'ExternalServiceError';
  }
}
