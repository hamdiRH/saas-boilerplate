/** Per client IP + endpoint, window in seconds. Stricter than the global default on purpose. */
export const AUTH_RATE_LIMIT_RULES = {
  '/forget-password': { max: 3, window: 60 },
  '/request-password-reset': { max: 3, window: 60 },
  '/send-verification-email': { max: 3, window: 60 },
  '/sign-in/email': { max: 5, window: 60 },
  '/sign-up/email': { max: 5, window: 60 },
} as const;

export const AUTH_RATE_LIMIT_DEFAULT = { max: 100, window: 60 } as const;
