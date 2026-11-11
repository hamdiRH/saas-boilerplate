import { randomUUID } from 'node:crypto';

import { text, timestamp } from 'drizzle-orm/pg-core';

/** Text primary key, UUID generated in the app (portable, no DB extension needed). */
export const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID());

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
