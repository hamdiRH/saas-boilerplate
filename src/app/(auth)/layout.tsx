import type { ReactNode } from 'react';

const AuthLayout = ({ children }: { children: ReactNode }) => (
  <main id="main" className="flex min-h-screen items-center justify-center p-4">
    <div className="w-full max-w-sm space-y-6 rounded-lg border p-6 shadow-sm">{children}</div>
  </main>
);

export default AuthLayout;
