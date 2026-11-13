import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

// Export only what is used (Knip!). Add `redirect`, `useRouter`… when you need them.
export const { Link, usePathname } = createNavigation(routing);
