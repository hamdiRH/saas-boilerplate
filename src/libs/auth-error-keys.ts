const KEYS: Record<string, string> = {
  EMAIL_NOT_VERIFIED: 'auth.errors.emailNotVerified',
  INVALID_EMAIL_OR_PASSWORD: 'auth.errors.invalidCredentials',
  INVALID_PASSWORD: 'auth.errors.wrongPassword',
  INVALID_TOKEN: 'auth.errors.invalidToken',
  PASSWORD_TOO_LONG: 'validation.passwordMax',
  PASSWORD_TOO_SHORT: 'validation.passwordMin',
  SESSION_EXPIRED: 'auth.errors.freshRequired',
  SESSION_NOT_FRESH: 'auth.errors.freshRequired',
  TOKEN_EXPIRED: 'auth.errors.invalidToken',
  USER_ALREADY_EXISTS: 'auth.errors.userExists',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'auth.errors.userExists',
};

interface AuthClientError {
  code?: string | undefined;
  status?: number | undefined;
}

/** Maps a Better Auth client error to a full i18n key. */
export function authErrorKey(error: AuthClientError | null | undefined): string {
  if (error?.status === 429) {
    return 'errors.rateLimited';
  }
  const key = error?.code ? KEYS[error.code] : undefined;
  return key ?? 'errors.internal';
}
