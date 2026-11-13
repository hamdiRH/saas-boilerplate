import type { ReactNode } from 'react';

const AdminLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen">
    <header className="bg-muted flex h-14 items-center border-b px-4 font-semibold">
      Admin console
    </header>
    <main id="main" className="p-6">
      {children}
    </main>
  </div>
);

export default AdminLayout;
