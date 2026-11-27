import { AppError } from './app-error';
import type { ErrorInit } from './app-error';

export { AppError } from './app-error';
export { AuthenticationError } from './authentication-error';
export { AuthorizationError } from './authorization-error';
export { ConflictError } from './conflict-error';
export { ExternalServiceError } from './external-service-error';
export { NotFoundError } from './not-found-error';
export { RateLimitError } from './rate-limit-error';
export { ValidationError } from './validation-error';

export class ReauthRequiredError extends AppError {
  constructor(init: ErrorInit = {}) {
    super({
      code: 'REAUTH_REQUIRED',
      httpStatus: 401,
      messageKey: 'auth.errors.freshRequired',
      ...init,
    });
    this.name = 'ReauthRequiredError';
  }
}
