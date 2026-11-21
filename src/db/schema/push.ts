import { index, text, timestamp, pgTable, uniqueIndex } from 'drizzle-orm/pg-core';

import { user } from './auth';

const tz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * One row per browser/device that opted in to web push. `endpoint` is a secret capability URL
 * issued by the push service, so it is unique and never shown to other users.
 */
export const pushSubscription = pgTable(
  'push_subscription',
  {
    auth: text('auth').notNull(),
    createdAt: tz('created_at').notNull().defaultNow(),
    endpoint: text('endpoint').notNull(),
    expiresAt: tz('expires_at'),
    id: text('id').primaryKey(),
    lastUsedAt: tz('last_used_at'),
    p256dh: text('p256dh').notNull(),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('push_subscription_endpoint_idx').on(table.endpoint),
    index('push_subscription_user_id_idx').on(table.userId),
  ],
);
