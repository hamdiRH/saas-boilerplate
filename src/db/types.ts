import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import type * as schema from './schema';

/** Any Drizzle Postgres database (node-postgres, PGlite…) bound to our schema. */
export type DbLike = PgDatabase<PgQueryResultHKT, typeof schema>;
