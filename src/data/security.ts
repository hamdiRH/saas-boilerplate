import 'server-only';
import { headers } from 'next/headers';

import { auth } from '@/libs/auth';
import { getEnabledProviders } from '@/libs/auth-providers';
import type { ProviderSummary } from '@/libs/auth-providers';
import { Env } from '@/libs/env';

import { requireSession } from './session';

export interface SecuritySnapshot {
  emailVerified: boolean;
  hasPassword: boolean;
  /** Better Auth account IDs and provider IDs for linked social accounts */
  linkedAccounts: { accountId: string; providerId: string }[];
  /** credential + social accounts — if this is 1, nothing may be disconnected */
  accountCount: number;
  providers: ProviderSummary[];
}

export async function getSecuritySnapshot(): Promise<SecuritySnapshot> {
  const { user } = await requireSession();

  // 🔍 `listUserAccounts` in current versions (older: `listAccounts`)
  const accounts = await auth.api.listUserAccounts({ headers: await headers() });

  return {
    emailVerified: user.emailVerified,
    hasPassword: accounts.some((account) => account.providerId === 'credential'),
    linkedAccounts: accounts
      .filter((account) => account.providerId !== 'credential')
      .map(({ id, providerId }) => ({ accountId: id, providerId })),
    accountCount: accounts.length,
    providers: getEnabledProviders(Env),
  };
}
