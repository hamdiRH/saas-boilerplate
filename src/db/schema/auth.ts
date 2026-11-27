import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable('user', {
  createdAt: tz('created_at').notNull().defaultNow(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  id: text('id').primaryKey(),
  image: text('image'),
  name: text('name').notNull(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    createdAt: tz('created_at').notNull().defaultNow(),
    expiresAt: tz('expires_at').notNull(),
    id: text('id').primaryKey(),
    ipAddress: text('ip_address'),
    token: text('token').notNull().unique(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    accessToken: text('access_token'),
    accessTokenExpiresAt: tz('access_token_expires_at'),
    accountId: text('account_id').notNull(),
    createdAt: tz('created_at').notNull().defaultNow(),
    id: text('id').primaryKey(),
    idToken: text('id_token'),
    password: text('password'),
    providerId: text('provider_id').notNull(),
    refreshToken: text('refresh_token'),
    refreshTokenExpiresAt: tz('refresh_token_expires_at'),
    scope: text('scope'),
    updatedAt: tz('updated_at').notNull().defaultNow(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    createdAt: tz('created_at').notNull().defaultNow(),
    expiresAt: tz('expires_at').notNull(),
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
    value: text('value').notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/**
 * Used by Better Auth's database-backed rate limiter (enabled in S2-T16).
 * The limiter looks rows up by `key` on every limited request and assumes `key` is unique,
 * hence the unique index.
 */
export const rateLimit = pgTable(
  'rate_limit',
  {
    count: integer('count').notNull(),
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (table) => [uniqueIndex('rate_limit_key_idx').on(table.key)],
);

export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: tz('created_at'),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('passkey_user_id_idx').on(table.userId),
    uniqueIndex('passkey_credential_id_idx').on(table.credentialID),
  ],
);
