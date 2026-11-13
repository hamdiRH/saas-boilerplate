import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { render } from 'vitest-browser-react';

import messages from '@/locales/en.json';

/** Renders a component with the English messages available. */
export function renderWithIntl(ui: ReactNode) {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}
