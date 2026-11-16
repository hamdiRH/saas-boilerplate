import 'server-only';
import { APIError } from 'better-auth/api';

import {
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  ValidationError,
} from '@/libs/errors';

/** Turns Better Auth server errors into our AppError types (anything else is returned unchanged). */
export function mapAuthApiError(error: unknown): unknown {
  if (!(error instanceof APIError)) {
    return error;
  }

  const code = typeof error.body?.code === 'string' ? error.body.code : undefined;

  if (code === 'INVALID_PASSWORD') {
    return new ValidationError({
      cause: error,
      fieldErrors: { currentPassword: ['auth.errors.wrongPassword'] },
    });
  }
  if (code === 'PASSWORD_TOO_SHORT') {
    return new ValidationError({
      cause: error,
      fieldErrors: { newPassword: ['validation.passwordMin'] },
    });
  }
  if (code === 'PASSWORD_TOO_LONG') {
    return new ValidationError({
      cause: error,
      fieldErrors: { newPassword: ['validation.passwordMax'] },
    });
  }

  switch (error.statusCode) {
    case 401: {
      return new AuthenticationError({ cause: error });
    }
    case 403: {
      return new AuthorizationError({ cause: error });
    }
    case 429: {
      return new RateLimitError({ cause: error });
    }
    default: {
      return error;
    }
  }
}
