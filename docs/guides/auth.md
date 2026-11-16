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
