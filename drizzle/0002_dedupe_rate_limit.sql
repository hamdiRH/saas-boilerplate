-- Custom SQL migration file, put your code below! --
-- Rate-limit rows are disposable counters. Before the next migration adds a UNIQUE index on "key",
-- drop any duplicate rows (keep one per key) so that migration cannot fail on existing data.
DELETE FROM "rate_limit" a USING "rate_limit" b WHERE a.ctid < b.ctid AND a.key = b.key;
