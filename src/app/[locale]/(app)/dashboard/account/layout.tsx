import type { ReactNode } from 'react';

import { AccountNav } from '@/components/account/account-nav';

// NOT a guard: each page below calls requireSession() itself.
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <AccountNav />
      {children}
    </div>
  );
}
