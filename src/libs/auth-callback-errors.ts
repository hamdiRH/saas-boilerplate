const KEYS: Record<string, string> = {
  // magic link
  invalid_token: 'auth.errors.invalidToken',
  token_expired: 'auth.errors.invalidToken',
  // OAuth
  account_not_linked: 'auth.errors.accountNotLinked',
  email_not_found: 'auth.errors.emailMissing',
  signup_disabled: 'auth.errors.signupDisabled',
};

/** `?error=` values come from redirects (magic link, OAuth). Case-insensitive, unknown → generic. */
export function callbackErrorKey(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  return KEYS[code.toLowerCase()] ?? 'auth.errors.oauthFailed';
}
