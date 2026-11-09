# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 6 — Observability, Security & Analytics

> Companion to `docs/roadmap/sprint-06-observability-security.md`. Every `S6-Txx` section is one ticket. Tickets follow the sprint file's order. **Golden rule of this sprint:** every integration is **optional**. With _no_ environment variables the app boots exactly as before; with _all_ of them (dummy keys) it still boots and no page breaks. Tests prove both (ADR-008).

🪟 **Windows + Cmder:** use the **Git Bash tab**. Paths with `[brackets]`/`(parentheses)` must be quoted. Windows-specific notes are marked 🪟.

> ⚠️ **About versions.** Sentry's Next.js SDK, Arcjet, Better Stack's ingestion API, Checkly's CLI and PostHog change often, and Next 16 specifics (`proxy.ts`, nonces, Turbopack) are young. Spots likely to differ are marked **🔍 Verify against docs**. The tests describe behaviour that must hold (no secrets in telemetry, no tracking before consent, headers present, optional means optional).

---

## 📋 What you will have at the end

- **Sentry** for server, client and React errors — with PII scrubbing, release tagging, source maps, and **Spotlight** for local debugging
- **Better Stack** log shipping (batched, bounded, never blocks a request) and a **request ID** that links a log line, a Sentry event and an error shown to a user
- **Arcjet** protection (shield, bot detection, rate limits, email validation) — in `DRY_RUN` first, `LIVE` in production
- A **`/api/health`** endpoint and **Checkly** monitoring-as-code
- **Security headers**, a **nonce-based CSP** (report-only first, then enforced), and **secret scanning**
- A **cookie-consent** system that gates **PostHog** analytics and Sentry Replay — nothing is tracked before consent

## 🧭 Decisions & deviations (made once, here)

| Topic | Decision | Why |
| --- | --- | --- |
| Optional integrations | Each lives behind a tiny adapter that **no-ops** without its env vars | Zero-config local start; easy to strip (S8) |
| Sentry tunnel | **Not** used | A tunnel route would collide with the locale proxy; ad-blocker loss is acceptable for now |
| Sentry Replay | Off by default; **lazy-loaded only after consent** (S6-T10) | Privacy; bundle size |
| Log shipping on serverless | Batched sink + `flushLogs()` from Server Actions; on Vercel prefer the **Better Stack Vercel integration (log drain)** | Background timers may be frozen after a response (`TD-14`) |
| Request ID | Created in `proxy.ts`, carried in `x-request-id`, bound to logs through LogTape's context | One id across logs, Sentry and user-visible error references |
| Arcjet placement | Inside `proxy.ts`, **also for `/api/auth/*`** (matcher widened) | Bots and credential stuffing target auth endpoints, not pages |
| Arcjet default mode | `DRY_RUN` outside production, `LIVE` in production (`ARCJET_MODE` overrides) | Observe before you block |
| CSP nonce vs static pages | **Two tiers**: nonce + `strict-dynamic` for dynamic areas (dashboard, admin, auth); `'unsafe-inline'` scripts for static marketing pages | A per-request nonce forces dynamic rendering — marketing pages must stay static for Lighthouse (S7) |
| CSP rollout | `CSP_MODE=report-only` → fix violations → `enforce` | Never break production to learn what you load |
| Secret scanning | **gitleaks** in CI + optional local hook (skipped if not installed) | It's a Go binary, not an npm package; 🪟 `winget install Gitleaks.Gitleaks` |
| Analytics consent | Default **denied**; **GPC** (Global Privacy Control) counts as denied; consent version bump re-asks | GDPR/ePrivacy posture |
| Server-side analytics | Only with the visitor's analytics consent (read from the cookie) | "Server-side" doesn't mean "exempt" |

---

## 🔀 Git workflow (PR-based)

```bash
git switch main && git pull
git switch -c <type>/s6-tXX-<slug>
# … work, then verify …
pnpm check
git add -A
git commit -m "<type>(<scope>): <message>"
git push -u origin <branch>
gh pr create --fill --base main
gh pr checks --watch
gh pr merge --merge --delete-branch
git switch main && git pull
```

Each ticket ends with a **🚢 Ship** line. Run `pnpm pin` after adding dependencies. CI's only required check is **`CI OK`** (Sprint 5).

---

## ✅ Before you start

```bash
git switch main && git pull
pnpm install
pnpm check              # Sprint 5 must be green
```

Set **Current sprint: Sprint 6** in `docs/roadmap/06-project-state.md`.

Create **free** accounts now (you can skip any — each ticket also works without): [Sentry](https://sentry.io), [Better Stack](https://betterstack.com), [Arcjet](https://arcjet.com), [PostHog](https://posthog.com), [Checkly](https://checklyhq.com). Keep their keys in `.env.local` only.

---

## 🎫 S6-T01 — Sentry (errors, release, optional by design)

**Branch:** `feat/s6-t01-sentry` · **Story:** US-060 · **3 SP** · 🔍 Read the Sentry **Next.js manual setup** docs for Next 16

```bash
git switch -c feat/s6-t01-sentry
pnpm add @sentry/nextjs
```

### 1. Environment (all optional)

📄 **Edit `src/libs/Env.ts`** — `flag` already exists. Add to `server`, `client` and `runtimeEnv`:

```ts
  server: {
    // …
    SENTRY_ORG: z.string().min(1).optional(), // build-time: source-map upload
    SENTRY_PROJECT: z.string().min(1).optional(),
    SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
  },
  client: {
    // …
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    // Dev only: send events to the local Spotlight sidecar (S6-T02)
    NEXT_PUBLIC_SENTRY_SPOTLIGHT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  },
```

```ts
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_SPOTLIGHT: process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT,
```

📄 **Append to `.env.example`:**

```dotenv
# ─── Sentry (optional: no DSN → nothing is sent) ────
NEXT_PUBLIC_SENTRY_DSN=
# Source maps are uploaded at build time only when all three are set (CI/production)
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
# Dev only: events go to the local Spotlight sidecar (pnpm spotlight)
NEXT_PUBLIC_SENTRY_SPOTLIGHT=false
```

### 2. Framework hooks

📄 **Create `src/instrumentation.ts`:**

```ts
import * as Sentry from '@sentry/nextjs';

// Next calls register() once per server start. Our proxy runs on Node, so there is no edge runtime to configure.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

// Reports errors thrown while rendering Server Components and in Route Handlers / Server Actions
export const onRequestError = Sentry.captureRequestError;
```

📄 **Create `src/sentry.server.config.ts`:**

```ts
import * as Sentry from '@sentry/nextjs';

import { Env } from '@/libs/Env';

// No DSN and no Spotlight → the SDK is never initialised, every Sentry.* call is a harmless no-op.
if (Env.NEXT_PUBLIC_SENTRY_DSN || Env.NEXT_PUBLIC_SENTRY_SPOTLIGHT) {
  Sentry.init({
    dsn: Env.NEXT_PUBLIC_SENTRY_DSN,
    spotlight: Env.NEXT_PUBLIC_SENTRY_SPOTLIGHT,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    sendDefaultPii: false, // never attach IPs, cookies, request bodies automatically
  });
}
```

📄 **Create `src/instrumentation-client.ts`:**

```ts
import * as Sentry from '@sentry/nextjs';

import { Env } from '@/libs/Env';

if (Env.NEXT_PUBLIC_SENTRY_DSN || Env.NEXT_PUBLIC_SENTRY_SPOTLIGHT) {
  Sentry.init({
    dsn: Env.NEXT_PUBLIC_SENTRY_DSN,
    spotlight: Env.NEXT_PUBLIC_SENTRY_SPOTLIGHT,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    sendDefaultPii: false,
    // Session Replay is NOT enabled here: it is added lazily after the visitor consents (S6-T10)
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

> `process.env.VERCEL_ENV`, `NODE_ENV` and `NEXT_RUNTIME` are framework-provided, not our configuration. Our env guard must allow these two files:

📄 **Edit `scripts/check-env-usage.mjs`:**

```js
const ALLOWED = new Set([
  'src/libs/Env.ts',
  // Framework-provided variables (NEXT_RUNTIME, NODE_ENV, VERCEL_ENV) — not app configuration
  'src/instrumentation.ts',
  'src/instrumentation-client.ts',
  'src/sentry.server.config.ts',
]);
```

(also add the three files to `knip.config.ts` → `entry`)

### 3. The adapter the app code uses

📄 **Create `src/libs/Sentry.ts`:**

```ts
import * as Sentry from '@sentry/nextjs';

import { redactValue } from '@/libs/logger-redaction';

type Context = {
  requestId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

/**
 * The only way application code reports unexpected errors. Safe to call without a DSN (no-op).
 * Expected errors (AppError subclasses: validation, forbidden…) must NOT be reported — they are not bugs.
 */
export function reportError(error: unknown, { requestId, tags, extra }: Context = {}): void {
  Sentry.captureException(error, {
    tags: { ...(requestId ? { requestId } : {}), ...tags },
    extra: extra ? (redactValue(extra) as Record<string, unknown>) : undefined,
  });
}
```

📄 **Create `src/libs/Sentry.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { reportError } from './Sentry';

it('is a harmless no-op when Sentry is not initialised (no DSN)', () => {
  expect(() =>
    reportError(new Error('boom'), { requestId: 'r1', extra: { password: 'x' } }),
  ).not.toThrow();
});
```

### 4. Use it where unexpected errors are caught

📄 **Edit `src/utils/action.ts`** — in the `catch` branch for unknown errors:

```ts
import { reportError } from '@/libs/Sentry';
// …
getLogger('app').error('Unhandled error in server action', { error });
reportError(error); // Sentry (no-op without DSN)
```

📄 **Edit `src/app/[locale]/error.tsx`** and **`(app)/error.tsx`:**

```tsx
import { useEffect } from 'react';

import { reportError } from '@/libs/Sentry';

// inside the component, before the return:
useEffect(() => {
  reportError(error, { tags: { boundary: 'route' } });
}, [error]);
```

📄 **Edit `src/app/global-error.tsx`** (crash in the root layout):

```tsx
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  // …existing markup…
}
```

### 5. Build plugin: release + source maps (only when a token exists)

📄 **Edit `next.config.ts`:**

```ts
import { withSentryConfig } from '@sentry/nextjs';

// …at the bottom, instead of `export default withNextIntl(nextConfig);`
const config = withNextIntl(nextConfig);

export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN, // without it the plugin skips the upload and only warns
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true }, // never serve source maps publicly
  // 🔍 release name defaults to the Git SHA on Vercel/GitHub; set `release: { name }` to override
});
```

> Add `@sentry/nextjs` to `serverExternalPackages`? Not needed. If the build complains about the Turbopack/webpack plugin mode, follow the current Sentry docs for **Turbopack** (source-map upload is supported in recent SDKs 🔍).

### ✅ Verify

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm knip && pnpm check:env
pnpm build            # works WITHOUT any Sentry variable (warning about the token is fine)
```

1. **Without a DSN:** `pnpm dev`, break something (temporarily `throw new Error('test')` in a page) → the error page appears, the terminal shows **no Sentry output**.
2. **With a DSN** in `.env.local` (`NEXT_PUBLIC_SENTRY_DSN=…` from your free Sentry project): restart, trigger the error again → the issue appears in Sentry within seconds: **server** errors (page throws), **client** errors (throw inside a `useEffect` of a client component) and **Server Action** failures (throw a non-`AppError` inside a handler) all show up. `AppError`s (e.g. a validation failure) do **not**.
3. Remove the test throws.

**🚢 Ship** — branch `feat/s6-t01-sentry` · message: `feat(obs): add optional sentry error reporting for server, client and error boundaries`

---

## 🎫 S6-T02 — Spotlight, scrubbing and source maps

**Branch:** `feat/s6-t02-sentry-scrub` · **Story:** US-060 · **2 SP** · 🔒 privacy

> 🎯 Telemetry is a data export. Before any event leaves the process we **remove** cookies, auth headers, request bodies, e-mail/IP and secret-looking URL parameters.

```bash
git switch main && git pull && git switch -c feat/s6-t02-sentry-scrub
```

### 1. The scrubber (pure, tested)

📄 **Create `src/libs/sentry-scrub.ts`:**

```ts
import { redactValue } from '@/libs/logger-redaction';

type SentryEventLike = {
  message?: string;
  request?: {
    cookies?: unknown;
    headers?: Record<string, string>;
    url?: string;
    query_string?: unknown;
    data?: unknown;
  };
  user?: { id?: string | number; email?: string; ip_address?: string | null; username?: string };
  extra?: Record<string, unknown>;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
};

const SECRET_PARAM = /([?&](?:token|code|secret|otp|key|password|session)=)[^&#\s]+/gi;
const SENSITIVE_HEADER = /^(authorization|cookie|set-cookie|x-api-key|x-forwarded-for|x-real-ip)$/i;

export const scrubString = (value: string) => value.replace(SECRET_PARAM, '$1[REDACTED]');

/** Removes secrets and personal data. Mutates and returns the event (Sentry's beforeSend contract). */
export function scrubEvent<T extends SentryEventLike>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data; // request bodies may hold passwords / codes
    delete event.request.query_string;
    if (event.request.url) event.request.url = scrubString(event.request.url);
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).map(([name, value]) => [
          name,
          SENSITIVE_HEADER.test(name) ? '[REDACTED]' : value,
        ]),
      );
    }
  }

  if (event.user) {
    // Keep the internal id (useful, not personal on its own); drop everything identifying
    event.user = event.user.id === undefined ? {} : { id: event.user.id };
  }

  if (event.message) event.message = scrubString(event.message);
  for (const entry of event.exception?.values ?? []) {
    if (entry.value) entry.value = scrubString(entry.value);
  }
  if (event.extra) event.extra = redactValue(event.extra) as Record<string, unknown>;
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubString(crumb.message);
    if (crumb.data) crumb.data = redactValue(crumb.data) as Record<string, unknown>;
  }
  return event;
}
```

📄 **Create `src/libs/sentry-scrub.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { scrubEvent, scrubString } from './sentry-scrub';

describe('scrubString', () => {
  it('hides secret-looking URL parameters but keeps the rest', () => {
    expect(scrubString('https://app.test/reset?token=abc123&lang=fr')).toBe(
      'https://app.test/reset?token=[REDACTED]&lang=fr',
    );
    expect(scrubString('failed for /verify?code=999111')).toBe(
      'failed for /verify?code=[REDACTED]',
    );
  });
});

describe('scrubEvent', () => {
  it('removes cookies, bodies, auth headers, personal data and secrets in extras', () => {
    const event = scrubEvent({
      message: 'Invalid link https://app.test/x?token=SECRET',
      request: {
        url: 'https://app.test/api/auth/verify-email?token=SECRET',
        cookies: { session: 'abc' },
        data: { password: 'hunter2' },
        query_string: 'token=SECRET',
        headers: { Authorization: 'Bearer x', Cookie: 'a=b', 'user-agent': 'Chrome' },
      },
      user: { id: 'u1', email: 'ada@example.com', ip_address: '1.2.3.4', username: 'ada' },
      extra: { password: 'hunter2', note: 'ok' },
      exception: { values: [{ value: 'Bad token=SECRET here' }] },
      breadcrumbs: [{ message: 'GET /x?code=123456', data: { apiKey: 'k', status: 200 } }],
    });

    expect(JSON.stringify(event)).not.toMatch(
      /SECRET|hunter2|ada@example|1\.2\.3\.4|123456|Bearer x/,
    );
    expect(event.request?.headers).toMatchObject({
      Authorization: '[REDACTED]',
      Cookie: '[REDACTED]',
      'user-agent': 'Chrome',
    });
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.extra).toEqual({ password: '[REDACTED]', note: 'ok' });
  });

  it('tolerates empty events', () => {
    expect(scrubEvent({})).toEqual({});
  });
});
```

Wire it into both inits (`sentry.server.config.ts`, `instrumentation-client.ts`):

```ts
import { scrubEvent } from '@/libs/sentry-scrub';
// inside Sentry.init({ … }):
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
```

### 2. Spotlight: see events locally, without a Sentry account

📄 **Edit `package.json`:** `"spotlight": "spotlight"` and install the sidecar:

```bash
pnpm add -D @spotlightjs/spotlight
```

Two terminals:

```bash
# Tab 1
pnpm spotlight                      # UI at http://localhost:8969
# Tab 2 — .env.local: NEXT_PUBLIC_SENTRY_SPOTLIGHT=true   (no DSN needed)
pnpm dev
```

> 🔒 Spotlight stays **dev-only**: it listens on localhost, and Spotlight mode is off by default.

### 3. Source maps in CI releases (only when the token exists)

The upload already happens inside `next build` when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` are set. Make sure **only the real build** has them: in GitHub → _Settings → Secrets_ add the three secrets, and expose them to the **release/deploy build only** (Sprint 8) — not to PR builds from forks.

📄 **Document it** — create `docs/guides/observability.md` (extended in later tickets):

```markdown
# Observability

## Sentry

- Optional: set `NEXT_PUBLIC_SENTRY_DSN`. Without it every `Sentry.*` call is a no-op.
- Report unexpected errors only (`reportError`, `src/libs/Sentry.ts`). `AppError` subclasses are expected → not reported.
- Everything is scrubbed before leaving the process (`src/libs/sentry-scrub.ts`): cookies, bodies, auth headers, e-mail/IP, `token|code|secret…` URL params.
- Releases + source maps: set `SENTRY_ORG/PROJECT/AUTH_TOKEN` for production builds. Maps are deleted after upload.
- Local debugging without an account: `pnpm spotlight` + `NEXT_PUBLIC_SENTRY_SPOTLIGHT=true`.
- Session Replay: off by default; loaded only after the visitor consents (S6-T10).
```

### ✅ Verify

```bash
pnpm test && pnpm check
```

1. With Spotlight running and `NEXT_PUBLIC_SENTRY_SPOTLIGHT=true`: throw an error in a page → it appears in the Spotlight UI with traces; **sign in first**, then throw inside a Server Action with the message `"Bad token=SECRET"` → in the event, `SECRET` is **not** visible, no cookies, no `Authorization` header, user shows only an `id`.
2. `git grep -n "Sentry.init" src` → exactly **two** places (server + client configs).
3. `pnpm build` still succeeds without the Sentry variables.

**🚢 Ship** — branch `feat/s6-t02-sentry-scrub` · message: `feat(obs): scrub personal data from sentry events and add local spotlight debugging`

---

## 🎫 S6-T03 — Better Stack log sink

**Branch:** `feat/s6-t03-betterstack` · **Story:** US-061 · **2 SP**

> 🎯 Ship structured logs to Better Stack **without ever slowing or breaking a request**: batch them, bound the queue, retry briefly, drop on overflow, and redact before anything leaves.

```bash
git switch main && git pull && git switch -c feat/s6-t03-betterstack
```

### 1. Environment

📄 **Edit `src/libs/Env.ts`** (`server` + `runtimeEnv`):

```ts
    BETTER_STACK_SOURCE_TOKEN: z.string().min(1).optional(),
    // e.g. s1234567.eu-nbg-2.betterstackdata.com (shown on your source's page)
    BETTER_STACK_INGESTING_HOST: z.string().min(1).optional(),
```

📄 **Append to `.env.example`:**

```dotenv
# ─── Better Stack logs (optional: both → logs are shipped; otherwise console only) ──
BETTER_STACK_SOURCE_TOKEN=
BETTER_STACK_INGESTING_HOST=
```

### 2. A batching sink

📄 **Create `src/libs/logger-betterstack.ts`:**

```ts
import type { LogRecord, Sink } from '@logtape/logtape';

type Options = {
  endpoint: string; // https://<ingesting host>
  token: string;
  fetchImpl?: typeof fetch;
  maxBatch?: number; // send as soon as this many logs are queued
  maxQueue?: number; // hard cap: the oldest logs are dropped beyond it
  flushIntervalMs?: number;
  retries?: number;
};

export type FlushableSink = Sink & { flush: () => Promise<void> };

function toPayload(record: LogRecord) {
  return {
    dt: new Date(record.timestamp).toISOString(),
    level: record.level,
    category: record.category.join('.'),
    // LogTape messages alternate text and interpolated values
    message: record.message
      .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
      .join(''),
    ...record.properties, // requestId, userId, orgId… (already redacted by withRedaction)
  };
}

/**
 * Batches logs and POSTs them to Better Stack's HTTP ingestion API.
 * Guarantees: never throws into the caller, never blocks the request path, memory is bounded.
 */
export function createBetterStackSink({
  endpoint,
  token,
  fetchImpl = fetch,
  maxBatch = 50,
  maxQueue = 1000,
  flushIntervalMs = 2000,
  retries = 2,
}: Options): FlushableSink {
  let queue: Record<string, unknown>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function send(batch: Record<string, unknown>[]) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(batch),
        });
        if (response.ok) return;
      } catch {
        // network error → retry below
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt)); // 100 ms, 200 ms, …
    }
    // Give up: losing logs is better than losing requests. (Console sink still has them.)
  }

  async function flush() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    await send(batch);
  }

  const sink = ((record: LogRecord) => {
    queue.push(toPayload(record));
    if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue); // drop OLDEST
    if (queue.length >= maxBatch) void flush();
    else if (!timer) {
      timer = setTimeout(() => void flush(), flushIntervalMs);
      timer.unref?.(); // never keep the process alive just to flush logs
    }
  }) as FlushableSink;

  sink.flush = flush;
  return sink;
}
```

📄 **Create `src/libs/logger-betterstack.test.ts`:**

```ts
import type { LogRecord } from '@logtape/logtape';
import { describe, expect, it, vi } from 'vitest';

import { createBetterStackSink } from './logger-betterstack';
import { withRedaction } from './logger-redaction';

const record = (message: string, properties: Record<string, unknown> = {}): LogRecord =>
  ({
    level: 'info',
    category: ['app', 'auth'],
    message: [message],
    rawMessage: message,
    timestamp: 1_700_000_000_000,
    properties,
  }) as LogRecord;

const ok = () => vi.fn().mockResolvedValue(new Response('', { status: 202 }));

describe('createBetterStackSink', () => {
  it('sends one batch with a bearer token and the log fields', async () => {
    const fetchMock = ok();
    const sink = createBetterStackSink({
      endpoint: 'https://logs.test',
      token: 't0k',
      fetchImpl: fetchMock,
    });

    sink(record('one', { requestId: 'r1' }));
    sink(record('two'));
    await sink.flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://logs.test');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t0k');
    expect(JSON.parse(init.body as string)).toEqual([
      expect.objectContaining({
        message: 'one',
        requestId: 'r1',
        category: 'app.auth',
        level: 'info',
      }),
      expect.objectContaining({ message: 'two' }),
    ]);
  });

  it('flushes immediately when the batch is full', async () => {
    const fetchMock = ok();
    const sink = createBetterStackSink({
      endpoint: 'x',
      token: 't',
      fetchImpl: fetchMock,
      maxBatch: 2,
    });
    sink(record('a'));
    sink(record('b'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  });

  it('never throws into the caller when the network is down, and retries before giving up', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    const sink = createBetterStackSink({
      endpoint: 'x',
      token: 't',
      fetchImpl: fetchMock,
      retries: 2,
    });

    sink(record('lost'));
    await expect(sink.flush()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 try + 2 retries
  });

  it('bounds memory: the oldest logs are dropped beyond maxQueue', async () => {
    const fetchMock = ok();
    const sink = createBetterStackSink({
      endpoint: 'x',
      token: 't',
      fetchImpl: fetchMock,
      maxQueue: 3,
      maxBatch: 1000,
      flushIntervalMs: 60_000,
    });
    for (let i = 1; i <= 5; i += 1) sink(record(`m${i}`));
    await sink.flush();

    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as {
      message: string;
    }[];
    expect(sent.map((entry) => entry.message)).toEqual(['m3', 'm4', 'm5']);
  });

  it('keeps secrets out of what leaves the process (when wrapped with redaction)', async () => {
    const fetchMock = ok();
    const sink = createBetterStackSink({ endpoint: 'x', token: 't', fetchImpl: fetchMock });
    withRedaction(sink)(record('login', { password: 'hunter2', userId: 'u1' }));
    await sink.flush();

    const body = (fetchMock.mock.calls[0]![1] as RequestInit).body as string;
    expect(body).not.toContain('hunter2');
    expect(body).toContain('[REDACTED]');
    expect(body).toContain('u1');
  });
});
```

### 3. Plug it into the logger (only when configured)

📄 **Edit `src/libs/Logger.ts`:**

```ts
import { createBetterStackSink, type FlushableSink } from '@/libs/logger-betterstack';

let betterStack: FlushableSink | undefined;

if (!globalForLog.__logtapeConfigured) {
  const consoleSink = withRedaction(getConsoleSink({/* …unchanged formatter… */}));

  // Both variables → ship logs. Either missing → console only (zero-config local start).
  if (Env.BETTER_STACK_SOURCE_TOKEN && Env.BETTER_STACK_INGESTING_HOST) {
    betterStack = createBetterStackSink({
      endpoint: `https://${Env.BETTER_STACK_INGESTING_HOST}`,
      token: Env.BETTER_STACK_SOURCE_TOKEN,
    });
  }

  configureSync({
    sinks: {
      console: consoleSink,
      ...(betterStack ? { betterstack: withRedaction(betterStack) } : {}), // redaction BEFORE anything leaves
    },
    loggers: [
      {
        category: ['app'],
        lowestLevel: Env.LOG_LEVEL,
        sinks: betterStack ? ['console', 'betterstack'] : ['console'],
      },
      { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'] },
    ],
  });
  globalForLog.__logtapeConfigured = true;
}

/** Flush buffered logs (call at the end of serverless work). Safe when nothing is configured. */
export async function flushLogs(): Promise<void> {
  await betterStack?.flush();
}
```

> 🔍 `betterStack` is module-level: if Next bundles `Logger.ts` more than once, only the instance that configured LogTape holds the sink — we already keep LogTape external (`serverExternalPackages`); flush through the same module in practice (Server Actions).

📄 **Flush after Server Actions** — edit `src/utils/action.ts`: wrap the returned function so logs are flushed when the action finishes (`after()` keeps serverless alive long enough):

```ts
import { after } from 'next/server';

import { flushLogs, getLogger } from '@/libs/Logger';

// inside createAction(...)'s returned async function, at the very top:
try {
  after(() => flushLogs());
} catch {
  // not in a request scope (tests/scripts): nothing to flush later
}
```

### ✅ Verify

```bash
pnpm test && pnpm check
```

1. **Without** the two variables: `pnpm dev` → logs only in the terminal; no network calls (watch with `LOG_LEVEL=debug`).
2. **With** your Better Stack source (`BETTER_STACK_SOURCE_TOKEN`, `BETTER_STACK_INGESTING_HOST` in `.env.local`): submit the contact form → within a few seconds the line **"Contact form received"** appears in _Live tail_; a line with `password` in its properties shows `[REDACTED]`.
3. Set a wrong token → the app keeps working (check the terminal: no stack traces from the sink).
4. Record the serverless caveat in `06-project-state.md`: _"`TD-14` — log batches can be lost when a serverless function is frozen; use Better Stack's Vercel integration in production."_

**🚢 Ship** — branch `feat/s6-t03-betterstack` · message: `feat(obs): ship logs to better stack with a bounded, redacted, non-blocking batch sink`

---

## 🎫 S6-T04 — Request correlation (one id across logs, Sentry and users)

**Branch:** `feat/s6-t04-request-id` · **Story:** US-061 · **3 SP**

> 🎯 _"A customer says: reference abc123."_ One search finds the logs **and** the Sentry event **and** the failing request. The id is born in `proxy.ts`, travels in a header, and is attached to every log line written during that request.

```bash
git switch main && git pull && git switch -c feat/s6-t04-request-id
```

### 1. Helpers for the proxy (pure, tested)

📄 **Create `src/libs/request-id.ts`:**

```ts
export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Reuse a well-formed incoming id (load balancer, CDN); otherwise mint one. Never trust arbitrary content in logs. */
export function resolveRequestId(
  incoming: string | null | undefined,
  generate: () => string = () => crypto.randomUUID(),
): string {
  return incoming && SAFE_ID.test(incoming) ? incoming : generate();
}

/** Request headers with the id set (for downstream server code). */
export function withRequestIdHeader(headers: Headers, requestId: string): Headers {
  const copy = new Headers(headers);
  copy.set(REQUEST_ID_HEADER, requestId);
  return copy;
}
```

📄 **Create `src/libs/request-id.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { REQUEST_ID_HEADER, resolveRequestId, withRequestIdHeader } from './request-id';

describe('resolveRequestId', () => {
  it('keeps a well-formed incoming id', () => {
    expect(resolveRequestId('abc-12345678', () => 'generated')).toBe('abc-12345678');
  });
  it('replaces missing, malformed or log-injecting ids', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'short',
      'has spaces in it!!',
      'line\nbreak-injection',
      'x'.repeat(200),
    ]) {
      expect(resolveRequestId(bad, () => 'generated')).toBe('generated');
    }
  });
});

it('withRequestIdHeader does not mutate the original headers', () => {
  const original = new Headers({ a: '1' });
  const next = withRequestIdHeader(original, 'rid-12345678');
  expect(next.get(REQUEST_ID_HEADER)).toBe('rid-12345678');
  expect(original.has(REQUEST_ID_HEADER)).toBe(false);
});
```

### 2. Born in the proxy

📄 **Edit `src/proxy.ts`:**

```ts
import { REQUEST_ID_HEADER, resolveRequestId, withRequestIdHeader } from './libs/request-id';

export default function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const { pathname, search } = request.nextUrl;
  const { path } = splitLocale(pathname);

  if (isProtectedPath(path) && !getSessionCookie(request)) {
    const redirect = NextResponse.redirect(
      new URL(buildSignInRedirect(pathname, search), request.url),
    );
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  // Forward the id to server code (headers()) AND echo it to the client
  const forwarded = new NextRequest(request, {
    headers: withRequestIdHeader(request.headers, requestId),
  });
  const response = intlMiddleware(forwarded);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
```

> 🔍 Confirm in the next-intl docs that passing a **new `NextRequest` with modified headers** into the middleware keeps them on the rewritten request. If a server component can't read `x-request-id`, fall back to the context helper's generated id (below) — the **response header** still carries the proxy's id for support.

### 3. Bind it to every log line (LogTape context)

📄 **Edit `src/libs/Logger.ts`** — enable implicit contexts:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
// in configureSync({ … }):
    contextLocalStorage: new AsyncLocalStorage(), // 🔍 enables withContext(); name per your LogTape version
```

📄 **Create `src/libs/request-context.ts`:**

```ts
import 'server-only';
import { withContext } from '@logtape/logtape';
import { headers } from 'next/headers';

import { REQUEST_ID_HEADER, resolveRequestId } from '@/libs/request-id';
import { setRequestTag } from '@/libs/Sentry';

/** The id of the current request (header set by proxy.ts); a fresh one outside a request (tests, scripts). */
export async function currentRequestId(): Promise<string> {
  try {
    return resolveRequestId((await headers()).get(REQUEST_ID_HEADER));
  } catch {
    return resolveRequestId(null);
  }
}

/** Every log line written inside `fn` (even in nested async calls) carries these properties. */
export async function withRequestContext<T>(
  extra: Record<string, unknown>,
  fn: (requestId: string) => Promise<T>,
): Promise<T> {
  const requestId = await currentRequestId();
  setRequestTag(requestId); // same id on Sentry events
  return withContext({ requestId, ...extra }, () => fn(requestId));
}

/** Adds more properties (userId, orgId) once they are known — nested inside the current context. */
export function bindContext<T>(extra: Record<string, unknown>, fn: () => Promise<T>): Promise<T> {
  return withContext(extra, fn);
}
```

📄 **Add to `src/libs/Sentry.ts`:**

```ts
export function setRequestTag(requestId: string): void {
  Sentry.getCurrentScope().setTag('requestId', requestId);
}
```

📄 **Use it in the action wrapper** — edit `src/utils/action.ts`: wrap the body, put the id into unknown-error results and logs:

```ts
import { withRequestContext } from '@/libs/request-context';

export type ActionError = {
  code: string;
  messageKey: string;
  fieldErrors?: Record<string, string[]>;
  /** Support reference (request id) — present for unexpected errors */
  reference?: string;
};

// inside the returned async function, wrap everything after the `after(...)` block:
return withRequestContext({}, async (requestId) => {
  /* …existing parse → try/catch…; in the unknown-error branch: */
  reportError(error, { requestId });
  return {
    ok: false,
    error: { code: 'INTERNAL', messageKey: 'errors.internal', reference: requestId },
  };
});
```

📄 **Bind user and organization** — edit `src/data/with-auth.ts`:

```ts
import { bindContext } from '@/libs/request-context';

return async (input: Input): Promise<Result> => {
  const session = await getSessionOrThrow();
  return bindContext({ userId: session.user.id }, () => handler(input, { session }));
};
```

and in `withOrgPermission` (`src/data/authz.ts`): `return bindContext({ orgId: context.org.id, userId: context.session.user.id }, () => handler(input, context));` (after computing `context = await requirePermission(…)`).

### 4. Show the reference to people

📄 **Edit `src/components/forms/form-error.tsx`:**

```tsx
export function FormError({ messageKey, reference }: { messageKey?: string | null; reference?: string | null }) {
  // …existing…
      <AlertDescription>
        {/* …message… */}
        {reference ? (
          <span className="mt-1 block text-xs opacity-80">
            {t('errors.reference')}: {reference}
          </span>
        ) : null}
      </AlertDescription>
```

Pass it where a Server Action result is shown — `ContactForm` first (state `{ messageKey, reference }`); other forms can adopt the same two lines. The route error boundary already prints Next's `digest` ("Reference: …", Sprint 1).

📄 **Test the context plumbing** — `src/libs/request-context.test.ts`:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

import { getLogger, configureSync, reset } from '@logtape/logtape';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-request-id': 'req-12345678' }),
}));

import { withRequestContext } from './request-context';

afterEach(async () => reset());

it('puts the request id on every log record written inside the context', async () => {
  const seen: Record<string, unknown>[] = [];
  configureSync({
    reset: true,
    contextLocalStorage: new AsyncLocalStorage(),
    sinks: { memory: (record) => seen.push(record.properties) },
    loggers: [{ category: ['test'], lowestLevel: 'debug', sinks: ['memory'] }],
  });

  await withRequestContext({ userId: 'u1' }, async () => {
    await Promise.resolve(); // survives async boundaries
    getLogger(['test']).info('inside');
  });
  getLogger(['test']).info('outside');

  expect(seen[0]).toMatchObject({ requestId: 'req-12345678', userId: 'u1' });
  expect(seen[1]).not.toHaveProperty('requestId');
});
```

> 🔍 Option names (`contextLocalStorage`, `reset`) follow current LogTape docs; adjust if yours differ.

### 5. How to trace one request (document it)

📄 **Append to `docs/guides/observability.md`:**

```markdown
## Following one request

1. Every response carries `x-request-id` (DevTools → Network). Unexpected errors in forms/error pages show it as **Reference**.
2. Logs: search `requestId:"<id>"` in Better Stack (or grep the terminal).
3. Sentry: the event has the tag `requestId` — search `requestId:<id>`.
4. Server Action logs also carry `userId` and (for organization actions) `orgId`.
```

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

1. `curl -i http://localhost:3000/` → header `x-request-id: <uuid>`; with `-H "x-request-id: my-trace-12345"` the **same** value is echoed; with `-H "x-request-id: bad value!"` a fresh id is generated.
2. Submit the contact form; the terminal's log lines for that action show the same `requestId`.
3. Make a Server Action fail unexpectedly (throw a plain `Error` in a handler): the UI shows **Reference: `<id>`**, the same id is on the log line **and** (with a DSN) on the Sentry event's tags.
4. An organization action's logs include `orgId` and `userId`.

**🚢 Ship** — branch `feat/s6-t04-request-id` · message: `feat(obs): propagate a request id through proxy, logs, sentry and user-facing references`

---

## 🎫 S6-T05 — Arcjet adapter (optional, observe-first)

**Branch:** `feat/s6-t05-arcjet-adapter` · **Story:** US-062 · **3 SP** · 🔍 Read the Arcjet **Next.js** docs

> 🎯 Arcjet adds bot detection, a WAF-style _shield_, rate limits and email validation. We wrap it so that **(a)** no key → everything is allowed, **(b)** `DRY_RUN` only _logs_ what it would have blocked, **(c)** an Arcjet outage never takes the site down (fail open), **(d)** the logic is testable without Arcjet.

```bash
git switch main && git pull && git switch -c feat/s6-t05-arcjet-adapter
pnpm add @arcjet/next
```

### 1. Environment

📄 **Edit `src/libs/Env.ts`** (`server` + `runtimeEnv`):

```ts
    ARCJET_KEY: z.string().min(1).optional(),
    // DRY_RUN = log only. Default: LIVE in production, DRY_RUN everywhere else.
    ARCJET_MODE: z.enum(['DRY_RUN', 'LIVE']).optional(),
```

📄 **Append to `.env.example`:**

```dotenv
# ─── Arcjet (optional: no key → no protection layer, nothing breaks) ──
ARCJET_KEY=
# DRY_RUN logs what WOULD be blocked. Leave empty: DRY_RUN in dev/preview, LIVE in production.
ARCJET_MODE=
```

### 2. Interpreting a decision (pure → testable)

📄 **Create `src/libs/arcjet-decision.ts`:**

```ts
export type DenyReason = 'rate_limit' | 'bot' | 'shield' | 'email' | 'other';

export type Verdict =
  | { allowed: true }
  | { allowed: false; reason: DenyReason; status: 400 | 403 | 429 };

/** The subset of Arcjet's decision object we rely on (keeps tests free of the SDK). */
export type DecisionLike = {
  isDenied(): boolean;
  reason: { isRateLimit(): boolean; isBot(): boolean; isShield(): boolean; isEmail(): boolean };
  results?: { state?: string; conclusion?: string }[];
};

const STATUS: Record<DenyReason, 400 | 403 | 429> = {
  rate_limit: 429,
  bot: 403,
  shield: 403,
  email: 400,
  other: 403,
};

export function interpretDecision(decision: DecisionLike): Verdict {
  if (!decision.isDenied()) return { allowed: true };

  const reason: DenyReason = decision.reason.isRateLimit()
    ? 'rate_limit'
    : decision.reason.isBot()
      ? 'bot'
      : decision.reason.isShield()
        ? 'shield'
        : decision.reason.isEmail()
          ? 'email'
          : 'other';
  return { allowed: false, reason, status: STATUS[reason] };
}

/** In DRY_RUN rules "run" but never deny — this tells us what LIVE mode would have done. */
export function wouldHaveDenied(decision: DecisionLike): boolean {
  return (decision.results ?? []).some(
    (result) => result.state === 'DRY_RUN' && result.conclusion === 'DENY',
  );
}
```

📄 **Create `src/libs/arcjet-decision.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { type DecisionLike, interpretDecision, wouldHaveDenied } from './arcjet-decision';

const decision = (
  denied: boolean,
  kind?: 'rate' | 'bot' | 'shield' | 'email',
  results: DecisionLike['results'] = [],
): DecisionLike => ({
  isDenied: () => denied,
  reason: {
    isRateLimit: () => kind === 'rate',
    isBot: () => kind === 'bot',
    isShield: () => kind === 'shield',
    isEmail: () => kind === 'email',
  },
  results,
});

describe('interpretDecision', () => {
  it('allows allowed decisions', () => {
    expect(interpretDecision(decision(false))).toEqual({ allowed: true });
  });

  it.each([
    ['rate', 'rate_limit', 429],
    ['bot', 'bot', 403],
    ['shield', 'shield', 403],
    ['email', 'email', 400],
  ] as const)('maps %s denials to %s / HTTP %i', (kind, reason, status) => {
    expect(interpretDecision(decision(true, kind))).toEqual({ allowed: false, reason, status });
  });

  it('treats unknown denials as 403', () => {
    expect(interpretDecision(decision(true))).toEqual({
      allowed: false,
      reason: 'other',
      status: 403,
    });
  });
});

it('wouldHaveDenied spots DRY_RUN denials only', () => {
  expect(
    wouldHaveDenied(decision(false, undefined, [{ state: 'DRY_RUN', conclusion: 'DENY' }])),
  ).toBe(true);
  expect(wouldHaveDenied(decision(false, undefined, [{ state: 'RUN', conclusion: 'ALLOW' }]))).toBe(
    false,
  );
  expect(wouldHaveDenied(decision(false))).toBe(false);
});
```

### 3. Where in the app each request belongs (pure)

📄 **Create `src/libs/arcjet-routes.ts`:**

```ts
export type RouteKind = 'page' | 'auth-api' | 'auth-signup' | 'auth-email-link' | 'auth-sign-in';

/** Which protection profile applies to a request path. */
export function classifyRoute(pathname: string): RouteKind {
  if (!pathname.startsWith('/api/auth')) return 'page';

  if (pathname.startsWith('/api/auth/sign-up')) return 'auth-signup';
  if (pathname.startsWith('/api/auth/sign-in/email')) return 'auth-sign-in';
  if (
    pathname.startsWith('/api/auth/sign-in/magic-link') ||
    pathname.startsWith('/api/auth/request-password-reset') || // 🔍 older name: /forget-password
    pathname.startsWith('/api/auth/forget-password') ||
    pathname.startsWith('/api/auth/send-verification-email')
  ) {
    return 'auth-email-link'; // endpoints that SEND EMAIL to an address the caller chooses
  }
  return 'auth-api';
}

/** Endpoints where the caller supplies an email we should validate / rate-limit per address. */
export const kindsWithEmail: readonly RouteKind[] = ['auth-signup', 'auth-email-link'];
```

📄 **Create `src/libs/arcjet-routes.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { classifyRoute } from './arcjet-routes';

it('classifies paths into protection profiles', () => {
  expect(classifyRoute('/dashboard')).toBe('page');
  expect(classifyRoute('/fr/sign-in')).toBe('page');
  expect(classifyRoute('/api/auth/sign-up/email')).toBe('auth-signup');
  expect(classifyRoute('/api/auth/sign-in/email')).toBe('auth-sign-in');
  expect(classifyRoute('/api/auth/sign-in/magic-link')).toBe('auth-email-link');
  expect(classifyRoute('/api/auth/request-password-reset')).toBe('auth-email-link');
  expect(classifyRoute('/api/auth/get-session')).toBe('auth-api');
});
```

### 4. The adapter

📄 **Create `src/libs/Arcjet.ts`:**

```ts
import arcjet, { detectBot, shield } from '@arcjet/next';

import {
  type DecisionLike,
  interpretDecision,
  type Verdict,
  wouldHaveDenied,
} from '@/libs/arcjet-decision';
import { classifyRoute, kindsWithEmail, type RouteKind } from '@/libs/arcjet-routes';
import { Env } from '@/libs/Env';
import { getLogger } from '@/libs/Logger';

/** What we use of an Arcjet client — lets tests pass fakes. */
export type ProtectClient = {
  protect: (request: Request, options?: Record<string, unknown>) => Promise<DecisionLike>;
};
export type Clients = { general?: ProtectClient; email?: ProtectClient };
type Input = { request: Request; pathname: string; email?: string | undefined };

const ALLOWED: Verdict = { allowed: true };

/**
 * The testable core. Fail-open by design: if Arcjet itself errors we let the request through
 * (an outage of a security vendor must not become OUR outage) and say so in the logs.
 */
export async function evaluate(
  clients: Clients,
  { request, pathname, email }: Input,
  kind: RouteKind = classifyRoute(pathname),
): Promise<Verdict> {
  const log = getLogger('security');
  const runs: { client: ProtectClient | undefined; options?: Record<string, unknown> }[] = [
    { client: clients.general },
    ...(email && kindsWithEmail.includes(kind)
      ? [{ client: clients.email, options: { email, userEmail: email } }]
      : []),
  ];

  for (const { client, options } of runs) {
    if (!client) continue;
    try {
      const decision = await client.protect(request, options);
      if (wouldHaveDenied(decision))
        log.warning('Arcjet DRY_RUN would block {kind} {path}', { kind, path: pathname });

      const verdict = interpretDecision(decision);
      if (!verdict.allowed) {
        log.warning('Arcjet blocked {kind} {path}: {reason}', {
          kind,
          path: pathname,
          reason: verdict.reason,
        });
        return verdict;
      }
    } catch (error) {
      log.error('Arcjet failed — letting the request through', { error });
    }
  }
  return ALLOWED;
}

const mode = Env.ARCJET_MODE ?? (Env.NODE_ENV === 'production' ? 'LIVE' : 'DRY_RUN');

// No key → no clients → evaluate() allows everything.
const general: ProtectClient | undefined = Env.ARCJET_KEY
  ? arcjet({
      key: Env.ARCJET_KEY,
      characteristics: ['ip.src'],
      rules: [
        shield({ mode }),
        detectBot({
          mode,
          // Search engines, link previews and uptime monitors (Checkly) are welcome; 🔍 category names per Arcjet docs
          allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW', 'CATEGORY:MONITOR'],
        }),
      ],
    })
  : undefined;

export const arcjetEnabled = Boolean(general);

/** Used by proxy.ts. A no-op (always allowed) when ARCJET_KEY is not set. */
export function protectRequest(request: Request, input: Omit<Input, 'request'>) {
  return evaluate({ general }, { request, ...input });
}
```

📄 **Create `src/libs/arcjet.test.ts`** (fake clients; no network):

```ts
import { describe, expect, it, vi } from 'vitest';

import { evaluate, type ProtectClient } from './Arcjet';
import type { DecisionLike } from './arcjet-decision';

const request = new Request('http://localhost/api/auth/sign-in/email', { method: 'POST' });

const decision = (
  denied: boolean,
  over: Partial<DecisionLike['reason']> = {},
  results: DecisionLike['results'] = [],
): DecisionLike => ({
  isDenied: () => denied,
  reason: {
    isRateLimit: () => false,
    isBot: () => false,
    isShield: () => false,
    isEmail: () => false,
    ...over,
  },
  results,
});
const client = (result: DecisionLike | Error): ProtectClient => ({
  protect: vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  }),
});

describe('evaluate', () => {
  it('allows everything when Arcjet is not configured (no clients)', async () => {
    expect(await evaluate({}, { request, pathname: '/dashboard' })).toEqual({ allowed: true });
  });

  it('blocks bots with 403 and rate-limited callers with 429', async () => {
    expect(
      await evaluate(
        { general: client(decision(true, { isBot: () => true })) },
        { request, pathname: '/' },
      ),
    ).toMatchObject({ allowed: false, status: 403, reason: 'bot' });
    expect(
      await evaluate(
        { general: client(decision(true, { isRateLimit: () => true })) },
        { request, pathname: '/api/auth/sign-in/email' },
      ),
    ).toMatchObject({ allowed: false, status: 429 });
  });

  it('FAILS OPEN when Arcjet throws', async () => {
    expect(
      await evaluate({ general: client(new Error('arcjet is down')) }, { request, pathname: '/' }),
    ).toEqual({ allowed: true });
  });

  it('DRY_RUN decisions never block', async () => {
    const dry = decision(false, {}, [{ state: 'DRY_RUN', conclusion: 'DENY' }]);
    expect(await evaluate({ general: client(dry) }, { request, pathname: '/' })).toEqual({
      allowed: true,
    });
  });
});
```

> The email client is added in S6-T07; `evaluate` already knows how to use it.

### ✅ Verify

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm knip && pnpm check:env
pnpm build            # builds WITHOUT ARCJET_KEY (the adapter is not used by any route yet)
```

`protectRequest` is exported but nothing calls it until S6-T06 — add `src/libs/Arcjet.ts` to Knip's temporary `entry` list if it complains.

**🚢 Ship** — branch `feat/s6-t05-arcjet-adapter` · message: `feat(sec): add optional arcjet adapter with dry-run mode and fail-open behaviour`

---

## 🎫 S6-T06 — Shield and bot detection in `proxy.ts`

**Branch:** `feat/s6-t06-arcjet-proxy` · **Story:** US-062 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s6-t06-arcjet-proxy
```

### 1. Denied responses

📄 **Create `src/libs/proxy-responses.ts`:**

```ts
import { NextResponse } from 'next/server';

import type { Verdict } from '@/libs/arcjet-decision';
import { REQUEST_ID_HEADER } from '@/libs/request-id';

const MESSAGES = {
  rate_limit: 'Too many requests. Please slow down.',
  bot: 'Automated traffic is not allowed.',
  shield: 'Request blocked.',
  email: 'Please use a valid, permanent email address.',
  other: 'Request blocked.',
} as const;

const CODES = {
  rate_limit: 'RATE_LIMITED',
  bot: 'BLOCKED',
  shield: 'BLOCKED',
  email: 'EMAIL_REJECTED',
  other: 'BLOCKED',
} as const;

/** JSON for API paths (Better Auth's client understands `{ code, message }`), plain text for pages. */
export function denyResponse(
  verdict: Extract<Verdict, { allowed: false }>,
  requestId: string,
  isApi: boolean,
) {
  const response = isApi
    ? NextResponse.json(
        { code: CODES[verdict.reason], message: MESSAGES[verdict.reason] },
        { status: verdict.status },
      )
    : new NextResponse(MESSAGES[verdict.reason], {
        status: verdict.status,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  if (verdict.reason === 'rate_limit') response.headers.set('Retry-After', '60');
  return response;
}
```

### 2. The proxy, now protecting pages **and** auth endpoints

📄 **Rewrite `src/proxy.ts`:**

```ts
import { getSessionCookie } from 'better-auth/cookies';
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from './i18n/routing';
import { protectRequest } from './libs/Arcjet';
import { denyResponse } from './libs/proxy-responses';
import { REQUEST_ID_HEADER, resolveRequestId, withRequestIdHeader } from './libs/request-id';
import { buildSignInRedirect, isProtectedPath, splitLocale } from './libs/route-guard';

const intlMiddleware = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const { pathname, search } = request.nextUrl;
  const isAuthApi = pathname.startsWith('/api/auth');

  // 1) Abuse protection FIRST: bots and attacks shouldn't reach any of our logic.
  //    No ARCJET_KEY → always allowed. DRY_RUN → only logs.
  const verdict = await protectRequest(request, { pathname });
  if (!verdict.allowed) return denyResponse(verdict, requestId, isAuthApi);

  // 2) Better Auth endpoints: just forward (no locale handling), with the request id
  if (isAuthApi) {
    const response = NextResponse.next({
      request: { headers: withRequestIdHeader(request.headers, requestId) },
    });
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }

  // 3) Optimistic auth redirect (ADR-003): the real check is in src/data/session.ts
  const { path } = splitLocale(pathname);
  if (isProtectedPath(path) && !getSessionCookie(request)) {
    const redirect = NextResponse.redirect(
      new URL(buildSignInRedirect(pathname, search), request.url),
    );
    redirect.headers.set(REQUEST_ID_HEADER, requestId);
    return redirect;
  }

  // 4) Locale routing
  const forwarded = new NextRequest(request, {
    headers: withRequestIdHeader(request.headers, requestId),
  });
  const response = intlMiddleware(forwarded);
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: [
    // Pages: everything except API, Next internals and files with an extension
    '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
    // …plus the auth API, which Arcjet must see (bots and credential stuffing target it)
    '/api/auth/:path*',
  ],
};
```

> 🔒 `/api/health` (S6-T08) and `/api/csp-report` stay **outside** the matcher on purpose: monitors and browsers must never be rate-limited or bot-blocked by our own guard.

### 3. Check that nothing legitimate is blocked

- Search engines, link previews and uptime monitors are in the `allow` list (S6-T05).
- Our **Playwright** tests run without `ARCJET_KEY`, so they're never classified as bots. If you later run E2E _with_ a key, set `ARCJET_MODE=DRY_RUN`.

### ✅ Verify

```bash
pnpm test && pnpm check && pnpm e2e        # unchanged behaviour with no key: everything passes
```

1. **No key:** browse the app, run E2E — identical to before. `curl -i localhost:3000/` still returns `x-request-id`.
2. **With a key, `DRY_RUN`** (`ARCJET_KEY=… ` in `.env.local`, restart): browse normally → no blocks. Run a bot-like request: `curl -A "python-requests/2.0" -i http://localhost:3000/` → still **200**, but the terminal logs **"Arcjet DRY_RUN would block page /"**.
3. **`ARCJET_MODE=LIVE`** (temporarily): the same `curl` now gets **403** `Automated traffic is not allowed.` while your browser keeps working. Revert to `DRY_RUN`.
4. **Fail open:** set `ARCJET_KEY=invalid` → requests still succeed and the log shows "Arcjet failed — letting the request through".
5. `/api/health` (next ticket) is reachable with any user-agent.

**🚢 Ship** — branch `feat/s6-t06-arcjet-proxy` · message: `feat(sec): protect pages and auth endpoints with arcjet shield and bot detection in the proxy`

---

## 🎫 S6-T07 — Rate limits and email validation

**Branch:** `feat/s6-t07-arcjet-limits` · **Story:** US-062 · **3 SP**

> 🎯 Two layers already exist: Better Auth's per-IP limits (Sprint 2). Arcjet adds what they can't see: **per-email** limits (an attacker rotating IPs against one inbox) and **disposable/invalid email** rejection at sign-up.

```bash
git switch main && git pull && git switch -c feat/s6-t07-arcjet-limits
```

### 1. Reading the email from the body (carefully)

📄 **Create `src/libs/request-body.ts`:**

```ts
const MAX_BODY_BYTES = 10_000; // auth bodies are tiny; never buffer something huge in the proxy

/** The `email` of a JSON auth request, lower-cased — without consuming the original body. */
export async function readEmail(request: Request): Promise<string | undefined> {
  if (request.method !== 'POST') return undefined;
  if (!request.headers.get('content-type')?.includes('application/json')) return undefined;
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return undefined;

  try {
    const body: unknown = await request.clone().json();
    const email =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>).email
        : undefined;
    return typeof email === 'string' && email.length <= 254
      ? email.trim().toLowerCase()
      : undefined;
  } catch {
    return undefined; // not JSON / malformed → Better Auth will reject it itself
  }
}
```

📄 **Create `src/libs/request-body.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { readEmail } from './request-body';

const post = (
  body: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' },
) =>
  new Request('http://localhost/api/auth/sign-up/email', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('readEmail', () => {
  it('returns the normalised email and leaves the body readable', async () => {
    const request = post({ email: ' Ada@Example.COM ', password: 'x' });
    expect(await readEmail(request)).toBe('ada@example.com');
    expect(await request.json()).toMatchObject({ password: 'x' }); // original body untouched
  });

  it('ignores GET, non-JSON, malformed and silly values', async () => {
    expect(await readEmail(new Request('http://x/', { method: 'GET' }))).toBeUndefined();
    expect(await readEmail(post('email=a@b.c', { 'content-type': 'text/plain' }))).toBeUndefined();
    expect(await readEmail(post('{nope'))).toBeUndefined();
    expect(await readEmail(post({ email: 42 }))).toBeUndefined();
    expect(await readEmail(post({ email: 'a'.repeat(300) }))).toBeUndefined();
  });
});
```

### 2. Rate limits and an email client

📄 **Edit `src/libs/Arcjet.ts`:**

```ts
import arcjet, { detectBot, shield, slidingWindow, validateEmail } from '@arcjet/next';

import { readEmail } from '@/libs/request-body';
```

Replace the `general` client with one that also rate-limits the auth API **per IP**, and add the per-email client:

```ts
const general: ProtectClient | undefined = Env.ARCJET_KEY
  ? arcjet({
      key: Env.ARCJET_KEY,
      characteristics: ['ip.src'],
      rules: [
        shield({ mode }),
        detectBot({
          mode,
          allow: ['CATEGORY:SEARCH_ENGINE', 'CATEGORY:PREVIEW', 'CATEGORY:MONITOR'],
        }),
        // Generous for humans, hopeless for scripts. (Pages are not limited: CDNs and monitors need them.)
        // Stricter per-endpoint limits already exist inside Better Auth (src/libs/auth-rate-limit.ts).
        slidingWindow({ mode, interval: '1m', max: 60 }),
      ],
    })
  : undefined;

// Per-ADDRESS protection: rotating IPs doesn't help an attacker who targets one inbox.
const email: ProtectClient | undefined = Env.ARCJET_KEY
  ? arcjet({
      key: Env.ARCJET_KEY,
      characteristics: ['userEmail'], // a custom characteristic we supply in protect(…, { userEmail })
      rules: [
        validateEmail({ mode, deny: ['DISPOSABLE', 'INVALID', 'NO_MX_RECORDS'] }),
        slidingWindow({ mode, interval: '1h', max: 5 }), // at most 5 sign-up / reset / magic-link emails per address per hour
      ],
    })
  : undefined;
```

and update the exported function so it reads the email only for the endpoints that need it:

```ts
import { classifyRoute, kindsWithEmail } from '@/libs/arcjet-routes';

export async function protectRequest(request: Request, { pathname }: { pathname: string }) {
  const kind = classifyRoute(pathname);
  const address = kindsWithEmail.includes(kind) ? await readEmail(request) : undefined;
  return evaluate({ general, email }, { request, pathname, email: address }, kind);
}
```

(`evaluate` already runs the email client only when an address was found **and** the route kind carries one.)

> 🔒 **Order matters:** the cheap per-IP checks run first; the per-email checks only run when those pass.

### 3. Tell users why a sign-up was refused

📄 **Add the message** — `validation` in both locale files:

```json
    "emailRejected": "Please use a valid, permanent email address."
```

```json
    "emailRejected": "Veuillez utiliser une adresse e-mail valide et permanente."
```

📄 **Edit `src/libs/auth-error-keys.ts`** — `KEYS`: `EMAIL_REJECTED: 'validation.emailRejected',` (the proxy answers `{ code: 'EMAIL_REJECTED' }` with HTTP 400; HTTP 429 already maps to the rate-limit message).

📄 **Extend `src/libs/arcjet.test.ts`:**

```ts
it('checks the email client only for endpoints that carry an address', async () => {
  const general = client(decision(false));
  const email = client(decision(false));

  await evaluate(
    { general, email },
    { request, pathname: '/api/auth/sign-up/email', email: 'ada@example.com' },
  );
  expect(email.protect).toHaveBeenCalledWith(request, {
    email: 'ada@example.com',
    userEmail: 'ada@example.com',
  });

  const other = client(decision(false));
  await evaluate(
    { general, email: other },
    { request, pathname: '/api/auth/sign-in/email', email: 'ada@example.com' },
  );
  expect(other.protect).not.toHaveBeenCalled();
});

it('rejects disposable addresses (HTTP 400) and over-used addresses (HTTP 429)', async () => {
  const disposable = client(decision(true, { isEmail: () => true }));
  const limited = client(decision(true, { isRateLimit: () => true }));

  expect(
    await evaluate(
      { email: disposable },
      { request, pathname: '/api/auth/sign-up/email', email: 'x@mailinator.com' },
    ),
  ).toMatchObject({ status: 400, reason: 'email' });
  expect(
    await evaluate(
      { email: limited },
      { request, pathname: '/api/auth/request-password-reset', email: 'a@b.co' },
    ),
  ).toMatchObject({ status: 429, reason: 'rate_limit' });
});
```

### ✅ Verify

```bash
pnpm test && pnpm check && pnpm e2e
```

With a real key (`ARCJET_MODE=LIVE` temporarily, dev server):

1. **Sign up with a disposable address** (e.g. `test@mailinator.com`) → the form shows "Please use a valid, permanent email address." (HTTP 400, nothing created).
2. **Per-address limit:** request a password reset for the same address 6 times within an hour (use a fake IP header with `curl -H "x-forwarded-for: 1.2.3.4"` and a different one each time) → the 6th is **429**, even though the IPs differ.
3. **Per-IP limit:** `for i in $(seq 70); do curl -s -o /dev/null -w "%{http_code} " -X POST localhost:3000/api/auth/get-session; done` → 429s after ~60.
4. Back to `DRY_RUN`: the same actions are allowed but logged as "would block".
5. Better Auth's own limits (S2/S3) still apply underneath — the two layers are independent.

**🚢 Ship** — branch `feat/s6-t07-arcjet-limits` · message: `feat(sec): add per-ip and per-email rate limits and disposable email rejection via arcjet`

---

## 🎫 S6-T08 — Health endpoint and Checkly monitoring-as-code

**Branch:** `feat/s6-t08-health-checkly` · **Story:** US-064 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s6-t08-health-checkly
mkdir -p src/app/api/health __checks__
```

### 1. The health check

📄 **Edit `src/libs/Env.ts`** (`server` + `runtimeEnv`): `APP_VERSION: z.string().min(1).optional(),` · `.env.example`: `APP_VERSION=` _(optional; e.g. the Git SHA set by your deploy)_.

📄 **Create `src/data/health.ts`** (database access stays in `src/data`, per the tenant-boundary rule):

```ts
import 'server-only';
import { sql } from 'drizzle-orm';

import { db } from '@/db/client';

export type DatabaseStatus = 'ok' | 'fail';

/** `select 1` with a hard timeout: a hung database must not hang the health check. */
export async function checkDatabase(timeoutMs = 1000): Promise<DatabaseStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('database timeout')), timeoutMs);
      }),
    ]);
    return 'ok';
  } catch {
    return 'fail'; // details stay in the logs, never in the response
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

📄 **Create `src/app/api/health/route.ts`:**

```ts
import { NextResponse } from 'next/server';

import { checkDatabase } from '@/data/health';
import { Env } from '@/libs/Env';

import packageJson from '../../../../package.json';

export const dynamic = 'force-dynamic'; // never cache a health check

/** Public, unauthenticated, and deliberately boring: status, version, database, time. No internals. */
export async function GET() {
  const database = await checkDatabase();
  const healthy = database === 'ok';

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'error',
      version: Env.APP_VERSION ?? packageJson.version,
      db: database,
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
```

📄 **Create `src/app/api/health/route.test.ts`:**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const checkDatabase = vi.hoisted(() => vi.fn());
vi.mock('@/data/health', () => ({ checkDatabase }));

import { GET } from './route';

beforeEach(() => checkDatabase.mockReset());

describe('GET /api/health', () => {
  it('200 with status ok when the database answers', async () => {
    checkDatabase.mockResolvedValue('ok');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      status: 'ok',
      db: 'ok',
      version: expect.any(String),
    });
  });

  it('503 when the database is down — and reveals nothing else', async () => {
    checkDatabase.mockResolvedValue('fail');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(Object.keys(body).sort()).toEqual(['db', 'status', 'time', 'version']);
  });
});
```

📄 **Create `src/data/health.test.ts`:**

```ts
import { describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('@/db/client', () => ({ db: { execute } }));

import { checkDatabase } from './health';

describe('checkDatabase', () => {
  it('ok when the query succeeds', async () => {
    execute.mockResolvedValue([]);
    expect(await checkDatabase()).toBe('ok');
  });
  it('fail when the query throws', async () => {
    execute.mockRejectedValue(new Error('connection refused'));
    expect(await checkDatabase()).toBe('fail');
  });
  it('fail (not hang) when the database never answers', async () => {
    execute.mockReturnValue(new Promise(() => undefined));
    expect(await checkDatabase(50)).toBe('fail');
  });
});
```

### 2. Checkly: monitoring as code

```bash
pnpm add -D checkly
```

📄 **Create `checkly.config.ts`:**

```ts
import { defineConfig } from 'checkly';
import { Frequency } from 'checkly/constructs';

export default defineConfig({
  projectName: 'SaaS Boilerplate',
  logicalId: 'saas-boilerplate',
  checks: {
    frequency: Frequency.EVERY_10M,
    locations: ['eu-west-1', 'us-east-1'],
    runtimeId: '2025.04', // 🔍 pick a current runtime from Checkly's docs
    checkMatch: '__checks__/**/*.check.ts',
    browserChecks: { testMatch: '__checks__/**/*.spec.ts' },
  },
  cli: { runLocation: 'eu-west-1' },
});
```

📄 **Create `__checks__/health.check.ts`:**

```ts
import { ApiCheck, AssertionBuilder } from 'checkly/constructs';

const baseUrl = process.env.CHECKLY_BASE_URL ?? 'https://your-app.example.com';

new ApiCheck('health-endpoint', {
  name: 'API · /api/health',
  degradedResponseTime: 800,
  maxResponseTime: 3000,
  request: {
    method: 'GET',
    url: `${baseUrl}/api/health`,
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$.status').equals('ok'),
      AssertionBuilder.jsonBody('$.db').equals('ok'),
    ],
  },
});
```

📄 **Create `__checks__/pages.check.ts`:**

```ts
import { BrowserCheck } from 'checkly/constructs';

const baseUrl = process.env.CHECKLY_BASE_URL ?? 'https://your-app.example.com';

new BrowserCheck('public-pages', {
  name: 'Browser · landing and sign-in render',
  code: { entrypoint: './pages.spec.ts' },
  environmentVariables: [{ key: 'BASE_URL', value: baseUrl }],
});
```

📄 **Create `__checks__/pages.spec.ts`:**

```ts
import { expect, test } from '@playwright/test';

const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';

test('the landing page renders', async ({ page }) => {
  const response = await page.goto(baseUrl);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the sign-in page renders its form', async ({ page }) => {
  await page.goto(`${baseUrl}/sign-in`);
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
```

📄 **Edit `package.json`:**

```json
"checkly:test": "checkly test --record=false",
"checkly:deploy": "checkly deploy --force"
```

📄 **Edit `knip.config.ts`** → `entry`: add `'checkly.config.ts'`, `'__checks__/**/*.ts'`. 📄 **Edit `vitest.config.ts`** → make sure the spec isn't picked up as a unit test: it ends in `.spec.ts` (our unit pattern is `*.test.ts`) ✓ nothing to do.

### 3. Deploy checks from CI (only when the secrets exist)

📄 **Create `.github/workflows/checkly.yml`:**

```yaml
name: Checkly

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      CHECKLY_API_KEY: ${{ secrets.CHECKLY_API_KEY }}
      CHECKLY_ACCOUNT_ID: ${{ secrets.CHECKLY_ACCOUNT_ID }}
      CHECKLY_BASE_URL: ${{ vars.CHECKLY_BASE_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - name: Deploy checks
        if: ${{ env.CHECKLY_API_KEY != '' && env.CHECKLY_BASE_URL != '' }}
        run: pnpm checkly:deploy
      - name: Nothing to do
        if: ${{ env.CHECKLY_API_KEY == '' || env.CHECKLY_BASE_URL == '' }}
        run: echo "Checkly secrets/variables not configured — skipping (optional integration)."
```

> Set `CHECKLY_BASE_URL` as a repository **variable** (your production URL) and the two Checkly values as **secrets** when you're ready (Sprint 8's deployment guide repeats this).

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev && curl -i http://localhost:3000/api/health
```

1. `200` with `{"status":"ok","version":"…","db":"ok","time":"…"}` and `Cache-Control: no-store`.
2. Stop the DB (kill `pnpm db:server`) → the same URL answers **503** within ~1 s with `db":"fail"` and nothing else. Restart the DB.
3. Health works with **any** user-agent and is **not** rate-limited (outside the proxy matcher).
4. (Optional, needs a Checkly account) `npx checkly login` → `pnpm checkly:test` runs both checks against `CHECKLY_BASE_URL` (use your local tunnel or deployed preview).
5. The new workflow is green on the PR _(it only prints the "skipping" message until secrets exist)_.

**🚢 Ship** — branch `feat/s6-t08-health-checkly` · message: `feat(obs): add health endpoint and checkly monitoring as code`

---

## 🎫 S6-T09 — Security headers

**Branch:** `feat/s6-t09-security-headers` · **Story:** US-065 · **1 SP**

> 🎯 Browsers can switch off whole classes of attack — if we ask. Clickjacking, MIME sniffing, referrer leaks, unwanted camera/microphone access. **Not** included yet: the Content-Security-Policy (S6-T11).

```bash
git switch main && git pull && git switch -c feat/s6-t09-security-headers
```

### 1. One tested definition

📄 **Create `src/libs/security-headers.ts`:**

```ts
export type HeaderEntry = { key: string; value: string };

export function buildSecurityHeaders({ production }: { production: boolean }): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' }, // clickjacking (CSP's frame-ancestors repeats this in S6-T11)
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      // Deny powerful features we never use. Passkeys (WebAuthn) must stay available to our own origin!
      value: [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'publickey-credentials-get=(self)',
        'publickey-credentials-create=(self)',
      ].join(', '),
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];

  // HSTS tells browsers "HTTPS only, for two years". Only meaningful (and safe to promise) in production.
  if (production) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }
  return headers;
}
```

📄 **Create `src/libs/security-headers.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { buildSecurityHeaders } from './security-headers';

const asMap = (production: boolean) =>
  new Map(buildSecurityHeaders({ production }).map((entry) => [entry.key, entry.value]));

describe('buildSecurityHeaders', () => {
  it('always sends the baseline protections, once each', () => {
    const entries = buildSecurityHeaders({ production: false });
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length); // no duplicates

    const headers = asMap(false);
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('keeps passkeys working while denying camera, microphone and geolocation', () => {
    const policy = asMap(false).get('Permissions-Policy')!;
    expect(policy).toContain('publickey-credentials-get=(self)');
    expect(policy).toContain('publickey-credentials-create=(self)');
    for (const denied of ['camera=()', 'microphone=()', 'geolocation=()'])
      expect(policy).toContain(denied);
  });

  it('adds HSTS only in production', () => {
    expect(asMap(false).has('Strict-Transport-Security')).toBe(false);
    expect(asMap(true).get('Strict-Transport-Security')).toContain('max-age=63072000');
  });
});
```

### 2. Apply it to every route

📄 **Edit `next.config.ts`:**

```ts
const { buildSecurityHeaders } = (await jiti.import(
  './src/libs/security-headers',
)) as typeof import('./src/libs/security-headers');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@logtape/logtape'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders({ production: process.env.NODE_ENV === 'production' }),
      },
    ];
  },
};
```

(keep the existing `jiti` setup at the top of the file)

### 3. Prove it from a real browser's point of view

📄 **Create `e2e/security-headers.spec.ts`:**

```ts
import { expect, test } from './fixtures';

// E2E runs the PRODUCTION build, so HSTS is expected too.
for (const path of ['/', '/sign-in', '/fr/contact', '/api/health']) {
  test(`${path} carries the security headers`, async ({ request }) => {
    const response = await request.get(path);
    const headers = response.headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('publickey-credentials-get=(self)');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['x-powered-by']).toBeUndefined(); // we don't advertise the framework
  });
}
```

### ✅ Verify

```bash
pnpm test && pnpm check
CI=1 pnpm e2e        # or: pnpm e2e  — the new spec plus ALL existing specs (passkeys included!)
```

1. DevTools → Network → any document → **Response Headers** show the six headers (HSTS only on the production build).
2. Passkey registration/sign-in (`e2e/auth-advanced.spec.ts`) **still passes** — proof that `Permissions-Policy` didn't break WebAuthn.
3. Put the site in an `<iframe>` from another origin (use a local HTML file) → the browser refuses to render it.
4. [securityheaders.com](https://securityheaders.com) (on a deployed preview) — expect an **A-ish** grade; the CSP in S6-T11 gets it to **A+** range.

**🚢 Ship** — branch `feat/s6-t09-security-headers` · message: `feat(sec): add security headers with a tested definition and e2e coverage`

---

## 🎫 S6-T10 — Cookie consent

**Branch:** `feat/s6-t10-consent` · **Story:** US-065 · **1 SP** _(the plan sized it small; the UI + tests make it the biggest "1" you'll meet — allow time)_

> 🎯 **Nothing non-essential runs before the visitor says yes.** Default = _denied_. A browser's **Global Privacy Control** signal counts as a "no" (and we don't nag). The choice lives in a first-party cookie, is versioned (bump the version → everyone is asked again) and can be reopened from the footer.

```bash
git switch main && git pull && git switch -c feat/s6-t10-consent
mkdir -p src/components/consent
```

### 1. Strings

📄 **`src/locales/en.json`** — in `footer` add `"cookieSettings": "Cookie settings"`, and a new top-level object:

```json
  "consent": {
    "title": "Your privacy choices",
    "description": "We use essential cookies to make the site work. With your permission we also use analytics and error recordings to improve it. You can change your mind at any time.",
    "acceptAll": "Accept all",
    "rejectAll": "Reject non-essential",
    "customize": "Customize",
    "save": "Save choices",
    "settingsTitle": "Cookie settings",
    "necessary": "Essential",
    "necessaryDescription": "Sign-in, security and language. Always on.",
    "analytics": "Analytics",
    "analyticsDescription": "Anonymous usage statistics to understand what to improve.",
    "replay": "Error recordings",
    "replayDescription": "Short recordings around errors (text and media masked) to help us fix bugs faster.",
    "gpc": "Your browser sent a Global Privacy Control signal, so analytics stays off."
  }
```

📄 **`src/locales/fr.json`** — `footer.cookieSettings` = `"Paramètres des cookies"`, plus:

```json
  "consent": {
    "title": "Vos choix de confidentialité",
    "description": "Nous utilisons des cookies essentiels au fonctionnement du site. Avec votre accord, nous utilisons aussi des statistiques et des enregistrements d'erreurs pour l'améliorer. Vous pouvez changer d'avis à tout moment.",
    "acceptAll": "Tout accepter",
    "rejectAll": "Refuser le non essentiel",
    "customize": "Personnaliser",
    "save": "Enregistrer mes choix",
    "settingsTitle": "Paramètres des cookies",
    "necessary": "Essentiels",
    "necessaryDescription": "Connexion, sécurité et langue. Toujours actifs.",
    "analytics": "Statistiques",
    "analyticsDescription": "Statistiques d'usage anonymes pour comprendre ce qu'il faut améliorer.",
    "replay": "Enregistrements d'erreurs",
    "replayDescription": "Courts enregistrements autour des erreurs (textes et médias masqués) pour corriger les bugs plus vite.",
    "gpc": "Votre navigateur a envoyé un signal Global Privacy Control : les statistiques restent désactivées."
  }
```

### 2. The consent rules (pure, tested)

📄 **Create `src/libs/consent.ts`:**

```ts
export const CONSENT_COOKIE = 'consent';
/** Bump when categories or purposes change: everybody is asked again. */
export const CONSENT_VERSION = 1;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 6 months

export type ConsentChoice = { analytics: boolean; replay: boolean };
export const DENIED: ConsentChoice = { analytics: false, replay: false };

export function serializeConsent(choice: ConsentChoice, now = Date.now()): string {
  return encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, ts: now, ...choice }));
}

/** `null` = no valid decision (missing, corrupt or from an older version) → ask. */
export function parseConsent(raw: string | null | undefined): ConsentChoice | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    if (
      data.v !== CONSENT_VERSION ||
      typeof data.analytics !== 'boolean' ||
      typeof data.replay !== 'boolean'
    )
      return null;
    return { analytics: data.analytics, replay: data.replay };
  } catch {
    return null;
  }
}

export function readConsentFromCookieHeader(header: string | null | undefined): string | undefined {
  return new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)`).exec(header ?? '')?.[1];
}

export function consentCookieString(
  choice: ConsentChoice,
  { secure }: { secure: boolean },
  now?: number,
): string {
  return `${CONSENT_COOKIE}=${serializeConsent(choice, now)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * Initial state on page load.
 *  - a valid cookie wins
 *  - otherwise a Global Privacy Control signal = "no" and we don't prompt
 *  - otherwise: denied + prompt
 */
export function resolveInitial({ cookie, gpc }: { cookie: string | undefined; gpc: boolean }): {
  status: 'set' | 'unset';
  choice: ConsentChoice;
} {
  const stored = parseConsent(cookie);
  if (stored) return { status: 'set', choice: gpc ? { ...stored, analytics: false } : stored };
  if (gpc) return { status: 'set', choice: DENIED };
  return { status: 'unset', choice: DENIED };
}
```

📄 **Create `src/libs/consent.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import {
  CONSENT_VERSION,
  consentCookieString,
  DENIED,
  parseConsent,
  readConsentFromCookieHeader,
  resolveInitial,
  serializeConsent,
} from './consent';

describe('parseConsent', () => {
  it('round-trips a choice', () => {
    expect(parseConsent(serializeConsent({ analytics: true, replay: false }))).toEqual({
      analytics: true,
      replay: false,
    });
  });

  it('treats missing, corrupt and outdated cookies as "no decision"', () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent('%7Bnot json')).toBeNull();
    expect(
      parseConsent(
        encodeURIComponent(
          JSON.stringify({ v: CONSENT_VERSION + 1, analytics: true, replay: true }),
        ),
      ),
    ).toBeNull();
    expect(
      parseConsent(
        encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, analytics: 'yes', replay: true })),
      ),
    ).toBeNull();
  });
});

describe('resolveInitial', () => {
  it('defaults to denied and asks', () => {
    expect(resolveInitial({ cookie: undefined, gpc: false })).toEqual({
      status: 'unset',
      choice: DENIED,
    });
  });
  it('respects a stored choice', () => {
    const cookie = serializeConsent({ analytics: true, replay: true });
    expect(resolveInitial({ cookie, gpc: false })).toEqual({
      status: 'set',
      choice: { analytics: true, replay: true },
    });
  });
  it('Global Privacy Control means no analytics — and no prompt', () => {
    expect(resolveInitial({ cookie: undefined, gpc: true })).toEqual({
      status: 'set',
      choice: DENIED,
    });
    const cookie = serializeConsent({ analytics: true, replay: true });
    expect(resolveInitial({ cookie, gpc: true }).choice.analytics).toBe(false);
  });
});

it('builds a first-party, lax, long-lived cookie (Secure over https only)', () => {
  const secure = consentCookieString(DENIED, { secure: true }, 1);
  expect(secure).toMatch(/^consent=.+; Path=\/; Max-Age=15552000; SameSite=Lax; Secure$/);
  expect(consentCookieString(DENIED, { secure: false }, 1)).not.toContain('Secure');
});

it('reads the consent cookie out of a Cookie header', () => {
  expect(readConsentFromCookieHeader('a=1; consent=abc; b=2')).toBe('abc');
  expect(readConsentFromCookieHeader('a=1')).toBeUndefined();
});
```

### 3. Provider, banner, settings

📄 **Create `src/components/consent/consent-provider.tsx`:**

```tsx
'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  type ConsentChoice,
  consentCookieString,
  DENIED,
  readConsentFromCookieHeader,
  resolveInitial,
} from '@/libs/consent';

type Status = 'unknown' | 'unset' | 'set'; // "unknown" until mounted: avoids a server/client mismatch

type ConsentContextValue = {
  status: Status;
  choice: ConsentChoice;
  gpc: boolean;
  settingsOpen: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  save: (choice: ConsentChoice) => void;
  openSettings: () => void;
  closeSettings: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: Status; choice: ConsentChoice; gpc: boolean }>({
    status: 'unknown',
    choice: DENIED,
    gpc: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const gpc =
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    const initial = resolveInitial({ cookie: readConsentFromCookieHeader(document.cookie), gpc });
    setState({ ...initial, gpc });
  }, []);

  const save = useCallback((choice: ConsentChoice) => {
    setState((current) => {
      const effective = current.gpc ? { ...choice, analytics: false } : choice; // GPC always wins
      document.cookie = consentCookieString(effective, {
        secure: window.location.protocol === 'https:',
      });
      return { ...current, status: 'set', choice: effective };
    });
    setSettingsOpen(false);
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      ...state,
      settingsOpen,
      acceptAll: () => save({ analytics: true, replay: true }),
      rejectAll: () => save(DENIED),
      save,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
    }),
    [state, settingsOpen, save],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const value = useContext(ConsentContext);
  if (!value) throw new Error('useConsent must be used inside <ConsentProvider>');
  return value;
}
```

📄 **Create `src/components/consent/consent-banner.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useConsent } from '@/components/consent/consent-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

function SettingsDialog() {
  const t = useTranslations('consent');
  const { choice, gpc, settingsOpen, closeSettings, save } = useConsent();
  const [draft, setDraft] = useState(choice);

  useEffect(() => {
    if (settingsOpen) setDraft(choice); // start from the current choice every time it opens
  }, [settingsOpen, choice]);

  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => (open ? undefined : closeSettings())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settingsTitle')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="consent-necessary"
              checked
              disabled
              aria-describedby="consent-necessary-d"
            />
            <div>
              <Label htmlFor="consent-necessary">{t('necessary')}</Label>
              <p id="consent-necessary-d" className="text-muted-foreground text-sm">
                {t('necessaryDescription')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="consent-analytics"
              checked={draft.analytics && !gpc}
              disabled={gpc}
              onCheckedChange={(value) => setDraft({ ...draft, analytics: value === true })}
            />
            <div>
              <Label htmlFor="consent-analytics">{t('analytics')}</Label>
              <p className="text-muted-foreground text-sm">
                {gpc ? t('gpc') : t('analyticsDescription')}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="consent-replay"
              checked={draft.replay}
              onCheckedChange={(value) => setDraft({ ...draft, replay: value === true })}
            />
            <div>
              <Label htmlFor="consent-replay">{t('replay')}</Label>
              <p className="text-muted-foreground text-sm">{t('replayDescription')}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => save(draft)}>{t('save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConsentBanner() {
  const t = useTranslations('consent');
  const { status, acceptAll, rejectAll, openSettings } = useConsent();

  return (
    <>
      {status === 'unset' ? (
        <section
          aria-label={t('title')}
          className="bg-background fixed inset-x-0 bottom-0 z-40 border-t p-4 shadow-lg"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <h2 className="font-medium">{t('title')}</h2>
              <p className="text-muted-foreground text-sm">{t('description')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* "Reject" is exactly as easy and as visible as "Accept" — no dark patterns */}
              <Button variant="outline" onClick={rejectAll}>
                {t('rejectAll')}
              </Button>
              <Button variant="outline" onClick={openSettings}>
                {t('customize')}
              </Button>
              <Button onClick={acceptAll}>{t('acceptAll')}</Button>
            </div>
          </div>
        </section>
      ) : null}
      <SettingsDialog />
    </>
  );
}
```

📄 **Create `src/components/consent/cookie-settings-button.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { useConsent } from '@/components/consent/consent-provider';

export function CookieSettingsButton({ className }: { className?: string }) {
  const t = useTranslations('footer');
  const { openSettings } = useConsent();
  return (
    <button type="button" className={className ?? 'underline'} onClick={openSettings}>
      {t('cookieSettings')}
    </button>
  );
}
```

### 4. Mount it

📄 **Edit `src/app/[locale]/layout.tsx`** — inside `<NextIntlClientProvider>`:

```tsx
import { ConsentBanner } from '@/components/consent/consent-banner';
import { ConsentProvider } from '@/components/consent/consent-provider';
// …
<NextIntlClientProvider>
  <ConsentProvider>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster richColors />
      <ConsentBanner />
    </ThemeProvider>
  </ConsentProvider>
</NextIntlClientProvider>;
```

📄 **Edit `src/components/layout/site-footer.tsx`:**

```tsx
import { CookieSettingsButton } from '@/components/consent/cookie-settings-button';
// inside the footer container (keep data-visual-mask on the year element):
<div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm">
  <span data-visual-mask className="text-muted-foreground">
    © {new Date().getFullYear()} {t('common.appName')}. {t('footer.rights')}
  </span>
  <CookieSettingsButton className="text-muted-foreground hover:text-foreground underline" />
</div>;
```

and in `UserMenu` add a `DropdownMenuItem onSelect={openSettings}` using `useConsent()` with label `t('footer.cookieSettings')` (use `useTranslations('footer')`).

### 5. Replay: only after consent, only when configured

📄 **Edit both Sentry inits** (`sentry.server.config.ts` needs nothing; `instrumentation-client.ts`):

```ts
    replaysSessionSampleRate: 0, // never record ordinary sessions
    replaysOnErrorSampleRate: 1, // record the moments around an error — but only once the integration is added
```

📄 **Create `src/components/consent/sentry-replay-consent.tsx`:**

```tsx
'use client';

import { useEffect } from 'react';

import { useConsent } from '@/components/consent/consent-provider';
import { Env } from '@/libs/Env';

/** Session Replay is code we don't even download until the visitor has consented. */
export function SentryReplayConsent() {
  const { choice, status } = useConsent();

  useEffect(() => {
    if (!Env.NEXT_PUBLIC_SENTRY_DSN || status !== 'set') return;

    void import('@sentry/nextjs').then((Sentry) => {
      const replay = Sentry.getReplay();
      if (choice.replay) {
        if (replay) void replay.start?.();
        else
          Sentry.addIntegration(
            Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
          );
      } else {
        void replay?.stop();
      }
    });
  }, [choice.replay, status]);

  return null;
}
```

(render `<SentryReplayConsent />` next to `<ConsentBanner />` in the layout)

### 6. Tests

📄 **Create `src/components/consent/consent.test.tsx`:**

```tsx
import { beforeEach, expect, test } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';
import { ConsentBanner } from './consent-banner';
import { ConsentProvider } from './consent-provider';

const mount = () =>
  renderWithIntl(
    <ConsentProvider>
      <ConsentBanner />
    </ConsentProvider>,
  );

beforeEach(() => {
  document.cookie = 'consent=; Max-Age=0; Path=/';
  Reflect.deleteProperty(navigator, 'globalPrivacyControl');
});

test('asks first, with "reject" as prominent as "accept"', async () => {
  const screen = await mount();
  await expect.element(screen.getByRole('button', { name: 'Reject non-essential' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Accept all' })).toBeVisible();
});

test('rejecting stores a denied choice and hides the banner', async () => {
  const screen = await mount();
  await screen.getByRole('button', { name: 'Reject non-essential' }).click();

  await expect.poll(() => decodeURIComponent(document.cookie)).toContain('"analytics":false');
  expect(screen.getByRole('button', { name: 'Accept all' }).elements()).toHaveLength(0);
});

test('accepting stores analytics and replay consent', async () => {
  const screen = await mount();
  await screen.getByRole('button', { name: 'Accept all' }).click();
  await expect.poll(() => decodeURIComponent(document.cookie)).toContain('"analytics":true');
});

test('a Global Privacy Control signal means: no prompt, analytics off', async () => {
  Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
  const screen = await mount();

  await expect
    .poll(() => screen.getByRole('button', { name: 'Accept all' }).elements().length)
    .toBe(0);
});
```

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check
pnpm dev
```

1. First visit (private window): the banner appears; **no** cookie named `consent` yet; DevTools → Network shows **no** third-party requests.
2. **Reject** → banner disappears, cookie `consent` has `analytics:false`; reload → no banner. **Footer → Cookie settings** reopens the dialog; toggle and save; the cookie changes.
3. Change `CONSENT_VERSION` to `2` → everyone is asked again. Revert.
4. Chrome with GPC on (or DevTools: `Object.defineProperty(navigator,'globalPrivacyControl',{value:true})` before load via an extension) → no banner, analytics stays off; the dialog explains why.
5. `/fr` shows the French banner. Keyboard-only: tab to the three buttons; the dialog traps focus and closes with Esc.
6. **Fix the E2E and visual suites** — a fixed banner would cover buttons and appear in every screenshot. Give every browser context a stored "denied" choice:

📄 **Create `e2e/helpers/consent.ts`:**

```ts
import { CONSENT_COOKIE, CONSENT_VERSION } from '../../src/libs/consent';

export const consentCookie = (baseURL: string, choice = { analytics: false, replay: false }) => ({
  name: CONSENT_COOKIE,
  value: encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, ts: 0, ...choice })),
  url: baseURL,
});
```

📄 **Edit `e2e/fixtures.ts`** — in `openAs` after creating the context: `await context.addCookies([consentCookie(baseURL!)]);`, and in the auto fixture:

```ts
  _clientIp: [
    async ({ context, baseURL }, use) => {
      await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
      await context.addCookies([consentCookie(baseURL!)]); // no banner in ordinary tests
      await use();
    },
    { auto: true },
  ],
```

📄 **Create `e2e/consent.spec.ts`:**

```ts
import { expect, test } from './fixtures';

test('the banner appears on a first visit and remembers the choice', async ({ page, context }) => {
  await context.clearCookies(); // pretend to be a brand-new visitor
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reject non-essential' })).toBeVisible();

  await page.getByRole('button', { name: 'Reject non-essential' }).click();
  await expect(page.getByRole('button', { name: 'Accept all' })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Accept all' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await expect(page.getByRole('heading', { name: 'Cookie settings' })).toBeVisible();
});
```

Run `pnpm e2e` and `pnpm e2e:visual` — the visual suite must be **unchanged** (no banner in screenshots; the footer's new "Cookie settings" link _does_ change the footer in every public page → re-baseline with the `update-snapshots` label, reviewing that **only the footer** differs).

**🚢 Ship** — branch `feat/s6-t10-consent` · message: `feat(privacy): add versioned cookie consent with gpc support and sentry replay gating`

---

## 🎫 S6-T11 — Content-Security-Policy (report-only → enforce)

**Branch:** `feat/s6-t11-csp` · **Story:** US-065 · **2 SP** · risk **R-10**

> 🎯 A CSP is the browser-side seatbelt against **XSS**: even if an attacker injects `<script>`, the browser refuses to run it. The hard part is _not breaking ourselves_. So: report-only first, E2E that fails on any violation, then enforce.

```bash
git switch main && git pull && git switch -c feat/s6-t11-csp
mkdir -p src/app/api/csp-report
```

### 1. Two tiers (and why)

| Tier | Pages | `script-src` | Why |
| --- | --- | --- | --- |
| **Strict** | dashboard, admin, sign-in/up, reset/verify, 2FA, invitations (all **dynamic**) | `'self' 'nonce-…' 'strict-dynamic'` | A fresh nonce per request: injected scripts have no nonce → blocked |
| **Relaxed** | marketing, contact, 404 (**static** HTML) | `'self' 'unsafe-inline'` | A per-request nonce forces dynamic rendering and would kill static caching/Lighthouse (Sprint 7). These pages render no user-supplied HTML |

Both tiers share the _other_ strong directives: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src` allow-list.

### 2. The policy builder (pure, tested)

📄 **Edit `src/libs/Env.ts`** (`server` + `runtimeEnv`): `CSP_MODE: z.enum(['off', 'report-only', 'enforce']).default('report-only'),` · `.env.example`: `CSP_MODE=report-only  # off | report-only | enforce`.

📄 **Create `src/libs/csp.ts`:**

```ts
import { splitLocale } from '@/libs/route-guard';

const STRICT_PREFIXES = [
  '/dashboard',
  '/admin',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/two-factor',
  '/verify-email',
  '/accept-invitation',
] as const;

/** Dynamic areas can carry a per-request nonce; static marketing pages cannot. */
export function usesStrictCsp(pathname: string): boolean {
  const { path } = splitLocale(pathname);
  return STRICT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export type CspInput = {
  nonce: string;
  strict: boolean;
  dev: boolean;
  /** Extra origins the browser may talk to (Sentry ingest, Spotlight…). */
  connectSources?: string[];
  reportUri: string;
  upgradeInsecure?: boolean;
};

export function buildCsp({
  nonce,
  strict,
  dev,
  connectSources = [],
  reportUri,
  upgradeInsecure = false,
}: CspInput): string {
  const scriptSrc = strict
    ? [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`]
    : [`'self'`, `'unsafe-inline'`];
  if (dev) scriptSrc.push(`'unsafe-eval'`); // React's dev tooling needs it; never in production

  const directives: Record<string, string[]> = {
    'default-src': [`'self'`],
    'script-src': scriptSrc,
    'style-src': [`'self'`, `'unsafe-inline'`], // Tailwind/next-font inject small inline styles
    'img-src': [`'self'`, 'data:', 'blob:', 'https:'],
    'font-src': [`'self'`, 'data:'],
    'connect-src': [`'self'`, ...connectSources],
    'worker-src': [`'self'`, 'blob:'], // Sentry Replay worker
    'frame-ancestors': [`'none'`],
    'form-action': [`'self'`],
    'base-uri': [`'self'`],
    'object-src': [`'none'`],
    'report-uri': [reportUri],
  };

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (upgradeInsecure) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

/** Origins to allow in connect-src, derived from the integrations that are actually configured. */
export function connectSourcesFor({
  sentryDsn,
  spotlight,
  dev,
}: {
  sentryDsn?: string | undefined;
  spotlight: boolean;
  dev: boolean;
}): string[] {
  const sources: string[] = [];
  if (sentryDsn) {
    try {
      sources.push(new URL(sentryDsn).origin);
    } catch {
      // a malformed DSN is Sentry's problem, not a reason to open the policy
    }
  }
  if (dev && spotlight) sources.push('http://localhost:8969');
  return sources;
}

export const newNonce = () => btoa(crypto.randomUUID());
```

📄 **Create `src/libs/csp.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { buildCsp, connectSourcesFor, usesStrictCsp } from './csp';

const base = { nonce: 'abc123', dev: false, reportUri: '/api/csp-report' };

describe('buildCsp', () => {
  it('strict tier: nonce + strict-dynamic, no unsafe-inline scripts', () => {
    const policy = buildCsp({ ...base, strict: true });
    expect(policy).toContain(`script-src 'self' 'nonce-abc123' 'strict-dynamic'`);
    expect(policy.match(/script-src[^;]*/)![0]).not.toContain('unsafe-inline');
  });

  it('relaxed tier: unsafe-inline scripts, no nonce', () => {
    const script = buildCsp({ ...base, strict: false }).match(/script-src[^;]*/)![0];
    expect(script).toContain(`'unsafe-inline'`);
    expect(script).not.toContain('nonce-');
  });

  it('always blocks framing, plugins and base-tag tricks', () => {
    for (const strict of [true, false]) {
      const policy = buildCsp({ ...base, strict });
      expect(policy).toContain(`frame-ancestors 'none'`);
      expect(policy).toContain(`object-src 'none'`);
      expect(policy).toContain(`base-uri 'self'`);
      expect(policy).toContain(`form-action 'self'`);
    }
  });

  it('allows eval ONLY in development', () => {
    expect(buildCsp({ ...base, strict: true, dev: true })).toContain(`'unsafe-eval'`);
    expect(buildCsp({ ...base, strict: true, dev: false })).not.toContain('unsafe-eval');
  });

  it('adds configured connect sources, a report endpoint and optional upgrade-insecure-requests', () => {
    const policy = buildCsp({
      ...base,
      strict: true,
      connectSources: ['https://o1.ingest.sentry.io'],
      upgradeInsecure: true,
    });
    expect(policy).toContain(`connect-src 'self' https://o1.ingest.sentry.io`);
    expect(policy).toContain('report-uri /api/csp-report');
    expect(policy).toContain('upgrade-insecure-requests');
  });
});

describe('usesStrictCsp', () => {
  it('is strict for dynamic areas (any language) and relaxed for static pages', () => {
    for (const path of [
      '/dashboard/acme',
      '/fr/admin/users',
      '/sign-in',
      '/fr/two-factor',
      '/accept-invitation/x',
    ]) {
      expect(usesStrictCsp(path), path).toBe(true);
    }
    for (const path of ['/', '/fr', '/contact', '/fr/contact', '/does-not-exist']) {
      expect(usesStrictCsp(path), path).toBe(false);
    }
  });
});

describe('connectSourcesFor', () => {
  it('derives origins only from configured integrations', () => {
    expect(
      connectSourcesFor({
        sentryDsn: 'https://pub@o9.ingest.de.sentry.io/123',
        spotlight: false,
        dev: false,
      }),
    ).toEqual(['https://o9.ingest.de.sentry.io']);
    expect(connectSourcesFor({ spotlight: true, dev: true })).toEqual(['http://localhost:8969']);
    expect(connectSourcesFor({ spotlight: true, dev: false })).toEqual([]); // never in production
    expect(connectSourcesFor({ sentryDsn: 'not a url', spotlight: false, dev: false })).toEqual([]);
  });
});
```

### 3. The report endpoint

📄 **Create `src/app/api/csp-report/route.ts`:**

```ts
import { getLogger } from '@/libs/Logger';

const MAX_BYTES = 10_000;
const clip = (value: unknown) => (typeof value === 'string' ? value.slice(0, 200) : undefined);

/** Browsers POST violation reports here (legacy `report-uri`). Never trusted, never stored as HTML. */
export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > MAX_BYTES) return new Response(null, { status: 413 });

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const report = (parsed['csp-report'] ?? parsed) as Record<string, unknown>;
    getLogger('security').warning('CSP violation: {directive} blocked {blocked} on {document}', {
      directive: clip(report['violated-directive']),
      blocked: clip(report['blocked-uri']),
      document: clip(report['document-uri']),
    });
  } catch {
    // malformed report: ignore
  }
  return new Response(null, { status: 204 });
}
```

📄 **Create `src/app/api/csp-report/route.test.ts`:**

```ts
import { describe, expect, it, vi } from 'vitest';

const warning = vi.hoisted(() => vi.fn());
vi.mock('@/libs/Logger', () => ({ getLogger: () => ({ warning }) }));

import { POST } from './route';

const post = (body: string) =>
  POST(new Request('http://localhost/api/csp-report', { method: 'POST', body }));

describe('POST /api/csp-report', () => {
  it('logs a clipped violation and answers 204', async () => {
    const response = await post(
      JSON.stringify({
        'csp-report': {
          'violated-directive': 'script-src',
          'blocked-uri': 'inline',
          'document-uri': 'https://x/' + 'a'.repeat(500),
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(warning).toHaveBeenCalledOnce();
    expect((warning.mock.calls[0]![1] as { document: string }).document.length).toBeLessThanOrEqual(
      200,
    );
  });

  it('survives garbage and rejects oversized bodies', async () => {
    expect((await post('{not json')).status).toBe(204);
    expect((await post('x'.repeat(20_000))).status).toBe(413);
  });
});
```

### 4. Applied in the proxy

📄 **Edit `src/proxy.ts`** — add before step 4 ("Locale routing"):

```ts
import { buildCsp, connectSourcesFor, newNonce, usesStrictCsp } from './libs/csp';
import { Env } from './libs/Env';

// 4) Content-Security-Policy (strict, nonce-based for dynamic areas)
const forwardedHeaders = withRequestIdHeader(request.headers, requestId);
let cspHeader: { name: string; value: string } | undefined;

if (Env.CSP_MODE !== 'off') {
  const nonce = newNonce();
  const policy = buildCsp({
    nonce,
    strict: usesStrictCsp(pathname),
    dev: Env.NODE_ENV !== 'production',
    connectSources: connectSourcesFor({
      sentryDsn: Env.NEXT_PUBLIC_SENTRY_DSN,
      spotlight: Env.NEXT_PUBLIC_SENTRY_SPOTLIGHT,
      dev: Env.NODE_ENV !== 'production',
    }),
    reportUri: '/api/csp-report',
    upgradeInsecure: Env.NODE_ENV === 'production',
  });
  // Next.js reads the nonce from the REQUEST header and stamps it on its own inline scripts
  forwardedHeaders.set('x-nonce', nonce);
  forwardedHeaders.set('content-security-policy', policy);
  cspHeader = {
    name:
      Env.CSP_MODE === 'enforce'
        ? 'Content-Security-Policy'
        : 'Content-Security-Policy-Report-Only',
    value: policy,
  };
}

// 5) Locale routing
const forwarded = new NextRequest(request, { headers: forwardedHeaders });
const response = intlMiddleware(forwarded);
response.headers.set(REQUEST_ID_HEADER, requestId);
if (cspHeader) response.headers.set(cspHeader.name, cspHeader.value);
return response;
```

> 🔍 **Verify against the Next.js CSP guide:** nonce extraction from the _request_ `content-security-policy` header, and that the nonce survives next-intl's rewrite. The E2E test below fails loudly if scripts end up without a nonce. 🔒 `/api/*` responses (JSON) don't get a CSP — it governs _documents_. The security headers from S6-T09 still apply to them. ⚠️ The `proxy.ts` matcher must keep `/api/csp-report` **outside** (it already is: `api` is excluded) so violation reports aren't themselves blocked or rate-limited.

### 5. E2E: _no_ violations, with _every_ integration switched on

📄 **Edit `playwright.config.ts`** → `appEnv`:

```ts
  CSP_MODE: 'enforce', // tests run with the policy ENFORCED: any violation breaks a page
  // Dummy values that switch the client integrations ON, so the policy is tested with them present
  NEXT_PUBLIC_SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_e2e_dummy',
  NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
```

📄 **Edit `.github/workflows/ci.yml`** → workflow-level `env:` (these are baked into the client bundle at build time, so the **build** job needs them too):

```yaml
NEXT_PUBLIC_SENTRY_DSN: https://public@o0.ingest.sentry.io/0
NEXT_PUBLIC_POSTHOG_KEY: phc_e2e_dummy
NEXT_PUBLIC_POSTHOG_HOST: https://eu.i.posthog.com
```

(the same three lines in `.github/workflows/visual-update.yml` so baseline generation uses the same build)

📄 **Create `e2e/csp.spec.ts`:**

```ts
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { consentCookie } from './helpers/consent';

function collectViolations(page: Page) {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content[- ]Security[- ]Policy|violates the following/i.test(message.text()))
      violations.push(message.text());
  });
  return violations;
}

const PUBLIC_PAGES = [
  '/',
  '/contact',
  '/sign-in',
  '/fr/sign-up',
  '/forgot-password',
  '/does-not-exist',
];

test.describe('Content-Security-Policy is enforced and nothing legitimate is blocked', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path}`, async ({ page }) => {
      const violations = collectViolations(page);
      const response = await page.goto(path);
      await page.waitForLoadState('networkidle');

      const csp = response!.headers()['content-security-policy'];
      expect(csp, 'enforced CSP header').toContain(`frame-ancestors 'none'`);
      expect(violations).toEqual([]);
    });
  }

  test('dynamic areas use a nonce; static pages do not', async ({ page }) => {
    const strict = (await page.goto('/sign-in'))!.headers()['content-security-policy']!;
    expect(strict).toMatch(/script-src[^;]*'nonce-[^']+'[^;]*'strict-dynamic'/);
    expect(await page.locator('script[nonce]').count()).toBeGreaterThan(0); // Next stamped its scripts

    const relaxed = (await page.goto('/contact'))!.headers()['content-security-policy']!;
    expect(relaxed).toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(relaxed).not.toContain('nonce-');
  });

  test('signed-in pages work under the strict policy', async ({ ownerPage, world }) => {
    const violations = collectViolations(ownerPage);
    for (const path of [
      `/dashboard/${world.orgSlug}`,
      `/dashboard/${world.orgSlug}/projects`,
      '/dashboard/account/security',
    ]) {
      await ownerPage.goto(path);
      await ownerPage.waitForLoadState('networkidle');
    }
    expect(violations).toEqual([]);
  });

  test('with analytics and replay consent (all integrations active) nothing is blocked either', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([consentCookie(baseURL!, { analytics: true, replay: true })]);
    const violations = collectViolations(page);

    for (const path of ['/', '/sign-in']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    expect(violations).toEqual([]);
  });
});
```

> The last test only becomes meaningful once PostHog arrives (S6-T13); it passes now and **guards** that ticket.

### 6. Rollout procedure (document it)

📄 **Append to `docs/guides/security.md`** (create the file if S6-T12 isn't merged yet):

```markdown
## Content-Security-Policy

`CSP_MODE`: `off` | `report-only` (default) | `enforce`. Policy: `src/libs/csp.ts`. Reports: `/api/csp-report` → logs (`security`).

Rolling out in a new environment:

1. Deploy with `report-only`. Browse every area; read the `CSP violation` log lines (Better Stack / terminal).
2. Each violation is either a legitimate resource (add its origin to the matching directive **in code**, with a test) or an actual problem (remove it).
3. When a week of traffic is clean → set `CSP_MODE=enforce`. Adding a third-party script/connection? Update `connectSourcesFor` + `csp.test.ts` first — the E2E suite runs with the policy enforced.
```

### ✅ Verify

```bash
pnpm test && pnpm check
CI=1 pnpm e2e          # the whole suite under an ENFORCED CSP, with Sentry/PostHog switched on
```

1. DevTools → Console on `/sign-in`, `/dashboard/<org>`, `/contact`: **no** CSP errors. Network → document → the header is `Content-Security-Policy` (E2E) or `…-Report-Only` (default dev).
2. **Prove it blocks:** in the console of a **strict** page run `const s=document.createElement('script'); s.textContent='alert(1)'; document.body.append(s)` → _Refused to execute inline script_ (and a report appears in the terminal log). On the **relaxed** tier it would run — which is why those pages never render user-supplied HTML.
3. `CSP_MODE=report-only pnpm dev`: same page loads, violations only logged.
4. Responses on strict pages contain `<script nonce="…">`; view-source and confirm every inline script has the nonce.
5. Re-run `pnpm e2e:visual` — unchanged.

**🚢 Ship** — branch `feat/s6-t11-csp` · message: `feat(sec): add two-tier nonce-based csp with report endpoint and e2e enforcement`

---

## 🎫 S6-T12 — Secret scanning

**Branch:** `ci/s6-t12-secret-scanning` · **Story:** US-065 · **1 SP** · risk **R-15**

```bash
git switch main && git pull && git switch -c ci/s6-t12-secret-scanning
```

### 1. gitleaks configuration

📄 **Create `.gitleaks.toml`:**

```toml
title = "saas-boilerplate"

[extend]
useDefault = true # start from gitleaks' full built-in rule set

# 🔍 older gitleaks versions use `[allowlist]` instead of `[[allowlists]]`
[[allowlists]]
description = "Documented placeholders and test fixtures — never real secrets"
paths = [
  '''\.env\.example$''',
  '''\.env\.development$''',
  '''^docs/''',
  '''(^|/)tests?/''',
  '''^e2e/''',
  '''^\.github/workflows/''',
]
regexes = [
  '''ci-only-secret-[A-Za-z0-9_-]+''',
  '''test-secret-[A-Za-z0-9_-]+''',
  '''Demo-Password-123''',
  '''phc_e2e_dummy''',
]
```

> Allow-list **narrowly**. Every entry is a place where a real leak could now hide.

### 2. Local guard (optional, automatic if installed)

gitleaks is a Go program, not an npm package:

```bash
winget install Gitleaks.Gitleaks          # 🪟 Windows · macOS: brew install gitleaks
gitleaks version
```

📄 **Edit `lefthook.yml`** → `pre-commit.commands`:

```yaml
secrets:
  # 🔍 gitleaks ≥ 8.19: `gitleaks git --pre-commit --staged`; older: `gitleaks protect --staged`
  run: gitleaks git --pre-commit --staged --redact --config .gitleaks.toml
  skip:
    - run: '! command -v gitleaks' # not installed locally → CI is the backstop
```

### 3. CI: scan the whole history, and CodeQL

📄 **Create `.github/workflows/security.yml`:**

```yaml
name: Security

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '0 5 * * 1'

permissions:
  contents: read
  security-events: write # CodeQL results

jobs:
  secrets:
    name: Secret scan
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # scan the history, not just the tip
      - name: gitleaks (container — no licence needed)
        run: |
          docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:latest \
            git /repo --config /repo/.gitleaks.toml --redact --verbose

  codeql:
    name: CodeQL
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          build-mode: none
      - uses: github/codeql-action/analyze@v3
```

Add **`Secret scan`** to the aggregate in `.github/workflows/ci.yml`? It lives in its own workflow so PRs from forks and scheduled runs behave independently: in GitHub's branch rule add `Secret scan` and `CodeQL` as **additional required checks**.

### 4. GitHub's own protection (settings, not code)

Repository → **Settings → Code security**: enable **Dependabot alerts**, **Secret scanning** and **Push protection** (free on public repositories; private repos need GitHub Advanced Security).

### 5. What to do when a secret leaks

📄 **Create `docs/guides/security.md`** (or append, if S6-T11 created it):

```markdown
# Security guide

## If a secret leaks (assume it is compromised)

1. **Revoke/rotate first**, clean up later. Removing a commit does not un-leak a secret.
2. Rotate: see the table. 3. Check logs/Sentry for use of the old value. 4. Then (optionally) rewrite history.

| Secret | Where it lives | How to rotate | Side effect |
| --- | --- | --- | --- |
| `BETTER_AUTH_SECRET` | env | generate a new one (`pnpm setup:env`), deploy | **every user is signed out**; stored TOTP secrets need re-enrolment if they were encrypted with the old key 🔍 |
| Database URL / password | env | reset the password in Neon, update `DATABASE_URL*`, redeploy | brief downtime |
| `RESEND_API_KEY` | env | create a new key, revoke the old | none |
| OAuth client secrets | env | regenerate at the provider, redeploy | none (Apple: re-run `pnpm apple:secret`) |
| `SENTRY_AUTH_TOKEN`, `CHECKLY_API_KEY`, `ARCJET_KEY` | CI/env | regenerate in the vendor UI | none |
| `NEXT_PUBLIC_*` keys (Sentry DSN, PostHog key) | public by design | rotate only if abused | none |

## Guards in this repository

- `.env*` is git-ignored (except examples); T3 Env separates server and `NEXT_PUBLIC_` variables.
- Pre-commit (if gitleaks is installed) + CI scan of the **whole history** + GitHub push protection + CodeQL.
```

### ✅ Verify

1. **Local guard (if installed):** create `leak.txt` containing a made-up AWS key: `AKIAIOSFODNN7EXAMPLE` and `aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` → `git add leak.txt && git commit -m "test: leak"` → **blocked** ("leaks found"). Remove the file.
2. **CI:** push a throw-away branch containing that file → the `Secret scan` job **fails**. Delete the branch.
3. `.env.example` and the docs containing the dummy `ci-only-secret-…` values pass (allow-list).
4. The **CodeQL** job completes (first run takes a few minutes); alerts, if any, appear under _Security → Code scanning_.
5. Confirm GitHub **Push protection** is on (try pushing the fake key from a test branch — GitHub rejects it).

**🚢 Ship** — branch `ci/s6-t12-secret-scanning` · message: `ci(sec): add gitleaks config and hooks, codeql workflow and secret rotation guide`

---

## 🎫 S6-T13 — PostHog analytics, strictly after consent

**Branch:** `feat/s6-t13-posthog` · **Story:** US-063 · **3 SP**

> 🎯 **Before consent: zero.** No script download, no cookie, no request. After the visitor agrees: pageviews (path only — never query strings, which may hold tokens). Revoke → capturing stops and the identity is reset.

```bash
git switch main && git pull && git switch -c feat/s6-t13-posthog
pnpm add posthog-js posthog-node
mkdir -p src/libs/analytics src/components/analytics
```

### 1. Environment and the reverse proxy

📄 **Edit `src/libs/Env.ts`** — `client` + `runtimeEnv`:

```ts
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    // EU cloud by default; use https://us.i.posthog.com for the US cloud
    NEXT_PUBLIC_POSTHOG_HOST: z.url().default('https://eu.i.posthog.com'),
```

📄 **Append to `.env.example`:**

```dotenv
# ─── PostHog (optional; only active after the visitor consents) ──
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

📄 **Create `src/libs/analytics/hosts.ts`:**

```ts
/** https://eu.i.posthog.com → https://eu-assets.i.posthog.com (static assets live on a sibling host). */
export const posthogAssetsHost = (host: string) =>
  host.replace('.i.posthog.com', '-assets.i.posthog.com');

/** https://eu.i.posthog.com → https://eu.posthog.com (the app UI, for the toolbar). */
export const posthogUiHost = (host: string) => host.replace('.i.posthog.com', '.posthog.com');

/** Only the path is sent to analytics: query strings and fragments can carry tokens. */
export function analyticsUrl(origin: string, pathname: string): string {
  return `${origin}${pathname.split(/[?#]/)[0]}`;
}
```

📄 **Create `src/libs/analytics/hosts.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { analyticsUrl, posthogAssetsHost, posthogUiHost } from './hosts';

it('derives the sibling hosts for each region', () => {
  expect(posthogAssetsHost('https://eu.i.posthog.com')).toBe('https://eu-assets.i.posthog.com');
  expect(posthogAssetsHost('https://us.i.posthog.com')).toBe('https://us-assets.i.posthog.com');
  expect(posthogUiHost('https://eu.i.posthog.com')).toBe('https://eu.posthog.com');
});

it('never sends query strings or fragments to analytics', () => {
  expect(analyticsUrl('https://app.test', '/reset-password?token=SECRET#x')).toBe(
    'https://app.test/reset-password',
  );
  expect(analyticsUrl('https://app.test', '/dashboard/acme')).toBe(
    'https://app.test/dashboard/acme',
  );
});
```

📄 **Edit `next.config.ts`** — first-party proxy path (ad-blockers and third-party-cookie rules then matter less, and CSP needs only `'self'`):

```ts
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';
const posthogAssets = posthogHost.replace('.i.posthog.com', '-assets.i.posthog.com');

const nextConfig: NextConfig = {
  // …existing…
  skipTrailingSlashRedirect: true, // PostHog endpoints use trailing slashes
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: `${posthogAssets}/static/:path*` },
      { source: '/ingest/:path*', destination: `${posthogHost}/:path*` },
    ];
  },
};
```

📄 **Edit the proxy matcher** (`src/proxy.ts`) — `/ingest` must not be locale-prefixed or inspected:

```ts
    '/((?!api|trpc|ingest|_next|_vercel|.*\\..*).*)',
```

### 2. The client wrapper (the ONLY place that talks to posthog-js)

📄 **Create `src/libs/analytics/events.ts`:**

```ts
/**
 * Every analytics event the product sends, with its allowed properties.
 * Rules: no emails, names, free text or ids of other people. Counts, categories and booleans only.
 */
export type AnalyticsEvents = {
  user_signed_up: { method: 'password' | 'magic_link' | 'social' };
  user_signed_in: { method: 'password' | 'magic_link' | 'passkey' | 'social' | 'two_factor' };
  org_created: { via: 'form' };
  member_invited: { role: 'admin' | 'member' };
  project_created: { status: 'active' | 'archived' };
};
```

📄 **Create `src/libs/analytics/client.ts`:**

```ts
import posthog from 'posthog-js';

import type { AnalyticsEvents } from '@/libs/analytics/events';
import { analyticsUrl, posthogUiHost } from '@/libs/analytics/hosts';

let active = false;

export const isAnalyticsActive = () => active;

/** Called only after the visitor consented. Before that this module does nothing at all. */
export function activateAnalytics({ key, host }: { key: string; host: string }): void {
  if (!active) {
    posthog.init(key, {
      api_host: '/ingest', // via our own origin (see next.config rewrites)
      ui_host: posthogUiHost(host),
      capture_pageview: false, // we send pageviews ourselves, without query strings
      capture_pageleave: true,
      autocapture: false, // explicit, typed events only
      disable_session_recording: true, // recordings are a separate consent category (Sentry Replay)
      person_profiles: 'identified_only',
      respect_dnt: true,
    });
  }
  posthog.opt_in_capturing();
  active = true;
}

/** Visitor withdrew consent. */
export function deactivateAnalytics(): void {
  if (!active) return;
  posthog.opt_out_capturing();
  posthog.reset();
  active = false;
}

export function capturePageview(pathname: string): void {
  if (!active) return;
  posthog.capture('$pageview', {
    $current_url: analyticsUrl(window.location.origin, pathname),
    $pathname: pathname.split(/[?#]/)[0],
  });
}

export function trackEvent<E extends keyof AnalyticsEvents>(
  event: E,
  properties: AnalyticsEvents[E],
): void {
  if (!active) return;
  posthog.capture(event, properties);
}

/** Internal ids only — never an email or a name. */
export function identifyUser(userId: string): void {
  if (!active) return;
  posthog.identify(userId);
}

export function groupOrganization(orgId: string): void {
  if (!active) return;
  posthog.group('organization', orgId);
}

export function resetAnalytics(): void {
  if (!active) return;
  posthog.reset();
}
```

📄 **Create `src/libs/analytics/client.test.ts`** (posthog-js mocked; module state reset per test):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
  identify: vi.fn(),
  group: vi.fn(),
}));
vi.mock('posthog-js', () => ({ default: posthog }));

async function load() {
  vi.resetModules();
  return import('./client');
}

beforeEach(() => Object.values(posthog).forEach((fn) => fn.mockReset()));

describe('analytics client', () => {
  it('does NOTHING before activation (no init, no capture, no identify)', async () => {
    const analytics = await load();
    analytics.capturePageview('/x');
    analytics.trackEvent('org_created', { via: 'form' });
    analytics.identifyUser('u1');
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it('initialises through the first-party proxy, without autocapture or recordings', async () => {
    const analytics = await load();
    analytics.activateAnalytics({ key: 'phc_x', host: 'https://eu.i.posthog.com' });

    expect(posthog.init).toHaveBeenCalledWith(
      'phc_x',
      expect.objectContaining({
        api_host: '/ingest',
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
      }),
    );
    expect(posthog.opt_in_capturing).toHaveBeenCalled();
  });

  it('captures typed events and strips query strings from pageviews', async () => {
    const analytics = await load();
    analytics.activateAnalytics({ key: 'phc_x', host: 'https://eu.i.posthog.com' });

    analytics.trackEvent('member_invited', { role: 'admin' });
    analytics.capturePageview('/reset-password?token=SECRET');

    expect(posthog.capture).toHaveBeenCalledWith('member_invited', { role: 'admin' });
    const pageview = posthog.capture.mock.calls.find(([name]) => name === '$pageview')!;
    expect(JSON.stringify(pageview)).not.toContain('SECRET');
  });

  it('identifies with the internal id ONLY', async () => {
    const analytics = await load();
    analytics.activateAnalytics({ key: 'phc_x', host: 'https://eu.i.posthog.com' });
    analytics.identifyUser('user_123');
    expect(posthog.identify).toHaveBeenCalledWith('user_123'); // no second argument = no email/name properties
  });

  it('withdrawing consent stops capturing and resets the identity', async () => {
    const analytics = await load();
    analytics.activateAnalytics({ key: 'phc_x', host: 'https://eu.i.posthog.com' });
    analytics.deactivateAnalytics();

    expect(posthog.opt_out_capturing).toHaveBeenCalled();
    expect(posthog.reset).toHaveBeenCalled();
    posthog.capture.mockReset();
    analytics.trackEvent('org_created', { via: 'form' });
    expect(posthog.capture).not.toHaveBeenCalled();
  });
});

// Compile-time guard: unknown events and unexpected properties don't type-check (enforced by `pnpm typecheck`)
it('typed events', async () => {
  const { trackEvent } = await load();
  // @ts-expect-error — unknown event name
  trackEvent('made_up_event', {});
  // @ts-expect-error — properties that are not part of the contract (no emails!)
  trackEvent('org_created', { via: 'form', email: 'ada@example.com' });
});
```

### 3. React side: provider + pageviews

📄 **Create `src/components/analytics/analytics-provider.tsx`:**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { useConsent } from '@/components/consent/consent-provider';
import { activateAnalytics, capturePageview, deactivateAnalytics } from '@/libs/analytics/client';
import { Env } from '@/libs/Env';

const AnalyticsReady = createContext(false);

/** True once analytics is initialised AND the visitor agreed. Components that identify users wait for it. */
export const useAnalyticsReady = () => useContext(AnalyticsReady);

function PageViews() {
  const pathname = usePathname();
  useEffect(() => capturePageview(pathname), [pathname]);
  return null;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { status, choice } = useConsent();
  const [ready, setReady] = useState(false);
  const key = Env.NEXT_PUBLIC_POSTHOG_KEY;

  useEffect(() => {
    if (!key || status !== 'set') return;

    if (choice.analytics) {
      activateAnalytics({ key, host: Env.NEXT_PUBLIC_POSTHOG_HOST });
      setReady(true);
    } else {
      deactivateAnalytics();
      setReady(false);
    }
  }, [key, status, choice.analytics]);

  return (
    <AnalyticsReady.Provider value={ready}>
      {children}
      {ready ? <PageViews /> : null}
    </AnalyticsReady.Provider>
  );
}
```

📄 **Edit `src/app/[locale]/layout.tsx`** — inside `<ConsentProvider>`: `<AnalyticsProvider> … </AnalyticsProvider>` around `ThemeProvider` (import it).

📄 **Create `src/components/analytics/analytics-provider.test.tsx`:**

```tsx
import { beforeEach, expect, test, vi } from 'vitest';

import { ConsentBanner } from '@/components/consent/consent-banner';
import { ConsentProvider } from '@/components/consent/consent-provider';

import { renderWithIntl } from '../../../tests/utils/render';
import { AnalyticsProvider } from './analytics-provider';

const analytics = vi.hoisted(() => ({
  activateAnalytics: vi.fn(),
  deactivateAnalytics: vi.fn(),
  capturePageview: vi.fn(),
}));
vi.mock('@/libs/analytics/client', () => analytics);
vi.mock('@/libs/Env', () => ({
  Env: {
    NEXT_PUBLIC_POSTHOG_KEY: 'phc_test',
    NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

const mount = () =>
  renderWithIntl(
    <ConsentProvider>
      <AnalyticsProvider>
        <ConsentBanner />
      </AnalyticsProvider>
    </ConsentProvider>,
  );

beforeEach(() => {
  Object.values(analytics).forEach((fn) => fn.mockReset());
  document.cookie = 'consent=; Max-Age=0; Path=/';
});

test('nothing is activated before the visitor decides', async () => {
  const screen = await mount();
  await expect.element(screen.getByRole('button', { name: 'Accept all' })).toBeVisible();
  expect(analytics.activateAnalytics).not.toHaveBeenCalled();
});

test('rejecting never activates analytics', async () => {
  const screen = await mount();
  await screen.getByRole('button', { name: 'Reject non-essential' }).click();
  await vi.waitFor(() => expect(analytics.deactivateAnalytics).toHaveBeenCalled());
  expect(analytics.activateAnalytics).not.toHaveBeenCalled();
});

test('accepting activates analytics and sends the first pageview', async () => {
  const screen = await mount();
  await screen.getByRole('button', { name: 'Accept all' }).click();

  await vi.waitFor(() =>
    expect(analytics.activateAnalytics).toHaveBeenCalledWith({
      key: 'phc_test',
      host: 'https://eu.i.posthog.com',
    }),
  );
  await vi.waitFor(() => expect(analytics.capturePageview).toHaveBeenCalledWith('/dashboard'));
});
```

### 4. Server-side events — with the same consent rule

📄 **Create `src/libs/analytics/server.ts`:**

```ts
import 'server-only';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { PostHog } from 'posthog-node';

import type { AnalyticsEvents } from '@/libs/analytics/events';
import { CONSENT_COOKIE, parseConsent } from '@/libs/consent';
import { Env } from '@/libs/Env';

/**
 * Server-side events are still analytics: they need the SAME consent as the browser ones.
 * No key, no consent cookie, or analytics declined → silently nothing.
 */
export async function trackServer<E extends keyof AnalyticsEvents>(
  distinctId: string,
  event: E,
  properties: AnalyticsEvents[E],
): Promise<void> {
  const key = Env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  if (!consent?.analytics) return;

  const client = new PostHog(key, {
    host: Env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
  client.capture({ distinctId, event, properties });
  // Keep the (serverless) function alive until the event is delivered
  try {
    after(() => client.shutdown());
  } catch {
    await client.shutdown();
  }
}
```

📄 **Create `src/libs/analytics/server.test.ts`:**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const cookieValue = vi.hoisted(() => ({ current: undefined as string | undefined }));
const capture = vi.hoisted(() => vi.fn());
const shutdown = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const env = vi.hoisted(() => ({
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_x' as string | undefined,
  NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (cookieValue.current ? { value: cookieValue.current } : undefined),
  }),
}));
vi.mock('next/server', () => ({ after: (task: () => unknown) => void task() }));
vi.mock('posthog-node', () => ({
  PostHog: class {
    capture = capture;
    shutdown = shutdown;
  },
}));
vi.mock('@/libs/Env', () => ({ Env: env }));

import { serializeConsent } from '@/libs/consent';

import { trackServer } from './server';

beforeEach(() => {
  capture.mockReset();
  cookieValue.current = undefined;
  env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_x';
});

describe('trackServer', () => {
  it('sends nothing without a consent cookie, with analytics declined, or without a key', async () => {
    await trackServer('u1', 'project_created', { status: 'active' });
    cookieValue.current = serializeConsent({ analytics: false, replay: false });
    await trackServer('u1', 'project_created', { status: 'active' });
    cookieValue.current = serializeConsent({ analytics: true, replay: false });
    env.NEXT_PUBLIC_POSTHOG_KEY = undefined;
    await trackServer('u1', 'project_created', { status: 'active' });

    expect(capture).not.toHaveBeenCalled();
  });

  it('sends the event once the visitor consented', async () => {
    cookieValue.current = serializeConsent({ analytics: true, replay: false });
    await trackServer('u1', 'project_created', { status: 'active' });
    expect(capture).toHaveBeenCalledWith({
      distinctId: 'u1',
      event: 'project_created',
      properties: { status: 'active' },
    });
  });
});
```

### 5. E2E: the network tells the truth

📄 **Create `e2e/analytics.spec.ts`:**

```ts
import { expect, test } from './fixtures';
import { consentCookie } from './helpers/consent';

const isAnalytics = (url: string) => url.includes('/ingest') || url.includes('posthog.com');

test('before consent: no analytics request at all', async ({ page, context }) => {
  await context.clearCookies();
  const seen: string[] = [];
  page.on('request', (request) => isAnalytics(request.url()) && seen.push(request.url()));

  await page.goto('/');
  await page.goto('/contact');
  await page.waitForLoadState('networkidle');
  expect(seen).toEqual([]);
});

test('rejecting keeps it that way', async ({ page, context }) => {
  await context.clearCookies();
  const seen: string[] = [];
  page.on('request', (request) => isAnalytics(request.url()) && seen.push(request.url()));

  await page.goto('/');
  await page.getByRole('button', { name: 'Reject non-essential' }).click();
  await page.goto('/contact');
  await page.waitForLoadState('networkidle');
  expect(seen).toEqual([]);
});

test('accepting starts analytics through our own /ingest path', async ({ page, context }) => {
  await context.clearCookies();
  const ingest = page.waitForRequest((request) => request.url().includes('/ingest'), {
    timeout: 15_000,
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Accept all' }).click();

  expect(new URL((await ingest).url()).pathname.startsWith('/ingest')).toBe(true); // first-party path, not posthog.com
});

test('with consent already stored, analytics starts on load; withdrawing stops new captures', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([consentCookie(baseURL!, { analytics: true, replay: false })]);
  await page.goto('/');
  await page.waitForRequest((request) => request.url().includes('/ingest'), { timeout: 15_000 });

  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await page.getByLabel('Analytics').uncheck();
  await page.getByRole('button', { name: 'Save choices' }).click();

  const afterWithdrawal: string[] = [];
  page.on(
    'request',
    (request) => request.url().includes('/ingest/e') && afterWithdrawal.push(request.url()),
  );
  await page.goto('/contact');
  await page.waitForLoadState('networkidle');
  expect(afterWithdrawal).toEqual([]);
});
```

> These assertions are **the** proof of the sprint's promise. If one fails, you are tracking people who said no.

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check && pnpm e2e
```

1. With a real PostHog key and the dev server: DevTools → Network, filter `ingest`. **Before** clicking anything: nothing. **Accept all** → requests to `/ingest/...` (same origin) and events in PostHog's _Live events_ (pageviews with **paths only**).
2. Navigate to `/reset-password?token=abc` → in PostHog the pageview URL has **no** `?token=`.
3. **Cookie settings → untick Analytics → Save** → no more `/ingest/e/` requests; `localStorage`/cookies named `ph_*` are cleared by `reset()`.
4. `NEXT_PUBLIC_POSTHOG_KEY` unset → the app behaves identically, banner still works.
5. CSP: the earlier `csp.spec.ts` "all integrations active" test still passes.

**🚢 Ship** — branch `feat/s6-t13-posthog` · message: `feat(analytics): add consent-gated posthog with first-party proxy, typed client and server helpers`

---

## 🎫 S6-T14 — Typed events and identity

**Branch:** `feat/s6-t14-events-identify` · **Story:** US-063 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s6-t14-events-identify
```

### 1. Identify (when allowed) and reset (always)

📄 **Create `src/components/analytics/analytics-identity.tsx`:**

```tsx
'use client';

import { useEffect } from 'react';

import { useAnalyticsReady } from '@/components/analytics/analytics-provider';
import { groupOrganization, identifyUser } from '@/libs/analytics/client';

/** Links events to an INTERNAL user id (and organization) — only while analytics is active. */
export function AnalyticsIdentity({ userId, orgId }: { userId: string; orgId?: string }) {
  const ready = useAnalyticsReady();

  useEffect(() => {
    if (!ready) return;
    identifyUser(userId);
    if (orgId) groupOrganization(orgId);
  }, [ready, userId, orgId]);

  return null;
}
```

📄 **Render it** — `(app)/layout.tsx`: `<AnalyticsIdentity userId={user.id} />` (inside the layout's root fragment) and `[orgSlug]/layout.tsx`: `<AnalyticsIdentity userId={session.user.id} orgId={org.id} />` (use `session` from `requireOrgMember`).

📄 **Reset on sign-out** — `src/components/layout/user-menu.tsx`:

```tsx
import { resetAnalytics } from '@/libs/analytics/client';

async function signOut() {
  resetAnalytics(); // the next person on this browser must not inherit this identity
  await authClient.signOut();
  // …unchanged…
}
```

(the same one-liner belongs in the "impersonation stop" button — an impersonated session must never be attributed to the admin or the user in analytics: **do not identify while impersonating**; pass `userId` only when `!session.session.impersonatedBy` in `(app)/layout.tsx`).

### 2. Send the typed events where they happen

| Event | Where (success branch) |
| --- | --- |
| `user_signed_up` `{ method: 'password' }` | `SignUpForm` after `authClient.signUp.email` succeeds |
| `user_signed_in` `{ method: 'password' }` | `SignInForm` right before navigating (and `'two_factor'` in `TotpForm`/`BackupForm`, `'passkey'` in `PasskeyButton`) |
| `org_created` `{ via: 'form' }` | `CreateOrganizationForm` after `organization.create` |
| `member_invited` `{ role }` | `InviteMemberForm` after `inviteMember` |
| `project_created` `{ status }` | **server-side**, in the `createProject` action |

Client example (`sign-up-form.tsx`):

```tsx
import { trackEvent } from '@/libs/analytics/client';
// after the success check:
trackEvent('user_signed_up', { method: 'password' });
```

Server example — `src/actions/projects.ts`:

```ts
import { trackServer } from '@/libs/analytics/server';
// in handleCreate, after tenantDb(org.id).projects.create(...) succeeds:
await trackServer(session.user.id, 'project_created', { status: input.status });
```

> `trackServer` checks the **visitor's consent cookie**, so the server-side event respects the same choice. It's also skipped for impersonation sessions? — add `if (session.session.impersonatedBy) return` before calling it: an admin's actions aren't the user's behaviour.

### 3. A guard against "creative" tracking

📄 **Create `src/libs/analytics/no-direct-posthog.test.ts`:**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

const ALLOWED = new Set([
  path.join('src', 'libs', 'analytics', 'client.ts'),
  path.join('src', 'libs', 'analytics', 'server.ts'),
]);

function files(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => path.join(dir, file));
}

it('only the two analytics wrappers import posthog directly', () => {
  const offenders = files('src').filter(
    (file) =>
      !ALLOWED.has(file) && /from ['"]posthog-(js|node)['"]/.test(readFileSync(file, 'utf8')),
  );
  expect(offenders, `Use src/libs/analytics/* instead:\n${offenders.join('\n')}`).toEqual([]);
});
```

### 4. Privacy documentation

📄 **Create `docs/guides/privacy.md`:**

```markdown
# Privacy & analytics

| Category | Tool | Default | What is sent |
| --- | --- | --- | --- |
| Essential | session cookie, language, `consent` cookie | always | nothing leaves our origin |
| Analytics | PostHog (via `/ingest`) | **off** | pageviews (path only), the typed events in `src/libs/analytics/events.ts`, internal user/org ids |
| Error recordings | Sentry Replay (lazy-loaded) | **off** | short recordings around errors, text/media masked |

Rules

- **Nothing** non-essential runs before consent. A Global Privacy Control signal = "no".
- Never send emails, names or free text. Ids are internal. Events are typed (`pnpm typecheck` enforces it).
- Only `src/libs/analytics/{client,server}.ts` may import posthog (a test enforces it).
- Server-side events read the same consent cookie.
- Impersonation sessions are never identified or tracked.
- Changing purposes or categories? Bump `CONSENT_VERSION` (src/libs/consent.ts) → everyone is asked again.

## Adding an event

1. Add it to `AnalyticsEvents` (properties: categories, counts, booleans).
2. `trackEvent('…', {…})` in the client success branch, or `trackServer(userId, '…', {…})` in the action.
3. Mention it in this table if it introduces a new kind of data.
```

### ✅ Verify

```bash
pnpm test && pnpm typecheck && pnpm check && pnpm e2e
```

1. Accept analytics → sign up, sign in, create an organization, invite someone, create a project → PostHog _Live events_ shows `user_signed_up`, `user_signed_in`, `org_created`, `member_invited`, `project_created`, linked to a **user id** (no email anywhere in the properties).
2. Sign out → the next action in the same browser is anonymous again (new distinct id).
3. Decline analytics → none of these appear, **including** the server-side `project_created`.
4. Impersonate someone (S4) → no events attributed to either person.
5. Try `trackEvent('org_created', { via: 'form', email: 'x' })` → `pnpm typecheck` fails.

**🚢 Ship** — branch `feat/s6-t14-events-identify` · message: `feat(analytics): add typed events, consent-aware identify and reset, and privacy docs`

---

## 🧾 Sprint 6 wrap-up

**Branch:** `docs/s6-wrap-up`

```bash
git switch main && git pull && git switch -c docs/s6-wrap-up
```

### 1. The two tests that define "optional"

Run both **manually once**, record the result in `06-project-state.md`:

**A. Zero configuration** — comment out every Sprint 6 variable (no Sentry, Better Stack, Arcjet, PostHog, Checkly; `CSP_MODE` default):

```bash
pnpm build && pnpm start      # boots; no warnings except the optional-integration notes
CI=1 pnpm e2e                 # green
```

**B. Everything on** — dummy values in `.env.local`:

```dotenv
NEXT_PUBLIC_SENTRY_DSN=https://public@o0.ingest.sentry.io/0
NEXT_PUBLIC_SENTRY_SPOTLIGHT=true
BETTER_STACK_SOURCE_TOKEN=dummy
BETTER_STACK_INGESTING_HOST=logs.invalid
ARCJET_KEY=ajkey_dummy
ARCJET_MODE=DRY_RUN
NEXT_PUBLIC_POSTHOG_KEY=phc_dummy
CSP_MODE=enforce
```

```bash
pnpm build && pnpm start      # boots; failing vendors are logged and ignored (fail-open / bounded queues)
```

Browse: sign up, sign in, create an org, a project. **Nothing breaks, no CSP violation, no unhandled error.** (Vendors rejecting the dummy credentials is expected and harmless — that _is_ the test.)

### 2. Docs

📄 **Append to `docs/guides/observability.md`:**

```markdown
## Logs (Better Stack)

Set `BETTER_STACK_SOURCE_TOKEN` + `BETTER_STACK_INGESTING_HOST`. Logs are redacted, batched, bounded and never block requests. Serverless caveat: prefer Better Stack's Vercel integration (log drain) in production.

## Health & monitoring

`GET /api/health` → `{ status, version, db, time }` (503 when the database is down). `pnpm checkly:test` / `checkly:deploy`.

## Arcjet

Optional. `ARCJET_MODE=DRY_RUN` logs would-be blocks; `LIVE` blocks. Fails open if Arcjet is unreachable. Per-IP limits on auth endpoints, per-address limits and disposable-email rejection on sign-up / reset / magic-link.
```

`docs/guides/security.md` (headers, CSP rollout, secrets) and `docs/guides/privacy.md` were created in their tickets.

### 3. Update `AGENTS.md`

**Conventions:**

```markdown
- Every third-party integration lives behind an adapter that no-ops without its env vars. Never import vendor SDKs from components/pages: use `src/libs/Sentry.ts`, `Arcjet.ts`, `analytics/client.ts|server.ts`.
- Report only UNEXPECTED errors (`reportError`); never log or report secrets, tokens, codes or personal data (redaction + scrubbing exist, don't rely on them).
- Analytics: typed events only (`src/libs/analytics/events.ts`), no personal data, consent-gated; posthog may only be imported by the two wrappers.
- Third-party origin needed in the browser? Update `connectSourcesFor` in `src/libs/csp.ts` AND its test; E2E runs with the CSP enforced.
- Static marketing pages must keep working under the relaxed CSP tier; new dynamic areas go in `STRICT_PREFIXES`.
- New public API route → decide: inside the proxy matcher (protected by Arcjet) or deliberately outside (health, csp-report).
```

**Commands:** `pnpm spotlight`, `pnpm checkly:test`, `pnpm checkly:deploy`.

```bash
pnpm check:agents
```

### 4. Update `docs/roadmap/06-project-state.md`

- **Last completed sprint:** Sprint 6 · **Current sprint:** Sprint 7
- **New env vars:** Sentry (4), Better Stack (2), Arcjet (2), `APP_VERSION`, `CSP_MODE`, PostHog (2)
- **New routes:** `/api/health`, `/api/csp-report`, `/ingest/*` (rewrite); proxy matcher now also covers `/api/auth/*`
- **Tests:** zero-config and all-integrations results (above), CSP-enforced E2E, analytics network spec
- **Deviations:** from the decisions table + any SDK option names changed
- **Debt:** `TD-14` (log loss on serverless), CSP report endpoint is unauthenticated/unthrottled, visual baselines re-generated after the footer link

Tick the checkboxes in `docs/roadmap/sprint-06-observability-security.md`, then:

```bash
pnpm check
git add -A
git commit -m "docs: add observability, security and privacy guides and update project state for sprint 6"
git push -u origin docs/s6-wrap-up
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
git tag -a v0.6.0 -m "chore: sprint 6 complete — observability, security, analytics"
git push origin v0.6.0
```

---

## 🏁 Sprint 6 — Definition of Done

- [ ] App boots and `CI=1 pnpm e2e` passes with **no** integration variables (**zero-config test**)
- [ ] App boots and browses cleanly with **every** integration switched on using dummy keys, CSP enforced (**all-on test**)
- [ ] Sentry: unexpected server/client/Server-Action errors reported with `requestId`; `AppError`s are not; events scrubbed (unit-tested)
- [ ] Logs ship to Better Stack redacted and batched; a dead endpoint never affects requests
- [ ] One `x-request-id` links the response header, log lines, Sentry tag and the "Reference" shown to users
- [ ] Arcjet: `DRY_RUN` logs, `LIVE` blocks bots/abuse; per-IP and per-email limits; disposable emails rejected; **fails open**
- [ ] `/api/health` answers 200/503 correctly; Checkly checks defined as code
- [ ] Security headers on every route (E2E-verified); passkeys still work
- [ ] CSP: nonce tier for dynamic areas, relaxed tier for static pages, report endpoint, **zero violations** in the enforced E2E suite
- [ ] gitleaks (hook + CI history scan), CodeQL, GitHub push protection; rotation guide written
- [ ] Consent: default denied, GPC respected, versioned, reopenable; **no analytics request before consent** (E2E-verified); Replay lazy-loaded after consent
- [ ] PostHog: first-party `/ingest`, path-only pageviews, typed events, internal ids only, reset on sign-out, server events consent-aware
- [ ] `docs/guides/{observability,security,privacy}.md` written; `06-project-state.md` updated; tag `v0.6.0`

### 🎬 Sprint review — measurable acceptance

| Check | Expected |
| --- | --- |
| Throw an unexpected error | appears in Sentry with `requestId`, no cookies/emails/tokens |
| Search `requestId:<id>` | finds the log lines **and** the Sentry event |
| Bot-like request (`curl -A python-requests`) | `DRY_RUN`: allowed + logged · `LIVE`: 403 |
| `GET /api/health` with the DB stopped | 503 within ~1 s, only `status/version/db/time` |
| Response headers | all expected headers; passkey E2E green |
| Inline `<script>` injected on `/dashboard` | refused by the CSP |
| Fresh browser, DevTools → Network | **zero** analytics requests until "Accept all" |
| Fake AWS key in a commit | blocked (hook) and failing `Secret scan` (CI) |

---

## 🧯 Troubleshooting (Sprint 6)

| Symptom | Likely cause → fix |
| --- | --- |
| Build warns "no auth token" from Sentry | Expected without `SENTRY_AUTH_TOKEN`; source maps are only uploaded in real builds |
| Sentry gets nothing | No DSN, DSN malformed, ad-blocker, or `beforeSend` dropping the event (scrubber returns the event — never `null`) |
| Spotlight UI empty | Sidecar not running (`pnpm spotlight`), or `NEXT_PUBLIC_SENTRY_SPOTLIGHT` not `true` at **build/start** time (it's inlined) |
| Logs missing in Better Stack | Wrong host/token, or the function froze before the batch was sent (`TD-14`) → `flushLogs()` / log drain |
| `x-request-id` present but logs lack `requestId` | LogTape `contextLocalStorage` not configured, or code ran outside `withRequestContext` |
| Arcjet blocks your own browser in `LIVE` | UA/IP flagged → keep `DRY_RUN` locally, review the log reason, adjust `allow` categories |
| Everything is slow after enabling Arcjet | It runs on **every page request**; keep rules lean, consider limiting `matcher` to auth/dynamic areas |
| `/api/health` 503 but the DB is fine | The pooled connection is exhausted/idle-timeout (PGlite allows one connection) → retry; check `checkDatabase` timeout |
| Page blank + CSP errors in the console | A new third-party origin or inline script → add it deliberately (`csp.ts` + test) or run `CSP_MODE=report-only` while investigating |
| Scripts without `nonce` on strict pages | The nonce didn't survive the next-intl rewrite → follow the Next CSP guide for passing `x-nonce`/`content-security-policy` on the _request_; the nonce E2E test catches it |
| Static marketing pages became dynamic | A strict policy (nonce) leaked onto them → check `usesStrictCsp` and that those routes don't read `headers()` |
| Hydration warning around the banner | The provider must render nothing until `status !== 'unknown'` (don't read cookies during SSR) |
| E2E clicks blocked by the consent banner | The `consent` cookie wasn't added to that context (`openAs` / the auto fixture) |
| Visual diffs only in the footer | Expected after S6-T10 (new "Cookie settings" link) → re-baseline with the `update-snapshots` label |
| PostHog requests 404 | The `/ingest` rewrite or matcher exclusion is missing, or `skipTrailingSlashRedirect` isn't set |
| `gitleaks: command not found` on commit | Not installed → the hook is skipped by design; CI is the backstop (`winget install Gitleaks.Gitleaks`) |
| Secret-scan job flags a doc | It's a real-looking secret → either it is one (rotate!) or add a **narrow** allow-list regex |
| 🪟 `docker` missing for gitleaks locally | Only CI uses Docker; locally use the native binary |

---

## ➡️ Next

Sprint 6 complete → **Sprint 7 — SEO, marketing, i18n sync, performance & accessibility** (`docs/roadmap/sprint-07-seo-marketing-perf.md`): marketing and legal pages, metadata/JSON-LD/OG/sitemap/robots, Crowdin, Lighthouse ≥ 95, WCAG 2.2 AA and RTL checks, and the final theme. Same format: one branch per ticket, verify, PR, merge.
