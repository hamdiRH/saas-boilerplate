import { pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './_helpers';

/** Temporary key/value table proving migrations work. Removed in Sprint 2. */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  ...timestamps,
});
