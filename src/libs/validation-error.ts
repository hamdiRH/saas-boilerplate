import { AppError } from './app-error';
import type { ErrorInit } from './app-error';

export class ValidationError extends AppError {
  readonly fieldErrors: Record<string, string[]> | undefined;

  constructor(init: ErrorInit & { fieldErrors?: Record<string, string[]> } = {}) {
    super({
      cause: init.cause,
      code: 'VALIDATION_ERROR',
      expose: true,
      httpStatus: 400,
      message: init.message,
      messageKey: 'errors.validation',
    });
    this.name = 'ValidationError';
    this.fieldErrors = init.fieldErrors;
  }
}
