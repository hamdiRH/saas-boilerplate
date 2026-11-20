# Docker

## Local development

The Compose stack runs the Next.js development server and a PostgreSQL container. It uses `.env.local` for the required `BETTER_AUTH_SECRET`, while the local Compose environment routes the app to its PostgreSQL service and prints email links to the app log.

```bash
pnpm docker:up
```

Open [http://localhost:3000](http://localhost:3000). Migrations run when the app container starts. PostgreSQL data persists in the `postgres-data` volume; the database is also available on host port `5434`.

Stop the containers with `pnpm docker:down`. This keeps the database volume. Follow logs with `pnpm docker:logs`.

## Production image

The Dockerfile builds a minimal, non-root Next.js standalone image. Set the public app name and URL at build time because `NEXT_PUBLIC_*` values are compiled into the browser bundle:

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_NAME=Nexora \
  --build-arg NEXT_PUBLIC_APP_URL=https://example.com \
  --target runner \
  -t saas-boilerplate .
```

At runtime, provide `BETTER_AUTH_SECRET`, `DATABASE_URL`, and the email settings required by your deployment. Do not set `ALLOW_LOCAL_SERVICES` in production. Apply database migrations separately with `DATABASE_URL_UNPOOLED` (or `DATABASE_URL` when using a direct PostgreSQL connection) before deploying the image.
