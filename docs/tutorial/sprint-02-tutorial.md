# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 2 — Authentication Core (Better Auth)

> Companion to `docs/roadmap/sprint-02-auth-core.md`. Every `S2-Txx` section is one ticket. Follow them **in the order shown here** (it differs from the sprint file — see the table below).

🪟 **Windows + Cmder:** use the **Git Bash tab**. Bash syntax and Node scripts only. Windows-specific notes are marked 🪟.

> ⚠️ **About versions.** Better Auth, React Email and Zod 4 move fast; option names (especially around change-email, delete-user and rate limiting) differ between releases. Where an API may have drifted the step says **🔍 Verify against docs**. Trust the official docs over this tutorial and record deviations in `docs/roadmap/06-project-state.md`.

---

## 📋 What you will have at the end

- **Better Auth** wired to Drizzle (users, sessions, accounts, verification tokens, rate limits)
- A pluggable **email layer** (console in dev, Resend in prod, memory in tests) with translated **React Email** templates
- Pages (en/fr): **sign up → verify email → sign in → sign out → forgot/reset password**
- An **authoritative session guard** in the data layer + an optimistic `proxy.ts` redirect (defence in depth)
- **Account settings:** profile, change password, change email, active sessions, delete account
- Rate limiting on sensitive endpoints, and a full **E2E suite** reading emails from the dev inbox

## 🔢 Ticket order used in this tutorial

| Order | Ticket                                   | Why moved                        |
| ----- | ---------------------------------------- | -------------------------------- |
| 1     | **S2-T04** Email transport               | Auth callbacks need to send mail |
| 2     | **S2-T05** Email templates               | …and templates                   |
| 3     | S2-T01 Better Auth config                | Uses the senders from T04/T05    |
| 4     | S2-T02 Schema + migration                |                                  |
| 5     | S2-T03 Route handler + client            |                                  |
| 6     | **S2-T10** Session DAL + `proxy.ts`      | Pages below need guards          |
| 7     | S2-T06 Sign-up                           |                                  |
| 8     | S2-T07 Email verification                |                                  |
| 9     | S2-T08 Sign-in / sign-out                |                                  |
| 10    | S2-T09 Forgot / reset password           |                                  |
| 11    | S2-T11 Protected dashboard + guard tests |                                  |
| 12    | S2-T12 Profile + change password         |                                  |
| 13    | S2-T13 Change email + sessions           |                                  |
| 14    | S2-T14 Delete account (stretch)          |                                  |
| 15    | **S2-T16** Rate limiting                 | Must exist before the E2E suite  |
| 16    | S2-T15 Auth E2E suite                    |                                  |
| 17    | Wrap-up                                  | docs, state, tag `v0.1.0-alpha`  |

### Deviations from the sprint file (decided once, here)

- **`BETTER_AUTH_URL` is dropped** — we reuse `NEXT_PUBLIC_APP_URL` (one source of truth, works with previews).
- **No `/api/dev/last-email` route.** Playwright runs on the same machine as the server, so E2E reads the `.emails/` folder directly. A route that exposes emails would be a liability if it ever shipped.
- **Auth flows use the Better Auth client SDK** from the browser (it talks to `/api/auth/*`, an external surface). Operations that need extra server-side side effects (change password → notification email) use **Server Actions** with `createAction`.

---

## 🔀 Git workflow (PR-based, same as Sprint 1)

```bash
git switch main && git pull
git switch -c <type>/s2-tXX-<slug>
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

Each ticket ends with a **🚢 Ship** line (branch + commit message). Run `pnpm pin` after adding dependencies.

---

## ✅ Before you start

```bash
git switch main && git pull
pnpm install
pnpm check              # Sprint 1 must be green
```

Set **Current sprint: Sprint 2** in `docs/roadmap/06-project-state.md`.

---

## 🎫 S2-T04 — Email transport abstraction

**Branch:** `feat/s2-t04-email-transport` · **Story:** US-021 · **3 SP**

> 🎯 One `sendEmail()` function. Where the mail goes depends on configuration: **console** (dev: prints the link and saves a JSON file), **Resend** (production), **memory** (tests).

```bash
git switch -c feat/s2-t04-email-transport
mkdir -p src/libs/email
```

### 1. Environment variables

📄 **Edit `src/libs/Env.ts`** — add to `server` and `runtimeEnv`:

```ts
    EMAIL_FROM: z.string().min(3).default('SaaS Boilerplate <onboarding@resend.dev>'),
    RESEND_API_KEY: z.string().min(1).optional(),
    // Optional override. Default: resend if a key exists, console in development, otherwise unset (sending fails loudly).
    EMAIL_TRANSPORT: z.enum(['console', 'resend', 'memory']).optional(),
```

```ts
    EMAIL_FROM: process.env.EMAIL_FROM,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_TRANSPORT: process.env.EMAIL_TRANSPORT,
```

📄 **Append to `.env.example`:**

```dotenv
# ─── Email ──────────────────────────────────────────
# Local development prints links in the terminal and stores messages in ./.emails (no setup needed).
EMAIL_FROM="SaaS Boilerplate <onboarding@resend.dev>"
RESEND_API_KEY=
# console | resend | memory  (leave empty for automatic selection)
EMAIL_TRANSPORT=
```

### 2. Types

📄 **Create `src/libs/email/types.ts`:**

```ts
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Free-form labels, e.g. { type: 'verify-email' } */
  tags?: Record<string, string>;
};

export type EmailTransport = {
  send(message: EmailMessage): Promise<void>;
};
```

### 3. Memory transport (tests)

📄 **Create `src/libs/email/memory-transport.ts`:**

```ts
import type { EmailMessage, EmailTransport } from './types';

export class MemoryTransport implements EmailTransport {
  readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
  }

  /** Latest message, optionally filtered by recipient. */
  last(to?: string): EmailMessage | undefined {
    return [...this.outbox].reverse().find((m) => (to ? m.to === to : true));
  }

  clear(): void {
    this.outbox.length = 0;
  }
}
```

### 4. Console transport (development)

📄 **Create `src/libs/email/console-transport.ts`:**

```ts
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { getLogger } from '@/libs/Logger';

import type { EmailMessage, EmailTransport } from './types';

export type CapturedEmail = EmailMessage & { links: string[]; createdAt: number };

export function extractLinks(text: string): string[] {
  return [...new Set(text.match(/https?:\/\/[^\s"'<>)]+/g) ?? [])];
}

const fileSafe = (value: string) => value.replace(/[^a-z0-9]+/gi, '_');

/** Prints the message (with clickable links) and stores it as JSON in `dir`. */
export class ConsoleTransport implements EmailTransport {
  readonly dir: string;

  constructor(dir = '.emails') {
    this.dir = dir;
  }

  async send(message: EmailMessage): Promise<void> {
    const links = extractLinks(message.text);
    const captured: CapturedEmail = { ...message, links, createdAt: Date.now() };

    getLogger('email').info('📧 "{subject}" → {to}\n{links}', {
      subject: message.subject,
      to: message.to,
      links: links.join('\n'),
    });

    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(
        path.join(this.dir, `${captured.createdAt}-${fileSafe(message.to)}.json`),
        JSON.stringify(captured, null, 2),
      );
    } catch (error) {
      // Read-only filesystems (serverless) must not break sign-up
      getLogger('email').warning('Could not store email on disk', { error });
    }
  }
}

/** Newest captured email for a recipient (used by tests). */
export function readLastEmail(dir: string, to: string): CapturedEmail | undefined {
  const files = readdirSync(dir).sort().reverse();
  for (const file of files) {
    const email = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as CapturedEmail;
    if (email.to === to) return email;
  }
  return undefined;
}
```

### 5. Resend transport (production)

📄 **Create `src/libs/email/resend-transport.ts`:**

```ts
import { ExternalServiceError } from '@/libs/errors';

import type { EmailMessage, EmailTransport } from './types';

/** Minimal Resend client over fetch — no SDK dependency. */
export class ResendTransport implements EmailTransport {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, from: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.from = from;
    this.fetchImpl = fetchImpl;
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: Object.entries(message.tags ?? {}).map(([name, value]) => ({ name, value })),
      }),
    });

    if (!response.ok) {
      // Details stay server-side; callers only see a generic ExternalServiceError
      throw new ExternalServiceError({ message: `Resend responded with HTTP ${response.status}` });
    }
  }
}
```

> 🔍 Resend tag values only allow letters, numbers, `_` and `-`. Keep tag values simple (`verify-email`).

### 6. Selecting a transport

📄 **Create `src/libs/email/index.ts`:**

```ts
import { Env } from '@/libs/Env';
import { AppError, ExternalServiceError } from '@/libs/errors';
import { getLogger } from '@/libs/Logger';

import { ConsoleTransport } from './console-transport';
import { MemoryTransport } from './memory-transport';
import { ResendTransport } from './resend-transport';
import type { EmailMessage, EmailTransport } from './types';

let transport: EmailTransport | undefined;

function selectTransport(): EmailTransport {
  const kind =
    Env.EMAIL_TRANSPORT ??
    (Env.RESEND_API_KEY ? 'resend' : Env.NODE_ENV === 'production' ? undefined : 'console');

  switch (kind) {
    case 'resend':
      if (!Env.RESEND_API_KEY) {
        throw new ExternalServiceError({
          message: 'EMAIL_TRANSPORT=resend but RESEND_API_KEY is missing',
        });
      }
      return new ResendTransport(Env.RESEND_API_KEY, Env.EMAIL_FROM);
    case 'console':
      return new ConsoleTransport('.emails');
    case 'memory':
      return new MemoryTransport();
    default:
      throw new ExternalServiceError({
        message:
          'No email transport configured. Set RESEND_API_KEY (or EMAIL_TRANSPORT) in production.',
      });
  }
}

export function getEmailTransport(): EmailTransport {
  transport ??= selectTransport();
  return transport;
}

/** Tests inject a MemoryTransport; pass `undefined` to reset. */
export function setEmailTransport(next: EmailTransport | undefined): void {
  transport = next;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  try {
    await getEmailTransport().send(message);
  } catch (error) {
    // Never log the recipient or body (PII / secrets in links)
    getLogger('email').error('Failed to send email', { error, tags: message.tags });
    throw error instanceof AppError ? error : new ExternalServiceError({ cause: error });
  }
}
```

Knip: `MemoryTransport`/`setEmailTransport` are used by tests; `getEmailTransport` is used internally — if Knip complains about it being an unused **export**, un-export it.

### 7. Tests

📄 **Create `src/libs/email/transports.test.ts`:**

```ts
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExternalServiceError } from '@/libs/errors';

import { ConsoleTransport, extractLinks, readLastEmail } from './console-transport';
import { MemoryTransport } from './memory-transport';
import { ResendTransport } from './resend-transport';
import type { EmailMessage } from './types';

const message: EmailMessage = {
  to: 'ada@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
  text: 'Open https://app.test/verify?token=abc123 to continue',
  tags: { type: 'test' },
};

describe('MemoryTransport', () => {
  it('stores messages and finds the last one per recipient', async () => {
    const transport = new MemoryTransport();
    await transport.send(message);
    await transport.send({ ...message, to: 'bob@example.com' });

    expect(transport.outbox).toHaveLength(2);
    expect(transport.last('ada@example.com')?.to).toBe('ada@example.com');
    transport.clear();
    expect(transport.last()).toBeUndefined();
  });
});

describe('ConsoleTransport', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('stores the email as JSON with extracted links', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'emails-'));
    dirs.push(dir);

    await new ConsoleTransport(dir).send(message);

    expect(readdirSync(dir)).toHaveLength(1);
    const stored = readLastEmail(dir, 'ada@example.com');
    expect(stored?.links).toEqual(['https://app.test/verify?token=abc123']);
    expect(readLastEmail(dir, 'nobody@example.com')).toBeUndefined();
  });

  it('does not throw when the folder cannot be written', async () => {
    await expect(
      new ConsoleTransport('/proc/definitely/not/writable').send(message),
    ).resolves.toBeUndefined();
  });
});

describe('extractLinks', () => {
  it('finds unique URLs', () => {
    expect(extractLinks('a https://x.io/a b https://x.io/a c http://y.io')).toEqual([
      'https://x.io/a',
      'http://y.io',
    ]);
  });
});

describe('ResendTransport', () => {
  it('posts the message with a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await new ResendTransport('re_key', 'App <a@b.co>', fetchMock).send(message);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: 'App <a@b.co>',
      to: ['ada@example.com'],
      tags: [{ name: 'type', value: 'test' }],
    });
  });

  it('throws a generic ExternalServiceError on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 422 }));
    await expect(new ResendTransport('k', 'f', fetchMock).send(message)).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });
});
```

> 🪟 The "cannot be written" test uses a Unix-style path; on Windows it also fails to create the folder, which is exactly what the test needs. If it behaves differently on your machine, replace the path with `'Z:\\definitely\\not\\writable'`.

### ✅ Verify

```bash
pnpm test
pnpm typecheck && pnpm lint && pnpm knip
```

**🚢 Ship** — branch `feat/s2-t04-email-transport` · message: `feat(email): add pluggable email transports (console, resend, memory)`

---

## 🎫 S2-T05 — React Email templates (translated)

**Branch:** `feat/s2-t05-email-templates` · **Story:** US-021 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t05-email-templates
pnpm add @react-email/components @react-email/render
pnpm add -D react-email
mkdir -p src/templates/emails
```

### 1. Translations for emails (all four templates at once)

📄 **Add to `src/locales/en.json`** (top-level key `emails`):

```json
  "emails": {
    "footer": "You received this email because of activity on your {appName} account.",
    "verify": {
      "subject": "Verify your email address",
      "heading": "Confirm your email",
      "greeting": "Hi {name},",
      "body": "Thanks for signing up. Confirm your email address to activate your account.",
      "button": "Verify email",
      "ignore": "If you didn't create an account, you can safely ignore this email."
    },
    "reset": {
      "subject": "Reset your password",
      "heading": "Reset your password",
      "greeting": "Hi {name},",
      "body": "We received a request to reset your password. This link expires in 1 hour.",
      "button": "Choose a new password",
      "ignore": "If you didn't request this, ignore this email — your password won't change."
    },
    "passwordChanged": {
      "subject": "Your password was changed",
      "heading": "Password changed",
      "greeting": "Hi {name},",
      "body": "The password for your account was just changed. If this wasn't you, reset your password immediately and contact support."
    },
    "changeEmail": {
      "subject": "Confirm your email change",
      "heading": "Approve email change",
      "greeting": "Hi {name},",
      "body": "You asked to change your account email to {newEmail}. Approve this change to continue.",
      "button": "Approve change",
      "ignore": "If you didn't ask for this, secure your account right away."
    }
  }
```

📄 **Add to `src/locales/fr.json`:**

```json
  "emails": {
    "footer": "Vous recevez cet e-mail suite à une activité sur votre compte {appName}.",
    "verify": {
      "subject": "Vérifiez votre adresse e-mail",
      "heading": "Confirmez votre e-mail",
      "greeting": "Bonjour {name},",
      "body": "Merci de votre inscription. Confirmez votre adresse e-mail pour activer votre compte.",
      "button": "Vérifier l'e-mail",
      "ignore": "Si vous n'avez pas créé de compte, ignorez simplement ce message."
    },
    "reset": {
      "subject": "Réinitialisez votre mot de passe",
      "heading": "Réinitialisez votre mot de passe",
      "greeting": "Bonjour {name},",
      "body": "Nous avons reçu une demande de réinitialisation de votre mot de passe. Ce lien expire dans 1 heure.",
      "button": "Choisir un nouveau mot de passe",
      "ignore": "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre mot de passe ne changera pas."
    },
    "passwordChanged": {
      "subject": "Votre mot de passe a été modifié",
      "heading": "Mot de passe modifié",
      "greeting": "Bonjour {name},",
      "body": "Le mot de passe de votre compte vient d'être modifié. Si ce n'était pas vous, réinitialisez-le immédiatement et contactez le support."
    },
    "changeEmail": {
      "subject": "Confirmez le changement d'e-mail",
      "heading": "Approuvez le changement d'e-mail",
      "greeting": "Bonjour {name},",
      "body": "Vous avez demandé à remplacer l'e-mail de votre compte par {newEmail}. Approuvez ce changement pour continuer.",
      "button": "Approuver le changement",
      "ignore": "Si vous n'êtes pas à l'origine de cette demande, sécurisez votre compte immédiatement."
    }
  }
```

### 2. Translator that works outside a request

📄 **Create `src/templates/emails/i18n.ts`:**

```ts
import { createTranslator, type Locale } from 'next-intl';

import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

const messages = { en, fr } as const;

/** Emails are rendered outside a React request (auth callbacks), so we build a standalone translator. */
export function getEmailTranslator(locale: Locale) {
  return createTranslator({ locale, messages: messages[locale], namespace: 'emails' });
}
```

> 🔍 `createTranslator` options and the exported `Locale` type are from next-intl v4 — check the docs if your version differs.

### 3. Layout + generic action email

📄 **Create `src/templates/emails/layout.tsx`:**

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components';

export type ActionEmailProps = {
  lang: string;
  heading: string;
  greeting: string;
  body: string;
  footer: string;
  /** Omit for informational emails (no button). */
  action?: { label: string; url: string };
  ignore?: string;
};

export function ActionEmail({
  lang,
  heading,
  greeting,
  body,
  footer,
  action,
  ignore,
}: ActionEmailProps) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{heading}</Preview>
      <Body
        style={{
          backgroundColor: '#f4f4f5',
          fontFamily: 'Arial, Helvetica, sans-serif',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container
          style={{ backgroundColor: '#ffffff', borderRadius: 8, maxWidth: 480, padding: 32 }}
        >
          <Heading as="h1" style={{ fontSize: 22, margin: '0 0 16px' }}>
            {heading}
          </Heading>
          <Text>{greeting}</Text>
          <Text>{body}</Text>
          {action ? (
            <Button
              href={action.url}
              style={{
                backgroundColor: '#18181b',
                borderRadius: 6,
                color: '#ffffff',
                padding: '12px 20px',
                textDecoration: 'none',
              }}
            >
              {action.label}
            </Button>
          ) : null}
          {action ? (
            <Text style={{ color: '#6b7280', fontSize: 12, wordBreak: 'break-all' }}>
              {action.url}
            </Text>
          ) : null}
          {ignore ? <Text style={{ color: '#6b7280' }}>{ignore}</Text> : null}
          <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 32 }}>{footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

> 🔎 The raw URL is printed under the button: it keeps the plain-text version useful and lets users copy the link when buttons are blocked. No tracking pixels, ever.

### 4. The four templates

📄 **Create `src/templates/emails/templates.tsx`:**

```tsx
import type { Locale } from 'next-intl';

import { Env } from '@/libs/Env';

import { getEmailTranslator } from './i18n';
import { ActionEmail } from './layout';

type Base = { locale: Locale; name: string };

export function VerifyEmail({ locale, name, url }: Base & { url: string }) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('verify.heading')}
      greeting={t('verify.greeting', { name })}
      body={t('verify.body')}
      action={{ label: t('verify.button'), url }}
      ignore={t('verify.ignore')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}

export function ResetPasswordEmail({ locale, name, url }: Base & { url: string }) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('reset.heading')}
      greeting={t('reset.greeting', { name })}
      body={t('reset.body')}
      action={{ label: t('reset.button'), url }}
      ignore={t('reset.ignore')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}

export function PasswordChangedEmail({ locale, name }: Base) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('passwordChanged.heading')}
      greeting={t('passwordChanged.greeting', { name })}
      body={t('passwordChanged.body')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}

export function ChangeEmailEmail({
  locale,
  name,
  url,
  newEmail,
}: Base & { url: string; newEmail: string }) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('changeEmail.heading')}
      greeting={t('changeEmail.greeting', { name })}
      body={t('changeEmail.body', { newEmail })}
      action={{ label: t('changeEmail.button'), url }}
      ignore={t('changeEmail.ignore')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}
```

### 5. Rendering (HTML + plain text)

📄 **Create `src/templates/emails/render.ts`:**

```ts
import { render } from '@react-email/render';
import type { ReactElement } from 'react';

/** Always produce both parts: HTML for clients, text for accessibility and spam scoring. */
export async function renderEmail(element: ReactElement) {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
```

> 🔍 In recent `@react-email/render` versions `render` returns a **Promise**; in older ones a string. `await` works for both.

### 6. Pick the language from the request

📄 **Create `src/i18n/request-locale.ts`:**

```ts
import { hasLocale, type Locale } from 'next-intl';

import { routing } from './routing';

/** next-intl's proxy stores the visitor's language in the NEXT_LOCALE cookie. */
export function localeFromRequest(request?: Request): Locale {
  const cookie = request?.headers.get('cookie') ?? '';
  const raw = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(cookie)?.[1];
  const value = raw ? decodeURIComponent(raw) : undefined;
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
```

📄 **Create `src/i18n/request-locale.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { localeFromRequest } from './request-locale';

const req = (cookie?: string) =>
  new Request('http://localhost', { headers: cookie ? { cookie } : {} });

it('reads NEXT_LOCALE and falls back to the default', () => {
  expect(localeFromRequest(req('a=1; NEXT_LOCALE=fr'))).toBe('fr');
  expect(localeFromRequest(req('NEXT_LOCALE=de'))).toBe('en'); // unsupported → default
  expect(localeFromRequest(req())).toBe('en');
  expect(localeFromRequest(undefined)).toBe('en');
});
```

### 7. Senders used by Better Auth callbacks

📄 **Create `src/libs/auth-emails.tsx`:**

```tsx
import { localeFromRequest } from '@/i18n/request-locale';
import { sendEmail } from '@/libs/email';
import { getEmailTranslator } from '@/templates/emails/i18n';
import { renderEmail } from '@/templates/emails/render';
import {
  ChangeEmailEmail,
  PasswordChangedEmail,
  ResetPasswordEmail,
  VerifyEmail,
} from '@/templates/emails/templates';

type Recipient = { email: string; name: string };
type Input = { user: Recipient; request?: Request };

export async function sendVerificationEmail({ user, url, request }: Input & { url: string }) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <VerifyEmail locale={locale} name={user.name} url={url} />,
  );
  await sendEmail({
    to: user.email,
    subject: getEmailTranslator(locale)('verify.subject'),
    html,
    text,
    tags: { type: 'verify-email' },
  });
}

export async function sendResetPasswordEmail({ user, url, request }: Input & { url: string }) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <ResetPasswordEmail locale={locale} name={user.name} url={url} />,
  );
  await sendEmail({
    to: user.email,
    subject: getEmailTranslator(locale)('reset.subject'),
    html,
    text,
    tags: { type: 'reset-password' },
  });
}

export async function sendPasswordChangedEmail({ user, request }: Input) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <PasswordChangedEmail locale={locale} name={user.name} />,
  );
  await sendEmail({
    to: user.email,
    subject: getEmailTranslator(locale)('passwordChanged.subject'),
    html,
    text,
    tags: { type: 'password-changed' },
  });
}

export async function sendChangeEmailEmail({
  user,
  newEmail,
  url,
  request,
}: Input & { newEmail: string; url: string }) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <ChangeEmailEmail locale={locale} name={user.name} url={url} newEmail={newEmail} />,
  );
  await sendEmail({
    to: user.email,
    subject: getEmailTranslator(locale)('changeEmail.subject'),
    html,
    text,
    tags: { type: 'change-email' },
  });
}
```

### 8. Template tests

📄 **Create `src/templates/emails/templates.test.ts`** (`.ts` on purpose: runs in the node project, so we use `createElement`):

```ts
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { renderEmail } from './render';
import { PasswordChangedEmail, ResetPasswordEmail, VerifyEmail } from './templates';

const url = 'https://app.test/api/auth/verify-email?token=tok_123';

describe('email templates', () => {
  it('renders HTML + plain text with the action link (en)', async () => {
    const { html, text } = await renderEmail(
      createElement(VerifyEmail, { locale: 'en', name: 'Ada', url }),
    );

    expect(html).toContain(url.replace(/&/g, '&amp;'));
    expect(html).toContain('lang="en"');
    expect(text).toContain('Hi Ada,');
    expect(text).toContain(url);
    expect(text).toMatchSnapshot();
  });

  it('renders French copy', async () => {
    const { text } = await renderEmail(
      createElement(ResetPasswordEmail, { locale: 'fr', name: 'Ada', url }),
    );
    expect(text).toContain('Bonjour Ada,');
    expect(text).toContain("Si vous n'êtes pas à l'origine");
  });

  it('informational emails have no button', async () => {
    const { text } = await renderEmail(
      createElement(PasswordChangedEmail, { locale: 'en', name: 'Ada' }),
    );
    expect(text).not.toMatch(/https?:\/\//);
  });
});
```

```bash
pnpm test          # first run writes the snapshot into __snapshots__/ — commit it
```

### 9. Preview script (optional but handy)

📄 **Edit `package.json`** `scripts`:

```json
"email:dev": "email dev --dir src/templates/emails --port 3030"
```

> 🔍 React Email's preview server expects exported components with `PreviewProps`. If it shows nothing, treat the preview as optional — the tests are the safety net.

### 10. Knip

`src/libs/auth-emails.tsx` is not imported yet (T01 does it). Add to `knip.config.ts` `entry` temporarily: `'src/libs/auth-emails.tsx'`.

### ✅ Verify

```bash
pnpm test
pnpm typecheck && pnpm lint && pnpm knip && pnpm test:browser
```

The locale parity test (Sprint 1) must still pass — both language files have the same `emails.*` keys.

**🚢 Ship** — branch `feat/s2-t05-email-templates` · message: `feat(email): add translated react-email templates and auth email senders`

---

## 🎫 S2-T01 — Install and configure Better Auth

**Branch:** `feat/s2-t01-better-auth` · **Story:** US-020 · **2 SP** · 🔍 Read the Better Auth docs for **Next.js + Drizzle** first

```bash
git switch main && git pull && git switch -c feat/s2-t01-better-auth
pnpm add better-auth server-only
```

### 1. Secret (never committed)

📄 **Edit `src/libs/Env.ts`:**

```ts
    // ≥ 32 chars. Generate with: pnpm setup:env
    BETTER_AUTH_SECRET: z.string().min(32),
```

```ts
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
```

📄 **Append to `.env.example`:**

```dotenv
# ─── Auth (Better Auth) ─────────────────────────────
# Run `pnpm setup:env` to generate one into .env.local. NEVER commit a real secret.
BETTER_AUTH_SECRET=
```

📄 **Create `scripts/setup-env.mjs`:**

```js
// scripts/setup-env.mjs — creates .env.local with a random BETTER_AUTH_SECRET if missing.
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const file = '.env.local';
const current = existsSync(file) ? readFileSync(file, 'utf8') : '';

if (/^BETTER_AUTH_SECRET=.+/m.test(current)) {
  console.log('✅ BETTER_AUTH_SECRET already set in .env.local');
  process.exit(0);
}

const secret = randomBytes(32).toString('base64url');
const prefix = current && !current.endsWith('\n') ? '\n' : '';
appendFileSync(file, `${prefix}BETTER_AUTH_SECRET=${secret}\n`);
console.log('✅ Generated BETTER_AUTH_SECRET in .env.local');
```

📄 **Edit `package.json`** `scripts`: `"setup:env": "node scripts/setup-env.mjs"`.

Other places that need a value:

- **Vitest** — `vitest.config.ts` → `test.env`: add `BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123'` (≥ 32 chars).
- **CI** — `.github/workflows/ci.yml` top-level `env:` block: add `BETTER_AUTH_SECRET: ci-only-secret-ci-only-secret-0123456789`.
- **README quick start** — add `pnpm setup:env` before `pnpm dev`.

```bash
pnpm setup:env
```

### 2. Tell the guard tests how to import `server-only`

Outside Next.js the `server-only` package throws on import. Stub it in tests:

📄 **Create `tests/stubs/server-only.ts`:**

```ts
// Vitest stub: lets server-only modules be imported in tests.
export {};
```

📄 **Edit `vitest.config.ts`** — extend the alias:

```ts
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'server-only': path.resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
```

### 3. Run-in-background helper (don't make users wait for SMTP)

📄 **Create `src/utils/background.ts`:**

```ts
import { after } from 'next/server';

import { getLogger } from '@/libs/Logger';

/**
 * Runs a task after the response is sent. Inside a request we use Next's `after()`
 * (keeps serverless functions alive until it finishes). Outside a request (tests, scripts)
 * it falls back to a plain detached promise.
 *
 * Why: awaiting email delivery inside auth endpoints makes response times differ between
 * "user exists" and "user doesn't exist" → a timing side-channel for account enumeration.
 */
export function runInBackground(task: () => Promise<void>): void {
  const guarded = () =>
    task().catch((error: unknown) => {
      getLogger('app').error('Background task failed', { error });
    });

  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
```

📄 **Create `src/utils/background.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { runInBackground } from './background';

it('runs the task outside a request scope and swallows its errors', async () => {
  let ran = false;
  runInBackground(async () => {
    ran = true;
    throw new Error('boom');
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(ran).toBe(true);
});
```

### 4. The Better Auth instance

📄 **Create `src/libs/Auth.ts`:**

```ts
import 'server-only';
import { randomUUID } from 'node:crypto';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import { db } from '@/db/client';
import * as schema from '@/db/schema';
import type { DbLike } from '@/db/types';
import {
  sendChangeEmailEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from '@/libs/auth-emails';
import { Env } from '@/libs/Env';
import { runInBackground } from '@/utils/background';

/** Factory so integration tests can run the real auth stack on an in-memory database. */
export function createAuth(database: DbLike) {
  return betterAuth({
    appName: Env.NEXT_PUBLIC_APP_NAME,
    baseURL: Env.NEXT_PUBLIC_APP_URL,
    secret: Env.BETTER_AUTH_SECRET,
    trustedOrigins: [Env.NEXT_PUBLIC_APP_URL],

    database: drizzleAdapter(database, { provider: 'pg', schema }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hour (seconds)
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        runInBackground(() => sendResetPasswordEmail({ user, url, request }));
      },
    },

    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false, // we re-send explicitly from the sign-in form (S2-T08) so the link carries the right callbackURL
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60, // 1 hour (seconds)
      sendVerificationEmail: async ({ user, url }, request) => {
        runInBackground(() => sendVerificationEmail({ user, url, request }));
      },
    },

    user: {
      changeEmail: {
        enabled: true,
        // 🔍 Option name/flow differs across versions (sendChangeEmailConfirmation in older ones)
        sendChangeEmailVerification: async ({ user, newEmail, url }, request) => {
          runInBackground(() => sendChangeEmailEmail({ user, newEmail, url, request }));
        },
      },
      deleteUser: { enabled: true },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh the expiry once a day
      freshAge: 60 * 10, // "fresh" for 10 minutes → sensitive actions need recent sign-in
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },

    advanced: {
      useSecureCookies: Env.NODE_ENV === 'production',
      // 🔍 older versions: advanced.generateId
      database: { generateId: () => randomUUID() },
    },

    // Required so cookies set inside Server Actions reach the browser
    plugins: [nextCookies()],
  });
}

export const auth = createAuth(db);
export type Auth = typeof auth;
```

> 🔒 **Notes**
>
> - Passwords are hashed by Better Auth (scrypt by default — 🔍 confirm in docs). We never touch password hashes.
> - `requireEmailVerification: true` means **no session exists until the email is verified**.
> - `nextCookies()` must stay the **last** plugin when you add more in Sprint 3/4.
> - If TypeScript complains about the `database` argument of `drizzleAdapter`, check the adapter docs for the accepted type and cast **narrowly** (no `any`).

Remove the temporary Knip entry for `auth-emails.tsx` (it's imported now) and add `'src/libs/Auth.ts'` as an entry until the route handler imports it in S2-T03.

### ✅ Verify

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm knip
```

Remove `BETTER_AUTH_SECRET` from `.env.local` and run `pnpm dev:web` → it must fail with "Invalid environment variables … BETTER_AUTH_SECRET". Restore it with `pnpm setup:env`.

**🚢 Ship** — branch `feat/s2-t01-better-auth` · message: `feat(auth): configure better auth with email verification and password reset`

---

## 🎫 S2-T02 — Auth schema and migration

**Branch:** `feat/s2-t02-auth-schema` · **Story:** US-020 · **2 SP**

> 🎯 Better Auth generates the table definitions; we adapt them to our conventions (timestamps with time zone, indexes) and **replace** the temporary `app_meta` table.

```bash
git switch main && git pull && git switch -c feat/s2-t02-auth-schema
```

### 1. Generate with the Better Auth CLI (source of truth)

```bash
pnpm dlx @better-auth/cli@latest generate --config src/libs/Auth.ts --output src/db/schema/auth.generated.ts
```

- Answer **yes** if it asks to overwrite.
- 🔍 If the CLI cannot resolve our `@/` aliases or `server-only`, use the fallback: create a throw-away `scripts/auth-cli.ts` with relative imports exporting an `auth` built from the same options, and point `--config` at it. Do not change `Auth.ts` to please the CLI.

Open `auth.generated.ts` and compare it with the file below. **The CLI output wins** when they differ (names of columns, extra columns added by newer versions).

### 2. Our adapted schema

📄 **Create `src/db/schema/auth.ts`:**

```ts
import { bigint, boolean, index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: tz('created_at').notNull().defaultNow(),
  updatedAt: tz('updated_at').notNull().defaultNow(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: tz('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: tz('created_at').notNull().defaultNow(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
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
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: tz('access_token_expires_at'),
    refreshTokenExpiresAt: tz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: tz('created_at').notNull().defaultNow(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: tz('expires_at').notNull(),
    createdAt: tz('created_at').notNull().defaultNow(),
    updatedAt: tz('updated_at').notNull().defaultNow(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/** Used by Better Auth's database-backed rate limiter (enabled in S2-T16). */
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
```

```bash
rm src/db/schema/auth.generated.ts     # 🪟 cmd.exe: del src\db\schema\auth.generated.ts
```

> 🔎 The generated file was only a reference. Keeping two copies of the same tables would make Drizzle define them twice.

### 3. Replace `app_meta`

```bash
git rm src/db/schema/app-meta.ts tests/factories/app-meta.factory.ts
```

📄 **Replace `src/db/schema/index.ts`:**

```ts
export * from './auth';
```

### 4. Update everything that used `app_meta`

📄 **Create `tests/factories/user.factory.ts`:**

```ts
import { randomUUID } from 'node:crypto';

import type { user } from '@/db/schema';

import { defineFactory, faker } from './factory';

export const userFactory = defineFactory<typeof user.$inferInsert>((n) => ({
  id: randomUUID(),
  name: faker.person.fullName(),
  email: `user${n}-${faker.string.alphanumeric(6).toLowerCase()}@example.com`,
  emailVerified: true,
}));
```

📄 **Rewrite `tests/utils/test-db.test.ts`:**

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { user } from '@/db/schema';

import { userFactory } from '../factories/user.factory';
import { createTestDb, type TestDb, withRollback } from './test-db';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
}, 30_000);

afterAll(async () => {
  await destroy();
});

describe('test database', () => {
  it('applies migrations to an empty database', async () => {
    expect(await db.select().from(user)).toEqual([]);
  });

  it('rolls back everything written inside withRollback', async () => {
    const row = userFactory.build();

    await withRollback(db, async (tx) => {
      await tx.insert(user).values(row);
      expect(await tx.select().from(user).where(eq(user.id, row.id))).toHaveLength(1);
    });

    expect(await db.select().from(user)).toHaveLength(0);
  });
});
```

📄 **Rewrite `src/db/seed.ts`** — a verified demo user for local development:

```ts
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { account, user } from './schema';
import type { DbLike } from './types';

export const DEMO_USER = {
  email: 'demo@example.com',
  name: 'Demo User',
  password: 'Demo-Password-123', // local development ONLY — seed refuses to run in production
} as const;

type SeedOptions = { hashPassword: (password: string) => Promise<string> };

/** Idempotent: safe to run any number of times. */
export async function seed(db: DbLike, { hashPassword }: SeedOptions) {
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEMO_USER.email));
  if (existing.length > 0) return;

  const userId = randomUUID();
  await db.insert(user).values({
    id: userId,
    name: DEMO_USER.name,
    email: DEMO_USER.email,
    emailVerified: true,
  });
  await db.insert(account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: 'credential',
    userId,
    password: await hashPassword(DEMO_USER.password),
  });
}
```

📄 **Update `scripts/seed.ts`** — build the hasher from Better Auth's own context so seeded passwords work with sign-in:

```ts
import './_env';
import { Env } from '../src/libs/Env';

async function main() {
  if (Env.NODE_ENV === 'production') {
    console.error('❌ Refusing to seed in production.');
    process.exit(1);
  }

  const { db } = await import('../src/db/client');
  const { auth } = await import('../src/libs/Auth');
  const { seed, DEMO_USER } = await import('../src/db/seed');

  const context = await auth.$context; // 🔍 documented way to reach the password hasher
  await seed(db, { hashPassword: context.password.hash });

  console.log(`🌱 Seed complete — sign in with ${DEMO_USER.email} / ${DEMO_USER.password}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Seed failed:', (error as Error).message);
  process.exit(1);
});
```

> 🪟 `server-only` throws when a module is loaded outside React Server Components, which includes `tsx` scripts. Make the script run with the right condition — **edit `package.json`**:
>
> ```json
> "db:seed": "tsx --conditions=react-server scripts/seed.ts"
> ```

📄 **Rewrite `src/db/seed.test.ts`:**

```ts
import { afterAll, beforeAll, expect, it } from 'vitest';

import { account, user } from '@/db/schema';

import { createTestDb, type TestDb } from '../../tests/utils/test-db';
import { seed } from './seed';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
}, 30_000);
afterAll(() => destroy());

it('is idempotent and stores a hashed password, never the plain one', async () => {
  const hashPassword = async (password: string) => `hashed:${password.length}`;

  await seed(db, { hashPassword });
  await seed(db, { hashPassword });

  expect(await db.select().from(user)).toHaveLength(1);
  const [row] = await db.select().from(account);
  expect(row?.password).toMatch(/^hashed:/);
});
```

### 5. Generate and apply the migration

```bash
pnpm db:generate         # creates 0001_….sql (drops app_meta, creates auth tables)
```

Open the SQL and check: `DROP TABLE "app_meta"`, five `CREATE TABLE`s, foreign keys with `ON DELETE cascade`, the indexes.

```bash
pnpm db:check
pnpm db:server           # tab 2 — applies migrations at start
pnpm db:reset            # tab 1 — drop + migrate + seed
pnpm db:studio           # user/session/account/verification/rate_limit exist; one demo user
```

### 6. Drift check for the future

When a Better Auth plugin is added (Sprints 3–4) the schema must be regenerated. Add a reminder script:

📄 **Edit `package.json`:**

```json
"auth:schema": "pnpm dlx @better-auth/cli@latest generate --config src/libs/Auth.ts --output src/db/schema/auth.generated.ts"
```

and a note in `docs/guides/database.md`:

```markdown
## Better Auth schema

After adding/removing a Better Auth plugin run `pnpm auth:schema`, copy new tables/columns into `src/db/schema/auth.ts` (use our helpers/indexes), delete `auth.generated.ts`, then `pnpm db:generate` and commit the migration.
```

### ✅ Verify

```bash
pnpm test && pnpm db:check && pnpm typecheck && pnpm lint && pnpm knip
```

**🚢 Ship** — branch `feat/s2-t02-auth-schema` · message: `feat(db): add better auth schema and replace app_meta table`

---

## 🎫 S2-T03 — Route handler, client and smoke test

**Branch:** `feat/s2-t03-auth-handler` · **Story:** US-020 · **1 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t03-auth-handler
mkdir -p "src/app/api/auth/[...all]"
```

📄 **Create `src/app/api/auth/[...all]/route.ts`:**

```ts
import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/libs/Auth';

export const { GET, POST } = toNextJsHandler(auth);
```

> 🔎 Our `proxy.ts` matcher already excludes `/api`, so next-intl never touches these routes.

📄 **Create `src/libs/AuthClient.ts`:**

```ts
import { createAuthClient } from 'better-auth/react';

// No baseURL → same origin. Works on localhost, preview URLs and production without config.
export const authClient = createAuthClient();
```

Remove `'src/libs/Auth.ts'` from the temporary Knip entries (the route imports it). `AuthClient.ts` is used from T06 onward — add it as a temporary entry.

### ✅ Verify

```bash
pnpm dev
# another tab:
curl -s http://localhost:3000/api/auth/get-session
# → null   (no session yet)
curl -s -X POST http://localhost:3000/api/auth/sign-in/email -H "content-type: application/json" \
  -d '{"email":"nobody@example.com","password":"wrong-password-123"}'
# → {"code":"INVALID_EMAIL_OR_PASSWORD","message":"Invalid email or password"}
```

🪟 In Git Bash the quotes above work as written; in cmd.exe prefer Postman or skip this check — the E2E tests cover it later.

Seeded login check:

```bash
curl -s -X POST http://localhost:3000/api/auth/sign-in/email -H "content-type: application/json" -H "origin: http://localhost:3000" \
  -d '{"email":"demo@example.com","password":"Demo-Password-123"}'
# → JSON with "user" and "token" — the seeded account works
```

**🚢 Ship** — branch `feat/s2-t03-auth-handler` · message: `feat(auth): expose better auth route handler and browser client`

---

## 🎫 S2-T10 — Session DAL and optimistic `proxy.ts`

**Branch:** `feat/s2-t10-session-guard` · **Story:** US-025 · **3 SP** · risk **R-05** (auth bypass)

> 🎯 **Two layers, on purpose (ADR-003):**
>
> 1. `proxy.ts` → _optimistic_: "is there a session **cookie**?" Fast, redirects with a `callbackUrl`, but a forged cookie passes.
> 2. **Data access layer** (`src/data/session.ts`) → _authoritative_: validates the session in the database on every protected page and action.
>
> Never rely on the proxy alone. Never rely on a **layout** alone either — Next.js layouts are not re-rendered on every client navigation, so each **page** calls a guard itself.

```bash
git switch main && git pull && git switch -c feat/s2-t10-session-guard
mkdir -p src/data
```

### 1. Navigation helpers we now need

📄 **Edit `src/i18n/navigation.ts`:**

```ts
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```

### 2. Pure route-guard helpers (easy to test)

📄 **Create `src/libs/route-guard.ts`:**

```ts
import { routing } from '@/i18n/routing';

const PROTECTED_PREFIXES = ['/dashboard', '/admin'] as const;
const locales: readonly string[] = routing.locales;

/** "/fr/dashboard/x" → { locale: "fr", path: "/dashboard/x" }; "/dashboard" → { locale: "en", path: "/dashboard" } */
export function splitLocale(pathname: string): { locale: string; path: string } {
  const [, first, ...rest] = pathname.split('/');
  if (first && locales.includes(first)) {
    const path = `/${rest.join('/')}`.replace(/\/+$/, '');
    return { locale: first, path: path === '' ? '/' : path };
  }
  const path = pathname.replace(/\/+$/, '');
  return { locale: routing.defaultLocale, path: path === '' ? '/' : path };
}

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function localizedPath(locale: string, path: string): string {
  if (locale === routing.defaultLocale) return path;
  return `/${locale}${path === '/' ? '' : path}`;
}

/** Where to send an unauthenticated visitor, remembering where they wanted to go. */
export function buildSignInRedirect(pathname: string, search: string): string {
  const { locale } = splitLocale(pathname);
  return `${localizedPath(locale, '/sign-in')}?callbackUrl=${encodeURIComponent(pathname + search)}`;
}
```

📄 **Create `src/libs/route-guard.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { buildSignInRedirect, isProtectedPath, localizedPath, splitLocale } from './route-guard';

describe('splitLocale', () => {
  it('detects a locale prefix', () => {
    expect(splitLocale('/fr/dashboard/x')).toEqual({ locale: 'fr', path: '/dashboard/x' });
    expect(splitLocale('/fr')).toEqual({ locale: 'fr', path: '/' });
  });
  it('falls back to the default locale', () => {
    expect(splitLocale('/dashboard')).toEqual({ locale: 'en', path: '/dashboard' });
    expect(splitLocale('/')).toEqual({ locale: 'en', path: '/' });
    expect(splitLocale('/dashboard/')).toEqual({ locale: 'en', path: '/dashboard' });
  });
});

describe('isProtectedPath', () => {
  it('protects dashboard and admin trees only', () => {
    expect(isProtectedPath('/dashboard')).toBe(true);
    expect(isProtectedPath('/dashboard/account/profile')).toBe(true);
    expect(isProtectedPath('/admin')).toBe(true);
    expect(isProtectedPath('/dashboards')).toBe(false); // prefix trap
    expect(isProtectedPath('/sign-in')).toBe(false);
    expect(isProtectedPath('/')).toBe(false);
  });
});

describe('buildSignInRedirect', () => {
  it('keeps the visitor’s language and encodes the callback', () => {
    expect(buildSignInRedirect('/dashboard', '?tab=1')).toBe(
      '/sign-in?callbackUrl=%2Fdashboard%3Ftab%3D1',
    );
    expect(buildSignInRedirect('/fr/dashboard', '')).toBe(
      '/fr/sign-in?callbackUrl=%2Ffr%2Fdashboard',
    );
  });
});

it('localizedPath omits the prefix for the default locale', () => {
  expect(localizedPath('en', '/sign-in')).toBe('/sign-in');
  expect(localizedPath('fr', '/sign-in')).toBe('/fr/sign-in');
  expect(localizedPath('fr', '/')).toBe('/fr');
});
```

### 3. Open-redirect protection

📄 **Create `src/utils/safe-redirect.ts`:**

```ts
/**
 * Only same-origin relative paths are allowed as post-login destinations.
 * Anything else (absolute URLs, //host, backslashes, control chars) → fallback.
 */
export function sanitizeCallbackUrl(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;

  try {
    const url = new URL(raw, 'http://internal.invalid');
    if (url.origin !== 'http://internal.invalid') return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
```

📄 **Create `src/utils/safe-redirect.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { sanitizeCallbackUrl } from './safe-redirect';

const FALLBACK = '/dashboard';

describe('sanitizeCallbackUrl', () => {
  it.each([
    ['/dashboard/account?tab=2', '/dashboard/account?tab=2'],
    ['/fr/dashboard', '/fr/dashboard'],
  ])('keeps safe path %s', (input, expected) => {
    expect(sanitizeCallbackUrl(input, FALLBACK)).toBe(expected);
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'dashboard',
    '/ok\r\nSet-Cookie: x=1',
    '',
  ])('rejects %j', (input) => {
    expect(sanitizeCallbackUrl(input, FALLBACK)).toBe(FALLBACK);
  });

  it('handles null/undefined', () => {
    expect(sanitizeCallbackUrl(null, FALLBACK)).toBe(FALLBACK);
    expect(sanitizeCallbackUrl(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
```

### 4. The data access layer

📄 **Create `src/data/session.ts`:**

```ts
import 'server-only';
import { getLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { cache } from 'react';

import { redirect } from '@/i18n/navigation';
import { auth } from '@/libs/Auth';
import { AuthenticationError } from '@/libs/errors';

/** Validated against the database. `cache()` dedupes calls within one request. */
export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** For pages/layouts: redirects to sign-in when there is no valid, verified session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session?.user.emailVerified) {
    return redirect({ href: '/sign-in', locale: await getLocale() });
  }
  return session;
}

/** For auth pages: signed-in users have no business there. */
export async function requireGuest(): Promise<void> {
  if (await getSession()) {
    redirect({ href: '/dashboard', locale: await getLocale() });
  }
}

/** For Server Actions / data functions: throw instead of redirecting. */
export async function getSessionOrThrow(): Promise<Session> {
  const session = await getSession();
  if (!session?.user.emailVerified) throw new AuthenticationError();
  return session;
}
```

📄 **Create `src/data/with-auth.ts`:**

```ts
import 'server-only';
import { getSessionOrThrow, type Session } from './session';

/** Wrap an action handler so it only runs for authenticated users: `createAction(schema, withAuth(handler))`. */
export function withAuth<Input, Result>(
  handler: (input: Input, context: { session: Session }) => Promise<Result>,
) {
  return async (input: Input): Promise<Result> =>
    handler(input, { session: await getSessionOrThrow() });
}
```

> 🔎 Banned users (Sprint 4) will be rejected in these same functions — one place to harden.

### 5. The optimistic proxy

📄 **Rewrite `src/proxy.ts`:**

```ts
import { getSessionCookie } from 'better-auth/cookies';
import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from './i18n/routing';
import { buildSignInRedirect, isProtectedPath, splitLocale } from './libs/route-guard';

const intlMiddleware = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { path } = splitLocale(pathname);

  // ⚠️ OPTIMISTIC: only checks that a session cookie EXISTS (ADR-003).
  // The real validation happens in src/data/session.ts on every page and action.
  if (isProtectedPath(path) && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL(buildSignInRedirect(pathname, search), request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};
```

> 🔍 If you need a custom cookie name/prefix later, pass the same options to `getSessionCookie(request, { cookiePrefix })`.

Update ADR-003 — append a consequence line to `docs/adr/003-*.md`: _"Every `page.tsx` under `(app)` calls `requireSession()` (enforced by a test, S2-T11); layouts alone are not a guard."_

### ✅ Verify

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm knip
```

Knip: `src/data/*` aren't imported by pages yet — add `'src/data/**/*.ts'` to the temporary `entry` list (removed in S2-T11).

Manual: `pnpm dev`, open `/dashboard` while signed out → redirected to `/sign-in?callbackUrl=%2Fdashboard` (page is still the S1 placeholder, which is fine). `/fr/dashboard` → `/fr/sign-in?callbackUrl=%2Ffr%2Fdashboard`.

**🚢 Ship** — branch `feat/s2-t10-session-guard` · message: `feat(auth): add session data-access layer and optimistic proxy guard`

---

## 🎫 S2-T06 — Sign-up page and form

**Branch:** `feat/s2-t06-sign-up` · **Story:** US-022 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t06-sign-up
mkdir -p src/components/auth src/hooks
```

### 1. All authentication strings (one patch for the whole sprint)

Later tickets only _use_ these keys. Edit both files:

📄 **`src/locales/en.json`** — (a) in `nav` add `"account": "Account"`; (b) in `dashboard` add `"welcome": "Welcome back, {name}"`; (c) add these keys to `validation`:

```json
    "passwordMin": "Password must be at least 12 characters",
    "passwordMax": "Password must be at most 128 characters",
    "passwordComplexity": "Use upper and lower case letters and a number",
    "passwordMismatch": "Passwords do not match",
    "confirmPhrase": "Type the exact confirmation word"
```

(d) **replace** the whole `auth` object and add a new top-level `account` object:

```json
  "auth": {
    "signIn": {
      "title": "Welcome back",
      "description": "Sign in to your account",
      "email": "Email",
      "password": "Password",
      "submit": "Sign in",
      "forgot": "Forgot your password?",
      "noAccount": "Don't have an account?",
      "signUpLink": "Sign up"
    },
    "signUp": {
      "title": "Create your account",
      "description": "Start in less than a minute",
      "name": "Name",
      "email": "Email",
      "password": "Password",
      "confirmPassword": "Confirm password",
      "submit": "Create account",
      "haveAccount": "Already have an account?",
      "signInLink": "Sign in",
      "strengthLabel": "Password strength",
      "strength": { "veryWeak": "Very weak", "weak": "Weak", "fair": "Fair", "good": "Good", "strong": "Strong" }
    },
    "checkEmail": {
      "title": "Check your email",
      "description": "We sent a verification link to {email}. Click it to activate your account.",
      "resend": "Resend email",
      "resent": "Verification email sent again.",
      "cooldown": "Resend available in {seconds}s",
      "wrongEmail": "Use a different email"
    },
    "verify": {
      "successTitle": "Email verified",
      "successDescription": "Your email is confirmed and you're signed in.",
      "signInDescription": "Your email is confirmed. Sign in to continue.",
      "signIn": "Sign in",
      "continue": "Continue to dashboard",
      "errorTitle": "This link is invalid or expired",
      "errorDescription": "Enter your email and we'll send you a new verification link.",
      "email": "Email",
      "resendSubmit": "Send a new link",
      "resendSent": "If the address is registered, a new link is on its way."
    },
    "forgot": {
      "title": "Forgot your password?",
      "description": "Enter your email and we'll send you a reset link.",
      "email": "Email",
      "submit": "Send reset link",
      "sentTitle": "Check your inbox",
      "sentDescription": "If an account exists for {email}, a reset link is on its way. It expires in 1 hour.",
      "back": "Back to sign in"
    },
    "reset": {
      "title": "Choose a new password",
      "description": "Use at least 12 characters.",
      "newPassword": "New password",
      "confirmPassword": "Confirm new password",
      "submit": "Reset password",
      "success": "Password updated. You can now sign in.",
      "invalidTitle": "This reset link is invalid or expired",
      "invalidDescription": "Request a new link to continue.",
      "requestNew": "Request a new link"
    },
    "userMenu": {
      "menuLabel": "Account menu",
      "account": "Account",
      "signOut": "Sign out",
      "signedInAs": "Signed in as"
    },
    "errors": {
      "invalidCredentials": "Invalid email or password.",
      "emailNotVerified": "Please verify your email first. We just sent you a new link.",
      "userExists": "We couldn't create your account. If you already have one, sign in or reset your password.",
      "invalidToken": "This link is invalid or expired.",
      "wrongPassword": "Your current password is incorrect.",
      "freshRequired": "For your security, please sign out and sign in again, then retry."
    }
  },
  "account": {
    "nav": { "profile": "Profile", "security": "Security" },
    "profile": {
      "title": "Profile",
      "description": "Update your personal information.",
      "name": "Name",
      "save": "Save changes",
      "saved": "Profile updated."
    },
    "email": {
      "title": "Email address",
      "description": "Your current email is {email}. Changing it requires confirmation.",
      "newEmail": "New email",
      "submit": "Change email",
      "sent": "Check your inbox to confirm the change."
    },
    "password": {
      "title": "Password",
      "description": "Choose a strong password you don't use elsewhere.",
      "current": "Current password",
      "new": "New password",
      "confirm": "Confirm new password",
      "revokeOthers": "Sign me out of other devices",
      "submit": "Change password",
      "changed": "Password changed."
    },
    "sessions": {
      "title": "Active sessions",
      "description": "Devices currently signed in to your account.",
      "current": "This device",
      "revoke": "Revoke",
      "revokeOthers": "Sign out other devices",
      "lastActive": "Last active {date}",
      "revoked": "Session revoked.",
      "empty": "No other active sessions."
    },
    "danger": {
      "title": "Delete account",
      "description": "Permanently delete your account and all associated data. This cannot be undone.",
      "button": "Delete my account",
      "confirmTitle": "Are you absolutely sure?",
      "confirmDescription": "Type {phrase} and enter your password to confirm.",
      "phrase": "DELETE",
      "phraseLabel": "Confirmation",
      "password": "Password",
      "submit": "Permanently delete",
      "cancel": "Cancel",
      "deleted": "Your account has been deleted."
    }
  }
```

📄 **`src/locales/fr.json`** — same edits in French: `nav.account` = `"Compte"`; `dashboard.welcome` = `"Bon retour, {name}"`; `validation`:

```json
    "passwordMin": "Le mot de passe doit contenir au moins 12 caractères",
    "passwordMax": "Le mot de passe ne doit pas dépasser 128 caractères",
    "passwordComplexity": "Utilisez des majuscules, des minuscules et un chiffre",
    "passwordMismatch": "Les mots de passe ne correspondent pas",
    "confirmPhrase": "Saisissez exactement le mot de confirmation"
```

and the `auth` + `account` objects:

```json
  "auth": {
    "signIn": {
      "title": "Content de vous revoir",
      "description": "Connectez-vous à votre compte",
      "email": "E-mail",
      "password": "Mot de passe",
      "submit": "Se connecter",
      "forgot": "Mot de passe oublié ?",
      "noAccount": "Pas encore de compte ?",
      "signUpLink": "S'inscrire"
    },
    "signUp": {
      "title": "Créez votre compte",
      "description": "Démarrez en moins d'une minute",
      "name": "Nom",
      "email": "E-mail",
      "password": "Mot de passe",
      "confirmPassword": "Confirmer le mot de passe",
      "submit": "Créer le compte",
      "haveAccount": "Vous avez déjà un compte ?",
      "signInLink": "Se connecter",
      "strengthLabel": "Robustesse du mot de passe",
      "strength": { "veryWeak": "Très faible", "weak": "Faible", "fair": "Moyen", "good": "Bon", "strong": "Fort" }
    },
    "checkEmail": {
      "title": "Vérifiez votre e-mail",
      "description": "Nous avons envoyé un lien de vérification à {email}. Cliquez dessus pour activer votre compte.",
      "resend": "Renvoyer l'e-mail",
      "resent": "E-mail de vérification renvoyé.",
      "cooldown": "Renvoi possible dans {seconds} s",
      "wrongEmail": "Utiliser un autre e-mail"
    },
    "verify": {
      "successTitle": "E-mail vérifié",
      "successDescription": "Votre e-mail est confirmé et vous êtes connecté.",
      "signInDescription": "Votre e-mail est confirmé. Connectez-vous pour continuer.",
      "signIn": "Se connecter",
      "continue": "Aller au tableau de bord",
      "errorTitle": "Ce lien est invalide ou a expiré",
      "errorDescription": "Saisissez votre e-mail et nous vous enverrons un nouveau lien de vérification.",
      "email": "E-mail",
      "resendSubmit": "Envoyer un nouveau lien",
      "resendSent": "Si l'adresse est enregistrée, un nouveau lien est en route."
    },
    "forgot": {
      "title": "Mot de passe oublié ?",
      "description": "Saisissez votre e-mail et nous vous enverrons un lien de réinitialisation.",
      "email": "E-mail",
      "submit": "Envoyer le lien",
      "sentTitle": "Consultez votre boîte mail",
      "sentDescription": "Si un compte existe pour {email}, un lien de réinitialisation est en route. Il expire dans 1 heure.",
      "back": "Retour à la connexion"
    },
    "reset": {
      "title": "Choisissez un nouveau mot de passe",
      "description": "Utilisez au moins 12 caractères.",
      "newPassword": "Nouveau mot de passe",
      "confirmPassword": "Confirmer le nouveau mot de passe",
      "submit": "Réinitialiser le mot de passe",
      "success": "Mot de passe mis à jour. Vous pouvez maintenant vous connecter.",
      "invalidTitle": "Ce lien de réinitialisation est invalide ou a expiré",
      "invalidDescription": "Demandez un nouveau lien pour continuer.",
      "requestNew": "Demander un nouveau lien"
    },
    "userMenu": {
      "menuLabel": "Menu du compte",
      "account": "Compte",
      "signOut": "Se déconnecter",
      "signedInAs": "Connecté en tant que"
    },
    "errors": {
      "invalidCredentials": "E-mail ou mot de passe invalide.",
      "emailNotVerified": "Veuillez d'abord vérifier votre e-mail. Nous venons de vous envoyer un nouveau lien.",
      "userExists": "Nous n'avons pas pu créer votre compte. Si vous en avez déjà un, connectez-vous ou réinitialisez votre mot de passe.",
      "invalidToken": "Ce lien est invalide ou a expiré.",
      "wrongPassword": "Votre mot de passe actuel est incorrect.",
      "freshRequired": "Pour votre sécurité, déconnectez-vous puis reconnectez-vous, et réessayez."
    }
  },
  "account": {
    "nav": { "profile": "Profil", "security": "Sécurité" },
    "profile": {
      "title": "Profil",
      "description": "Mettez à jour vos informations personnelles.",
      "name": "Nom",
      "save": "Enregistrer",
      "saved": "Profil mis à jour."
    },
    "email": {
      "title": "Adresse e-mail",
      "description": "Votre e-mail actuel est {email}. Le modifier nécessite une confirmation.",
      "newEmail": "Nouvel e-mail",
      "submit": "Changer d'e-mail",
      "sent": "Consultez votre boîte mail pour confirmer le changement."
    },
    "password": {
      "title": "Mot de passe",
      "description": "Choisissez un mot de passe robuste que vous n'utilisez nulle part ailleurs.",
      "current": "Mot de passe actuel",
      "new": "Nouveau mot de passe",
      "confirm": "Confirmer le nouveau mot de passe",
      "revokeOthers": "Me déconnecter des autres appareils",
      "submit": "Changer le mot de passe",
      "changed": "Mot de passe modifié."
    },
    "sessions": {
      "title": "Sessions actives",
      "description": "Appareils actuellement connectés à votre compte.",
      "current": "Cet appareil",
      "revoke": "Révoquer",
      "revokeOthers": "Déconnecter les autres appareils",
      "lastActive": "Dernière activité {date}",
      "revoked": "Session révoquée.",
      "empty": "Aucune autre session active."
    },
    "danger": {
      "title": "Supprimer le compte",
      "description": "Supprime définitivement votre compte et toutes les données associées. Cette action est irréversible.",
      "button": "Supprimer mon compte",
      "confirmTitle": "Êtes-vous absolument sûr ?",
      "confirmDescription": "Saisissez {phrase} et votre mot de passe pour confirmer.",
      "phrase": "SUPPRIMER",
      "phraseLabel": "Confirmation",
      "password": "Mot de passe",
      "submit": "Supprimer définitivement",
      "cancel": "Annuler",
      "deleted": "Votre compte a été supprimé."
    }
  }
```

```bash
pnpm test        # the locale parity test must pass: both files must have identical keys
```

### 2. Validation schemas (Zod messages are i18n keys)

📄 **Create `src/validations/auth.ts`:**

```ts
import { z } from 'zod';

const email = z.email({ message: 'validation.email' });
const name = z.string().trim().min(2, { message: 'validation.nameMin' });

export const newPassword = z
  .string()
  .min(12, { message: 'validation.passwordMin' })
  .max(128, { message: 'validation.passwordMax' })
  .regex(/[a-z]/, { message: 'validation.passwordComplexity' })
  .regex(/[A-Z]/, { message: 'validation.passwordComplexity' })
  .regex(/\d/, { message: 'validation.passwordComplexity' });

const required = z.string().min(1, { message: 'validation.required' });

function matching<T extends { confirmPassword: string }>(
  data: T,
  field: Exclude<keyof T, 'confirmPassword'>,
) {
  return data[field] === data.confirmPassword;
}

export const signUpSchema = z
  .object({ name, email, password: newPassword, confirmPassword: required })
  .refine((data) => matching(data, 'password'), {
    path: ['confirmPassword'],
    message: 'validation.passwordMismatch',
  });

export const signInSchema = z.object({ email, password: required });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: required })
  .refine((data) => matching(data, 'password'), {
    path: ['confirmPassword'],
    message: 'validation.passwordMismatch',
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

📄 **Create `src/validations/auth.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { signInSchema, signUpSchema } from './auth';

const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'Str0ng-Passw0rd',
  confirmPassword: 'Str0ng-Passw0rd',
};

const messagesFor = (input: unknown, field: string) => {
  const result = signUpSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.filter((i) => i.path[0] === field).map((i) => i.message);
};

describe('signUpSchema', () => {
  it('accepts valid input', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects short, simple and mismatching passwords with translation keys', () => {
    expect(
      messagesFor({ ...valid, password: 'Short1', confirmPassword: 'Short1' }, 'password'),
    ).toContain('validation.passwordMin');
    expect(
      messagesFor(
        { ...valid, password: 'alllowercase123', confirmPassword: 'alllowercase123' },
        'password',
      ),
    ).toContain('validation.passwordComplexity');
    expect(
      messagesFor({ ...valid, confirmPassword: 'Different-Passw0rd' }, 'confirmPassword'),
    ).toEqual(['validation.passwordMismatch']);
  });

  it('rejects invalid email and short name', () => {
    expect(messagesFor({ ...valid, email: 'nope' }, 'email')).toEqual(['validation.email']);
    expect(messagesFor({ ...valid, name: 'A' }, 'name')).toEqual(['validation.nameMin']);
  });
});

it('signInSchema only requires a non-empty password (no policy leak at sign-in)', () => {
  expect(signInSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
});
```

### 3. Password strength

📄 **Create `src/utils/password-strength.ts`:**

```ts
export type PasswordScore = 0 | 1 | 2 | 3 | 4;

/** Rough UX hint (not a security control — the schema + Better Auth enforce the policy). */
export function scorePassword(password: string): PasswordScore {
  if (!password || /^(.)\1+$/.test(password)) return 0;

  let points = 0;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^A-Za-z0-9]/.test(password)) points += 1;

  return Math.min(points, 4) as PasswordScore;
}
```

📄 **Create `src/utils/password-strength.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { scorePassword } from './password-strength';

it('scores weak to strong', () => {
  expect(scorePassword('')).toBe(0);
  expect(scorePassword('aaaaaaaaaaaaaaaa')).toBe(0);
  expect(scorePassword('short')).toBe(0);
  expect(scorePassword('Str0ngPassw0rd')).toBeGreaterThanOrEqual(3);
  expect(scorePassword('Str0ng-Passw0rd-Is-Long!')).toBe(4);
});
```

### 4. Error key mapping and the cooldown hook

📄 **Create `src/libs/auth-error-keys.ts`** (client-safe — no server imports):

```ts
const KEYS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'auth.errors.invalidCredentials',
  EMAIL_NOT_VERIFIED: 'auth.errors.emailNotVerified',
  // Deliberately vague: never confirm that an email is registered
  USER_ALREADY_EXISTS: 'auth.errors.userExists',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'auth.errors.userExists',
  INVALID_TOKEN: 'auth.errors.invalidToken',
  TOKEN_EXPIRED: 'auth.errors.invalidToken',
  INVALID_PASSWORD: 'auth.errors.wrongPassword',
  PASSWORD_TOO_SHORT: 'validation.passwordMin',
  PASSWORD_TOO_LONG: 'validation.passwordMax',
  SESSION_EXPIRED: 'auth.errors.freshRequired',
  SESSION_NOT_FRESH: 'auth.errors.freshRequired',
};

type AuthClientError = { code?: string | undefined; status?: number | undefined };

/** Maps a Better Auth client error to a full i18n key. */
export function authErrorKey(error: AuthClientError | null | undefined): string {
  if (error?.status === 429) return 'errors.rateLimited';
  const key = error?.code ? KEYS[error.code] : undefined;
  return key ?? 'errors.internal';
}
```

📄 **Create `src/libs/auth-error-keys.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { authErrorKey } from './auth-error-keys';

it('maps known codes, rate limits and unknown errors', () => {
  expect(authErrorKey({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 })).toBe(
    'auth.errors.invalidCredentials',
  );
  expect(authErrorKey({ code: 'EMAIL_NOT_VERIFIED', status: 403 })).toBe(
    'auth.errors.emailNotVerified',
  );
  expect(authErrorKey({ status: 429 })).toBe('errors.rateLimited');
  expect(authErrorKey({ code: 'SOMETHING_NEW', status: 500 })).toBe('errors.internal');
  expect(authErrorKey(null)).toBe('errors.internal');
});
```

📄 **Create `src/hooks/use-cooldown.ts`:**

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

/** Counts down from `seconds` after `start()`. Used for "resend email" buttons. */
export function useCooldown(seconds: number, startActive = false) {
  const [remaining, setRemaining] = useState(startActive ? seconds : 0);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);

  return { remaining, start };
}
```

### 5. Components

📄 **Create `src/components/auth/password-strength.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useWatch } from 'react-hook-form';

import { cn } from '@/utils/cn';
import { scorePassword } from '@/utils/password-strength';

const LABELS = ['veryWeak', 'weak', 'fair', 'good', 'strong'] as const;
const COLORS = [
  'bg-destructive',
  'bg-destructive',
  'bg-yellow-500',
  'bg-green-500',
  'bg-green-600',
] as const;

export function PasswordStrength({ name }: { name: string }) {
  const t = useTranslations('auth.signUp');
  const value = useWatch({ name }) as string | undefined;
  const score = scorePassword(value ?? '');

  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn('h-1 flex-1 rounded', index < score ? COLORS[score] : 'bg-muted')}
          />
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {t('strengthLabel')}: {t(`strength.${LABELS[score]}`)}
      </p>
    </div>
  );
}
```

📄 **Create `src/components/auth/check-email.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useCooldown } from '@/hooks/use-cooldown';
import { authClient } from '@/libs/AuthClient';

type Props = { email: string; callbackURL: string; onChangeEmail?: () => void };

export function CheckEmail({ email, callbackURL, onChangeEmail }: Props) {
  const t = useTranslations('auth.checkEmail');
  const { remaining, start } = useCooldown(60, true); // a mail was just sent
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    // Same response whether or not the address exists — never reveal account state
    await authClient.sendVerificationEmail({ email, callbackURL });
    setMessage(t('resent'));
    start();
  }

  return (
    <div className="space-y-4 text-center" role="status">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{t('description', { email })}</p>
      <Button variant="outline" onClick={resend} disabled={remaining > 0}>
        {remaining > 0 ? t('cooldown', { seconds: remaining }) : t('resend')}
      </Button>
      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {onChangeEmail ? (
        <Button variant="link" size="sm" onClick={onChangeEmail}>
          {t('wrongEmail')}
        </Button>
      ) : null}
    </div>
  );
}
```

📄 **Create `src/components/auth/sign-up-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { CheckEmail } from '@/components/auth/check-email';
import { PasswordStrength } from '@/components/auth/password-strength';
import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { getPathname } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { type SignUpInput, signUpSchema } from '@/validations/auth';

export function SignUpForm() {
  const t = useTranslations('auth.signUp');
  const locale = useLocale();
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  // After clicking the email link the user lands on our own /verify-email page
  const callbackURL = getPathname({ href: '/verify-email', locale });

  async function onSubmit(values: SignUpInput) {
    setFormError(null);
    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      callbackURL,
    });

    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    setSubmittedEmail(values.email);
  }

  if (submittedEmail) {
    return (
      <CheckEmail
        email={submittedEmail}
        callbackURL={callbackURL}
        onChangeEmail={() => setSubmittedEmail(null)}
      />
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="name" label={t('name')} autoComplete="name" />
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <div className="space-y-2">
          <PasswordField name="password" label={t('password')} autoComplete="new-password" />
          <PasswordStrength name="password" />
        </div>
        <PasswordField
          name="confirmPassword"
          label={t('confirmPassword')}
          autoComplete="new-password"
        />
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
```

Remove the temporary Knip entries for `src/components/forms/password-field.tsx` and `src/libs/AuthClient.ts` (both are used now).

### 6. The page

📄 **Rewrite `src/app/[locale]/(auth)/sign-up/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SignUpForm } from '@/components/auth/sign-up-form';
import { requireGuest } from '@/data/session';
import { Link } from '@/i18n/navigation';

export default async function SignUpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuest();
  const t = await getTranslations('auth.signUp');

  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <SignUpForm />
      <p className="text-muted-foreground text-center text-sm">
        {t('haveAccount')}{' '}
        <Link href="/sign-in" className="text-foreground underline">
          {t('signInLink')}
        </Link>
      </p>
    </>
  );
}
```

### 7. Component test (browser mode)

📄 **Create `src/components/auth/sign-up-form.test.tsx`:**

```tsx
import { beforeEach, expect, test, vi } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';
import { SignUpForm } from './sign-up-form';

const signUpEmail = vi.hoisted(() => vi.fn());
vi.mock('@/libs/AuthClient', () => ({
  authClient: { signUp: { email: signUpEmail }, sendVerificationEmail: vi.fn() },
}));

beforeEach(() => signUpEmail.mockReset());

async function fill(
  screen: Awaited<ReturnType<typeof renderWithIntl>>,
  password: string,
  confirm: string,
) {
  await screen.getByLabelText('Name', { exact: true }).fill('Ada Lovelace');
  await screen.getByLabelText('Email', { exact: true }).fill('ada@example.com');
  await screen.getByLabelText('Password', { exact: true }).fill(password);
  await screen.getByLabelText('Confirm password', { exact: true }).fill(confirm);
  await screen.getByRole('button', { name: 'Create account' }).click();
}

test('shows a mismatch error and does not call the API', async () => {
  const screen = await renderWithIntl(<SignUpForm />);
  await fill(screen, 'Str0ng-Passw0rd', 'Different-Passw0rd');

  await expect.element(screen.getByText('Passwords do not match')).toBeVisible();
  expect(signUpEmail).not.toHaveBeenCalled();
});

test('shows the "check your email" screen after a successful sign-up', async () => {
  signUpEmail.mockResolvedValue({ data: { user: {} }, error: null });
  const screen = await renderWithIntl(<SignUpForm />);
  await fill(screen, 'Str0ng-Passw0rd', 'Str0ng-Passw0rd');

  await expect.element(screen.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  expect(signUpEmail).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'ada@example.com', callbackURL: '/verify-email' }),
  );
});

test('shows a generic error when the API refuses', async () => {
  signUpEmail.mockResolvedValue({
    data: null,
    error: { code: 'USER_ALREADY_EXISTS', status: 422 },
  });
  const screen = await renderWithIntl(<SignUpForm />);
  await fill(screen, 'Str0ng-Passw0rd', 'Str0ng-Passw0rd');

  await expect.element(screen.getByText(/couldn't create your account/i)).toBeVisible();
});
```

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check
pnpm dev
```

Open `/sign-up` (and `/fr/sign-up`):

1. Submit empty → translated errors, focus on the first field.
2. Type a password → the strength bar and label update live.
3. Submit valid data → **Check your email**; the terminal prints the email with the verification link, and `.emails/` contains a JSON file.
4. Check the DB (`pnpm db:studio`): a `user` row with `email_verified = false`, **no** `session` row.
5. Sign up again with the same email → generic error text (no "email already registered").

**🚢 Ship** — branch `feat/s2-t06-sign-up` · message: `feat(auth): add sign-up form with password strength and email confirmation screen`

---

## 🎫 S2-T07 — Email verification flow

**Branch:** `feat/s2-t07-verify-email` · **Story:** US-022 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t07-verify-email
```

### 1. Resend form (expired / invalid link)

📄 **Create `src/components/auth/resend-verification-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { getPathname } from '@/i18n/navigation';
import { authClient } from '@/libs/AuthClient';
import { type ForgotPasswordInput, forgotPasswordSchema } from '@/validations/auth';

export function ResendVerificationForm() {
  const t = useTranslations('auth.verify');
  const locale = useLocale();
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit({ email }: ForgotPasswordInput) {
    await authClient.sendVerificationEmail({
      email,
      callbackURL: getPathname({ href: '/verify-email', locale }),
    });
    setSent(true); // identical outcome for unknown addresses
  }

  if (sent)
    return (
      <p className="text-sm text-green-600" role="status">
        {t('resendSent')}
      </p>
    );

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <SubmitButton className="w-full">{t('resendSubmit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
```

> 🔎 We reuse `forgotPasswordSchema` (just `{ email }`) — no new schema needed.

### 2. The page

Better Auth redirects to our `callbackURL` after the user clicks the link: **success** → session cookie set (auto sign-in) and no query; **failure** → `?error=invalid_token` (or similar).

📄 **Create `src/app/[locale]/(auth)/verify-email/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ResendVerificationForm } from '@/components/auth/resend-verification-form';
import { Button } from '@/components/ui/button';
import { getSession } from '@/data/session';
import { Link } from '@/i18n/navigation';

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { error } = await searchParams;
  const t = await getTranslations('auth.verify');

  if (error) {
    return (
      <>
        <header className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">{t('errorTitle')}</h1>
          <p className="text-muted-foreground text-sm">{t('errorDescription')}</p>
        </header>
        <ResendVerificationForm />
      </>
    );
  }

  // Verified. Auto sign-in normally gives us a session; if not, ask the user to sign in.
  const session = await getSession();

  return (
    <div className="space-y-4 text-center">
      <h1 className="text-xl font-semibold">{t('successTitle')}</h1>
      <p className="text-muted-foreground text-sm">
        {session ? t('successDescription') : t('signInDescription')}
      </p>
      <Button asChild className="w-full">
        {session ? (
          <Link href="/dashboard">{t('continue')}</Link>
        ) : (
          <Link href="/sign-in">{t('signIn')}</Link>
        )}
      </Button>
    </div>
  );
}
```

> ℹ️ This page intentionally does **not** call `requireGuest()`: right after verification the user _is_ signed in.

### ✅ Verify

```bash
pnpm dev
```

1. Sign up → copy the link from the terminal (or `.emails/*.json` → `links`) → open it → **Email verified** → **Continue to dashboard**.
2. Studio: `user.email_verified = true`, one `session` row.
3. Open the **same link again** → error state (token is single-use) with the resend form.
4. Tamper with `token=` in the URL → error state.
5. Sign up, wait / change `expiresIn` temporarily to `5` seconds → link expired → error state. Revert.

```bash
pnpm check
```

**🚢 Ship** — branch `feat/s2-t07-verify-email` · message: `feat(auth): add email verification landing page and resend form`

---

## 🎫 S2-T08 — Sign-in and sign-out

**Branch:** `feat/s2-t08-sign-in-out` · **Story:** US-023 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t08-sign-in-out
```

### 1. Sign-in form

📄 **Create `src/components/auth/sign-in-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Link, getPathname } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { type SignInInput, signInSchema } from '@/validations/auth';

/** `callbackUrl` is already sanitised by the page and includes the locale prefix. */
export function SignInForm({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations('auth.signIn');
  const locale = useLocale();
  const router = useRouter(); // next/navigation: callbackUrl is a full path (with locale)
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit({ email, password }: SignInInput) {
    setFormError(null);
    const { error } = await authClient.signIn.email({ email, password });

    if (error) {
      if (error.code === 'EMAIL_NOT_VERIFIED') {
        // Send a fresh link whose callback is our verification page
        await authClient.sendVerificationEmail({
          email,
          callbackURL: getPathname({ href: '/verify-email', locale }),
        });
      }
      setFormError(authErrorKey(error)); // generic for bad credentials — no user enumeration
      return;
    }

    router.push(callbackUrl);
    router.refresh(); // re-run server components with the new session
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <PasswordField name="password" label={t('password')} autoComplete="current-password" />
        <div className="text-end text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground underline"
          >
            {t('forgot')}
          </Link>
        </div>
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
```

> 🔒 Why no `callbackURL` in `signIn.email`? We navigate ourselves with the already-sanitised value. Letting the SDK redirect would mean trusting another layer with an attacker-controlled string.

### 2. The page (with `callbackUrl` sanitising)

📄 **Rewrite `src/app/[locale]/(auth)/sign-in/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { SignInForm } from '@/components/auth/sign-in-form';
import { requireGuest } from '@/data/session';
import { Link, getPathname } from '@/i18n/navigation';
import { sanitizeCallbackUrl } from '@/utils/safe-redirect';

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuest();

  const { callbackUrl } = await searchParams;
  const destination = sanitizeCallbackUrl(callbackUrl, getPathname({ href: '/dashboard', locale }));
  const t = await getTranslations('auth.signIn');

  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <SignInForm callbackUrl={destination} />
      <p className="text-muted-foreground text-center text-sm">
        {t('noAccount')}{' '}
        <Link href="/sign-up" className="text-foreground underline">
          {t('signUpLink')}
        </Link>
      </p>
    </>
  );
}
```

### 3. User menu with sign-out

📄 **Rewrite `src/components/layout/user-menu.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Link, useRouter } from '@/i18n/navigation';
import { authClient } from '@/libs/AuthClient';

type Props = { user: { name: string; email: string } };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function UserMenu({ user }: Props) {
  const t = useTranslations('auth.userMenu');
  const router = useRouter();

  async function signOut() {
    await authClient.signOut(); // invalidates the session server-side and clears the cookie
    router.replace('/');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t('menuLabel')} className="rounded-full">
        <Avatar className="size-8">
          <AvatarFallback>{initials(user.name) || '?'}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-muted-foreground text-xs">{t('signedInAs')}</p>
          <p className="truncate text-sm font-medium">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account/profile">{t('account')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>{t('signOut')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

(The "Account" link 404s until S2-T12.)

### 4. The app layout reads the session

📄 **Rewrite `src/app/[locale]/(app)/layout.tsx`:**

```tsx
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { MobileNav, type NavLink } from '@/components/layout/mobile-nav';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';
import { requireSession } from '@/data/session';
import { Link } from '@/i18n/navigation';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession(); // cached per request; pages call it too
  const t = await getTranslations();

  const links: readonly NavLink[] = [{ href: '/dashboard', label: t('nav.dashboard') }];

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-e p-4 md:block">
        <p className="mb-6 font-semibold">{t('common.appName')}</p>
        <nav className="flex flex-col gap-2 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <MobileNav links={links} />
          <span className="text-muted-foreground text-sm">{t('nav.workspace')}</span>
          <div className="ms-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu user={{ name: user.name, email: user.email }} />
          </div>
        </header>
        <main id="main" className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

### ✅ Verify

```bash
pnpm dev
```

1. Sign in with `demo@example.com` / `Demo-Password-123` (from `pnpm db:seed`) → lands on `/dashboard`; the header shows an avatar with initials.
2. Wrong password → "Invalid email or password." (same text for an unknown email).
3. Sign up a new user but **don't verify**, then sign in → "Please verify your email first…" and a **new email** appears in the terminal.
4. Open the avatar menu → **Sign out** → back on `/`; `/dashboard` redirects to sign-in. In Studio the `session` row is gone (server-side invalidation).
5. `http://localhost:3000/sign-in?callbackUrl=https://evil.example` → sign in → you land on `/dashboard`, **not** on evil.example.
6. While signed in, visit `/sign-in` → redirected to `/dashboard`.
7. DevTools → Application → Cookies: the session cookie is `HttpOnly`, `SameSite=Lax` (and `Secure` in production builds).

**🚢 Ship** — branch `feat/s2-t08-sign-in-out` · message: `feat(auth): add sign-in, sign-out and session-aware app layout`

---

## 🎫 S2-T09 — Forgot / reset password

**Branch:** `feat/s2-t09-password-reset` · **Story:** US-024 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t09-password-reset
```

### 1. Notify the user when the password changes

📄 **Edit `src/libs/Auth.ts`** — import `sendPasswordChangedEmail` and add inside `emailAndPassword`:

```ts
      // 🔍 `onPasswordReset` exists in recent versions; check the docs for your version
      onPasswordReset: async ({ user }, request) => {
        runInBackground(() => sendPasswordChangedEmail({ user, request }));
      },
```

### 2. Forms

📄 **Create `src/components/auth/forgot-password-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Button } from '@/components/ui/button';
import { Link, getPathname } from '@/i18n/navigation';
import { authClient } from '@/libs/AuthClient';
import { type ForgotPasswordInput, forgotPasswordSchema } from '@/validations/auth';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const locale = useLocale();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit({ email }: ForgotPasswordInput) {
    // 🔍 Older versions call this `authClient.forgetPassword`
    await authClient.requestPasswordReset({
      email,
      redirectTo: getPathname({ href: '/reset-password', locale }),
    });
    setSentTo(email); // ALWAYS the same confirmation → no account enumeration
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center" role="status">
        <h1 className="text-xl font-semibold">{t('sentTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('sentDescription', { email: sentTo })}</p>
        <Button asChild variant="outline">
          <Link href="/sign-in">{t('back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
```

📄 **Create `src/components/auth/reset-password-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { PasswordStrength } from '@/components/auth/password-strength';
import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { type ResetPasswordInput, resetPasswordSchema } from '@/validations/auth';

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth.reset');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  async function onSubmit({ password }: ResetPasswordInput) {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });

    if (error) {
      setFormError(authErrorKey(error));
      return;
    }

    toast.success(t('success'));
    router.replace('/sign-in');
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <div className="space-y-2">
          <PasswordField name="password" label={t('newPassword')} autoComplete="new-password" />
          <PasswordStrength name="password" />
        </div>
        <PasswordField
          name="confirmPassword"
          label={t('confirmPassword')}
          autoComplete="new-password"
        />
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
```

> 🔎 `PasswordStrength` reads its label from `auth.signUp.*` — that's fine, it's a shared widget.

### 3. Pages

📄 **Create `src/app/[locale]/(auth)/forgot-password/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { requireGuest } from '@/data/session';
import { Link } from '@/i18n/navigation';

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuest();
  const t = await getTranslations('auth.forgot');

  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <ForgotPasswordForm />
      <p className="text-center text-sm">
        <Link href="/sign-in" className="text-muted-foreground hover:text-foreground underline">
          {t('back')}
        </Link>
      </p>
    </>
  );
}
```

📄 **Create `src/app/[locale]/(auth)/reset-password/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token, error } = await searchParams;
  const t = await getTranslations('auth.reset');

  // Better Auth redirects here with ?token=… on success, or ?error=INVALID_TOKEN
  if (!token || error) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">{t('invalidTitle')}</h1>
        <p className="text-muted-foreground text-sm">{t('invalidDescription')}</p>
        <Button asChild>
          <Link href="/forgot-password">{t('requestNew')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <ResetPasswordForm token={token} />
    </>
  );
}
```

### 4. Integration tests with the real auth stack (in-memory DB)

📄 **Create `tests/utils/auth.ts`:**

```ts
import { expect, vi } from 'vitest';

import type { createAuth } from '@/libs/Auth';
import { extractLinks } from '@/libs/email/console-transport';
import type { MemoryTransport } from '@/libs/email/memory-transport';
import type { EmailMessage } from '@/libs/email/types';

export type TestAuth = ReturnType<typeof createAuth>;
export const TEST_PASSWORD = 'Str0ng-Passw0rd-Test!';

export function firstLink(message: EmailMessage | undefined): string {
  const link = extractLinks(message?.text ?? '')[0];
  if (!link) throw new Error('No link found in email');
  return link;
}

/** Verification links use ?token=…, reset links use /reset-password/<token>. */
export function tokenFromLink(link: string): string {
  const url = new URL(link);
  return url.searchParams.get('token') ?? url.pathname.split('/').pop() ?? '';
}

/** Turns Set-Cookie headers of a response into a Cookie header for the next call. */
export function cookieHeaderFrom(response: Response): Headers {
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  return new Headers({ cookie });
}

export async function signUpAndVerify(auth: TestAuth, transport: MemoryTransport, email: string) {
  await auth.api.signUpEmail({ body: { name: 'Test User', email, password: TEST_PASSWORD } });
  await vi.waitFor(() => expect(transport.last(email)).toBeDefined());

  await auth.api.verifyEmail({ query: { token: tokenFromLink(firstLink(transport.last(email))) } });
  transport.clear();
}

export async function signIn(auth: TestAuth, email: string, password = TEST_PASSWORD) {
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  return { response, headers: cookieHeaderFrom(response) };
}
```

📄 **Create `tests/integration/auth.test.ts`:**

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { session, user } from '@/db/schema';
import { createAuth } from '@/libs/Auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import { firstLink, signIn, signUpAndVerify, TEST_PASSWORD, tokenFromLink } from '../utils/auth';
import { createTestDb, type TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
const transport = new MemoryTransport();
let counter = 0;
const nextEmail = () => `user${Date.now()}-${++counter}@example.com`;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
  auth = createAuth(db);
  setEmailTransport(transport);
}, 30_000);

afterAll(async () => {
  setEmailTransport(undefined);
  await destroy();
});

beforeEach(() => transport.clear());

describe('sign-up and email verification', () => {
  it('creates an UNVERIFIED user, sends a link and creates no session', async () => {
    const email = nextEmail();
    await auth.api.signUpEmail({ body: { name: 'Ada', email, password: TEST_PASSWORD } });
    await vi.waitFor(() => expect(transport.last(email)).toBeDefined());

    const [row] = await db.select().from(user).where(eq(user.email, email));
    expect(row?.emailVerified).toBe(false);
    expect(await db.select().from(session).where(eq(session.userId, row!.id))).toHaveLength(0);
    expect(firstLink(transport.last(email))).toContain('/api/auth/verify-email');
  });

  it('blocks sign-in until the email is verified, then allows it', async () => {
    const email = nextEmail();
    await auth.api.signUpEmail({ body: { name: 'Ada', email, password: TEST_PASSWORD } });
    await vi.waitFor(() => expect(transport.last(email)).toBeDefined());

    // 🔍 APIError shape (status/body.code) can differ slightly between versions
    await expect(
      auth.api.signInEmail({ body: { email, password: TEST_PASSWORD } }),
    ).rejects.toMatchObject({ body: { code: 'EMAIL_NOT_VERIFIED' } });

    await auth.api.verifyEmail({
      query: { token: tokenFromLink(firstLink(transport.last(email))) },
    });

    const { response } = await signIn(auth, email);
    expect(response.status).toBe(200);
  });

  it('rejects a wrong password with a generic error', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);

    await expect(
      auth.api.signInEmail({ body: { email, password: 'Wrong-Passw0rd-123' } }),
    ).rejects.toMatchObject({ body: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
  });
});

describe('password reset', () => {
  it('sends a single-use link, changes the password and revokes every session', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);
    await signIn(auth, email); // a session that the reset must kill

    // 🔍 Older versions: auth.api.forgetPassword
    await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } });
    await vi.waitFor(() => expect(transport.last(email)).toBeDefined());
    const token = tokenFromLink(firstLink(transport.last(email)));

    const newPassword = 'Brand-New-Passw0rd!';
    await auth.api.resetPassword({ body: { newPassword, token } });

    const [row] = await db.select().from(user).where(eq(user.email, email));
    expect(await db.select().from(session).where(eq(session.userId, row!.id))).toHaveLength(0);

    // old password dead, new one works
    await expect(
      auth.api.signInEmail({ body: { email, password: TEST_PASSWORD } }),
    ).rejects.toThrow();
    expect((await signIn(auth, email, newPassword)).response.status).toBe(200);

    // the token cannot be reused
    await expect(
      auth.api.resetPassword({ body: { newPassword: 'Another-Passw0rd-1', token } }),
    ).rejects.toThrow();
  });

  it('answers identically for unknown emails and sends nothing', async () => {
    await auth.api.requestPasswordReset({
      body: { email: nextEmail(), redirectTo: '/reset-password' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(transport.outbox).toHaveLength(0);
  });
});
```

> 🔍 These tests touch Better Auth's server API directly. If a method name differs in your version (e.g. `forgetPassword`), fix the name — the **assertions** (unverified → blocked, token single-use, sessions revoked) are the contract that must keep holding.

### ✅ Verify

```bash
pnpm test                     # integration tests included (first run may take a few seconds)
pnpm dev
```

Manual flow:

1. `/forgot-password` → enter `demo@example.com` → "Check your inbox" → link in the terminal.
2. Enter an **unknown** email → exactly the same confirmation, and **no** email in the terminal.
3. Open the link → `/reset-password?token=…` → choose a new password (weak ones are rejected) → toast → sign in works with the new password only.
4. Reuse the same link → "This reset link is invalid or expired".
5. A "Password changed" email is printed after the reset.
6. In Studio, all other `session` rows of that user disappeared.
7. Run `pnpm db:reset` afterwards to restore the demo password.

```bash
pnpm check
```

**🚢 Ship** — branch `feat/s2-t09-password-reset` · message: `feat(auth): add forgot and reset password flow with integration tests`

---

## 🎫 S2-T11 — Protected dashboard and guard tests

**Branch:** `feat/s2-t11-protected-dashboard` · **Story:** US-025 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t11-protected-dashboard
```

### 1. The dashboard page calls the guard itself

📄 **Rewrite `src/app/[locale]/(app)/dashboard/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageHeader } from '@/components/layout/page-header';
import { requireSession } from '@/data/session';

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Authoritative check — do NOT rely on the layout or the proxy (ADR-003)
  const { user } = await requireSession();
  const t = await getTranslations('dashboard');

  return <PageHeader title={t('title')} description={t('welcome', { name: user.name })} />;
}
```

Remove the temporary `'src/data/**/*.ts'` Knip entry — everything in `src/data` is imported now (if `getSessionOrThrow`/`withAuth` are flagged as unused exports, they're consumed in S2-T12; keep the entry until then).

### 2. Unit tests for the guards — **without** the proxy

📄 **Create `src/data/session.test.ts`:**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError } from '@/libs/errors';

const getSessionMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((target: unknown) => {
    throw new Error(`REDIRECT:${JSON.stringify(target)}`);
  }),
);

vi.mock('@/libs/Auth', () => ({ auth: { api: { getSession: getSessionMock } } }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'fr' }));
vi.mock('@/i18n/navigation', () => ({ redirect: redirectMock }));

import { getSessionOrThrow, requireGuest, requireSession } from './session';
import { withAuth } from './with-auth';

const verified = {
  user: { id: 'u1', name: 'Ada', email: 'ada@example.com', emailVerified: true },
  session: { id: 's1' },
};

beforeEach(() => {
  getSessionMock.mockReset();
  redirectMock.mockClear();
});

describe('requireSession (no proxy involved)', () => {
  it('redirects to sign-in, in the visitor’s locale, when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow('REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith({ href: '/sign-in', locale: 'fr' });
  });

  it('treats an expired/invalid session (null from Better Auth) like no session', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow('REDIRECT');
  });

  it('rejects sessions of unverified users', async () => {
    getSessionMock.mockResolvedValue({
      ...verified,
      user: { ...verified.user, emailVerified: false },
    });
    await expect(requireSession()).rejects.toThrow('REDIRECT');
  });

  it('returns the session when valid', async () => {
    getSessionMock.mockResolvedValue(verified);
    await expect(requireSession()).resolves.toMatchObject({ user: { id: 'u1' } });
  });
});

describe('requireGuest', () => {
  it('redirects signed-in users to the dashboard', async () => {
    getSessionMock.mockResolvedValue(verified);
    await expect(requireGuest()).rejects.toThrow('REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith({ href: '/dashboard', locale: 'fr' });
  });

  it('lets guests through', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(requireGuest()).resolves.toBeUndefined();
  });
});

describe('getSessionOrThrow / withAuth', () => {
  it('throws AuthenticationError without a session', async () => {
    getSessionMock.mockResolvedValue(null);
    await expect(getSessionOrThrow()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('withAuth never runs the handler for anonymous callers', async () => {
    getSessionMock.mockResolvedValue(null);
    const handler = vi.fn();
    await expect(withAuth(handler)({ a: 1 })).rejects.toBeInstanceOf(AuthenticationError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('withAuth passes the session to the handler', async () => {
    getSessionMock.mockResolvedValue(verified);
    const handler = vi.fn(async (input: { a: number }, ctx: { session: unknown }) => ({
      input,
      ctx,
    }));
    const result = await withAuth(handler)({ a: 1 });
    expect(result.input).toEqual({ a: 1 });
    expect(result.ctx.session).toBe(verified);
  });
});
```

### 3. "Every protected page calls a guard" — enforced by a test (risk R-05)

📄 **Create `src/data/guard-coverage.test.ts`:**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

const PROTECTED_ROOT = path.join('src', 'app', '[locale]', '(app)');

it('every page under (app) calls requireSession() itself', () => {
  const pages = (readdirSync(PROTECTED_ROOT, { recursive: true }) as string[])
    .filter((file) => file.endsWith('page.tsx'))
    .map((file) => path.join(PROTECTED_ROOT, file));

  expect(pages.length).toBeGreaterThan(0);

  const unguarded = pages.filter(
    (file) => !/require(Session|Admin)\(/.test(readFileSync(file, 'utf8')),
  );

  // Layouts are NOT re-rendered on client navigations — a layout-only guard is not a guard.
  expect(unguarded, `Pages without a guard:\n${unguarded.join('\n')}`).toEqual([]);
});
```

> 🔎 When Sprint 4 adds `requireAdmin()` for `(admin)` pages, extend this test with a second root.

### ✅ Verify

```bash
pnpm test
```

Mutation check (proves the test has teeth): remove the `requireSession()` line from the dashboard page → `pnpm test` fails listing that file → restore it.

Browser check: sign in, open `/dashboard` → "Welcome back, Demo User". Delete the session cookie in DevTools and reload → redirected to sign-in. **Forge** a cookie (`better-auth.session_token=fake`) and reload → the **proxy lets you through (cookie present) but the page still redirects to sign-in** — that's the authoritative layer doing its job.

**🚢 Ship** — branch `feat/s2-t11-protected-dashboard` · message: `feat(auth): guard dashboard with authoritative session checks and tests`

---

## 🎫 S2-T12 — Profile and change password

**Branch:** `feat/s2-t12-profile-password` · **Story:** US-026 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t12-profile-password
mkdir -p src/components/account "src/app/[locale]/(app)/dashboard/account/profile" "src/app/[locale]/(app)/dashboard/account/security"
```

### 1. Server Actions can now return field errors from `AppError`s

`createAction` (Sprint 1) dropped `fieldErrors` carried by `ValidationError`. Fix it:

📄 **Edit `src/utils/action.ts`** — import `ValidationError` and replace the `AppError` branch:

```ts
import { AppError, ValidationError } from '@/libs/errors';
```

```ts
if (error instanceof AppError) {
  return {
    ok: false,
    error: {
      code: error.code,
      messageKey: error.messageKey,
      ...(error instanceof ValidationError && error.fieldErrors
        ? { fieldErrors: error.fieldErrors }
        : {}),
    },
  };
}
```

📄 **Add a test to `src/utils/action.test.ts`:**

```ts
import { ConflictError, ValidationError } from '@/libs/errors';

it('forwards field errors thrown as ValidationError', async () => {
  const action = createAction(schema, async () => {
    throw new ValidationError({ fieldErrors: { currentPassword: ['auth.errors.wrongPassword'] } });
  });
  expect(await action({ email: 'a@b.co' })).toEqual({
    ok: false,
    error: {
      code: 'VALIDATION_ERROR',
      messageKey: 'errors.validation',
      fieldErrors: { currentPassword: ['auth.errors.wrongPassword'] },
    },
  });
});
```

(Merge the import with the existing `ConflictError` import.)

### 2. Schemas

📄 **Edit `src/validations/auth.ts`** — export the small building blocks at the bottom:

```ts
export { email as emailField, name as nameField, required as requiredField };
```

📄 **Create `src/validations/account.ts`:**

```ts
import { z } from 'zod';

import { emailField, nameField, newPassword, requiredField } from './auth';

export const updateProfileSchema = z.object({ name: nameField });

export const changePasswordSchema = z
  .object({
    currentPassword: requiredField,
    newPassword,
    confirmPassword: requiredField,
    revokeOtherSessions: z.boolean(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordMismatch',
  });

export const changeEmailSchema = z.object({ newEmail: emailField });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
```

> If Zod complains that `refine` makes `.shape` unavailable — we don't use `.shape`, so nothing to change.

### 3. Server-side helpers

📄 **Create `src/data/request.ts`** — rebuild a `Request` from the current headers (so emails sent from actions pick the visitor's language):

```ts
import 'server-only';
import { headers } from 'next/headers';

import { Env } from '@/libs/Env';

export async function currentRequest(): Promise<Request> {
  return new Request(Env.NEXT_PUBLIC_APP_URL, { headers: new Headers(await headers()) });
}
```

📄 **Create `src/libs/auth-api-errors.ts`:**

```ts
import 'server-only';
import { APIError } from 'better-auth/api';

import {
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  ValidationError,
} from '@/libs/errors';

/** Turns Better Auth server errors into our AppError types (anything else is returned unchanged). */
export function mapAuthApiError(error: unknown): unknown {
  if (!(error instanceof APIError)) return error;

  const code = typeof error.body?.code === 'string' ? error.body.code : undefined;

  if (code === 'INVALID_PASSWORD') {
    return new ValidationError({
      fieldErrors: { currentPassword: ['auth.errors.wrongPassword'] },
      cause: error,
    });
  }
  if (code === 'PASSWORD_TOO_SHORT') {
    return new ValidationError({
      fieldErrors: { newPassword: ['validation.passwordMin'] },
      cause: error,
    });
  }
  if (code === 'PASSWORD_TOO_LONG') {
    return new ValidationError({
      fieldErrors: { newPassword: ['validation.passwordMax'] },
      cause: error,
    });
  }

  switch (error.statusCode) {
    case 401:
      return new AuthenticationError({ cause: error });
    case 403:
      return new AuthorizationError({ cause: error });
    case 429:
      return new RateLimitError({ cause: error });
    default:
      return error;
  }
}
```

> 🔍 `APIError` exposes `statusCode` and `body.code` in current versions; adjust if yours differ.

### 4. The Server Action (password change + notification email)

📄 **Create `src/actions/account.ts`:**

```ts
'use server';

import { headers } from 'next/headers';

import { currentRequest } from '@/data/request';
import { withAuth } from '@/data/with-auth';
import { auth } from '@/libs/Auth';
import { mapAuthApiError } from '@/libs/auth-api-errors';
import { sendPasswordChangedEmail } from '@/libs/auth-emails';
import { createAction } from '@/utils/action';
import { runInBackground } from '@/utils/background';
import { changePasswordSchema } from '@/validations/account';

const handleChangePassword = createAction(
  changePasswordSchema,
  withAuth(async (input, { session }) => {
    try {
      await auth.api.changePassword({
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: input.revokeOtherSessions,
        },
        headers: await headers(),
      });
    } catch (error) {
      throw mapAuthApiError(error);
    }

    const request = await currentRequest();
    runInBackground(() => sendPasswordChangedEmail({ user: session.user, request }));
    return { changed: true as const };
  }),
);

export async function changePassword(input: unknown) {
  return handleChangePassword(input);
}
```

> 🔎 Why a Server Action and not the client SDK? We need a **server-side side effect** (notification email) and want `createAction`'s typed errors. The client SDK is used where Better Auth alone is enough.

### 5. A helper to show action errors in forms

📄 **Create `src/utils/form-errors.ts`:**

```ts
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import type { ActionError } from '@/utils/action';

/** Puts field errors under their inputs; returns the key for a form-level error (or null). */
export function applyActionError<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: ActionError,
): string | null {
  if (!error.fieldErrors) return error.messageKey;

  for (const [field, keys] of Object.entries(error.fieldErrors)) {
    const key = keys[0];
    if (key) form.setError(field as Path<T>, { message: key });
  }
  return null;
}
```

### 6. Components

📄 **Create `src/components/account/profile-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { type UpdateProfileInput, updateProfileSchema } from '@/validations/account';

export function ProfileForm({ name }: { name: string }) {
  const t = useTranslations('account.profile');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name },
  });

  async function onSubmit(values: UpdateProfileInput) {
    setFormError(null);
    const { error } = await authClient.updateUser({ name: values.name });
    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    toast.success(t('saved'));
    router.refresh(); // header + dashboard show the new name
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="name" label={t('name')} autoComplete="name" />
        <SubmitButton>{t('save')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
```

📄 **Create `src/components/account/change-password-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { changePassword } from '@/actions/account';
import { PasswordStrength } from '@/components/auth/password-strength';
import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { applyActionError } from '@/utils/form-errors';
import { type ChangePasswordInput, changePasswordSchema } from '@/validations/account';

export function ChangePasswordForm() {
  const t = useTranslations('account.password');
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      revokeOtherSessions: true,
    },
  });

  async function onSubmit(values: ChangePasswordInput) {
    setFormError(null);
    const result = await changePassword(values);

    if (result.ok) {
      toast.success(t('changed'));
      form.reset();
      return;
    }
    setFormError(applyActionError(form, result.error));
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <PasswordField
          name="currentPassword"
          label={t('current')}
          autoComplete="current-password"
        />
        <div className="space-y-2">
          <PasswordField name="newPassword" label={t('new')} autoComplete="new-password" />
          <PasswordStrength name="newPassword" />
        </div>
        <PasswordField name="confirmPassword" label={t('confirm')} autoComplete="new-password" />
        <Controller
          control={form.control}
          name="revokeOtherSessions"
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <Checkbox
                id="revoke-other-sessions"
                name={field.name}
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                aria-invalid={fieldState.invalid}
              />
              <FieldLabel htmlFor="revoke-other-sessions" className="font-normal">
                {t('revokeOthers')}
              </FieldLabel>
            </Field>
          )}
        />
        <SubmitButton>{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
```

📄 **Create `src/components/account/account-nav.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/utils/cn';

const ITEMS = [
  { href: '/dashboard/account/profile', key: 'profile' },
  { href: '/dashboard/account/security', key: 'security' },
] as const;

export function AccountNav() {
  const t = useTranslations('account.nav');
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm',
            pathname === item.href
              ? 'border-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground border-transparent',
          )}
        >
          {t(item.key)}
        </Link>
      ))}
    </nav>
  );
}
```

### 7. Layout and pages

📄 **Create `src/app/[locale]/(app)/dashboard/account/layout.tsx`:**

```tsx
import type { ReactNode } from 'react';

import { AccountNav } from '@/components/account/account-nav';

// NOT a guard: each page below calls requireSession() itself.
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <AccountNav />
      {children}
    </div>
  );
}
```

📄 **Create `src/app/[locale]/(app)/dashboard/account/profile/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ProfileForm } from '@/components/account/profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/data/session';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireSession();
  const t = await getTranslations('account.profile');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileForm name={user.name} />
      </CardContent>
    </Card>
  );
}
```

📄 **Create `src/app/[locale]/(app)/dashboard/account/security/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ChangePasswordForm } from '@/components/account/change-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireSession } from '@/data/session';

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations('account.password');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
```

Add an **Account** link to the sidebar in `(app)/layout.tsx`:

```tsx
const links: readonly NavLink[] = [
  { href: '/dashboard', label: t('nav.dashboard') },
  { href: '/dashboard/account/profile', label: t('nav.account') },
];
```

Remove the remaining temporary Knip entry for `src/data/**/*.ts` (everything is consumed).

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check
pnpm dev
```

Sign in as the demo user:

1. **Profile:** change the name → toast; the avatar initials and dashboard greeting update.
2. **Security → password:** wrong current password → error **under** "Current password"; weak new password → translated policy errors; mismatch → error under confirmation.
3. Valid change (leave "sign me out of other devices" ticked) → toast; a "Your password was changed" email is printed; sign out and sign in with the new password works, the old one doesn't. (`pnpm db:reset` restores the demo password.)
4. Open `/fr/dashboard/account/security` → everything in French.
5. Signed out, open `/dashboard/account/profile` → redirected to sign-in with the callback.

**🚢 Ship** — branch `feat/s2-t12-profile-password` · message: `feat(account): add profile editing and password change with notification email`

---

## 🎫 S2-T13 — Change email and session management

**Branch:** `feat/s2-t13-email-sessions` · **Story:** US-026 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t13-email-sessions
```

### 1. Change email (profile page)

📄 **Create `src/components/account/change-email-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { getPathname } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { type ChangeEmailInput, changeEmailSchema } from '@/validations/account';

export function ChangeEmailForm() {
  const t = useTranslations('account.email');
  const locale = useLocale();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '' },
  });

  async function onSubmit({ newEmail }: ChangeEmailInput) {
    setFormError(null);
    // 🔍 Flow depends on the version: confirmation to the CURRENT address first, then a
    // verification link to the NEW one. Test it end to end and adapt the copy if needed.
    const { error } = await authClient.changeEmail({
      newEmail,
      callbackURL: getPathname({ href: '/dashboard/account/profile', locale }),
    });

    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    toast.success(t('sent'));
    form.reset();
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="newEmail" label={t('newEmail')} type="email" autoComplete="email" />
        <SubmitButton>{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
```

📄 **Edit the profile page** — add a second card under the first (import `ChangeEmailForm`):

```tsx
<Card>
  <CardHeader>
    <CardTitle>{tEmail('title')}</CardTitle>
    <CardDescription>{tEmail('description', { email: user.email })}</CardDescription>
  </CardHeader>
  <CardContent>
    <ChangeEmailForm />
  </CardContent>
</Card>
```

with `const tEmail = await getTranslations('account.email');` and wrap both cards in `<div className="space-y-6">`.

### 2. A tiny user-agent describer (no dependency)

📄 **Create `src/utils/user-agent.ts`:**

```ts
/** "Chrome on Windows". Deliberately simple — it's a hint for recognising your own devices. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';

  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';

  return `${browser} on ${os}`;
}
```

📄 **Create `src/utils/user-agent.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { describeUserAgent } from './user-agent';

it.each([
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    'Chrome on Windows',
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0',
    'Edge on Windows',
  ],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    'Safari on macOS',
  ],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox on Linux'],
  [null, 'Unknown device'],
])('describes %s', (ua, expected) => {
  expect(describeUserAgent(ua)).toBe(expected);
});
```

### 3. Session data for the page (tokens never leave the server)

📄 **Create `src/data/sessions.ts`:**

```ts
import 'server-only';
import { headers } from 'next/headers';

import { auth } from '@/libs/Auth';
import { describeUserAgent } from '@/utils/user-agent';

import { requireSession } from './session';

export type SessionSummary = {
  id: string;
  device: string;
  ip: string | null;
  updatedAt: string;
  current: boolean;
};

/** The signed-in user's active sessions, WITHOUT their secret tokens. */
export async function listUserSessions(): Promise<SessionSummary[]> {
  const { session: currentSession } = await requireSession();
  const sessions = await auth.api.listSessions({ headers: await headers() });

  return sessions
    .map((item) => ({
      id: item.id,
      device: describeUserAgent(item.userAgent),
      ip: item.ipAddress ?? null,
      updatedAt: new Date(item.updatedAt).toISOString(),
      current: item.id === currentSession.id,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}
```

### 4. Actions: revoke by **id** (the token is resolved server-side)

📄 **Append to `src/actions/account.ts`:**

```ts
import { z } from 'zod';

import { NotFoundError } from '@/libs/errors';

const handleRevokeSession = createAction(
  z.object({ sessionId: z.string().min(1) }),
  withAuth(async ({ sessionId }) => {
    const requestHeaders = await headers();
    const sessions = await auth.api.listSessions({ headers: requestHeaders });

    // Only sessions of the CURRENT user are listed → other users' ids simply "don't exist"
    const target = sessions.find((item) => item.id === sessionId);
    if (!target) throw new NotFoundError();

    try {
      await auth.api.revokeSession({ body: { token: target.token }, headers: requestHeaders });
    } catch (error) {
      throw mapAuthApiError(error);
    }
    return { revoked: true as const };
  }),
);

export async function revokeSession(input: unknown) {
  return handleRevokeSession(input);
}

const handleRevokeOthers = createAction(
  z.object({}),
  withAuth(async () => {
    try {
      await auth.api.revokeOtherSessions({ headers: await headers() });
    } catch (error) {
      throw mapAuthApiError(error);
    }
    return { revoked: true as const };
  }),
);

export async function revokeOtherSessions() {
  return handleRevokeOthers({});
}
```

(Merge the `zod`/`errors` imports with the existing ones at the top of the file.)

### 5. The sessions card

📄 **Create `src/components/account/sessions-list.tsx`:**

```tsx
'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { revokeOtherSessions, revokeSession } from '@/actions/account';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SessionSummary } from '@/data/sessions';
import { useRouter } from '@/i18n/navigation';

export function SessionsList({ sessions }: { sessions: SessionSummary[] }) {
  const t = useTranslations('account.sessions');
  const tErrors = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: boolean; error?: { messageKey: string } }>) {
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        toast.success(t('revoked'));
        router.refresh();
      } else if (result.error) {
        toast.error(
          tErrors.has(result.error.messageKey as never)
            ? tErrors(result.error.messageKey as never)
            : tErrors('errors.internal'),
        );
      }
    });
  }

  const others = sessions.filter((item) => !item.current);

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-md border">
        {sessions.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                {item.device}
                {item.current ? <Badge variant="secondary">{t('current')}</Badge> : null}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {item.ip ? `${item.ip} · ` : ''}
                {t('lastActive', {
                  date: format.dateTime(new Date(item.updatedAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
              </p>
            </div>
            {item.current ? null : (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(() => revokeSession({ sessionId: item.id }))}
              >
                {t('revoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {others.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => revokeOtherSessions())}
        >
          {t('revokeOthers')}
        </Button>
      )}
    </div>
  );
}
```

📄 **Edit `security/page.tsx`** — add the card (import `SessionsList` and `listUserSessions`):

```tsx
const sessions = await listUserSessions();
const tSessions = await getTranslations('account.sessions');
// …inside the returned <div className="space-y-6">, after the password card:
<Card>
  <CardHeader>
    <CardTitle>{tSessions('title')}</CardTitle>
    <CardDescription>{tSessions('description')}</CardDescription>
  </CardHeader>
  <CardContent>
    <SessionsList sessions={sessions} />
  </CardContent>
</Card>;
```

### 6. Make the DAL truly authoritative: bypass the cookie cache

Better Auth's `cookieCache` stores a signed copy of the session in a cookie so repeated reads skip the database — which also means a **revoked** session could still look valid for up to 5 minutes. For our guard that's unacceptable:

📄 **Edit `src/data/session.ts`:**

```ts
export const getSession = cache(async () =>
  // 🔍 disableCookieCache: always validate against the database (revocation takes effect immediately)
  auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } }),
);
```

(`cache()` still dedupes the lookup to **one query per request**.)

### 7. Integration tests: revocation, expiry, ownership

📄 **Create `tests/integration/account.test.ts`:**

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { session, user } from '@/db/schema';
import { createAuth } from '@/libs/Auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import { signIn, signUpAndVerify } from '../utils/auth';
import { createTestDb, type TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
const transport = new MemoryTransport();
let counter = 0;
const nextEmail = () => `acct${Date.now()}-${++counter}@example.com`;
const fresh = { query: { disableCookieCache: true } } as const;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
  auth = createAuth(db);
  setEmailTransport(transport);
}, 30_000);
afterAll(async () => {
  setEmailTransport(undefined);
  await destroy();
});
beforeEach(() => transport.clear());

describe('sessions', () => {
  it('revoking a session removes it and kills that device immediately', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);
    const laptop = await signIn(auth, email);
    const phone = await signIn(auth, email);

    const sessions = await auth.api.listSessions({ headers: laptop.headers });
    expect(sessions.length).toBeGreaterThanOrEqual(2);

    const phoneSession = await auth.api.getSession({ headers: phone.headers, ...fresh });
    await auth.api.revokeSession({
      body: { token: phoneSession!.session.token },
      headers: laptop.headers,
    });

    expect(await auth.api.getSession({ headers: phone.headers, ...fresh })).toBeNull();
    expect(await auth.api.getSession({ headers: laptop.headers, ...fresh })).not.toBeNull();
  });

  it('an expired session is no session', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);
    const device = await signIn(auth, email);

    const current = await auth.api.getSession({ headers: device.headers, ...fresh });
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(session.id, current!.session.id));

    expect(await auth.api.getSession({ headers: device.headers, ...fresh })).toBeNull();
  });

  it('never lists another user’s sessions', async () => {
    const a = nextEmail();
    const b = nextEmail();
    await signUpAndVerify(auth, transport, a);
    await signUpAndVerify(auth, transport, b);
    const deviceA = await signIn(auth, a);
    await signIn(auth, b);

    const listedForA = await auth.api.listSessions({ headers: deviceA.headers });
    const [rowA] = await db.select().from(user).where(eq(user.email, a));
    expect(listedForA.every((item) => item.userId === rowA!.id)).toBe(true);
  });
});
```

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

1. Sign in from **two browsers** (e.g. Edge + Chrome, or one in a private window).
2. In browser A → Security → **Active sessions** lists both; "This device" is marked and has no revoke button.
3. Revoke browser B's session → within one click+reload B is back at sign-in (**immediately**, not after 5 minutes).
4. **Sign out other devices** works; the list then says "No other active sessions".
5. Profile → **Change email**: enter a new address → toast; follow the printed email link(s). After completing the flow the email changes (and the new address must be verified). 🔍 If your version's flow differs, document the observed steps in `docs/guides/auth.md`.

**🚢 Ship** — branch `feat/s2-t13-email-sessions` · message: `feat(account): add change email and active session management`

---

## 🎫 S2-T14 — Delete account _(stretch — P1, may slip)_

**Branch:** `feat/s2-t14-delete-account` · **Story:** US-026 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t14-delete-account
```

### 1. Future hook for organizations

📄 **Edit `src/libs/Auth.ts`:**

```ts
      deleteUser: {
        enabled: true,
        // TODO(Sprint 4): beforeDelete → block (or transfer) when the user is the sole owner
        // of an organization that still has other members.
      },
```

The sessions are already "fresh" for 10 minutes (`session.freshAge`); Better Auth rejects deletion for older sessions, which gives us the **re-authentication** requirement.

### 2. Schema with a **translated** confirmation word

📄 **Append to `src/validations/account.ts`:**

```ts
export function createDeleteAccountSchema(phrase: string) {
  return z
    .object({ confirm: z.string(), password: requiredField })
    .refine((data) => data.confirm.trim() === phrase, {
      path: ['confirm'],
      message: 'validation.confirmPhrase',
    });
}

export type DeleteAccountInput = z.infer<ReturnType<typeof createDeleteAccountSchema>>;
```

### 3. The dialog

📄 **Create `src/components/account/delete-account-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { createDeleteAccountSchema, type DeleteAccountInput } from '@/validations/account';

export function DeleteAccountForm() {
  const t = useTranslations('account.danger');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const phrase = t('phrase');
  const schema = useMemo(() => createDeleteAccountSchema(phrase), [phrase]);

  const form = useForm<DeleteAccountInput>({
    resolver: zodResolver(schema),
    defaultValues: { confirm: '', password: '' },
  });

  async function onSubmit({ password }: DeleteAccountInput) {
    setFormError(null);
    const { error } = await authClient.deleteUser({ password });

    if (error) {
      setFormError(authErrorKey(error)); // includes "please sign in again" for stale sessions
      return;
    }

    toast.success(t('deleted'));
    router.replace('/');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t('button')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
          <DialogDescription>{t('confirmDescription', { phrase })}</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormError messageKey={formError} />
            <TextField name="confirm" label={t('phraseLabel')} autoComplete="off" />
            <PasswordField name="password" label={t('password')} autoComplete="current-password" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <SubmitButton variant="destructive">{t('submit')}</SubmitButton>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
```

📄 **Edit `security/page.tsx`** — add a danger card:

```tsx
const tDanger = await getTranslations('account.danger');
// …
<Card className="border-destructive/50">
  <CardHeader>
    <CardTitle className="text-destructive">{tDanger('title')}</CardTitle>
    <CardDescription>{tDanger('description')}</CardDescription>
  </CardHeader>
  <CardContent>
    <DeleteAccountForm />
  </CardContent>
</Card>;
```

### 4. Cascade test

📄 **Append to `tests/integration/account.test.ts`:**

```ts
import { account } from '@/db/schema';

import { TEST_PASSWORD } from '../utils/auth';

describe('account deletion', () => {
  it('removes the user together with sessions and credentials', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);
    const device = await signIn(auth, email);
    const [row] = await db.select().from(user).where(eq(user.email, email));

    // 🔍 Option shape may differ by version (e.g. requires `password` or a token)
    await auth.api.deleteUser({ body: { password: TEST_PASSWORD }, headers: device.headers });

    expect(await db.select().from(user).where(eq(user.id, row!.id))).toHaveLength(0);
    expect(await db.select().from(session).where(eq(session.userId, row!.id))).toHaveLength(0);
    expect(await db.select().from(account).where(eq(account.userId, row!.id))).toHaveLength(0);
  });
});
```

(Move the two new imports to the top of the file.)

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

1. Create a throw-away account, verify it, open **Security → Delete account**.
2. Wrong confirmation word → error under the first field; wrong password → "current password incorrect"-style error.
3. Correct values → toast, redirect to `/`, and `/dashboard` redirects to sign-in. In Studio the `user`, `session`, `account` rows are gone.
4. Sign in, wait 11+ minutes (or temporarily set `freshAge` to `5` seconds), then try again → "please sign out and sign in again…". Revert.

**🚢 Ship** — branch `feat/s2-t14-delete-account` · message: `feat(account): add account deletion with confirmation and re-authentication`

---

## 🎫 S2-T16 — Auth rate limiting _(done before the E2E suite)_

**Branch:** `feat/s2-t16-rate-limit` · **Story:** US-027 · **1 SP**

```bash
git switch main && git pull && git switch -c feat/s2-t16-rate-limit
```

### 1. Switch + rules

📄 **Edit `src/libs/Env.ts`:**

```ts
    // Better Auth rate limiting. "off" is only for local development.
    AUTH_RATE_LIMIT: z.enum(['on', 'off']).default('on'),
```

```ts
    AUTH_RATE_LIMIT: process.env.AUTH_RATE_LIMIT,
```

`.env.example`: `AUTH_RATE_LIMIT=on` · `.env.development`: `AUTH_RATE_LIMIT=off` · `vitest.config.ts` → `test.env`: `AUTH_RATE_LIMIT: 'off'`.

📄 **Create `src/libs/auth-rate-limit.ts`:**

```ts
/** Per client IP + endpoint, window in seconds. Stricter than the global default on purpose. */
export const AUTH_RATE_LIMIT_RULES = {
  '/sign-in/email': { window: 60, max: 5 },
  '/sign-up/email': { window: 60, max: 5 },
  // 🔍 Route names differ by version — list both until you've confirmed yours in the docs
  '/request-password-reset': { window: 60, max: 3 },
  '/forget-password': { window: 60, max: 3 },
  '/send-verification-email': { window: 60, max: 3 },
} as const;

export const AUTH_RATE_LIMIT_DEFAULT = { window: 60, max: 100 } as const;
```

📄 **Create `src/libs/auth-rate-limit.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { AUTH_RATE_LIMIT_DEFAULT, AUTH_RATE_LIMIT_RULES } from './auth-rate-limit';

it('sensitive endpoints are much stricter than the default', () => {
  for (const rule of Object.values(AUTH_RATE_LIMIT_RULES)) {
    expect(rule.max).toBeLessThanOrEqual(5);
    expect(rule.max).toBeLessThan(AUTH_RATE_LIMIT_DEFAULT.max);
  }
  expect(AUTH_RATE_LIMIT_RULES['/sign-in/email'].max).toBe(5);
});
```

📄 **Edit `src/libs/Auth.ts`** — import the rules and add (before `plugins`):

```ts
    rateLimit: {
      enabled: Env.AUTH_RATE_LIMIT === 'on',
      ...AUTH_RATE_LIMIT_DEFAULT,
      storage: 'database', // works across serverless instances (table: rate_limit)
      customRules: { ...AUTH_RATE_LIMIT_RULES },
    },
```

and extend `advanced`:

```ts
      // Client IP comes from this header. On Vercel it is set by the platform and can't be spoofed;
      // behind your own proxy make sure it overwrites any client-supplied value.
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
```

> 🔍 Check the exact `rateLimit` option names (`customRules`, `storage`) and the `advanced.ipAddress` shape in your version.

Add a note to `docs/guides/auth.md` (created in the wrap-up): _"Per-IP limits only protect against single-source abuse. Arcjet (Sprint 6) adds per-email fingerprinting and bot detection."_

### ✅ Verify

```bash
pnpm test
```

The behaviour is proven by the E2E rate-limit spec in the next ticket. Quick manual check with the limiter on:

```bash
AUTH_RATE_LIMIT=on pnpm dev       # 🪟 cmd.exe: set AUTH_RATE_LIMIT=on&& pnpm dev
```

Submit the sign-in form with a wrong password **6 times in a minute** → the form shows "Too many requests. Please slow down." Wait a minute → works again. Studio → `rate_limit` has rows.

**🚢 Ship** — branch `feat/s2-t16-rate-limit` · message: `feat(auth): add database-backed rate limiting for sensitive endpoints`

---

## 🎫 S2-T15 — Auth E2E suite

**Branch:** `test/s2-t15-auth-e2e` · **Story:** US-027 · **2 SP**

> 🎯 End-to-end through the real UI, the real server and the real database, reading emails from the `.emails/` folder the console transport writes.

```bash
git switch main && git pull && git switch -c test/s2-t15-auth-e2e
mkdir -p e2e/helpers
```

### 1. Playwright config: database + app servers, deterministic env

📄 **Rewrite `playwright.config.ts`:**

```ts
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = 'http://localhost:3000';

// Same settings locally and in CI so tests behave identically
const appEnv = {
  AUTH_RATE_LIMIT: 'on',
  EMAIL_TRANSPORT: 'console', // writes .emails/*.json that the tests read
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: isCI
    ? [
        // CI: fresh embedded database + the PRODUCTION build
        { command: 'pnpm db:server', port: 5433, reuseExistingServer: false, timeout: 120_000 },
        {
          command: 'pnpm build && pnpm start',
          url: baseURL,
          reuseExistingServer: false,
          timeout: 300_000,
          env: appEnv,
        },
      ]
    : // Local: `pnpm dev` already starts the database. Reuses a running dev server if there is one.
      {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
        env: appEnv,
      },
});
```

> 🔎 If you reuse an already running `pnpm dev`, it won't have `EMAIL_TRANSPORT`/`AUTH_RATE_LIMIT` from this config. In development the console transport is the default anyway; the **rate-limit spec only runs with `CI=1`** (see below).

### 2. Helpers

📄 **Create `e2e/helpers/inbox.ts`:**

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('.emails');

export type CapturedEmail = {
  to: string;
  subject: string;
  text: string;
  links: string[];
  createdAt: number;
};

function find(to: string, since: number): CapturedEmail | undefined {
  if (!existsSync(DIR)) return undefined;

  for (const file of readdirSync(DIR).sort().reverse()) {
    try {
      const email = JSON.parse(readFileSync(path.join(DIR, file), 'utf8')) as CapturedEmail;
      if (email.to === to && email.createdAt >= since) return email;
    } catch {
      // file still being written — try again on the next poll
    }
  }
  return undefined;
}

/** Waits for an email to `to` created at/after `since` (ms epoch). */
export async function waitForEmail(
  to: string,
  { since, timeout = 15_000 }: { since: number; timeout?: number },
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const email = find(to, since);
    if (email) return email;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email for ${to} within ${timeout} ms (is EMAIL_TRANSPORT=console?)`);
}
```

📄 **Create `e2e/helpers/users.ts`:**

```ts
import { type APIRequestContext, expect } from '@playwright/test';

import { waitForEmail } from './inbox';

export const PASSWORD = 'Str0ng-Passw0rd-E2E!';

export const randomIp = () =>
  `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;

export const uniqueEmail = () =>
  `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Creates a user through the API (fast). Optionally verifies the email. */
export async function createUser(
  request: APIRequestContext,
  baseURL: string,
  { verify = true } = {},
) {
  const email = uniqueEmail();
  const ip = randomIp();
  const headers = { origin: baseURL, 'x-forwarded-for': ip };
  const since = Date.now();

  const response = await request.post('/api/auth/sign-up/email', {
    data: { name: 'E2E User', email, password: PASSWORD },
    headers,
  });
  expect(response.ok()).toBeTruthy();

  const mail = await waitForEmail(email, { since });
  if (verify) {
    const link = mail.links[0];
    if (!link) throw new Error('Verification email has no link');
    await request.get(link, { headers: { 'x-forwarded-for': ip } });
  }

  return { email, password: PASSWORD };
}
```

📄 **Create `e2e/fixtures.ts`** — every test gets its own client IP, so the per-IP rate limits never interfere between tests:

```ts
import { test as base } from '@playwright/test';

import { randomIp } from './helpers/users';

export const test = base.extend<{ _clientIp: void }>({
  _clientIp: [
    async ({ context }, use) => {
      await context.setExtraHTTPHeaders({ 'x-forwarded-for': randomIp() });
      await use();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
```

### 3. The specs

📄 **Create `e2e/auth.spec.ts`:**

```ts
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { waitForEmail } from './helpers/inbox';
import { createUser, PASSWORD, randomIp, uniqueEmail } from './helpers/users';

async function signInViaUi(page: Page, email: string, password: string) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('sign up → verify → dashboard → sign out → sign in', async ({ page }) => {
  const email = uniqueEmail();
  const since = Date.now();

  await page.goto('/sign-up');
  await page.getByLabel('Name', { exact: true }).fill('Ada Lovelace');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  const mail = await waitForEmail(email, { since });
  await page.goto(mail.links[0]!);

  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();

  await page.getByRole('link', { name: 'Continue to dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Welcome back, Ada Lovelace')).toBeVisible();

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard/);

  await signInViaUi(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('wrong password shows a generic error', async ({ page, request, baseURL }) => {
  const user = await createUser(request, baseURL!);

  await page.goto('/sign-in');
  await signInViaUi(page, user.email, 'Wrong-Passw0rd-123');

  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('an unverified user cannot sign in and gets a new link', async ({
  page,
  request,
  baseURL,
}) => {
  const user = await createUser(request, baseURL!, { verify: false });
  const since = Date.now();

  await page.goto('/sign-in');
  await signInViaUi(page, user.email, user.password);

  await expect(page.getByRole('alert')).toContainText('verify your email');
  const mail = await waitForEmail(user.email, { since });
  expect(mail.subject).toBe('Verify your email address');
});

test('forgot → reset → old password dead, new password works', async ({
  page,
  request,
  baseURL,
}) => {
  const user = await createUser(request, baseURL!);
  const since = Date.now();

  await page.goto('/forgot-password');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  const mail = await waitForEmail(user.email, { since });
  expect(mail.subject).toBe('Reset your password');
  await page.goto(mail.links[0]!);

  await expect(page).toHaveURL(/\/reset-password\?token=/);
  const newPassword = 'Brand-New-Passw0rd-E2E!';
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  await signInViaUi(page, user.email, user.password); // old password
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');

  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('the proxy redirects anonymous visitors and remembers the destination', async ({
  page,
  request,
  baseURL,
}) => {
  const user = await createUser(request, baseURL!);

  await page.goto('/dashboard/account/security');
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fdashboard%2Faccount%2Fsecurity/);

  await signInViaUi(page, user.email, user.password);
  await expect(page).toHaveURL(/\/dashboard\/account\/security$/);
});

test('callbackUrl pointing to another site is ignored', async ({ page, request, baseURL }) => {
  const user = await createUser(request, baseURL!);

  await page.goto('/sign-in?callbackUrl=https%3A%2F%2Fevil.example%2Fphish');
  await signInViaUi(page, user.email, user.password);

  await expect(page).toHaveURL(/localhost:3000\/dashboard$/);
});

test('the French experience: page and email', async ({ page }) => {
  const email = uniqueEmail();
  const since = Date.now();

  await page.goto('/fr/sign-up');
  await expect(page.getByRole('heading', { name: 'Créez votre compte' })).toBeVisible();

  await page.getByLabel('Nom', { exact: true }).fill('Ada Lovelace');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer le compte' }).click();

  await expect(page.getByRole('heading', { name: 'Vérifiez votre e-mail' })).toBeVisible();
  const mail = await waitForEmail(email, { since });
  expect(mail.subject).toBe('Vérifiez votre adresse e-mail');
});

test('repeated failed sign-ins are rate limited', async ({ request, baseURL }) => {
  test.skip(
    !process.env.CI,
    'Rate limiting is off in local dev. Run against a production build with: CI=1 pnpm e2e',
  );

  const headers = { origin: baseURL!, 'x-forwarded-for': randomIp() };
  const statuses: number[] = [];

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const response = await request.post('/api/auth/sign-in/email', {
      data: { email: 'nobody@example.com', password: 'Wrong-Passw0rd-123' },
      headers,
    });
    statuses.push(response.status());
  }

  expect(statuses[0]).not.toBe(429);
  expect(statuses).toContain(429);
});
```

> 🔎 Why `request` (API) to create users instead of the UI? It makes tests **fast and independent**: only `auth.spec.ts` exercises the sign-up/sign-in UI end to end. Sprint 5 adds reusable `storageState` fixtures.

### ✅ Verify

```bash
pnpm e2e                         # local: uses (or starts) `pnpm dev`; the rate-limit test is skipped
```

Now reproduce **exactly what CI does** (stop any running `pnpm dev` first so ports 3000 and 5433 are free):

```bash
CI=1 pnpm e2e                    # 🪟 Git Bash syntax; cmd.exe: set CI=1&& pnpm e2e
```

All 8 auth specs + the 5 smoke specs pass, including the rate-limit one.

Sabotage checks (revert after each):

- Remove `requireGuest()` from the sign-in page → no spec fails (guests aren't affected) — but remove `requireSession()` from the dashboard page **and** the cookie-forgery step in S2-T11 shows the hole; the guard-coverage unit test catches it first.
- Change the French heading in `fr.json` → the French spec fails.

CI: the `E2E` job already runs `pnpm e2e`; with `CI=true` Playwright starts the embedded DB and the production build by itself. Push the branch and confirm all 5 jobs are green.

**🚢 Ship** — branch `test/s2-t15-auth-e2e` · message: `test(e2e): add authentication end-to-end suite with email inbox helper`

---

## 🧾 Sprint 2 wrap-up

**Branch:** `docs/s2-wrap-up`

```bash
git switch main && git pull && git switch -c docs/s2-wrap-up
```

### 1. Auth guide

📄 **Create `docs/guides/auth.md`:**

```markdown
# Authentication (Better Auth)

## Flows

| Flow                    | Where                                                       |
| ----------------------- | ----------------------------------------------------------- |
| Sign up → verify email  | `/sign-up` → email link → `/verify-email`                   |
| Sign in / out           | `/sign-in`, avatar menu                                     |
| Forgot / reset password | `/forgot-password` → email link → `/reset-password`         |
| Account                 | `/dashboard/account/profile`, `/dashboard/account/security` |

## Layers (never skip the second one)

1. `src/proxy.ts` — optimistic: redirects when there is **no session cookie**.
2. `src/data/session.ts` — authoritative: `requireSession()` in **every** protected page, `withAuth()` in every Server Action. Bypasses Better Auth's cookie cache so revocation is immediate.

## Environment

| Variable | Notes |
| --- | --- |
| `BETTER_AUTH_SECRET` | ≥ 32 chars. `pnpm setup:env` generates one into `.env.local` |
| `NEXT_PUBLIC_APP_URL` | Base URL used in email links and as the trusted origin |
| `EMAIL_FROM`, `RESEND_API_KEY`, `EMAIL_TRANSPORT` | See `docs/guides/email.md` below |
| `AUTH_RATE_LIMIT` | `on` (default) / `off` (local dev only) |

## Email

- Dev: links are printed in the terminal and stored in `.emails/` (git-ignored).
- Production: set `RESEND_API_KEY` and verify your sending domain (SPF, DKIM, DMARC).
- Production **refuses** to start sending without a transport instead of silently dropping mail.

## Security notes

- Passwords: min 12 chars (policy in `src/validations/auth.ts`), hashed by Better Auth.
- No account enumeration: identical responses for sign-up conflicts, forgot-password and resend.
- Post-login redirects only accept same-origin relative paths (`sanitizeCallbackUrl`).
- Sessions are revoked on password reset; users can revoke others from the Security page.
- Per-IP rate limits only stop single-source abuse; Arcjet (Sprint 6) adds bot detection.

## Changing the schema

After adding a Better Auth plugin: `pnpm auth:schema`, copy changes into `src/db/schema/auth.ts`, `pnpm db:generate`, commit the migration.
```

### 2. Update `AGENTS.md`

**Commands** — add:

```markdown
- `pnpm setup:env` — generates `.env.local` with a random `BETTER_AUTH_SECRET`
- `pnpm auth:schema` — regenerate the Better Auth schema reference after plugin changes
- `pnpm email:dev` — preview email templates
```

**Structure** — add:

```markdown
src/data/ data-access layer: session guards (requireSession, withAuth), tenant helpers later src/hooks/ client hooks src/templates/emails/ React Email templates src/libs/email/ email transports src/libs/Auth.ts (server only) · AuthClient.ts (browser)
```

**Security** — add:

```markdown
- EVERY `page.tsx` under `src/app/[locale]/(app)` calls `requireSession()`; Server Actions use `withAuth()`. A layout is never a guard (enforced by `src/data/guard-coverage.test.ts`).
- Never import `@/libs/Auth` in client code — use `@/libs/AuthClient`. Never read tokens/hashes in components.
- Post-login redirects go through `sanitizeCallbackUrl`. Auth errors shown to users stay generic.
```

```bash
pnpm check:agents
```

### 3. Update `docs/roadmap/06-project-state.md`

- **Last completed sprint:** Sprint 2 · **Current sprint:** Sprint 3
- **Tables:** `user`, `session`, `account`, `verification`, `rate_limit` (migrations `0001_…`)
- **Env vars:** `BETTER_AUTH_SECRET`, `EMAIL_FROM`, `RESEND_API_KEY`, `EMAIL_TRANSPORT`, `AUTH_RATE_LIMIT`
- **Routes:** `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password`, `/dashboard`, `/dashboard/account/profile`, `/dashboard/account/security`, `/api/auth/*`
- **Helpers:** `requireSession`, `requireGuest`, `getSessionOrThrow`, `withAuth`, `sendEmail`, `runInBackground`, `createAuth(db)`, `sanitizeCallbackUrl`, `applyActionError`
- **Demo user:** `demo@example.com` / `Demo-Password-123` (seed, dev only)
- **Deviations:** no `BETTER_AUTH_URL`; no dev-email HTTP route (E2E reads `.emails/`); `sendOnSignIn:false` with explicit resend; DAL disables cookie cache; reordered tickets; Better Auth option names verified/changed: _write what you found_
- **Measured:** CI duration, E2E duration

Tick the checkboxes in `docs/roadmap/sprint-02-auth-core.md`, then ship:

```bash
pnpm check
git add -A
git commit -m "docs: add auth guide and update project state for sprint 2"
git push -u origin docs/s2-wrap-up
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
git tag -a v0.1.0-alpha -m "chore: sprint 2 complete — authentication core"
git push origin v0.1.0-alpha
```

---

## 🏁 Sprint 2 — Definition of Done

Prove it on a **fresh clone**:

```bash
cd "$TEMP" && git clone git@github.com:OWNER/saas-boilerplate.git s2-check && cd s2-check
corepack enable && pnpm install && pnpm setup:env
pnpm dev
```

(🪟 cmd.exe: `cd %TEMP%`.)

- [ ] Sign up → verification email (terminal) → link → signed in on `/dashboard`
- [ ] Unverified users cannot sign in and receive a fresh link
- [ ] Wrong credentials → one generic message (known and unknown emails alike)
- [ ] Sign-out invalidates the session **server-side** (row gone)
- [ ] Forgot/reset: same confirmation for unknown emails; link single-use, 1 h; sessions revoked; "password changed" email sent
- [ ] Every page under `(app)` calls `requireSession()` (test enforces it); a **forged cookie** gets past the proxy but not the page
- [ ] Profile, change password, change email, active sessions (revocation immediate), delete account (stretch)
- [ ] `callbackUrl` open-redirect attempts are ignored
- [ ] Sensitive endpoints rate-limited (429) with a translated message
- [ ] Everything works in English **and** French (pages and emails)
- [ ] `pnpm test` (unit + integration), `pnpm test:browser`, `pnpm e2e` and `CI=1 pnpm e2e` green; CI has 5 green jobs
- [ ] No secrets in git: `git grep -n "BETTER_AUTH_SECRET=" -- . ':!*.md' ':!.env.example'` returns nothing
- [ ] `docs/guides/auth.md` written; `06-project-state.md` updated; tag `v0.1.0-alpha` pushed

```bash
git log --first-parent --oneline        # one merge per ticket
```

### 🎬 Sprint review — measurable acceptance

| Check                                     | Expected                                      |
| ----------------------------------------- | --------------------------------------------- |
| Sign up with a new email                  | email in terminal; unverified sign-in blocked |
| Click the link                            | signed in, on `/dashboard`                    |
| Sign out, visit `/dashboard`              | redirected to sign-in with `callbackUrl`      |
| 6 wrong sign-ins in a minute (limiter on) | 429 → "Too many requests…"                    |
| Reset password                            | old sessions revoked, new password works      |
| Revoke a session in another browser       | that browser loses access on its next request |
| Forge a session cookie                    | proxy passes, page redirects to sign-in       |
| `pnpm e2e`                                | all auth specs green                          |

---

## 🧯 Troubleshooting (Sprint 2)

| Symptom | Likely cause → fix |
| --- | --- |
| `Invalid environment variables … BETTER_AUTH_SECRET` | Run `pnpm setup:env` (≥ 32 chars). CI needs the dummy secret in the workflow `env:` block |
| `server-only` error when running a script | Run it with `tsx --conditions=react-server …` (see the `db:seed` script) |
| Better Auth CLI can't resolve `@/…` | Use the relative-import `scripts/auth-cli.ts` fallback from S2-T02 |
| TypeScript error on `drizzleAdapter(database, …)` | Check the adapter's accepted DB type in the docs; cast narrowly, never `any` |
| Option rejected (`onPasswordReset`, `sendChangeEmailVerification`, `customRules`…) | Names differ across Better Auth versions → check the docs, adjust, note it in `06-project-state.md` |
| No email appears in the terminal | `EMAIL_TRANSPORT` or `RESEND_API_KEY` set? In dev with neither, the console transport is used. Check logger `LOG_LEVEL` isn't `error` |
| `No email transport configured` in production | Set `RESEND_API_KEY` (or `EMAIL_TRANSPORT=console` for CI/E2E only) |
| Verification link goes to the wrong host | `NEXT_PUBLIC_APP_URL` must match the URL you browse |
| "Invalid origin" from Better Auth | Origin not in `trustedOrigins` — API calls need an `origin` header equal to `NEXT_PUBLIC_APP_URL` |
| Revoked session still works for minutes | Something reads the session with the cookie cache on → DAL must pass `disableCookieCache: true` |
| Sign-in works but `/dashboard` bounces to sign-in | `emailVerified` false, or the proxy/DAL can't see the cookie (secure cookie over plain http in a production build) |
| Rate limit never triggers locally | `AUTH_RATE_LIMIT=off` in dev (by design) — run `CI=1 pnpm e2e` or start with `AUTH_RATE_LIMIT=on` |
| Rate limit blocks your E2E runs | Tests must send distinct `x-forwarded-for` values (`e2e/fixtures.ts` does) |
| E2E: "No email for … within 15000 ms" | The app wasn't started with the console transport, or `.emails/` is a different folder (run from the repo root) |
| 🪟 `CI=1 pnpm e2e` hangs | Ports 3000/5433 busy → `netstat -ano \| findstr :3000` / `:5433`, then `taskkill /PID <pid> /F` |
| 🪟 `getSetCookie is not a function` | Node < 20 → use Node 22 (`nvm use 22`) |
| Integration tests slow on first run | PGlite WASM warm-up; note the time in `06-project-state.md` |

---

## ➡️ Next

Sprint 2 complete → **Sprint 3 — Advanced authentication** (`docs/roadmap/sprint-03-auth-advanced.md`): magic links, social login, passkeys, MFA. Same format: one branch per ticket, verify, PR, merge.
