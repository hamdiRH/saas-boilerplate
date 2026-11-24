export const SOCIAL_PROVIDER_IDS = ['google', 'github', 'facebook', 'twitter', 'apple'] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];

interface Definition {
  id: SocialProviderId;
  // brand names are not translated
  label: string;
  clientIdKey: string;
  clientSecretKey: string;
}

const DEFINITIONS: readonly Definition[] = [
  {
    id: 'google',
    label: 'Google',
    clientIdKey: 'GOOGLE_CLIENT_ID',
    clientSecretKey: 'GOOGLE_CLIENT_SECRET',
  },
  {
    id: 'github',
    label: 'GitHub',
    clientIdKey: 'GITHUB_CLIENT_ID',
    clientSecretKey: 'GITHUB_CLIENT_SECRET',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    clientIdKey: 'FACEBOOK_CLIENT_ID',
    clientSecretKey: 'FACEBOOK_CLIENT_SECRET',
  },
  {
    id: 'twitter',
    label: 'X',
    clientIdKey: 'TWITTER_CLIENT_ID',
    clientSecretKey: 'TWITTER_CLIENT_SECRET',
  },
  {
    id: 'apple',
    label: 'Apple',
    clientIdKey: 'APPLE_CLIENT_ID',
    clientSecretKey: 'APPLE_CLIENT_SECRET',
  },
];

type EnvLike = Readonly<Record<string, unknown>>;
export interface Credentials {
  clientId: string;
  clientSecret: string;
}
export interface ProviderSummary {
  id: SocialProviderId;
  label: string;
}

const has = (env: EnvLike, key: string): string | undefined => {
  const value = env[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

function credentialsFor(env: EnvLike, definition: Definition): Credentials | undefined {
  const clientId = has(env, definition.clientIdKey);
  const clientSecret = has(env, definition.clientSecretKey);
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** Providers with BOTH credentials set, in display order. Safe to send to the browser (no secrets). */
export function getEnabledProviders(env: EnvLike): ProviderSummary[] {
  return DEFINITIONS.filter((d) => credentialsFor(env, d)).map(({ id, label }) => ({ id, label }));
}

/** The `socialProviders` option for Better Auth. */
export function buildSocialProviders(env: EnvLike): Partial<Record<SocialProviderId, Credentials>> {
  const result: Partial<Record<SocialProviderId, Credentials>> = {};
  for (const definition of DEFINITIONS) {
    const credentials = credentialsFor(env, definition);
    if (credentials) {
      result[definition.id] = credentials;
    }
  }
  return result;
}

/** Providers where only ONE of the two variables is set — almost certainly a typo. */
export function incompleteProviders(env: EnvLike): SocialProviderId[] {
  return DEFINITIONS.filter(
    (d) => Boolean(has(env, d.clientIdKey)) !== Boolean(has(env, d.clientSecretKey)),
  ).map((d) => d.id);
}

export function providerLabel(id: string): string {
  return DEFINITIONS.find((d) => d.id === id)?.label ?? id;
}

/** Apple POSTs back from its own origin, so it must be a trusted origin. */
export function buildTrustedOrigins(
  appUrl: string,
  enabled: readonly SocialProviderId[],
): string[] {
  return enabled.includes('apple') ? [appUrl, 'https://appleid.apple.com'] : [appUrl];
}

/** The redirect URI to register at each provider's console. */
export function callbackUrlFor(appUrl: string, id: SocialProviderId): string {
  return `${appUrl.replace(/\/$/u, '')}/api/auth/callback/${id}`;
}
