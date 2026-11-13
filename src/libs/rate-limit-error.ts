import { AppError } from './app-error';
import type { ErrorInit } from './app-error';

export class RateLimitError extends AppError {
  constructor(init: ErrorInit = {}) {
    super({
      code: 'RATE_LIMITED',
      httpStatus: 429,
      messageKey: 'errors.rateLimited',
      ...init,
    });
    this.name = 'RateLimitError';
  }
}
