import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

const MarketingLayout = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen flex-col">
    <SiteHeader />
    <main id="main" className="flex-1">
      {children}
    </main>
    <SiteFooter />
  </div>
);

export default MarketingLayout;
