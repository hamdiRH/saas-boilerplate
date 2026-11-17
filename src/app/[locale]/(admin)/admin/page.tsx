import { Suspense } from 'react';

import { requireSession } from '@/data/session';

async function AdminContent() {
  // Authoritative check (ADR-003). The proxy only looks for a cookie, so it is not a guard.
  // Sprint 4 swaps this for requireAdmin() once roles exist.
  await requireSession();
  return <h1 className="text-xl font-semibold">Admin</h1>;
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminContent />
    </Suspense>
  );
}
