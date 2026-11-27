/**
 * Providers whose emails are verified by the provider itself → safe to auto-link by email.
 * NOT Facebook (unverified emails possible), NOT X, NOT Apple (private relay addresses never match).
 */
export const TRUSTED_PROVIDERS = ['google', 'github'] as const;

export const ACCOUNT_LINKING = {
  enabled: true,
  trustedProviders: [...TRUSTED_PROVIDERS],
  // A provider whose email differs from the account's email can't be attached
  allowDifferentEmails: false,
  // Better Auth refuses to remove the LAST linked account
  allowUnlinkingAll: false,
};
