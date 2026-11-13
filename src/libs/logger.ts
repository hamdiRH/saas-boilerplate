import {
  configureSync,
  getAnsiColorFormatter,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger as getBaseLogger,
} from '@logtape/logtape';

import { Env } from '@/libs/env';
import { withRedaction } from '@/libs/logger-redaction';

type LogCategory = 'app' | 'auth' | 'db' | 'email' | 'security' | 'http';

// Configure ONCE, even with Next.js hot reload / multiple bundles.
const globalForLog = globalThis as unknown as { __logtapeConfigured?: boolean };

if (!globalForLog.__logtapeConfigured) {
  configureSync({
    loggers: [
      { category: ['app'], lowestLevel: Env.LOG_LEVEL, sinks: ['console'] },
      { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'] },
    ],
    sinks: {
      console: withRedaction(
        getConsoleSink({
          // Pretty in dev, machine-readable JSON lines in production
          formatter:
            Env.NODE_ENV === 'production' ? getJsonLinesFormatter() : getAnsiColorFormatter(),
        }),
      ),
    },
  });
  globalForLog.__logtapeConfigured = true;
}

export function getLogger(category: LogCategory = 'app') {
  return category === 'app' ? getBaseLogger(['app']) : getBaseLogger(['app', category]);
}
