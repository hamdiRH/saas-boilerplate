# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 3 — Advanced Authentication (Magic Links, Social, Passkeys, MFA)

> Companion to `docs/roadmap/sprint-03-auth-advanced.md`. Every `S3-Txx` section is one ticket. Tickets follow the sprint file's order.

🪟 **Windows + Cmder:** use the **Git Bash tab**. Bash syntax and Node scripts only. Windows-specific notes are marked 🪟.

> ⚠️ **About versions — read this.** This sprint uses the youngest parts of Better Auth (**passkey** and **two-factor** plugins, social providers, account linking). Plugin import paths (e.g. `@better-auth/passkey` vs `better-auth/plugins/passkey`), client method names and option names change between releases. Every spot likely to differ is marked **🔍 Verify against docs**. The **tests** describe the behaviour that must hold (single-use tokens, no MFA bypass, no account takeover) — if a method name differs in your version, fix the _name_, never the _assertion_.

---

## 📋 What you will have at the end

- **Magic links** — passwordless sign-in by email (single-use, 5 minutes)
- **Social sign-in** — Google, GitHub fully documented and tested by hand; Facebook, X (Twitter) and Apple _config-ready_. Providers without credentials simply **don't render**
- **Account linking policy** — only providers that verify emails are trusted; you can't unlink your last sign-in method
- **Passkeys** — register, rename, delete; sign in with a button **and** browser autofill
- **Two-factor authentication** — TOTP (QR code), one-time **backup codes**, optional **email OTP**, "trust this device"
- A **Security** page that brings it all together (checkup score, connected accounts, passkeys, 2FA, sessions)
- E2E tests using Chromium's **virtual authenticator** (passkeys) and generated TOTP codes

## 🧭 Decisions & deviations (made once, here)

| Topic | Decision | Why |
| --- | --- | --- |
| Magic-link policy | The "may we send a link?" decision lives **inside** `sendMagicLink` (run in the background), not in Better Auth's `disableSignUp` | Unknown emails get the _same_ response as known ones → no account enumeration |
| MFA vs magic link | Users with 2FA **can't** use magic links (S3-T13) | Otherwise an attacker with mailbox access skips the TOTP step |
| 2FA redirect | We handle `twoFactorRedirect` in our sign-in form, **not** the plugin's `onTwoFactorRedirect` hook | Keeps navigation locale-aware and the callback URL sanitised |
| Disabling 2FA | Requires **password** (+ a fresh session), not a TOTP code | Better Auth's disable endpoint takes a password |
| Security score | 3 protections (verified email, 2FA, passkey) instead of 4 | We only count real protections |
| Social E2E | UI + redirect-URL assertions only; linking rules covered by config tests + a manual checklist | A faithful fake OAuth provider is out of scope (tracked as `TD-07`) |
| Brand icons | Text-only provider buttons for now | Google/Apple/etc. require their official logos & guidelines — added in Sprint 7 |
| Flat file names | `auth-providers.ts`, `auth-linking.ts`… in `src/libs/` | `Auth.ts` and an `auth/` folder would collide on case-insensitive Windows disks |

---

## 🔀 Git workflow (PR-based)

```bash
git switch main && git pull
git switch -c <type>/s3-tXX-<slug>
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

Each ticket ends with a **🚢 Ship** line. Run `pnpm pin` after adding dependencies.

> 🔎 **Schema migrations are sequential** (passkey in T06, two-factor in T08). Merge one PR before starting the next so the generated SQL never conflicts (risk R-03).

---

## ✅ Before you start

```bash
git switch main && git pull
pnpm install
pnpm check              # Sprint 2 must be green (includes unit, integration, browser tests)
```

Set **Current sprint: Sprint 3** in `docs/roadmap/06-project-state.md`.

---

## 🎫 S3-T01 — Magic link sign-in

**Branch:** `feat/s3-t01-magic-link` · **Story:** US-030 · **3 SP**

```bash
git switch -c feat/s3-t01-magic-link
mkdir -p tests/integration
```

### 1. Every string of the sprint — in one patch

Later tickets only _use_ these keys. Edit **both** locale files. Placement is described in prose, then the JSON.

📄 **`src/locales/en.json`**

**(a)** In `auth.signIn` add:

```json
      "or": "or",
      "social": "Continue with {provider}",
      "magicLink": "Email me a sign-in link",
      "passkey": "Sign in with a passkey"
```

**(b)** Inside `auth`, add two new objects next to `signIn`/`signUp`:

```json
    "magicLink": {
      "title": "Sign in with an email link",
      "description": "We'll email you a link that signs you in. No password needed.",
      "email": "Email",
      "submit": "Send sign-in link",
      "sentTitle": "Check your email",
      "sentDescription": "If you can sign in with {email}, a link is on its way. It expires in 5 minutes and works once.",
      "back": "Use a password instead",
      "resend": "Send another link"
    },
    "twoFactor": {
      "title": "Two-factor authentication",
      "description": "Enter the 6-digit code from your authenticator app.",
      "code": "Authentication code",
      "submit": "Verify",
      "trustDevice": "Trust this device for 30 days",
      "useBackup": "Use a backup code instead",
      "useApp": "Use my authenticator app instead",
      "useEmail": "Email me a code instead",
      "backupTitle": "Use a backup code",
      "backupDescription": "Enter one of your saved backup codes. Each code works only once.",
      "backupCode": "Backup code",
      "emailDescription": "We'll email a 6-digit code to the address on your account.",
      "sendEmail": "Send me a code",
      "emailSent": "We emailed you a 6-digit code."
    }
```

**(c)** In `auth.errors` add:

```json
      "accountNotLinked": "This email is already registered. Sign in with your original method, then connect this provider in Security settings.",
      "emailMissing": "Your provider didn't share an email address, so we can't sign you in.",
      "oauthFailed": "Signing in with this provider failed. Please try again.",
      "signupDisabled": "Sign-up with this method is currently disabled.",
      "invalidCode": "That code is not valid. Check it and try again.",
      "twoFactorExpired": "Your sign-in session expired. Please sign in again.",
      "passkeyFailed": "We couldn't use your passkey. Try again or use another method.",
      "passkeyCancelled": "Passkey request cancelled."
```

**(d)** In `validation` add:

```json
    "totpCode": "Enter the 6-digit code",
    "backupCode": "Enter a backup code",
    "passkeyName": "Give your passkey a name (max 40 characters)"
```

**(e)** In `emails` add:

```json
    "magicLink": {
      "subject": "Your sign-in link",
      "heading": "Sign in to your account",
      "greeting": "Hi there,",
      "body": "Use the button below to sign in. The link expires in 5 minutes and can be used once.",
      "button": "Sign in",
      "ignore": "If you didn't request this, you can safely ignore this email."
    },
    "otp": {
      "subject": "Your sign-in code",
      "heading": "Your verification code",
      "greeting": "Hi {name},",
      "body": "Enter this code to finish signing in. It expires in 5 minutes.",
      "ignore": "If this wasn't you, change your password right away."
    }
```

**(f)** New **top-level** object `security`:

```json
  "security": {
    "reauth": {
      "title": "Please sign in again",
      "description": "For your security, this action needs a recent sign-in.",
      "action": "Sign in again"
    },
    "score": {
      "title": "Security checkup",
      "summary": "{count} of {total} protections enabled",
      "emailVerified": "Email verified",
      "twoFactor": "Two-factor authentication",
      "passkey": "Passkey"
    },
    "connected": {
      "title": "Connected accounts",
      "description": "Sign in faster with accounts you already use.",
      "connect": "Connect",
      "disconnect": "Disconnect",
      "linked": "Connected",
      "none": "No social providers are configured.",
      "disconnected": "{provider} disconnected.",
      "lastMethod": "You can't disconnect your only sign-in method."
    },
    "passkeys": {
      "title": "Passkeys",
      "description": "Sign in with your fingerprint, face or device PIN — no password needed.",
      "add": "Add a passkey",
      "name": "Passkey name",
      "namePlaceholder": "e.g. Work laptop",
      "added": "Passkey added.",
      "removed": "Passkey removed.",
      "renamed": "Passkey renamed.",
      "empty": "You haven't added a passkey yet.",
      "unsupported": "This browser doesn't support passkeys.",
      "created": "Added {date}",
      "rename": "Rename",
      "save": "Save",
      "cancel": "Cancel",
      "delete": "Delete",
      "synced": "Synced across your devices"
    },
    "mfa": {
      "title": "Two-factor authentication",
      "description": "Protect your account with a code from an authenticator app.",
      "on": "Enabled",
      "off": "Not enabled",
      "enable": "Enable two-factor",
      "password": "Confirm your password",
      "continue": "Continue",
      "scanTitle": "Scan the QR code",
      "scanDescription": "Use an authenticator app such as 1Password, Authy or Google Authenticator.",
      "manualKey": "Can't scan? Enter this key manually",
      "code": "6-digit code",
      "verify": "Verify and enable",
      "backupTitle": "Save your backup codes",
      "backupDescription": "Each code works once if you lose access to your authenticator. They won't be shown again.",
      "copy": "Copy",
      "copied": "Copied to clipboard.",
      "download": "Download",
      "saved": "I have saved my backup codes",
      "done": "Done",
      "enabled": "Two-factor authentication enabled.",
      "disable": "Disable two-factor",
      "disableTitle": "Disable two-factor authentication?",
      "disableDescription": "Your account will only be protected by your sign-in method. Enter your password to confirm.",
      "disabled": "Two-factor authentication disabled.",
      "regenerate": "Regenerate backup codes",
      "regenerated": "New backup codes generated. The old ones no longer work.",
      "cancel": "Cancel"
    }
  }
```

📄 **`src/locales/fr.json`** — the same placements:

**(a)** `auth.signIn`:

```json
      "or": "ou",
      "social": "Continuer avec {provider}",
      "magicLink": "Recevoir un lien de connexion par e-mail",
      "passkey": "Se connecter avec une clé d'accès"
```

**(b)** `auth.magicLink` and `auth.twoFactor`:

```json
    "magicLink": {
      "title": "Connexion par lien e-mail",
      "description": "Nous vous envoyons un lien qui vous connecte. Pas de mot de passe.",
      "email": "E-mail",
      "submit": "Envoyer le lien",
      "sentTitle": "Consultez votre boîte mail",
      "sentDescription": "Si vous pouvez vous connecter avec {email}, un lien est en route. Il expire dans 5 minutes et ne sert qu'une fois.",
      "back": "Utiliser un mot de passe",
      "resend": "Envoyer un autre lien"
    },
    "twoFactor": {
      "title": "Authentification à deux facteurs",
      "description": "Saisissez le code à 6 chiffres de votre application d'authentification.",
      "code": "Code d'authentification",
      "submit": "Vérifier",
      "trustDevice": "Faire confiance à cet appareil pendant 30 jours",
      "useBackup": "Utiliser un code de secours",
      "useApp": "Utiliser mon application d'authentification",
      "useEmail": "Recevoir un code par e-mail",
      "backupTitle": "Utiliser un code de secours",
      "backupDescription": "Saisissez l'un de vos codes de secours enregistrés. Chaque code ne fonctionne qu'une fois.",
      "backupCode": "Code de secours",
      "emailDescription": "Nous enverrons un code à 6 chiffres à l'adresse de votre compte.",
      "sendEmail": "Envoyez-moi un code",
      "emailSent": "Nous vous avons envoyé un code à 6 chiffres."
    }
```

**(c)** `auth.errors`:

```json
      "accountNotLinked": "Cet e-mail est déjà enregistré. Connectez-vous avec votre méthode d'origine, puis associez ce fournisseur dans les paramètres de sécurité.",
      "emailMissing": "Votre fournisseur n'a pas communiqué d'adresse e-mail, nous ne pouvons pas vous connecter.",
      "oauthFailed": "La connexion avec ce fournisseur a échoué. Veuillez réessayer.",
      "signupDisabled": "L'inscription avec cette méthode est actuellement désactivée.",
      "invalidCode": "Ce code n'est pas valide. Vérifiez-le et réessayez.",
      "twoFactorExpired": "Votre session de connexion a expiré. Veuillez vous reconnecter.",
      "passkeyFailed": "Impossible d'utiliser votre clé d'accès. Réessayez ou utilisez une autre méthode.",
      "passkeyCancelled": "Demande de clé d'accès annulée."
```

**(d)** `validation`:

```json
    "totpCode": "Saisissez le code à 6 chiffres",
    "backupCode": "Saisissez un code de secours",
    "passkeyName": "Donnez un nom à votre clé d'accès (40 caractères max)"
```

**(e)** `emails`:

```json
    "magicLink": {
      "subject": "Votre lien de connexion",
      "heading": "Connectez-vous à votre compte",
      "greeting": "Bonjour,",
      "body": "Utilisez le bouton ci-dessous pour vous connecter. Le lien expire dans 5 minutes et ne peut être utilisé qu'une fois.",
      "button": "Se connecter",
      "ignore": "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message."
    },
    "otp": {
      "subject": "Votre code de connexion",
      "heading": "Votre code de vérification",
      "greeting": "Bonjour {name},",
      "body": "Saisissez ce code pour terminer la connexion. Il expire dans 5 minutes.",
      "ignore": "Si ce n'était pas vous, changez immédiatement votre mot de passe."
    }
```

**(f)** top-level `security`:

```json
  "security": {
    "reauth": {
      "title": "Veuillez vous reconnecter",
      "description": "Pour votre sécurité, cette action nécessite une connexion récente.",
      "action": "Se reconnecter"
    },
    "score": {
      "title": "Bilan de sécurité",
      "summary": "{count} protections sur {total} activées",
      "emailVerified": "E-mail vérifié",
      "twoFactor": "Authentification à deux facteurs",
      "passkey": "Clé d'accès"
    },
    "connected": {
      "title": "Comptes associés",
      "description": "Connectez-vous plus vite avec des comptes que vous utilisez déjà.",
      "connect": "Associer",
      "disconnect": "Dissocier",
      "linked": "Associé",
      "none": "Aucun fournisseur social n'est configuré.",
      "disconnected": "{provider} dissocié.",
      "lastMethod": "Vous ne pouvez pas dissocier votre unique méthode de connexion."
    },
    "passkeys": {
      "title": "Clés d'accès",
      "description": "Connectez-vous avec votre empreinte, votre visage ou le code de l'appareil — sans mot de passe.",
      "add": "Ajouter une clé d'accès",
      "name": "Nom de la clé d'accès",
      "namePlaceholder": "ex. Ordinateur du bureau",
      "added": "Clé d'accès ajoutée.",
      "removed": "Clé d'accès supprimée.",
      "renamed": "Clé d'accès renommée.",
      "empty": "Vous n'avez pas encore ajouté de clé d'accès.",
      "unsupported": "Ce navigateur ne prend pas en charge les clés d'accès.",
      "created": "Ajoutée le {date}",
      "rename": "Renommer",
      "save": "Enregistrer",
      "cancel": "Annuler",
      "delete": "Supprimer",
      "synced": "Synchronisée entre vos appareils"
    },
    "mfa": {
      "title": "Authentification à deux facteurs",
      "description": "Protégez votre compte avec un code issu d'une application d'authentification.",
      "on": "Activée",
      "off": "Non activée",
      "enable": "Activer la double authentification",
      "password": "Confirmez votre mot de passe",
      "continue": "Continuer",
      "scanTitle": "Scannez le QR code",
      "scanDescription": "Utilisez une application comme 1Password, Authy ou Google Authenticator.",
      "manualKey": "Impossible de scanner ? Saisissez cette clé manuellement",
      "code": "Code à 6 chiffres",
      "verify": "Vérifier et activer",
      "backupTitle": "Enregistrez vos codes de secours",
      "backupDescription": "Chaque code ne fonctionne qu'une fois si vous perdez l'accès à votre application. Ils ne seront plus affichés.",
      "copy": "Copier",
      "copied": "Copié dans le presse-papiers.",
      "download": "Télécharger",
      "saved": "J'ai enregistré mes codes de secours",
      "done": "Terminé",
      "enabled": "Authentification à deux facteurs activée.",
      "disable": "Désactiver la double authentification",
      "disableTitle": "Désactiver l'authentification à deux facteurs ?",
      "disableDescription": "Votre compte ne sera protégé que par votre méthode de connexion. Saisissez votre mot de passe pour confirmer.",
      "disabled": "Authentification à deux facteurs désactivée.",
      "regenerate": "Régénérer les codes de secours",
      "regenerated": "Nouveaux codes de secours générés. Les anciens ne fonctionnent plus.",
      "cancel": "Annuler"
    }
  }
```

```bash
pnpm test        # the locale parity test must stay green
```

### 2. Environment flags

📄 **Edit `src/libs/Env.ts`** — add a helper above `createEnv` and the variables:

```ts
const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');
```

```ts
    AUTH_MAGIC_LINK_ENABLED: flag('true'),
    // false → unknown emails never receive a link (response stays identical)
    AUTH_ALLOW_SIGNUP_VIA_MAGIC_LINK: flag('true'),
```

```ts
    AUTH_MAGIC_LINK_ENABLED: process.env.AUTH_MAGIC_LINK_ENABLED,
    AUTH_ALLOW_SIGNUP_VIA_MAGIC_LINK: process.env.AUTH_ALLOW_SIGNUP_VIA_MAGIC_LINK,
```

📄 **Append to `.env.example`:**

```dotenv
# ─── Magic links ────────────────────────────────────
AUTH_MAGIC_LINK_ENABLED=true
AUTH_ALLOW_SIGNUP_VIA_MAGIC_LINK=true
```

### 3. Email: template + sender

📄 **Edit `src/templates/emails/layout.tsx`** — support a prominent code (used by email OTP in S3-T10). Add `code?: string` to `ActionEmailProps`, destructure it, and render it after `{body}`:

```tsx
{
  code ? (
    <Text
      style={{
        backgroundColor: '#f4f4f5',
        borderRadius: 6,
        fontFamily: 'monospace',
        fontSize: 28,
        letterSpacing: 6,
        padding: '12px 16px',
        textAlign: 'center',
      }}
    >
      {code}
    </Text>
  ) : null;
}
```

📄 **Append to `src/templates/emails/templates.tsx`:**

```tsx
export function MagicLinkEmail({ locale, url }: { locale: Locale; url: string }) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('magicLink.heading')}
      greeting={t('magicLink.greeting')}
      body={t('magicLink.body')}
      action={{ label: t('magicLink.button'), url }}
      ignore={t('magicLink.ignore')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}

export function OtpEmail({ locale, name, code }: Base & { code: string }) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('otp.heading')}
      greeting={t('otp.greeting', { name })}
      body={t('otp.body')}
      code={code}
      ignore={t('otp.ignore')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}
```

📄 **Append to `src/libs/auth-emails.tsx`** (and import `MagicLinkEmail`, `OtpEmail`):

```tsx
export async function sendMagicLinkEmail({
  email,
  url,
  request,
}: {
  email: string;
  url: string;
  request?: Request;
}) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(<MagicLinkEmail locale={locale} url={url} />);
  await sendEmail({
    to: email,
    subject: getEmailTranslator(locale)('magicLink.subject'),
    html,
    text,
    tags: { type: 'magic-link' },
  });
}

export async function sendOtpEmail({ user, code, request }: Input & { code: string }) {
  const locale = localeFromRequest(request);
  const { html, text } = await renderEmail(
    <OtpEmail locale={locale} name={user.name} code={code} />,
  );
  await sendEmail({
    to: user.email,
    subject: getEmailTranslator(locale)('otp.subject'),
    html,
    text,
    tags: { type: 'email-otp' },
  });
}
```

> The OTP sender is wired in S3-T10; Knip may flag `sendOtpEmail` until then — add `'src/libs/auth-emails.tsx'` to the temporary `entry` list.

### 4. The send policy (testable, enumeration-safe)

📄 **Create `src/libs/auth-magic-link.ts`:**

```ts
import { eq } from 'drizzle-orm';

import { user } from '@/db/schema';
import type { DbLike } from '@/db/types';

export type MagicLinkDecision = 'send' | 'skip-unknown-user';

/**
 * Decides whether an email actually gets sent. The HTTP response is identical either way;
 * this runs in the background so response TIMING doesn't leak the answer either.
 */
export async function decideMagicLink(
  database: DbLike,
  { email, allowSignUp }: { email: string; allowSignUp: boolean },
): Promise<MagicLinkDecision> {
  const [existing] = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.toLowerCase()));

  if (!existing && !allowSignUp) return 'skip-unknown-user';
  return 'send';
}
```

> S3-T13 extends this with an MFA rule once the `two_factor_enabled` column exists.

### 5. The plugin (server + client)

📄 **Edit `src/libs/Auth.ts`:**

```ts
import { magicLink } from 'better-auth/plugins';

import { sendMagicLinkEmail } from '@/libs/auth-emails';
import { decideMagicLink } from '@/libs/auth-magic-link';
import { getLogger } from '@/libs/Logger';
```

and in `plugins` (keep `nextCookies()` **last**):

```ts
    plugins: [
      magicLink({
        expiresIn: 60 * 5, // seconds
        sendMagicLink: async ({ email, url }, request) => {
          if (!Env.AUTH_MAGIC_LINK_ENABLED) return;

          runInBackground(async () => {
            const decision = await decideMagicLink(database, {
              email,
              allowSignUp: Env.AUTH_ALLOW_SIGNUP_VIA_MAGIC_LINK,
            });
            if (decision !== 'send') {
              getLogger('security').info('Magic link not sent: {decision}', { decision });
              return;
            }
            await sendMagicLinkEmail({ email, url, request });
          });
        },
      }),
      nextCookies(),
    ],
```

📄 **Edit `src/libs/AuthClient.ts`:**

```ts
import { magicLinkClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
```

> 🔍 Check the exact import paths for plugins in the docs of your Better Auth version.

> **No schema change:** magic links reuse the `verification` table, so no migration is needed here.

### 6. OAuth/magic-link error messages on the sign-in page

📄 **Create `src/libs/auth-callback-errors.ts`:**

```ts
const KEYS: Record<string, string> = {
  // magic link
  invalid_token: 'auth.errors.invalidToken',
  token_expired: 'auth.errors.invalidToken',
  // OAuth
  account_not_linked: 'auth.errors.accountNotLinked',
  email_not_found: 'auth.errors.emailMissing',
  signup_disabled: 'auth.errors.signupDisabled',
};

/** `?error=` values come from redirects (magic link, OAuth). Case-insensitive, unknown → generic. */
export function callbackErrorKey(code: string | null | undefined): string | null {
  if (!code) return null;
  return KEYS[code.toLowerCase()] ?? 'auth.errors.oauthFailed';
}
```

📄 **Create `src/libs/auth-callback-errors.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { callbackErrorKey } from './auth-callback-errors';

it('maps redirect error codes', () => {
  expect(callbackErrorKey(null)).toBeNull();
  expect(callbackErrorKey('INVALID_TOKEN')).toBe('auth.errors.invalidToken');
  expect(callbackErrorKey('account_not_linked')).toBe('auth.errors.accountNotLinked');
  expect(callbackErrorKey('anything_else')).toBe('auth.errors.oauthFailed');
});
```

### 7. The magic-link form and the sign-in panel

📄 **Create `src/components/auth/magic-link-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Button } from '@/components/ui/button';
import { useCooldown } from '@/hooks/use-cooldown';
import { getPathname } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { type ForgotPasswordInput, forgotPasswordSchema } from '@/validations/auth';

type Props = { callbackUrl: string };

export function MagicLinkForm({ callbackUrl }: Props) {
  const t = useTranslations('auth.magicLink');
  const locale = useLocale();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { remaining, start } = useCooldown(30);

  // Reuses { email } — no extra schema needed
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function send(email: string) {
    setFormError(null);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: callbackUrl,
      newUserCallbackURL: callbackUrl,
      // Failures (expired/used link) land back on the sign-in page with ?error=…
      errorCallbackURL: getPathname({ href: '/sign-in', locale }),
    });

    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    setSentTo(email); // same screen for known and unknown addresses
    start();
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center" role="status">
        <h2 className="text-lg font-semibold">{t('sentTitle')}</h2>
        <p className="text-muted-foreground text-sm">{t('sentDescription', { email: sentTo })}</p>
        <Button variant="outline" disabled={remaining > 0} onClick={() => send(sentTo)}>
          {t('resend')}
          {remaining > 0 ? ` (${remaining})` : ''}
        </Button>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(({ email }) => send(email))}
        noValidate
        className="space-y-4"
      >
        <FormError messageKey={formError} />
        <p className="text-muted-foreground text-sm">{t('description')}</p>
        <TextField name="email" label={t('email')} type="email" autoComplete="email" />
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}
```

📄 **Create `src/components/auth/sign-in-panel.tsx`** — one place that composes every sign-in method (extended in T02 and T07):

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MagicLinkForm } from '@/components/auth/magic-link-form';
import { SignInForm } from '@/components/auth/sign-in-form';
import { FormError } from '@/components/forms/form-error';
import { Button } from '@/components/ui/button';

type Props = {
  callbackUrl: string;
  /** i18n key of an error that came back through a redirect (?error=…) */
  initialErrorKey: string | null;
  magicLinkEnabled: boolean;
};

export function SignInPanel({ callbackUrl, initialErrorKey, magicLinkEnabled }: Props) {
  const t = useTranslations('auth.signIn');
  const tMagic = useTranslations('auth.magicLink');
  const [mode, setMode] = useState<'password' | 'magic'>('password');

  return (
    <div className="space-y-4">
      <FormError messageKey={initialErrorKey} />

      {mode === 'password' ? (
        <SignInForm callbackUrl={callbackUrl} />
      ) : (
        <MagicLinkForm callbackUrl={callbackUrl} />
      )}

      {magicLinkEnabled ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => setMode(mode === 'password' ? 'magic' : 'password')}
        >
          {mode === 'password' ? t('magicLink') : tMagic('back')}
        </Button>
      ) : null}
    </div>
  );
}
```

📄 **Edit `src/app/[locale]/(auth)/sign-in/page.tsx`** — read `error`, build the panel:

```tsx
import { SignInPanel } from '@/components/auth/sign-in-panel';
import { callbackErrorKey } from '@/libs/auth-callback-errors';
import { Env } from '@/libs/Env';
// …
searchParams: Promise<{ callbackUrl?: string; error?: string }>;
// …
const { callbackUrl, error } = await searchParams;
// …replace <SignInForm callbackUrl={destination} /> with:
<SignInPanel
  callbackUrl={destination}
  initialErrorKey={callbackErrorKey(error)}
  magicLinkEnabled={Env.AUTH_MAGIC_LINK_ENABLED}
/>;
```

Magic-link users created by email only have an empty name — make the dashboard greeting safe: 📄 **Edit `src/app/[locale]/(app)/dashboard/page.tsx`:** `t('welcome', { name: user.name || user.email })`.

### 8. Tests: the policy and the whole link lifecycle

📄 **Create `tests/integration/magic-link.test.ts`:**

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { user, verification } from '@/db/schema';
import { createAuth } from '@/libs/Auth';
import { decideMagicLink } from '@/libs/auth-magic-link';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import { firstLink, tokenFromLink } from '../utils/auth';
import { createTestDb, type TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
const transport = new MemoryTransport();
let counter = 0;
const nextEmail = () => `magic${Date.now()}-${++counter}@example.com`;

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

async function requestLink(email: string) {
  // 🔍 method name: auth.api.signInMagicLink in current versions
  await auth.api.signInMagicLink({
    body: { email, callbackURL: '/dashboard' },
    headers: new Headers(),
  });
  await vi.waitFor(() => expect(transport.last(email)).toBeDefined());
  return tokenFromLink(firstLink(transport.last(email)));
}

describe('decideMagicLink', () => {
  it('skips unknown users only when sign-up via magic link is disabled', async () => {
    expect(await decideMagicLink(db, { email: 'new@example.com', allowSignUp: false })).toBe(
      'skip-unknown-user',
    );
    expect(await decideMagicLink(db, { email: 'new@example.com', allowSignUp: true })).toBe('send');
  });
});

describe('magic link lifecycle', () => {
  it('creates a verified user and a session, once', async () => {
    const email = nextEmail();
    const token = await requestLink(email);

    // 🔍 method name: auth.api.magicLinkVerify
    const response = await auth.api.magicLinkVerify({
      query: { token, callbackURL: '/dashboard' },
      headers: new Headers(),
      asResponse: true,
    });
    expect(response.status).toBeLessThan(400);

    const [created] = await db.select().from(user).where(eq(user.email, email));
    expect(created?.emailVerified).toBe(true);

    // replay: the token is gone
    const replay = await auth.api
      .magicLinkVerify({
        query: { token, callbackURL: '/dashboard' },
        headers: new Headers(),
        asResponse: true,
      })
      .catch((error: unknown) => error);
    const failed =
      replay instanceof Response
        ? replay.status >= 300 && !replay.headers.getSetCookie().length
        : true;
    expect(failed).toBe(true);
  });

  it('rejects an expired link', async () => {
    const email = nextEmail();
    const token = await requestLink(email);

    // 🔍 the token is stored as the verification identifier
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(verification.identifier, token));

    const attempt = await auth.api
      .magicLinkVerify({
        query: { token, callbackURL: '/dashboard' },
        headers: new Headers(),
        asResponse: true,
      })
      .catch((error: unknown) => error);
    const failed = attempt instanceof Response ? !attempt.headers.getSetCookie().length : true;
    expect(failed).toBe(true);
    expect(await db.select().from(user).where(eq(user.email, email))).toHaveLength(0);
  });
});
```

> 🔍 If the token isn't stored under `identifier`, open Studio → `verification` after requesting a link and adapt the `where` clause. The contract: **expired links must not sign anyone in or create users**.

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check
pnpm dev
```

1. `/sign-in` → **Email me a sign-in link** → enter an email → "Check your email"; the terminal prints the link.
2. Open the link → you land on `/dashboard`, signed in. A **new** email gets a user with `email_verified = true` and **no password**.
3. Open the same link in a private window → back on `/sign-in` with "This link is invalid or expired."
4. Wait 5 minutes (or set `expiresIn: 10` temporarily) → expired link rejected. Revert.
5. Set `AUTH_ALLOW_SIGNUP_VIA_MAGIC_LINK=false` in `.env.local`, restart, request a link for an **unknown** address → same "Check your email" screen, **no email** printed. Remove the override.
6. `AUTH_MAGIC_LINK_ENABLED=false` → the toggle button disappears.
7. `/fr/sign-in` shows French labels; the email subject is "Votre lien de connexion" when your browser has the French locale cookie.

**🚢 Ship** — branch `feat/s3-t01-magic-link` · message: `feat(auth): add passwordless magic link sign-in`

---

## 🎫 S3-T02 — Social provider registry (config-driven)

**Branch:** `feat/s3-t02-provider-registry` · **Story:** US-031 · **3 SP**

> 🎯 **Rule:** a provider exists **only if both** its client id and secret are set. No credentials → no button, no route, no error.

```bash
git switch main && git pull && git switch -c feat/s3-t02-provider-registry
```

### 1. Environment (all optional)

📄 **Edit `src/libs/Env.ts`** — add to `server` and `runtimeEnv`:

```ts
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    FACEBOOK_CLIENT_ID: z.string().min(1).optional(),
    FACEBOOK_CLIENT_SECRET: z.string().min(1).optional(),
    TWITTER_CLIENT_ID: z.string().min(1).optional(),
    TWITTER_CLIENT_SECRET: z.string().min(1).optional(),
    APPLE_CLIENT_ID: z.string().min(1).optional(),
    APPLE_CLIENT_SECRET: z.string().min(1).optional(),
```

(and the matching `process.env.X` lines in `runtimeEnv`)

📄 **Append to `.env.example`:**

```dotenv
# ─── Social sign-in (each provider needs BOTH values; see docs/guides/social-auth.md) ───
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
# Apple's "secret" is a signed JWT that expires every ≤ 6 months: pnpm apple:secret
APPLE_CLIENT_ID=
APPLE_CLIENT_SECRET=
```

### 2. The registry

📄 **Create `src/libs/auth-providers.ts`:**

```ts
export const SOCIAL_PROVIDER_IDS = ['google', 'github', 'facebook', 'twitter', 'apple'] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];

type Definition = {
  id: SocialProviderId;
  label: string; // brand names are not translated
  clientIdKey: string;
  clientSecretKey: string;
};

const DEFINITIONS: readonly Definition[] = [
  {
    id: 'google',
    label: 'Google',
    clientIdKey: 'GOOGLE_CLIENT_ID',
    clientSecretKey: 'GOOGLE_CLIENT_SECRET',
  },
  {
    id: 'github',
    label: 'GitHub',
    clientIdKey: 'GITHUB_CLIENT_ID',
    clientSecretKey: 'GITHUB_CLIENT_SECRET',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    clientIdKey: 'FACEBOOK_CLIENT_ID',
    clientSecretKey: 'FACEBOOK_CLIENT_SECRET',
  },
  {
    id: 'twitter',
    label: 'X',
    clientIdKey: 'TWITTER_CLIENT_ID',
    clientSecretKey: 'TWITTER_CLIENT_SECRET',
  },
  {
    id: 'apple',
    label: 'Apple',
    clientIdKey: 'APPLE_CLIENT_ID',
    clientSecretKey: 'APPLE_CLIENT_SECRET',
  },
];

type EnvLike = Readonly<Record<string, unknown>>;
export type Credentials = { clientId: string; clientSecret: string };
export type ProviderSummary = { id: SocialProviderId; label: string };

const has = (env: EnvLike, key: string): string | undefined => {
  const value = env[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

function credentialsFor(env: EnvLike, definition: Definition): Credentials | undefined {
  const clientId = has(env, definition.clientIdKey);
  const clientSecret = has(env, definition.clientSecretKey);
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** Providers with BOTH credentials set, in display order. Safe to send to the browser (no secrets). */
export function getEnabledProviders(env: EnvLike): ProviderSummary[] {
  return DEFINITIONS.filter((d) => credentialsFor(env, d)).map(({ id, label }) => ({ id, label }));
}

/** The `socialProviders` option for Better Auth. */
export function buildSocialProviders(env: EnvLike): Partial<Record<SocialProviderId, Credentials>> {
  const result: Partial<Record<SocialProviderId, Credentials>> = {};
  for (const definition of DEFINITIONS) {
    const credentials = credentialsFor(env, definition);
    if (credentials) result[definition.id] = credentials;
  }
  return result;
}

/** Providers where only ONE of the two variables is set — almost certainly a typo. */
export function incompleteProviders(env: EnvLike): SocialProviderId[] {
  return DEFINITIONS.filter(
    (d) => Boolean(has(env, d.clientIdKey)) !== Boolean(has(env, d.clientSecretKey)),
  ).map((d) => d.id);
}

export function providerLabel(id: string): string {
  return DEFINITIONS.find((d) => d.id === id)?.label ?? id;
}

/** Apple POSTs back from its own origin, so it must be a trusted origin. */
export function buildTrustedOrigins(
  appUrl: string,
  enabled: readonly SocialProviderId[],
): string[] {
  return enabled.includes('apple') ? [appUrl, 'https://appleid.apple.com'] : [appUrl];
}

/** The redirect URI to register at each provider's console. */
export function callbackUrlFor(appUrl: string, id: SocialProviderId): string {
  return `${appUrl.replace(/\/$/, '')}/api/auth/callback/${id}`;
}
```

📄 **Create `src/libs/auth-providers.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import {
  buildSocialProviders,
  buildTrustedOrigins,
  callbackUrlFor,
  getEnabledProviders,
  incompleteProviders,
} from './auth-providers';

const env = {
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
  GITHUB_CLIENT_ID: 'gh-id', // secret missing → NOT enabled
  FACEBOOK_CLIENT_ID: '',
  FACEBOOK_CLIENT_SECRET: '',
  NODE_ENV: 'test',
};

describe('provider registry', () => {
  it('enables only providers with both credentials', () => {
    expect(getEnabledProviders(env)).toEqual([{ id: 'google', label: 'Google' }]);
    expect(buildSocialProviders(env)).toEqual({
      google: { clientId: 'g-id', clientSecret: 'g-secret' },
    });
  });

  it('never leaks secrets into the summary sent to the browser', () => {
    expect(JSON.stringify(getEnabledProviders(env))).not.toContain('g-secret');
  });

  it('flags half-configured providers', () => {
    expect(incompleteProviders(env)).toEqual(['github']);
  });

  it('enables nothing for an empty environment', () => {
    expect(getEnabledProviders({})).toEqual([]);
    expect(buildSocialProviders({})).toEqual({});
  });

  it('trusts Apple’s origin only when Apple is enabled', () => {
    expect(buildTrustedOrigins('http://localhost:3000', ['google'])).toEqual([
      'http://localhost:3000',
    ]);
    expect(buildTrustedOrigins('http://localhost:3000', ['apple'])).toContain(
      'https://appleid.apple.com',
    );
  });

  it('builds the redirect URI', () => {
    expect(callbackUrlFor('https://app.test/', 'github')).toBe(
      'https://app.test/api/auth/callback/github',
    );
  });
});
```

### 3. Wire it into Better Auth

📄 **Edit `src/libs/Auth.ts`:**

```ts
import {
  buildSocialProviders,
  buildTrustedOrigins,
  getEnabledProviders,
  incompleteProviders,
} from '@/libs/auth-providers';

const enabledProviderIds = getEnabledProviders(Env).map((provider) => provider.id);

for (const id of incompleteProviders(Env)) {
  getLogger('auth').warning(
    'Social provider "{id}" has only one of CLIENT_ID / CLIENT_SECRET set — ignoring it',
    { id },
  );
}
```

(place these above `createAuth`), then inside the config:

```ts
    trustedOrigins: buildTrustedOrigins(Env.NEXT_PUBLIC_APP_URL, enabledProviderIds),
    socialProviders: buildSocialProviders(Env),
```

(replace the previous `trustedOrigins` line).

### 4. Buttons

📄 **Create `src/components/auth/social-buttons.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { ProviderSummary } from '@/libs/auth-providers';
import { authClient } from '@/libs/AuthClient';

type Props = {
  providers: ProviderSummary[];
  callbackUrl: string;
  errorCallbackUrl: string;
  newUserCallbackUrl?: string;
};

export function SocialButtons({
  providers,
  callbackUrl,
  errorCallbackUrl,
  newUserCallbackUrl,
}: Props) {
  const t = useTranslations('auth.signIn');
  const [pending, setPending] = useState<string | null>(null);

  if (providers.length === 0) return null; // nothing configured → nothing rendered

  async function start(id: string) {
    setPending(id);
    // Redirects the browser to the provider. On return, Better Auth sets the session cookie.
    await authClient.signIn.social({
      provider: id as 'google' | 'github' | 'facebook' | 'twitter' | 'apple',
      callbackURL: callbackUrl,
      errorCallbackURL: errorCallbackUrl,
      newUserCallbackURL: newUserCallbackUrl ?? callbackUrl,
    });
    setPending(null); // only reached if the redirect didn't happen (error)
  }

  return (
    <div className="grid gap-2">
      {providers.map((provider) => (
        <Button
          key={provider.id}
          type="button"
          variant="outline"
          disabled={pending !== null}
          aria-busy={pending === provider.id}
          onClick={() => start(provider.id)}
        >
          {t('social', { provider: provider.label })}
        </Button>
      ))}
    </div>
  );
}
```

> ⚖️ Google, Apple, Facebook and X publish **branding guidelines** for their buttons. We ship text-only buttons now; official logos are added in Sprint 7 (S7-T13).

### 5. Show them in the sign-in panel

📄 **Edit `src/components/auth/sign-in-panel.tsx`:**

```tsx
import { useLocale } from 'next-intl';

import { SocialButtons } from '@/components/auth/social-buttons';
import { getPathname } from '@/i18n/navigation';
import type { ProviderSummary } from '@/libs/auth-providers';
```

add props `providers: ProviderSummary[];` and inside the component `const locale = useLocale();`, then after the magic-link toggle button:

```tsx
{
  providers.length > 0 ? (
    <>
      <div className="text-muted-foreground flex items-center gap-3 text-xs uppercase">
        <span className="bg-border h-px flex-1" />
        {t('or')}
        <span className="bg-border h-px flex-1" />
      </div>
      <SocialButtons
        providers={providers}
        callbackUrl={callbackUrl}
        errorCallbackUrl={getPathname({ href: '/sign-in', locale })}
      />
    </>
  ) : null;
}
```

📄 **Edit the sign-in page** — pass `providers={getEnabledProviders(Env)}` (import from `@/libs/auth-providers`).

### ✅ Verify

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm knip
pnpm dev
```

- With **no** provider variables: `/sign-in` shows no social section at all.
- Put `GOOGLE_CLIENT_ID=x` (without the secret) in `.env.local` → still no button, and the terminal warns about the half-configured provider.
- Add both (`GOOGLE_CLIENT_ID=x`, `GOOGLE_CLIENT_SECRET=y`) → a **Continue with Google** button appears; clicking it navigates to Google's consent screen with an `invalid_client` error (expected with fake credentials). Remove the fake values afterwards.
- `/sign-in?error=account_not_linked` → shows the translated "already registered" message.

**🚢 Ship** — branch `feat/s3-t02-provider-registry` · message: `feat(auth): add config-driven social provider registry and buttons`

---

## 🎫 S3-T03 — Google and GitHub end to end

**Branch:** `docs/s3-t03-google-github` · **Story:** US-031 · **2 SP**

> 🎯 Real providers need real accounts, so this ticket is **documentation + a manual acceptance test**. You'll do it once with your own Google and GitHub apps.

```bash
git switch main && git pull && git switch -c docs/s3-t03-google-github
```

### 1. A helper that prints the exact redirect URIs to register

📄 **Create `scripts/auth-redirect-uris.mjs`:**

```js
// Usage: pnpm auth:redirect-uris [https://your-production-domain.com]
const PROVIDERS = ['google', 'github', 'facebook', 'twitter', 'apple'];
const urls = ['http://localhost:3000', process.argv[2]].filter(Boolean);

for (const base of urls) {
  console.log(`\n# ${base}`);
  for (const id of PROVIDERS) {
    console.log(`${id.padEnd(9)} ${base.replace(/\/$/, '')}/api/auth/callback/${id}`);
  }
}
```

📄 **Edit `package.json`:** `"auth:redirect-uris": "node scripts/auth-redirect-uris.mjs"`

```bash
pnpm auth:redirect-uris https://app.example.com
```

### 2. The guide

📄 **Create `docs/guides/social-auth.md`:**

```markdown
# Social sign-in

Each provider appears **only if both** `<PROVIDER>_CLIENT_ID` and `<PROVIDER>_CLIENT_SECRET` are set. Print the redirect URIs to register with: `pnpm auth:redirect-uris https://your-domain`.

| Provider    | Status                          | Redirect URI                                     |
| ----------- | ------------------------------- | ------------------------------------------------ |
| Google      | ✅ documented + manually tested | `{APP_URL}/api/auth/callback/google`             |
| GitHub      | ✅ documented + manually tested | `{APP_URL}/api/auth/callback/github`             |
| Facebook    | ⚙️ config-ready, not E2E tested | `{APP_URL}/api/auth/callback/facebook`           |
| X (Twitter) | ⚙️ config-ready, not E2E tested | `{APP_URL}/api/auth/callback/twitter`            |
| Apple       | ⚙️ config-ready, not E2E tested | `{APP_URL}/api/auth/callback/apple` (HTTPS only) |

Create **separate** OAuth apps for local development and production — never reuse a production secret locally.

## Google

1. Google Cloud Console → _APIs & Services_ → **OAuth consent screen** (External; add yourself as a test user while in "Testing").
2. _Credentials_ → **Create credentials → OAuth client ID** → _Web application_.
3. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` (+ production).
4. Copy the client ID/secret into `.env.local`. Scopes used: `openid email profile`. Google reports whether the email is verified.

## GitHub

1. GitHub → _Settings → Developer settings → OAuth Apps → New OAuth App_.
2. Homepage URL = your app URL; **Authorization callback URL** = `http://localhost:3000/api/auth/callback/github`.
3. Generate a client secret; copy both values. Users who keep their email private still work: the app reads their **primary verified** email (scope `user:email`).

## Facebook

Meta for Developers → _Create app_ → add **Facebook Login** → _Valid OAuth Redirect URIs_. `email` and `public_profile` need no review, but the app must be **Live** for people who aren't app testers. Facebook accounts may have **no email**.

## X (Twitter)

Developer portal → app → _User authentication settings_ → **OAuth 2.0**, type _Web App_, set the callback URL. Getting the user's **email** requires enabling "Request email from users" (may need elevated access).

## Apple

Needs a paid Apple Developer account. Create an **App ID**, a **Services ID** (this is the `CLIENT_ID`) with _Sign in with Apple_ enabled, a **Key** (.p8), and register your **HTTPS** domain + return URL (`localhost` is not allowed — test on a deployed preview). The client secret is a **JWT that expires in ≤ 6 months**: generate it with `pnpm apple:secret` and put a reminder in your calendar. Apple may return a **private relay** address (`…@privaterelay.appleid.com`) and only sends the name on the first sign-in.

## Manual acceptance checklist (Google and GitHub)

- [ ] New user signs in → account created, `user.email_verified = true`, name and image filled
- [ ] Signing out and in again reuses the same account (no duplicate user)
- [ ] User with a password account (same verified email) signs in with the provider → accounts are **linked**, not duplicated
- [ ] Cancelling at the provider returns to `/sign-in` with a readable error
- [ ] Security → _Connected accounts_: connect and disconnect work; the **last** sign-in method can't be disconnected
- [ ] Production redirect URI registered and tested on the deployed URL
```

### ✅ Verify (manual, ~20 minutes)

1. Create a Google OAuth client and a GitHub OAuth app following the guide; put the values in `.env.local`; restart `pnpm dev`.
2. Walk through the **manual acceptance checklist** above with real accounts.
3. In Studio, check one social user: `account.provider_id = 'google'` (or `github`), access/refresh tokens stored.

Record the result in `docs/roadmap/06-project-state.md` ("Google ✅ / GitHub ✅ tested on <date>"). Keep the keys only in `.env.local`.

**🚢 Ship** — branch `docs/s3-t03-google-github` · message: `docs(auth): document and manually verify google and github sign-in`

---

## 🎫 S3-T04 — Facebook, X and Apple (config-ready)

**Branch:** `feat/s3-t04-other-providers` · **Story:** US-031 · **2 SP**

> Everything for these three is already in the registry. This ticket adds what's special: **Apple's rotating secret** and the documented limits. They're marked "config-ready, not E2E-tested" (`TD-07`).

```bash
git switch main && git pull && git switch -c feat/s3-t04-other-providers
pnpm add -D jose
```

### 1. Generate Apple's client secret

📄 **Create `scripts/apple-secret.ts`:**

```ts
import { readFileSync } from 'node:fs';

import { importPKCS8, SignJWT } from 'jose';

/**
 * Usage: pnpm apple:secret <TEAM_ID> <SERVICES_ID (client id)> <KEY_ID> <path/to/AuthKey_XXXX.p8>
 * Output: the JWT to put in APPLE_CLIENT_SECRET. Apple caps its lifetime at 6 months.
 */
async function main() {
  const [teamId, clientId, keyId, keyPath] = process.argv.slice(2);
  if (!teamId || !clientId || !keyId || !keyPath) {
    console.error('Usage: pnpm apple:secret <TEAM_ID> <CLIENT_ID> <KEY_ID> <path-to-p8>');
    process.exit(1);
  }

  const privateKey = await importPKCS8(readFileSync(keyPath, 'utf8'), 'ES256');
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('180d')
    .sign(privateKey);

  console.log(jwt);
  console.error(
    '\n⏰ Expires in 180 days — renew it before then (or sign-in with Apple stops working).',
  );
}

main().catch((error) => {
  console.error('❌', (error as Error).message);
  process.exit(1);
});
```

📄 **Edit `package.json`:** `"apple:secret": "tsx scripts/apple-secret.ts"`

> 🔒 The `.p8` file is a private key: keep it **outside** the repo. `.gitignore` already blocks `.env*`; also add `*.p8`.

### 2. Limits to remember

Already documented in `docs/guides/social-auth.md`: Apple needs HTTPS + paid account + 6-month secret rotation; X needs elevated access for emails; Facebook accounts can lack an email (we show `auth.errors.emailMissing`).

### ✅ Verify

```bash
pnpm test                                  # registry tests include Apple's trusted origin
pnpm apple:secret                          # prints usage, exits 1
```

With dummy Facebook/X/Apple values in `.env.local`, three extra buttons appear and the terminal shows no errors on boot; remove the dummy values after checking.

**🚢 Ship** — branch `feat/s3-t04-other-providers` · message: `feat(auth): add apple client secret generator and document provider limits`

---

## 🎫 S3-T05 — Account linking policy and unlink guard

**Branch:** `feat/s3-t05-account-linking` · **Story:** US-031 · **1 SP** · 🔒 security-critical

> 🎯 **Threat:** account takeover by pre-registration. An attacker signs up with `victim@x.com`; later the victim signs in with a provider that reports an _unverified_ email and gets silently merged into the attacker's account. So: **only providers that verify emails are trusted for automatic linking.**

```bash
git switch main && git pull && git switch -c feat/s3-t05-account-linking
```

### 1. The policy as data (testable)

📄 **Create `src/libs/auth-linking.ts`:**

```ts
/**
 * Providers whose emails are verified by the provider itself → safe to auto-link by email.
 * NOT Facebook (unverified emails possible), NOT X, NOT Apple (private relay addresses never match).
 */
export const TRUSTED_PROVIDERS = ['google', 'github'] as const;

export const ACCOUNT_LINKING = {
  enabled: true,
  trustedProviders: [...TRUSTED_PROVIDERS],
  // A provider whose email differs from the account's email can't be attached
  allowDifferentEmails: false,
  // Better Auth refuses to remove the LAST linked account
  allowUnlinkingAll: false,
} as const;
```

📄 **Create `src/libs/auth-linking.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { ACCOUNT_LINKING, TRUSTED_PROVIDERS } from './auth-linking';

it('only email-verifying providers are trusted for automatic linking', () => {
  expect([...TRUSTED_PROVIDERS].sort()).toEqual(['github', 'google']);
  for (const risky of ['facebook', 'twitter', 'apple', 'credential']) {
    expect(ACCOUNT_LINKING.trustedProviders).not.toContain(risky);
  }
});

it('never allows linking different emails or removing the last account', () => {
  expect(ACCOUNT_LINKING.allowDifferentEmails).toBe(false);
  expect(ACCOUNT_LINKING.allowUnlinkingAll).toBe(false);
});
```

📄 **Edit `src/libs/Auth.ts`:**

```ts
import { ACCOUNT_LINKING } from '@/libs/auth-linking';
// inside the config:
    account: { accountLinking: ACCOUNT_LINKING },
```

> 🔍 Confirm option names (`trustedProviders`, `allowDifferentEmails`, `allowUnlinkingAll`) in the account-linking docs of your version.

### 2. Data for the Security page

📄 **Create `src/data/security.ts`** (grows in T06 and T08):

```ts
import 'server-only';
import { headers } from 'next/headers';

import { auth } from '@/libs/Auth';
import { getEnabledProviders, type ProviderSummary } from '@/libs/auth-providers';
import { Env } from '@/libs/Env';

import { requireSession } from './session';

export type SecuritySnapshot = {
  emailVerified: boolean;
  hasPassword: boolean;
  /** providerIds of linked SOCIAL accounts */
  linkedProviders: string[];
  /** credential + social accounts — if this is 1, nothing may be disconnected */
  accountCount: number;
  providers: ProviderSummary[];
};

export async function getSecuritySnapshot(): Promise<SecuritySnapshot> {
  const { user } = await requireSession();

  // 🔍 `listUserAccounts` in current versions (older: `listAccounts`)
  const accounts = await auth.api.listUserAccounts({ headers: await headers() });

  return {
    emailVerified: user.emailVerified,
    hasPassword: accounts.some((account) => account.providerId === 'credential'),
    linkedProviders: accounts
      .filter((account) => account.providerId !== 'credential')
      .map((a) => a.providerId),
    accountCount: accounts.length,
    providers: getEnabledProviders(Env),
  };
}
```

### 3. Connect / disconnect UI

📄 **Create `src/components/account/connected-accounts.tsx`:**

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getPathname, useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import type { ProviderSummary } from '@/libs/auth-providers';
import { authClient } from '@/libs/AuthClient';

type Props = { providers: ProviderSummary[]; linked: string[]; accountCount: number };

export function ConnectedAccounts({ providers, linked, accountCount }: Props) {
  const t = useTranslations('security.connected');
  const tAll = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (providers.length === 0) return <p className="text-muted-foreground text-sm">{t('none')}</p>;

  const canDisconnect = accountCount > 1; // never offer to remove the only sign-in method

  function connect(id: ProviderSummary['id']) {
    startTransition(async () => {
      await authClient.linkSocial({
        provider: id,
        callbackURL: getPathname({ href: '/dashboard/account/security', locale }),
      });
    });
  }

  function disconnect(provider: ProviderSummary) {
    startTransition(async () => {
      const { error } = await authClient.unlinkAccount({ providerId: provider.id });
      if (error) {
        const key = authErrorKey(error);
        toast.error(tAll.has(key as never) ? tAll(key as never) : t('lastMethod'));
        return;
      }
      toast.success(t('disconnected', { provider: provider.label }));
      router.refresh();
    });
  }

  return (
    <ul className="divide-y rounded-md border">
      {providers.map((provider) => {
        const isLinked = linked.includes(provider.id);
        return (
          <li key={provider.id} className="flex items-center justify-between gap-4 p-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              {provider.label}
              {isLinked ? <Badge variant="secondary">{t('linked')}</Badge> : null}
            </span>
            {isLinked ? (
              <Button
                variant="outline"
                size="sm"
                disabled={pending || !canDisconnect}
                title={canDisconnect ? undefined : t('lastMethod')}
                onClick={() => disconnect(provider)}
              >
                {t('disconnect')}
              </Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => connect(provider.id)}>
                {t('connect')}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

📄 **Edit `security/page.tsx`** — load the snapshot and add a card above _Sessions_ (T11 reorganises the page):

```tsx
import { ConnectedAccounts } from '@/components/account/connected-accounts';
import { getSecuritySnapshot } from '@/data/security';
// …
const snapshot = await getSecuritySnapshot();
const tConnected = await getTranslations('security.connected');
// …
<Card>
  <CardHeader>
    <CardTitle>{tConnected('title')}</CardTitle>
    <CardDescription>{tConnected('description')}</CardDescription>
  </CardHeader>
  <CardContent>
    <ConnectedAccounts
      providers={snapshot.providers}
      linked={snapshot.linkedProviders}
      accountCount={snapshot.accountCount}
    />
  </CardContent>
</Card>;
```

Add `'src/data/security.ts'` to the Knip entries only if it complains (it's imported by the page).

### ✅ Verify

```bash
pnpm test && pnpm check
```

Manual (needs Google or GitHub from S3-T03):

1. Account with email + password **and** the same verified email at Google → **Continue with Google** logs you into the **same** user (one row in `user`, two in `account`).
2. A user with only a Google account: **Disconnect** is disabled with the tooltip.
3. Add a password-less user (magic link) → connect GitHub → disconnect is disabled (only one account).
4. **Takeover test (conceptual)** — Facebook is _not_ trusted: if a Facebook sign-in arrives with an email that matches an existing account, it must **not** merge automatically (you get `account_not_linked`). Verify this once with a Facebook test user, or record it as pending in `docs/roadmap/06-project-state.md` (`TD-07`).

**🚢 Ship** — branch `feat/s3-t05-account-linking` · message: `feat(auth): restrict account linking to trusted providers and add connected accounts UI`

---

## 🎫 S3-T06 — Passkeys: register and manage

**Branch:** `feat/s3-t06-passkeys` · **Story:** US-032 · **3 SP** · 🔍 Read the Better Auth **passkey** docs first (package location changed across versions)

```bash
git switch main && git pull && git switch -c feat/s3-t06-passkeys
pnpm add @better-auth/passkey          # 🔍 older versions ship it inside `better-auth` (better-auth/plugins/passkey)
```

### 1. Relying-party configuration (testable)

A passkey is bound to a **relying-party ID** (rpID = your domain, e.g. `localhost` or `app.example.com`) and an **origin**. Get these wrong and registration fails with cryptic browser errors — so they're computed in one tested function.

📄 **Edit `src/libs/Env.ts`** (+ `runtimeEnv`):

```ts
    // Defaults: hostname of NEXT_PUBLIC_APP_URL / app name
    PASSKEY_RP_ID: z.string().min(1).optional(),
    PASSKEY_RP_NAME: z.string().min(1).optional(),
```

📄 **Append to `.env.example`:**

```dotenv
# ─── Passkeys ───────────────────────────────────────
# rpID must equal (or be a parent domain of) the site's hostname. Leave empty to derive it.
PASSKEY_RP_ID=
PASSKEY_RP_NAME=
```

📄 **Create `src/libs/auth-passkey.ts`:**

```ts
type Input = {
  appUrl: string;
  appName: string;
  rpId?: string | undefined;
  rpName?: string | undefined;
};

export function buildPasskeyConfig({ appUrl, appName, rpId, rpName }: Input) {
  const url = new URL(appUrl);
  return {
    // "localhost" is a valid rpID and works over plain http in browsers
    rpID: rpId ?? url.hostname,
    rpName: rpName ?? appName,
    origin: url.origin,
  };
}
```

📄 **Create `src/libs/auth-passkey.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { buildPasskeyConfig } from './auth-passkey';

it('derives rpID and origin from the app URL', () => {
  expect(buildPasskeyConfig({ appUrl: 'http://localhost:3000', appName: 'App' })).toEqual({
    rpID: 'localhost',
    rpName: 'App',
    origin: 'http://localhost:3000',
  });
  expect(buildPasskeyConfig({ appUrl: 'https://app.example.com/', appName: 'App' }).rpID).toBe(
    'app.example.com',
  );
});

it('honours explicit overrides (e.g. a parent domain shared by subdomains)', () => {
  const config = buildPasskeyConfig({
    appUrl: 'https://app.example.com',
    appName: 'App',
    rpId: 'example.com',
    rpName: 'Example',
  });
  expect(config).toMatchObject({
    rpID: 'example.com',
    rpName: 'Example',
    origin: 'https://app.example.com',
  });
});
```

### 2. Plugin (server + client)

📄 **Edit `src/libs/Auth.ts`:**

```ts
import { passkey } from '@better-auth/passkey'; // 🔍 or 'better-auth/plugins/passkey'

import { buildPasskeyConfig } from '@/libs/auth-passkey';
```

in `plugins` (before `nextCookies()`):

```ts
      passkey(
        buildPasskeyConfig({
          appUrl: Env.NEXT_PUBLIC_APP_URL,
          appName: Env.NEXT_PUBLIC_APP_NAME,
          rpId: Env.PASSKEY_RP_ID,
          rpName: Env.PASSKEY_RP_NAME,
        }),
      ),
```

📄 **Edit `src/libs/AuthClient.ts`:**

```ts
import { passkeyClient } from '@better-auth/passkey/client'; // 🔍 or 'better-auth/client/plugins'
// …
  plugins: [magicLinkClient(), passkeyClient()],
```

### 3. Schema + migration (sequential — nothing else open!)

```bash
pnpm auth:schema        # writes src/db/schema/auth.generated.ts — compare, then delete it
```

📄 **Edit `src/db/schema/auth.ts`** — add `uniqueIndex` to the Drizzle import and append (🔍 **the CLI output wins** if columns differ, e.g. `aaguid` appears in recent versions):

```ts
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
```

```bash
rm src/db/schema/auth.generated.ts
pnpm db:generate         # 0002_….sql → CREATE TABLE "passkey" …
pnpm db:check && pnpm test
```

### 4. "Fresh sign-in" for sensitive actions

Deleting a passkey is sensitive: require a **recent** sign-in (same 10-minute window Better Auth uses).

📄 **Create `src/libs/auth-constants.ts`:**

```ts
/** A session younger than this counts as "fresh" (recently authenticated). */
export const SESSION_FRESH_SECONDS = 60 * 10;
```

📄 **Edit `src/libs/Auth.ts`:** `freshAge: SESSION_FRESH_SECONDS,` (import the constant; replaces `60 * 10`).

📄 **Edit `src/libs/errors.ts`** — append:

```ts
export class ReauthRequiredError extends AppError {
  constructor(init: Init = {}) {
    super({
      code: 'REAUTH_REQUIRED',
      httpStatus: 401,
      messageKey: 'auth.errors.freshRequired',
      ...init,
    });
  }
}
```

and add a row to the `it.each` table in `errors.test.ts`: `[new ReauthRequiredError(), 401, 'REAUTH_REQUIRED', 'auth.errors.freshRequired'],`

📄 **Append to `src/data/session.ts`:**

```ts
import { SESSION_FRESH_SECONDS } from '@/libs/auth-constants';
import { ReauthRequiredError } from '@/libs/errors';

/** For sensitive Server Actions: signed in AND authenticated recently. */
export async function requireFreshSession(maxAgeSeconds = SESSION_FRESH_SECONDS): Promise<Session> {
  const session = await getSessionOrThrow();
  const ageSeconds = (Date.now() - new Date(session.session.createdAt).getTime()) / 1000;
  if (ageSeconds > maxAgeSeconds) throw new ReauthRequiredError();
  return session;
}
```

📄 **Add to `src/data/session.test.ts`:**

```ts
import { ReauthRequiredError } from '@/libs/errors';

import { requireFreshSession } from './session';

describe('requireFreshSession', () => {
  it('accepts a recent session', async () => {
    getSessionMock.mockResolvedValue({ ...verified, session: { id: 's1', createdAt: new Date() } });
    await expect(requireFreshSession()).resolves.toBeDefined();
  });

  it('asks for re-authentication when the session is old', async () => {
    getSessionMock.mockResolvedValue({
      ...verified,
      session: { id: 's1', createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await expect(requireFreshSession()).rejects.toBeInstanceOf(ReauthRequiredError);
  });
});
```

(merge the imports at the top of the file)

### 5. Error keys with a per-feature fallback

📄 **Edit `src/libs/auth-error-keys.ts`** — add to `KEYS` and give `authErrorKey` a fallback parameter:

```ts
  AUTH_CANCELLED: 'auth.errors.passkeyCancelled',
```

```ts
export function authErrorKey(
  error: AuthClientError | null | undefined,
  fallback = 'errors.internal',
): string {
  if (error?.status === 429) return 'errors.rateLimited';
  const key = error?.code ? KEYS[error.code] : undefined;
  return key ?? fallback;
}
```

📄 **Add to `auth-error-keys.test.ts`:**

```ts
it('uses the per-feature fallback and maps cancelled passkey prompts', () => {
  expect(authErrorKey({ code: 'UNKNOWN' }, 'auth.errors.passkeyFailed')).toBe(
    'auth.errors.passkeyFailed',
  );
  expect(authErrorKey({ code: 'AUTH_CANCELLED' }, 'auth.errors.passkeyFailed')).toBe(
    'auth.errors.passkeyCancelled',
  );
});
```

### 6. Data, validation, action

📄 **Create `src/validations/security.ts`:**

```ts
import { z } from 'zod';

export const passkeyNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'validation.passkeyName' })
    .max(40, { message: 'validation.passkeyName' }),
});
export type PasskeyNameInput = z.infer<typeof passkeyNameSchema>;
```

📄 **Edit `src/data/security.ts`** — add a type, the field and the query:

```ts
export type PasskeySummary = {
  id: string;
  name: string;
  createdAt: string | null;
  deviceType: string;
  backedUp: boolean;
};
```

in `SecuritySnapshot`: `passkeys: PasskeySummary[];` and in the function:

```ts
// 🔍 `listPasskeys` in current versions
const passkeys = await auth.api.listPasskeys({ headers: await headers() });
```

```ts
    passkeys: passkeys.map((item) => ({
      id: item.id,
      name: item.name ?? 'Passkey',
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      deviceType: item.deviceType,
      backedUp: item.backedUp,
    })),
```

(the public key and credential id never leave the server)

📄 **Create `src/actions/security.ts`:**

```ts
'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { requireFreshSession } from '@/data/session';
import { auth } from '@/libs/Auth';
import { mapAuthApiError } from '@/libs/auth-api-errors';
import { createAction } from '@/utils/action';

const handleDeletePasskey = createAction(z.object({ id: z.string().min(1) }), async ({ id }) => {
  await requireFreshSession(); // authenticated + recently signed in

  try {
    // Better Auth only deletes passkeys that belong to the current user — verify below in the E2E suite
    await auth.api.deletePasskey({ body: { id }, headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  return { deleted: true as const };
});

export async function deletePasskey(input: unknown) {
  return handleDeletePasskey(input);
}
```

### 7. UI

📄 **Create `src/hooks/use-passkey-support.ts`:**

```ts
'use client';

import { useEffect, useState } from 'react';

/** `null` until mounted (avoids a server/client hydration mismatch). */
export function usePasskeySupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'PublicKeyCredential' in window);
  }, []);
  return supported;
}
```

📄 **Create `src/components/account/reauth-notice.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/libs/AuthClient';

/** Shown when an action fails with REAUTH_REQUIRED: signs out and returns here after sign-in. */
export function ReauthNotice() {
  const t = useTranslations('security.reauth');
  const router = useRouter();

  async function signInAgain() {
    await authClient.signOut();
    router.replace({ pathname: '/sign-in', query: { callbackUrl: '/dashboard/account/security' } });
  }

  return (
    <div role="alert" className="border-destructive/40 space-y-2 rounded-md border p-3 text-sm">
      <p className="font-medium">{t('title')}</p>
      <p className="text-muted-foreground">{t('description')}</p>
      <Button size="sm" variant="outline" onClick={signInAgain}>
        {t('action')}
      </Button>
    </div>
  );
}
```

> 🔍 If `router.replace` with an object isn't accepted by your next-intl version, build the URL string with `getPathname` + `?callbackUrl=`.

📄 **Create `src/components/account/passkeys-card.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { deletePasskey } from '@/actions/security';
import { ReauthNotice } from '@/components/account/reauth-notice';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PasskeySummary } from '@/data/security';
import { usePasskeySupport } from '@/hooks/use-passkey-support';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { type PasskeyNameInput, passkeyNameSchema } from '@/validations/security';

export function PasskeysCard({ passkeys }: { passkeys: PasskeySummary[] }) {
  const t = useTranslations('security.passkeys');
  const format = useFormatter();
  const router = useRouter();
  const supported = usePasskeySupport();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const form = useForm<PasskeyNameInput>({
    resolver: zodResolver(passkeyNameSchema),
    defaultValues: { name: '' },
  });

  async function add({ name }: PasskeyNameInput) {
    setFormError(null);
    // Opens the browser/OS passkey prompt
    const { error } = await authClient.passkey.addPasskey({ name });
    if (error) {
      setFormError(authErrorKey(error, 'auth.errors.passkeyFailed'));
      return;
    }
    toast.success(t('added'));
    form.reset();
    router.refresh();
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deletePasskey({ id });
      if (result.ok) {
        toast.success(t('removed'));
        router.refresh();
      } else if (result.error.code === 'REAUTH_REQUIRED') {
        setNeedsReauth(true);
      } else {
        setFormError(result.error.messageKey);
      }
    });
  }

  function saveName() {
    if (!editing) return;
    const parsed = passkeyNameSchema.safeParse({ name: editing.name });
    if (!parsed.success) return;

    startTransition(async () => {
      const { error } = await authClient.passkey.updatePasskey({
        id: editing.id,
        name: parsed.data.name,
      });
      if (error) {
        setFormError(authErrorKey(error));
        return;
      }
      toast.success(t('renamed'));
      setEditing(null);
      router.refresh();
    });
  }

  if (supported === false)
    return <p className="text-muted-foreground text-sm">{t('unsupported')}</p>;

  return (
    <div className="space-y-4">
      {needsReauth ? <ReauthNotice /> : null}
      <FormError messageKey={formError} />

      {passkeys.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {passkeys.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3">
              {editing?.id === item.id ? (
                <div className="flex flex-1 gap-2">
                  <Input
                    aria-label={t('name')}
                    value={editing.name}
                    maxLength={40}
                    onChange={(event) => setEditing({ id: item.id, name: event.target.value })}
                  />
                  <Button size="sm" disabled={pending} onClick={saveName}>
                    {t('save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {t('cancel')}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {item.name}
                      {item.backedUp ? <Badge variant="secondary">{t('synced')}</Badge> : null}
                    </p>
                    {item.createdAt ? (
                      <p className="text-muted-foreground text-xs">
                        {t('created', {
                          date: format.dateTime(new Date(item.createdAt), { dateStyle: 'medium' }),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing({ id: item.id, name: item.name })}
                    >
                      {t('rename')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => remove(item.id)}
                    >
                      {t('delete')}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(add)} noValidate className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              name="name"
              label={t('name')}
              placeholder={t('namePlaceholder')}
              autoComplete="off"
              maxLength={40}
            />
          </div>
          <SubmitButton>{t('add')}</SubmitButton>
        </form>
      </FormProvider>
    </div>
  );
}
```

📄 **Edit `security/page.tsx`** — add a card (before _Sessions_):

```tsx
import { PasskeysCard } from '@/components/account/passkeys-card';
const tPasskeys = await getTranslations('security.passkeys');
// …
<Card>
  <CardHeader>
    <CardTitle>{tPasskeys('title')}</CardTitle>
    <CardDescription>{tPasskeys('description')}</CardDescription>
  </CardHeader>
  <CardContent>
    <PasskeysCard passkeys={snapshot.passkeys} />
  </CardContent>
</Card>;
```

Add `src/validations/security.ts` tests: 📄 **Create `src/validations/security.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { passkeyNameSchema } from './security';

it('accepts 1–40 characters after trimming', () => {
  expect(passkeyNameSchema.safeParse({ name: '  Work laptop ' }).success).toBe(true);
  expect(passkeyNameSchema.safeParse({ name: '   ' }).success).toBe(false);
  expect(passkeyNameSchema.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
});
```

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

Use **Chrome or Edge** on `http://localhost:3000` (Windows Hello / a security key / phone):

1. Security → **Passkeys** → type a name → **Add a passkey** → the OS prompt appears → approve → the passkey is listed with its date.
2. Cancel the OS prompt → "Passkey request cancelled." (no crash, nothing saved).
3. Rename it; delete it → confirmation by toast; the row disappears from Studio (`passkey` table).
4. Sign out, sign in, wait 11 minutes (or set `SESSION_FRESH_SECONDS` to `5` temporarily) → **Delete** now shows "Please sign in again" with a button. Revert the constant.
5. A browser without WebAuthn (or an old one) shows "This browser doesn't support passkeys."

> 🪟 **No Windows Hello/biometrics?** Use a phone via the QR option, or Chrome DevTools → **More tools → WebAuthn → Enable virtual authenticator** to simulate one.

**🚢 Ship** — branch `feat/s3-t06-passkeys` · message: `feat(auth): add passkey registration and management with fresh-session guard`

---

## 🎫 S3-T07 — Passkey sign-in (button + autofill)

**Branch:** `feat/s3-t07-passkey-sign-in` · **Story:** US-032 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s3-t07-passkey-sign-in
```

### 1. Button

📄 **Create `src/components/auth/passkey-button.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormError } from '@/components/forms/form-error';
import { Button } from '@/components/ui/button';
import { usePasskeySupport } from '@/hooks/use-passkey-support';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';

export function PasskeyButton({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations('auth.signIn');
  const router = useRouter(); // callbackUrl is a full path (with locale)
  const supported = usePasskeySupport();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!supported) return null;

  async function signIn() {
    setError(null);
    setBusy(true);
    const { error: failure } = await authClient.signIn.passkey();
    setBusy(false);

    if (failure) {
      setError(authErrorKey(failure, 'auth.errors.passkeyFailed')); // cancel → friendly message
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <FormError messageKey={error} />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={busy}
        aria-busy={busy}
        onClick={signIn}
      >
        {t('passkey')}
      </Button>
    </div>
  );
}
```

### 2. Autofill ("conditional UI")

Browsers can offer your passkeys **inside the email field's autofill dropdown**. It needs two things: `autocomplete="username webauthn"` on the input and a pending _conditional_ request.

📄 **Create `src/hooks/use-passkey-autofill.ts`:**

```ts
'use client';

import { useEffect } from 'react';

import { authClient } from '@/libs/AuthClient';

/** Starts a conditional WebAuthn request; calls `onSuccess` if the user picks a passkey. */
export function usePasskeyAutofill(onSuccess: () => void) {
  useEffect(() => {
    let active = true;

    async function start() {
      if (typeof PublicKeyCredential === 'undefined') return;
      if (!(await PublicKeyCredential.isConditionalMediationAvailable?.())) return;

      const { error } = await authClient.signIn.passkey({ autoFill: true });
      // Errors here are normal (user ignored the dropdown, page navigated) → stay silent
      if (!error && active) onSuccess();
    }

    void start();
    return () => {
      active = false;
    };
    // onSuccess is intentionally not a dependency: we only want ONE pending request per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

> 🔎 If your linter objects to the disable comment, wrap `onSuccess` in `useRef` instead — same behaviour.

📄 **Edit `src/components/auth/sign-in-form.tsx`:**

```tsx
import { usePasskeyAutofill } from '@/hooks/use-passkey-autofill';
// inside SignInForm, after `const router = …`:
usePasskeyAutofill(() => {
  router.push(callbackUrl);
  router.refresh();
});
// and on the email field:
<TextField name="email" label={t('email')} type="email" autoComplete="username webauthn" />;
```

### 3. Offer the button in the panel

📄 **Edit `src/components/auth/sign-in-panel.tsx`:**

```tsx
import { PasskeyButton } from '@/components/auth/passkey-button';
// render it right after the form, before the magic-link toggle:
<PasskeyButton callbackUrl={callbackUrl} />;
```

(The button renders nothing in browsers without WebAuthn.)

### ✅ Verify

```bash
pnpm check
pnpm dev
```

1. With a passkey from S3-T06: sign out → `/sign-in` → **Sign in with a passkey** → OS prompt → you're on `/dashboard`.
2. Click the **Email** field → the browser offers your passkey in the autofill list → pick it → signed in. (Chrome/Edge/Safari; Firefox support varies.)
3. Cancel the prompt → "Passkey request cancelled." and the page remains usable.
4. A user **without** passkeys: the button shows, the prompt finds nothing → friendly error, other methods still work.
5. `/fr/sign-in` → "Se connecter avec une clé d'accès".
6. Studio: `passkey.counter` increases after each sign-in.

**🚢 Ship** — branch `feat/s3-t07-passkey-sign-in` · message: `feat(auth): add passkey sign-in with button and browser autofill`

---

## 🎫 S3-T08 — Two-factor: schema and TOTP enrollment

**Branch:** `feat/s3-t08-totp-enroll` · **Story:** US-033 · **3 SP** · 🔍 Read the Better Auth **two-factor** docs first

```bash
git switch main && git pull && git switch -c feat/s3-t08-totp-enroll
pnpm add qrcode.react
pnpm add -D otplib@12          # tests generate real TOTP codes (v12 API: `authenticator`)
```

### 1. Env, plugin, client

📄 **Edit `src/libs/Env.ts`** (+ `runtimeEnv`): `TOTP_ISSUER: z.string().min(1).optional(),` `.env.example`: `TOTP_ISSUER=` with a comment _"Name shown in authenticator apps (default: app name)"_.

📄 **Edit `src/libs/Auth.ts`:**

```ts
import { twoFactor } from 'better-auth/plugins';
// plugins (before nextCookies):
      twoFactor({
        issuer: Env.TOTP_ISSUER ?? Env.NEXT_PUBLIC_APP_NAME,
        // Backup codes: 10 single-use codes (plugin default) — shown ONCE at enrollment
      }),
```

📄 **Edit `src/libs/AuthClient.ts`:**

```ts
import { twoFactorClient } from 'better-auth/client/plugins';
// plugins: [magicLinkClient(), passkeyClient(), twoFactorClient()],
```

> We deliberately **don't** use the plugin's `onTwoFactorRedirect` hook — our sign-in form navigates itself (locale-aware) in S3-T09.

### 2. Schema + migration

```bash
pnpm auth:schema        # compare with the CLI output, then delete the generated file
```

📄 **Edit `src/db/schema/auth.ts`:** in `user` add `twoFactorEnabled: boolean('two_factor_enabled').default(false),` and append:

```ts
export const twoFactor = pgTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(), // encrypted by the plugin
    backupCodes: text('backup_codes').notNull(), // encrypted by the plugin
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('two_factor_user_id_idx').on(table.userId)],
);
```

```bash
rm src/db/schema/auth.generated.ts
pnpm db:generate        # 0003_….sql
pnpm db:check && pnpm test
```

### 3. Small utilities

📄 **Create `src/utils/totp.ts`:**

```ts
/** Extracts the base32 secret from an otpauth:// URI, grouped in 4s for manual entry. */
export function secretFromTotpUri(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret') ?? '';
  return secret.replace(/(.{4})/g, '$1 ').trim();
}
```

📄 **Create `src/utils/totp.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { secretFromTotpUri } from './totp';

it('extracts and groups the secret', () => {
  expect(secretFromTotpUri('otpauth://totp/App:ada@x.co?secret=JBSWY3DPEHPK3PXP&issuer=App')).toBe(
    'JBSW Y3DP EHPK 3PXP',
  );
});
```

📄 **Create `src/utils/download.ts`:**

```ts
/** Saves text as a file in the browser (used for backup codes). */
export function downloadTextFile(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

📄 **Add error codes to `src/libs/auth-error-keys.ts`** `KEYS`:

```ts
  INVALID_CODE: 'auth.errors.invalidCode',
  INVALID_BACKUP_CODE: 'auth.errors.invalidCode',
  INVALID_TWO_FACTOR_COOKIE: 'auth.errors.twoFactorExpired',
```

### 4. Components

📄 **Create `src/components/account/backup-codes.tsx`** (also used when regenerating, S3-T10):

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { downloadTextFile } from '@/utils/download';

export function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations('security.mfa');
  const [saved, setSaved] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(codes.join('\n'));
    toast.success(t('copied'));
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">{t('backupTitle')}</h3>
        <p className="text-muted-foreground text-sm">{t('backupDescription')}</p>
      </div>

      <ul
        className="bg-muted grid grid-cols-2 gap-2 rounded-md p-4 font-mono text-sm"
        aria-label={t('backupTitle')}
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {t('copy')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadTextFile('backup-codes.txt', codes.join('\n'))}
        >
          {t('download')}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="codes-saved"
          checked={saved}
          onCheckedChange={(value) => setSaved(value === true)}
        />
        <Label htmlFor="codes-saved" className="font-normal">
          {t('saved')}
        </Label>
      </div>

      <Button type="button" disabled={!saved} onClick={onDone}>
        {t('done')}
      </Button>
    </div>
  );
}
```

📄 **Create `src/components/account/totp-setup.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { BackupCodes } from '@/components/account/backup-codes';
import { FormError } from '@/components/forms/form-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { secretFromTotpUri } from '@/utils/totp';

type Step = 'start' | 'scan' | 'backup';

export function TotpSetup() {
  const t = useTranslations('security.mfa');
  const router = useRouter();
  const [step, setStep] = useState<Step>('start');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [uri, setUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    // Re-authentication with the password; returns the secret URI + 10 backup codes
    const { data, error: failure } = await authClient.twoFactor.enable({ password });
    setBusy(false);

    if (failure || !data) {
      setError(authErrorKey(failure));
      return;
    }
    setPassword('');
    setUri(data.totpURI);
    setBackupCodes(data.backupCodes);
    setStep('scan');
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError('validation.totpCode');
      return;
    }

    setBusy(true);
    // 2FA only becomes ACTIVE after the first valid code — so a typo can't lock you out
    const { error: failure } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);

    if (failure) {
      setError(authErrorKey(failure, 'auth.errors.invalidCode'));
      return;
    }
    toast.success(t('enabled'));
    setStep('backup');
  }

  if (step === 'backup') {
    return <BackupCodes codes={backupCodes} onDone={() => router.refresh()} />;
  }

  if (step === 'scan') {
    return (
      <form onSubmit={confirm} noValidate className="space-y-4">
        <FormError messageKey={error} />
        <div>
          <h3 className="font-medium">{t('scanTitle')}</h3>
          <p className="text-muted-foreground text-sm">{t('scanDescription')}</p>
        </div>
        <div className="flex justify-center rounded-md bg-white p-4">
          <QRCodeSVG value={uri} size={176} />
        </div>
        <p className="text-muted-foreground text-xs">
          {t('manualKey')}:{' '}
          <code className="font-mono text-sm select-all">{secretFromTotpUri(uri)}</code>
        </p>
        <div className="space-y-2">
          <Label htmlFor="totp-code">{t('code')}</Label>
          <Input
            id="totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {t('verify')}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={begin} className="space-y-4">
      <FormError messageKey={error} />
      <div className="space-y-2">
        <Label htmlFor="mfa-password">{t('password')}</Label>
        <Input
          id="mfa-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy || password.length === 0}>
        {t('enable')}
      </Button>
    </form>
  );
}
```

> 🔒 The password prompt only works for users who **have** a password. A passwordless user (magic link/social only) must set one first — S3-T11 shows a hint in that case.

### 5. Security snapshot + page card

📄 **Edit `src/data/security.ts`:** add `twoFactorEnabled: boolean;` to the type and `twoFactorEnabled: Boolean(user.twoFactorEnabled),` to the returned object.

📄 **Edit `security/page.tsx`:**

```tsx
import { TotpSetup } from '@/components/account/totp-setup';
const tMfa = await getTranslations('security.mfa');
// …
<Card>
  <CardHeader>
    <CardTitle>{tMfa('title')}</CardTitle>
    <CardDescription>{tMfa('description')}</CardDescription>
  </CardHeader>
  <CardContent>
    {snapshot.twoFactorEnabled ? (
      <p className="text-sm font-medium text-green-600">{tMfa('on')}</p>
    ) : (
      <TotpSetup />
    )}
  </CardContent>
</Card>;
```

### 6. Integration test: enrolment really works

📄 **Create `tests/integration/two-factor.test.ts`:**

```ts
import { eq } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { twoFactor, user } from '@/db/schema';
import { createAuth } from '@/libs/Auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import { signIn, signUpAndVerify, TEST_PASSWORD } from '../utils/auth';
import { createTestDb, type TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
const transport = new MemoryTransport();
let counter = 0;
const nextEmail = () => `mfa${Date.now()}-${++counter}@example.com`;

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

const userRow = async (email: string) =>
  (await db.select().from(user).where(eq(user.email, email)))[0];

describe('TOTP enrolment', () => {
  it('only becomes active after a valid code, and never stores the secret in clear text', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);
    const device = await signIn(auth, email);

    // 🔍 method names: enableTwoFactor / verifyTOTP
    const enabled = await auth.api.enableTwoFactor({
      body: { password: TEST_PASSWORD },
      headers: device.headers,
    });
    const secret = new URL(enabled.totpURI).searchParams.get('secret')!;

    expect(enabled.backupCodes).toHaveLength(10);
    expect((await userRow(email))?.twoFactorEnabled).toBeFalsy(); // not active yet

    await expect(
      auth.api.verifyTOTP({ body: { code: '000000' }, headers: device.headers }),
    ).rejects.toThrow();
    expect((await userRow(email))?.twoFactorEnabled).toBeFalsy();

    await auth.api.verifyTOTP({
      body: { code: authenticator.generate(secret) },
      headers: device.headers,
    });
    const row = await userRow(email);
    expect(row?.twoFactorEnabled).toBe(true);

    const [stored] = await db.select().from(twoFactor).where(eq(twoFactor.userId, row!.id));
    expect(stored?.secret).not.toBe(secret); // encrypted at rest
    expect(stored?.backupCodes).not.toContain(enabled.backupCodes[0]!);
  });

  it('requires the correct password to start enrolment', async () => {
    const email = nextEmail();
    await signUpAndVerify(auth, transport, email);
    const device = await signIn(auth, email);

    await expect(
      auth.api.enableTwoFactor({
        body: { password: 'Wrong-Passw0rd-123' },
        headers: device.headers,
      }),
    ).rejects.toThrow();
  });
});
```

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

1. Security → **Two-factor** → enter your password → **Enable** → a QR code and a manual key appear.
2. Scan with an authenticator app (or compute the code with the key in any TOTP tool) → enter the 6 digits → **Verify and enable** → the **backup codes** screen.
3. **Copy** and **Download** work; **Done** stays disabled until you tick "I have saved…".
4. Wrong code → "That code is not valid…" and 2FA stays off (Studio: `user.two_factor_enabled = false`).
5. After success: `two_factor_enabled = true`; the `two_factor` row's `secret` is **not** the base32 string.
6. Reload the page → status "Enabled" (the full manage UI arrives in S3-T10).

**🚢 Ship** — branch `feat/s3-t08-totp-enroll` · message: `feat(auth): add two-factor schema and TOTP enrolment with backup codes`

---

## 🎫 S3-T09 — Sign-in challenge and backup codes

**Branch:** `feat/s3-t09-mfa-challenge` · **Story:** US-033 · **3 SP** · 🔒 security-critical

> 🎯 For a user with 2FA, a correct **password alone must grant nothing**: no session, no dashboard. Only after TOTP / backup code does a session exist.

```bash
git switch main && git pull && git switch -c feat/s3-t09-mfa-challenge
```

### 1. Validation and rate-limit rules

📄 **Append to `src/validations/security.ts`:**

```ts
export const totpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { message: 'validation.totpCode' }),
  trustDevice: z.boolean(),
});

export const backupCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6, { message: 'validation.backupCode' })
    .max(32, { message: 'validation.backupCode' }),
  trustDevice: z.boolean(),
});

export type TotpInput = z.infer<typeof totpSchema>;
export type BackupCodeInput = z.infer<typeof backupCodeSchema>;
```

📄 **Edit `src/libs/auth-rate-limit.ts`** — add to `AUTH_RATE_LIMIT_RULES` (windows in seconds):

```ts
  // 6-digit codes are guessable by brute force → very strict, 10-minute windows
  '/two-factor/verify-totp': { window: 600, max: 5 },
  '/two-factor/verify-backup-code': { window: 600, max: 5 },
  '/two-factor/verify-otp': { window: 600, max: 5 },
  '/two-factor/send-otp': { window: 600, max: 3 },
  '/sign-in/magic-link': { window: 60, max: 3 },
```

The existing test (`max ≤ 5`, below the default) still applies — keep it green. Exceeding the limit returns **429**, which `authErrorKey` already maps to "Too many requests. Please slow down."

### 2. The sign-in form hands over to the challenge page

📄 **Edit `src/components/auth/sign-in-form.tsx`** — in `onSubmit`, replace the call and add the redirect:

```tsx
const { data, error } = await authClient.signIn.email({ email, password });

if (error) {
  /* …unchanged… */
  return;
}

// Correct password, but a second factor is required: there is NO session yet
if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
  const next = `${getPathname({ href: '/two-factor', locale })}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  router.push(next);
  return;
}

router.push(callbackUrl);
router.refresh();
```

> 🔍 If TypeScript can't see `twoFactorRedirect`, check that `twoFactorClient()` is in `AuthClient.ts` (it extends the response types).

### 3. The challenge forms

📄 **Create `src/components/auth/two-factor-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import {
  type BackupCodeInput,
  backupCodeSchema,
  type TotpInput,
  totpSchema,
} from '@/validations/security';

type Mode = 'totp' | 'backup';
type Props = { callbackUrl: string };

function TrustDevice({ control }: { control: ReturnType<typeof useForm<TotpInput>>['control'] }) {
  const t = useTranslations('auth.twoFactor');
  return (
    <Controller
      control={control}
      name="trustDevice"
      render={({ field, fieldState }) => (
        <Field orientation="horizontal" data-invalid={fieldState.invalid}>
          <Checkbox
            id="trust-device"
            name={field.name}
            checked={field.value}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            aria-invalid={fieldState.invalid}
          />
          <FieldLabel htmlFor="trust-device" className="font-normal">
            {t('trustDevice')}
          </FieldLabel>
        </Field>
      )}
    />
  );
}

function TotpForm({ callbackUrl }: Props) {
  const t = useTranslations('auth.twoFactor');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<TotpInput>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: '', trustDevice: false },
  });

  const code = useWatch({ control: form.control, name: 'code' });
  useEffect(() => form.setFocus('code'), [form]);

  async function onSubmit(values: TotpInput) {
    setFormError(null);
    const { error } = await authClient.twoFactor.verifyTotp({
      code: values.code,
      trustDevice: values.trustDevice,
    });
    if (error) {
      setFormError(authErrorKey(error, 'auth.errors.invalidCode'));
      form.setValue('code', '');
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  // Submit automatically at 6 digits (guard against double submits)
  useEffect(() => {
    if (code.length === 6 && !form.formState.isSubmitting) void form.handleSubmit(onSubmit)();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField
          name="code"
          label={t('code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
        />
        <TrustDevice control={form.control} />
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}

function BackupForm({ callbackUrl }: Props) {
  const t = useTranslations('auth.twoFactor');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<BackupCodeInput>({
    resolver: zodResolver(backupCodeSchema),
    defaultValues: { code: '', trustDevice: false },
  });

  async function onSubmit(values: BackupCodeInput) {
    setFormError(null);
    const { error } = await authClient.twoFactor.verifyBackupCode({
      code: values.code,
      trustDevice: values.trustDevice,
    });
    if (error) {
      setFormError(authErrorKey(error, 'auth.errors.invalidCode'));
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <p className="text-muted-foreground text-sm">{t('backupDescription')}</p>
        <TextField name="code" label={t('backupCode')} autoComplete="off" />
        <SubmitButton className="w-full">{t('submit')}</SubmitButton>
      </form>
    </FormProvider>
  );
}

export function TwoFactorForm({ callbackUrl }: Props) {
  const t = useTranslations('auth.twoFactor');
  const [mode, setMode] = useState<Mode>('totp');

  return (
    <div className="space-y-4">
      {mode === 'totp' ? (
        <TotpForm callbackUrl={callbackUrl} />
      ) : (
        <BackupForm callbackUrl={callbackUrl} />
      )}
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => setMode(mode === 'totp' ? 'backup' : 'totp')}
      >
        {mode === 'totp' ? t('useBackup') : t('useApp')}
      </Button>
    </div>
  );
}
```

> The `TrustDevice` control typing is intentionally loose-but-safe; if TypeScript objects, type the prop as `Control<TotpInput>` imported from `react-hook-form`.

📄 **Create `src/app/[locale]/(auth)/two-factor/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { TwoFactorForm } from '@/components/auth/two-factor-form';
import { requireGuest } from '@/data/session';
import { getPathname } from '@/i18n/navigation';
import { sanitizeCallbackUrl } from '@/utils/safe-redirect';

export default async function TwoFactorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireGuest(); // before the second factor there is no session → guests only

  const { callbackUrl } = await searchParams;
  const destination = sanitizeCallbackUrl(callbackUrl, getPathname({ href: '/dashboard', locale }));
  const t = await getTranslations('auth.twoFactor');

  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <TwoFactorForm callbackUrl={destination} />
    </>
  );
}
```

### 4. Integration tests — the contract

📄 **Append to `tests/integration/two-factor.test.ts`:**

```ts
import { cookieHeaderFrom } from '../utils/auth';

const fresh = { query: { disableCookieCache: true } } as const;

async function enrol(email: string) {
  await signUpAndVerify(auth, transport, email);
  const device = await signIn(auth, email);
  const enabled = await auth.api.enableTwoFactor({
    body: { password: TEST_PASSWORD },
    headers: device.headers,
  });
  const secret = new URL(enabled.totpURI).searchParams.get('secret')!;
  await auth.api.verifyTOTP({
    body: { code: authenticator.generate(secret) },
    headers: device.headers,
  });
  return { secret, backupCodes: enabled.backupCodes };
}

async function passwordSignIn(email: string) {
  const response = await auth.api.signInEmail({
    body: { email, password: TEST_PASSWORD },
    asResponse: true,
  });
  return { response, pending: cookieHeaderFrom(response) };
}

describe('second factor at sign-in', () => {
  it('a correct password alone grants NO session', async () => {
    const email = nextEmail();
    await enrol(email);

    const { response, pending } = await passwordSignIn(email);
    expect((await response.json()).twoFactorRedirect).toBe(true);
    expect(await auth.api.getSession({ headers: pending, ...fresh })).toBeNull();
  });

  it('a valid TOTP code completes the sign-in; a wrong one does not', async () => {
    const email = nextEmail();
    const { secret } = await enrol(email);

    const { pending } = await passwordSignIn(email);
    await expect(
      auth.api.verifyTOTP({ body: { code: '000000' }, headers: pending }),
    ).rejects.toThrow();
    expect(await auth.api.getSession({ headers: pending, ...fresh })).toBeNull();

    const verified = await auth.api.verifyTOTP({
      body: { code: authenticator.generate(secret) },
      headers: pending,
      asResponse: true,
    });
    expect(
      await auth.api.getSession({ headers: cookieHeaderFrom(verified), ...fresh }),
    ).not.toBeNull();
  });

  it('a backup code works exactly once', async () => {
    const email = nextEmail();
    const { backupCodes } = await enrol(email);
    const code = backupCodes[0]!;

    const first = await passwordSignIn(email);
    const accepted = await auth.api.verifyBackupCode({
      body: { code },
      headers: first.pending,
      asResponse: true,
    });
    expect(
      await auth.api.getSession({ headers: cookieHeaderFrom(accepted), ...fresh }),
    ).not.toBeNull();

    const second = await passwordSignIn(email);
    await expect(
      auth.api.verifyBackupCode({ body: { code }, headers: second.pending }),
    ).rejects.toThrow();
  });
});
```

> 🔍 Method names `verifyTOTP`, `verifyBackupCode` and the `{ twoFactorRedirect: true }` response shape follow current docs. If TOTP codes from `otplib` are rejected, check that the server and your machine clocks agree (±30 s).

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

1. Sign out; sign in with your 2FA account's password → you land on `/two-factor` (not the dashboard). In DevTools open `/dashboard` manually → bounced to sign-in (no session yet).
2. Enter a wrong code → "That code is not valid…" and the field clears.
3. Type the right 6 digits → **auto-submits** → dashboard.
4. Sign in again → **Use a backup code instead** → enter one saved code → in. Try the **same** code again on a later sign-in → rejected.
5. Tick **Trust this device** → next sign-in on that browser skips the challenge for 30 days (clear cookies to test again).
6. Enter 6 wrong codes quickly (with `AUTH_RATE_LIMIT=on`) → "Too many requests. Please slow down."
7. Passkey and magic-link sign-ins still work for this user (policy: see S3-T13).
8. `/fr/two-factor` is fully translated.

**🚢 Ship** — branch `feat/s3-t09-mfa-challenge` · message: `feat(auth): add two-factor sign-in challenge with backup codes and attempt limits`

---

## 🎫 S3-T10 — Disable 2FA, regenerate codes, trusted device, email OTP

**Branch:** `feat/s3-t10-mfa-manage` · **Story:** US-033 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s3-t10-mfa-manage
```

### 1. Email OTP flag + sender wiring

📄 **Edit `src/libs/Env.ts`** (+ `runtimeEnv`): `AUTH_EMAIL_OTP_ENABLED: flag('false'),` `.env.example`: `AUTH_EMAIL_OTP_ENABLED=false` with the comment _"Lets users receive their 2FA code by email as a fallback"_.

📄 **Edit the `twoFactor(...)` call in `src/libs/Auth.ts`:**

```ts
      twoFactor({
        issuer: Env.TOTP_ISSUER ?? Env.NEXT_PUBLIC_APP_NAME,
        otpOptions: {
          period: 5, // minutes the emailed code stays valid
          // 🔍 option shape: `sendOTP({ user, otp }, request)`
          sendOTP: async ({ user, otp }, request) => {
            if (!Env.AUTH_EMAIL_OTP_ENABLED) return;
            runInBackground(() => sendOtpEmail({ user, code: otp, request }));
          },
        },
      }),
```

(import `sendOtpEmail`; remove the temporary Knip entry for `auth-emails.tsx`.)

> 🔒 The email-OTP endpoints exist even when the flag is off, but they send nothing. Rate limits (`/two-factor/send-otp`: 3 per 10 min) are already in place from S3-T09.

### 2. Email option in the challenge

📄 **Edit `src/components/auth/two-factor-form.tsx`** — add a third mode (shown only when enabled):

```tsx
type Mode = 'totp' | 'backup' | 'email';
type Props = { callbackUrl: string; emailOtpEnabled?: boolean };
```

```tsx
function EmailOtpForm({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations('auth.twoFactor');
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setError(null);
    setBusy(true);
    const { error: failure } = await authClient.twoFactor.sendOtp();
    setBusy(false);
    if (failure) return setError(authErrorKey(failure));
    setSent(true);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { error: failure } = await authClient.twoFactor.verifyOtp({ code });
    setBusy(false);
    if (failure) return setError(authErrorKey(failure, 'auth.errors.invalidCode'));
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <FormError messageKey={error} />
      {sent ? (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-muted-foreground text-sm">{t('emailSent')}</p>
          <TextFieldLite value={code} onChange={setCode} label={t('code')} />
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
            {t('submit')}
          </Button>
        </form>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t('emailDescription')}</p>
          <Button type="button" className="w-full" disabled={busy} onClick={send}>
            {t('sendEmail')}
          </Button>
        </>
      )}
    </div>
  );
}
```

with a tiny local helper (labelled input without RHF):

```tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function TextFieldLite({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="otp-code">{label}</Label>
      <Input
        id="otp-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
      />
    </div>
  );
}
```

Update the wrapper so it can cycle through modes:

```tsx
export function TwoFactorForm({ callbackUrl, emailOtpEnabled = false }: Props) {
  const t = useTranslations('auth.twoFactor');
  const [mode, setMode] = useState<Mode>('totp');

  return (
    <div className="space-y-2">
      {mode === 'totp' ? <TotpForm callbackUrl={callbackUrl} /> : null}
      {mode === 'backup' ? <BackupForm callbackUrl={callbackUrl} /> : null}
      {mode === 'email' ? <EmailOtpForm callbackUrl={callbackUrl} /> : null}

      {mode !== 'totp' ? (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('totp')}>
          {t('useApp')}
        </Button>
      ) : null}
      {mode !== 'backup' ? (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('backup')}>
          {t('useBackup')}
        </Button>
      ) : null}
      {emailOtpEnabled && mode !== 'email' ? (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setMode('email')}>
          {t('useEmail')}
        </Button>
      ) : null}
    </div>
  );
}
```

📄 **Edit the two-factor page:** `<TwoFactorForm callbackUrl={destination} emailOtpEnabled={Env.AUTH_EMAIL_OTP_ENABLED} />` (import `Env`).

### 3. Manage 2FA: regenerate codes and disable

📄 **Create `src/components/account/mfa-manage.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { BackupCodes } from '@/components/account/backup-codes';
import { FormError } from '@/components/forms/form-error';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';

function PasswordPrompt({
  id,
  value,
  onChange,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function MfaManage() {
  const t = useTranslations('security.mfa');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [regenPassword, setRegenPassword] = useState('');
  const [regenOpen, setRegenOpen] = useState(false);

  async function disable(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { error: failure } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (failure) return setError(authErrorKey(failure));

    toast.success(t('disabled'));
    setOpen(false);
    router.refresh();
  }

  async function regenerate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: failure } = await authClient.twoFactor.generateBackupCodes({
      password: regenPassword,
    });
    setBusy(false);
    if (failure || !data) return setError(authErrorKey(failure));

    toast.success(t('regenerated'));
    setRegenPassword('');
    setRegenOpen(false);
    setNewCodes(data.backupCodes);
  }

  if (newCodes) return <BackupCodes codes={newCodes} onDone={() => setNewCodes(null)} />;

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-green-600">{t('on')}</p>

      <div className="flex flex-wrap gap-2">
        <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">{t('regenerate')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('regenerate')}</DialogTitle>
              <DialogDescription>{t('password')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={regenerate} className="space-y-4">
              <FormError messageKey={error} />
              <PasswordPrompt
                id="regen-password"
                value={regenPassword}
                onChange={setRegenPassword}
                label={t('password')}
              />
              <DialogFooter>
                <Button type="submit" disabled={busy || regenPassword.length === 0}>
                  {t('regenerate')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">{t('disable')}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('disableTitle')}</DialogTitle>
              <DialogDescription>{t('disableDescription')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={disable} className="space-y-4">
              <FormError messageKey={error} />
              <PasswordPrompt
                id="disable-password"
                value={password}
                onChange={setPassword}
                label={t('password')}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={busy || password.length === 0}
                >
                  {t('disable')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
```

📄 **Edit `security/page.tsx`:** replace the "Enabled" placeholder with `<MfaManage />`.

### ✅ Verify

```bash
pnpm check
pnpm dev
```

1. Security (2FA enabled) → **Regenerate backup codes** → password → a **new** list; an **old** code no longer works at sign-in.
2. **Disable two-factor** → wrong password → error; right password → status switches back to the enrolment form; sign-in no longer asks for a code.
3. Set `AUTH_EMAIL_OTP_ENABLED=true`, restart: on `/two-factor` a **Email me a code instead** option appears → **Send me a code** → the terminal prints "Your sign-in code" with 6 digits → enter it → signed in. With the flag off the option is hidden and no email is printed even if you call the endpoint.
4. "Trust this device": covered in S3-T09; confirm the 30-day behaviour once more after re-enabling 2FA.

**🚢 Ship** — branch `feat/s3-t10-mfa-manage` · message: `feat(auth): add 2fa disable, backup code regeneration and optional email otp`

---

## 🎫 S3-T11 — The Security page, assembled

**Branch:** `feat/s3-t11-security-page` · **Story:** US-034 · **5 SP**

> 🎯 Until now each ticket bolted a card onto `account/security`. This ticket turns the pile into a **designed page**: a security checkup on top, passwordless-aware cards, a loading skeleton, and component tests.

```bash
git switch main && git pull && git switch -c feat/s3-t11-security-page
```

### 1. Two extra strings

📄 **`src/locales/en.json`** — in `security` add `"noPassword"`, and in `security.mfa` add `"needsPassword"`:

```json
    "noPassword": "Your account has no password yet. Use “Forgot password” on the sign-in page to create one.",
```

```json
      "needsPassword": "Two-factor authentication needs a password. Create one first with “Forgot password” on the sign-in page.",
```

📄 **`src/locales/fr.json`:**

```json
    "noPassword": "Votre compte n'a pas encore de mot de passe. Utilisez « Mot de passe oublié » sur la page de connexion pour en créer un.",
```

```json
      "needsPassword": "L'authentification à deux facteurs nécessite un mot de passe. Créez-en un d'abord avec « Mot de passe oublié » sur la page de connexion.",
```

> 🔍 Whether the reset flow can _create_ a first password for a passwordless user depends on your Better Auth version — test it once and adjust the wording if needed.

### 2. The score (pure function)

📄 **Create `src/libs/security-score.ts`:**

```ts
type Input = { emailVerified: boolean; twoFactorEnabled: boolean; passkeyCount: number };

export type ScoreItem = { key: 'emailVerified' | 'twoFactor' | 'passkey'; done: boolean };

/** Counts only protections that really reduce risk. */
export function computeSecurityScore({ emailVerified, twoFactorEnabled, passkeyCount }: Input) {
  const items: ScoreItem[] = [
    { key: 'emailVerified', done: emailVerified },
    { key: 'twoFactor', done: twoFactorEnabled },
    { key: 'passkey', done: passkeyCount > 0 },
  ];
  return { items, count: items.filter((item) => item.done).length, total: items.length };
}
```

📄 **Create `src/libs/security-score.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { computeSecurityScore } from './security-score';

it('counts the enabled protections', () => {
  expect(
    computeSecurityScore({ emailVerified: true, twoFactorEnabled: false, passkeyCount: 0 }),
  ).toMatchObject({ count: 1, total: 3 });
  expect(
    computeSecurityScore({ emailVerified: true, twoFactorEnabled: true, passkeyCount: 2 }),
  ).toMatchObject({ count: 3, total: 3 });
});
```

### 3. Presentational components

📄 **Create `src/components/account/security-section.tsx`:**

```tsx
import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/cn';

type Props = {
  title: string;
  description?: string;
  tone?: 'default' | 'danger';
  children: ReactNode;
};

export function SecuritySection({ title, description, tone = 'default', children }: Props) {
  return (
    <Card className={cn(tone === 'danger' && 'border-destructive/50')}>
      <CardHeader>
        <CardTitle className={cn(tone === 'danger' && 'text-destructive')}>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
```

📄 **Create `src/components/account/security-score.tsx`:**

```tsx
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SecuritySection } from '@/components/account/security-section';
import { computeSecurityScore } from '@/libs/security-score';

type Props = { emailVerified: boolean; twoFactorEnabled: boolean; passkeyCount: number };

export function SecurityScore(props: Props) {
  const t = useTranslations('security.score');
  const { items, count, total } = computeSecurityScore(props);

  return (
    <SecuritySection title={t('title')} description={t('summary', { count, total })}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
        aria-label={t('title')}
        className="bg-muted mb-4 h-2 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${(count / total) * 100}%` }}
        />
      </div>
      <ul className="space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            {item.done ? (
              <Check className="size-4 text-green-600" aria-hidden />
            ) : (
              <X className="text-muted-foreground size-4" aria-hidden />
            )}
            <span className={item.done ? '' : 'text-muted-foreground'}>{t(item.key)}</span>
            <span className="sr-only">{item.done ? '✓' : '✗'}</span>
          </li>
        ))}
      </ul>
    </SecuritySection>
  );
}
```

### 4. The page (final form)

📄 **Rewrite `src/app/[locale]/(app)/dashboard/account/security/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { ChangePasswordForm } from '@/components/account/change-password-form';
import { ConnectedAccounts } from '@/components/account/connected-accounts';
import { DeleteAccountForm } from '@/components/account/delete-account-form';
import { MfaManage } from '@/components/account/mfa-manage';
import { PasskeysCard } from '@/components/account/passkeys-card';
import { SecurityScore } from '@/components/account/security-score';
import { SecuritySection } from '@/components/account/security-section';
import { SessionsList } from '@/components/account/sessions-list';
import { TotpSetup } from '@/components/account/totp-setup';
import { getSecuritySnapshot } from '@/data/security';
import { requireSession } from '@/data/session';
import { listUserSessions } from '@/data/sessions';

export default async function SecurityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession(); // each page guards itself — layouts are not guards

  const [snapshot, sessions, t] = await Promise.all([
    getSecuritySnapshot(),
    listUserSessions(),
    getTranslations(),
  ]);

  return (
    <div className="space-y-6">
      <SecurityScore
        emailVerified={snapshot.emailVerified}
        twoFactorEnabled={snapshot.twoFactorEnabled}
        passkeyCount={snapshot.passkeys.length}
      />

      <SecuritySection
        title={t('account.password.title')}
        description={t('account.password.description')}
      >
        {snapshot.hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-muted-foreground text-sm">{t('security.noPassword')}</p>
        )}
      </SecuritySection>

      <SecuritySection
        title={t('security.connected.title')}
        description={t('security.connected.description')}
      >
        <ConnectedAccounts
          providers={snapshot.providers}
          linked={snapshot.linkedProviders}
          accountCount={snapshot.accountCount}
        />
      </SecuritySection>

      <SecuritySection
        title={t('security.passkeys.title')}
        description={t('security.passkeys.description')}
      >
        <PasskeysCard passkeys={snapshot.passkeys} />
      </SecuritySection>

      <SecuritySection title={t('security.mfa.title')} description={t('security.mfa.description')}>
        {!snapshot.hasPassword ? (
          <p className="text-muted-foreground text-sm">{t('security.mfa.needsPassword')}</p>
        ) : snapshot.twoFactorEnabled ? (
          <MfaManage />
        ) : (
          <TotpSetup />
        )}
      </SecuritySection>

      <SecuritySection
        title={t('account.sessions.title')}
        description={t('account.sessions.description')}
      >
        <SessionsList sessions={sessions} />
      </SecuritySection>

      <SecuritySection
        tone="danger"
        title={t('account.danger.title')}
        description={t('account.danger.description')}
      >
        <DeleteAccountForm />
      </SecuritySection>
    </div>
  );
}
```

📄 **Create `security/loading.tsx`:**

```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function SecurityLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-lg border p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
```

### 5. Component tests (browser mode)

📄 **Create `src/components/account/security-score.test.tsx`:**

```tsx
import { expect, test } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';
import { SecurityScore } from './security-score';

test('summarises the protections that are enabled', async () => {
  const screen = await renderWithIntl(
    <SecurityScore emailVerified twoFactorEnabled={false} passkeyCount={1} />,
  );

  await expect.element(screen.getByText('2 of 3 protections enabled')).toBeVisible();
  await expect.element(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
});
```

📄 **Create `src/components/account/connected-accounts.test.tsx`:**

```tsx
import { expect, test, vi } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';
import { ConnectedAccounts } from './connected-accounts';

vi.mock('@/libs/AuthClient', () => ({
  authClient: { linkSocial: vi.fn(), unlinkAccount: vi.fn() },
}));
vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ href }: { href: string }) => href,
  useRouter: () => ({ refresh: vi.fn() }),
}));

const providers = [{ id: 'github' as const, label: 'GitHub' }];

test('the only sign-in method cannot be disconnected', async () => {
  const screen = await renderWithIntl(
    <ConnectedAccounts providers={providers} linked={['github']} accountCount={1} />,
  );
  await expect.element(screen.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
});

test('a linked provider can be disconnected when another method exists', async () => {
  const screen = await renderWithIntl(
    <ConnectedAccounts providers={providers} linked={['github']} accountCount={2} />,
  );
  await expect.element(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
});

test('shows a hint when no provider is configured', async () => {
  const screen = await renderWithIntl(
    <ConnectedAccounts providers={[]} linked={[]} accountCount={1} />,
  );
  await expect.element(screen.getByText('No social providers are configured.')).toBeVisible();
});
```

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check
pnpm dev
```

1. Security opens with the **checkup** (verified email ✓; the others ✗) and a progress bar. Enable a passkey and 2FA → the count climbs to 3/3.
2. A **magic-link-only** user (no password): the password card and the 2FA card show the hint instead of a form that would fail.
3. Reload with a throttled network (DevTools → Slow 3G) → the skeleton appears.
4. Keyboard only: you can tab through every card and operate every button; the progress bar has an accessible name.
5. `/fr/dashboard/account/security` is entirely French.
6. Delete the `requireSession()` line from this page → `pnpm test` fails (guard-coverage test). Restore it.

**🚢 Ship** — branch `feat/s3-t11-security-page` · message: `feat(account): assemble security page with checkup, passwordless hints and skeleton`

---

## 🎫 S3-T12 — E2E for advanced authentication

**Branch:** `test/s3-t12-advanced-auth-e2e` · **Story:** US-035 · **3 SP** · risk **R-07** (flaky passkey/TOTP tests)

> 🎯 Real browser, real server. **Passkeys** use Chromium's _virtual authenticator_; **TOTP** uses real codes computed with `otplib`. Social is limited to UI + redirect assertions (see decisions table).

```bash
git switch main && git pull && git switch -c test/s3-t12-advanced-auth-e2e
```

### 1. Config: dummy provider credentials for the E2E server

📄 **Edit `playwright.config.ts`:**

```ts
const appEnv = {
  AUTH_RATE_LIMIT: 'on',
  EMAIL_TRANSPORT: 'console',
  // Dummy values: they only make the GitHub button appear — we never complete a real OAuth flow
  GITHUB_CLIENT_ID: 'e2e-github-id',
  GITHUB_CLIENT_SECRET: 'e2e-github-secret',
};
```

### 2. Helpers

📄 **Create `e2e/helpers/ui.ts`** (move `signInViaUi` here from `auth.spec.ts` and import it there):

```ts
import type { Page } from '@playwright/test';

export async function signInViaUi(page: Page, email: string, password: string) {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signOutViaUi(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL('/');
}
```

📄 **Create `e2e/helpers/webauthn.ts`:**

```ts
import type { Page } from '@playwright/test';

/** Adds a software authenticator to the page's browser: no hardware, no OS prompts. */
export async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true, // discoverable credentials → "sign in with a passkey" needs no username
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}
```

📄 **Create `e2e/helpers/totp.ts`:**

```ts
import type { Page } from '@playwright/test';
import { authenticator } from 'otplib';

const lastStep = new Map<string, number>();
const step = () => Math.floor(Date.now() / 30_000);

/**
 * A TOTP code can only be used once per 30 s window. If this secret already produced a code in the
 * current window, wait for the next one — deterministic instead of flaky (risk R-07).
 */
export async function nextTotp(secret: string): Promise<string> {
  if (lastStep.get(secret) === step()) {
    await new Promise((resolve) => setTimeout(resolve, 30_000 - (Date.now() % 30_000) + 500));
  }
  lastStep.set(secret, step());
  return authenticator.generate(secret);
}

/** Runs the enrolment wizard in the UI. Returns the secret and the backup codes. */
export async function enableTotpViaUi(page: Page, password: string) {
  await page.goto('/dashboard/account/security');
  await page.getByLabel('Confirm your password').fill(password);
  await page.getByRole('button', { name: 'Enable two-factor' }).click();

  const manualKey = await page.getByText("Can't scan?").locator('code').innerText();
  const secret = manualKey.replace(/\s+/g, '');

  await page.getByLabel('6-digit code').fill(await nextTotp(secret));
  await page.getByRole('button', { name: 'Verify and enable' }).click();

  const list = page.getByRole('list', { name: 'Save your backup codes' });
  const backupCodes = (await list.getByRole('listitem').allInnerTexts()).map((text) => text.trim());

  await page.getByLabel('I have saved my backup codes').check();
  await page.getByRole('button', { name: 'Done' }).click();
  return { secret, backupCodes };
}
```

### 3. The specs

📄 **Create `e2e/auth-advanced.spec.ts`:**

```ts
import { expect, test } from './fixtures';
import { waitForEmail } from './helpers/inbox';
import { enableTotpViaUi, nextTotp } from './helpers/totp';
import { signInViaUi, signOutViaUi } from './helpers/ui';
import { createUser, uniqueEmail } from './helpers/users';
import { addVirtualAuthenticator } from './helpers/webauthn';

test.describe('magic link', () => {
  test('signs a new visitor in once, then the link is dead', async ({ page, browser }) => {
    const email = uniqueEmail();
    const since = Date.now();

    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send sign-in link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    const mail = await waitForEmail(email, { since });
    expect(mail.subject).toBe('Your sign-in link');
    const link = mail.links[0]!;

    await page.goto(link);
    await expect(page).toHaveURL(/\/dashboard$/);

    // Replay in a clean browser: the token has been consumed
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(link);
    await expect(otherPage).toHaveURL(/\/sign-in/);
    await expect(otherPage.getByRole('alert')).toContainText('invalid or expired');
    await other.close();
  });
});

test.describe('passkeys', () => {
  test('register, sign in with the passkey, delete it', async ({ page, request, baseURL }) => {
    const user = await createUser(request, baseURL!);
    await addVirtualAuthenticator(page);

    await page.goto('/sign-in');
    await signInViaUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/dashboard/account/security');
    await page.getByLabel('Passkey name').fill('E2E key');
    await page.getByRole('button', { name: 'Add a passkey' }).click();
    await expect(page.getByText('Passkey added.')).toBeVisible();
    await expect(page.getByText('E2E key')).toBeVisible();

    await page.goto('/dashboard');
    await signOutViaUi(page);

    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/dashboard/account/security');
    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.getByText('Passkey removed.')).toBeVisible();
    await expect(page.getByText("You haven't added a passkey yet.")).toBeVisible();
  });
});

test.describe('two-factor authentication', () => {
  test('TOTP is required after the password, backup codes work once', async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(120_000); // may wait for the next 30 s TOTP window (see nextTotp)
    const user = await createUser(request, baseURL!);

    await page.goto('/sign-in');
    await signInViaUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    const { secret, backupCodes } = await enableTotpViaUi(page, user.password);
    expect(backupCodes).toHaveLength(10);
    await expect(page.getByText('Enabled', { exact: true })).toBeVisible();

    // 1) password → challenge, NOT the dashboard
    await signOutViaUi(page);
    await page.goto('/sign-in');
    await signInViaUi(page, user.email, user.password);
    await expect(page).toHaveURL(/\/two-factor/);

    await page.goto('/dashboard'); // no session yet → bounced
    await expect(page).toHaveURL(/\/sign-in/);

    // 2) wrong code, then the right one
    await signInViaUi(page, user.email, user.password);
    await page.getByLabel('Authentication code').fill('000000');
    await expect(page.getByRole('alert')).toContainText('not valid');
    await page.getByLabel('Authentication code').fill(await nextTotp(secret));
    await expect(page).toHaveURL(/\/dashboard$/);

    // 3) backup code: works once
    const [code] = backupCodes;
    await signOutViaUi(page);
    await page.goto('/sign-in');
    await signInViaUi(page, user.email, user.password);
    await page.getByRole('button', { name: 'Use a backup code instead' }).click();
    await page.getByLabel('Backup code').fill(code!);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await signOutViaUi(page);
    await page.goto('/sign-in');
    await signInViaUi(page, user.email, user.password);
    await page.getByRole('button', { name: 'Use a backup code instead' }).click();
    await page.getByLabel('Backup code').fill(code!);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('alert')).toContainText('not valid');
  });
});

test.describe('social sign-in', () => {
  test.skip(
    !process.env.CI,
    'Needs the dummy GITHUB_* env that Playwright sets for CI-mode servers: run with CI=1',
  );

  test('only configured providers are offered and the redirect is correct', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toHaveCount(0);

    const authorize = page.waitForRequest(/github\.com\/login\/oauth\/authorize/);
    await page.route('https://github.com/**', (route) => route.abort()); // never talk to GitHub
    await page.getByRole('button', { name: 'Continue with GitHub' }).click();

    const url = new URL((await authorize).url());
    expect(url.searchParams.get('client_id')).toBe('e2e-github-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback/github',
    );
    expect(url.searchParams.get('state')).toBeTruthy(); // CSRF protection is on
  });

  test('provider errors come back as readable messages', async ({ page }) => {
    await page.goto('/sign-in?error=account_not_linked');
    await expect(page.getByRole('alert')).toContainText('already registered');
  });
});
```

> 🔍 Selectors rely on the exact English strings in `en.json`. If you reworded something, update the spec **or** the message — never silently both. 🔎 **Linking rules** (no takeover via untrusted providers) are enforced by `ACCOUNT_LINKING` (unit-tested in S3-T05) and verified manually (S3-T03/T05 checklists). A faithful fake OAuth server is tracked as `TD-07`.

### ✅ Verify

```bash
pnpm e2e                       # magic link, passkeys, 2FA (social specs skipped)
CI=1 pnpm e2e                  # 🪟 cmd.exe: set CI=1&& pnpm e2e  — stop `pnpm dev` first (ports 3000 and 5433)
```

Run the passkey and 2FA tests **10 times** to look for flakiness:

```bash
pnpm exec playwright test e2e/auth-advanced.spec.ts --repeat-each=10 --workers=2
```

Expected: 100 % pass. If TOTP tests flake, check your machine clock sync (Windows: _Settings → Time → Sync now_). In CI the traces are uploaded on failure (`playwright-report`).

**🚢 Ship** — branch `test/s3-t12-advanced-auth-e2e` · message: `test(e2e): cover magic link, passkeys, totp and social sign-in`

---

## 🎫 S3-T13 — Hardening review

**Branch:** `feat/s3-t13-auth-hardening` · **Story:** US-035 · **2 SP** · 🔒 security-critical

```bash
git switch main && git pull && git switch -c feat/s3-t13-auth-hardening
```

### 1. Close the MFA bypass through magic links

Without this, an attacker with access to the victim's **mailbox** skips the TOTP step by requesting a magic link. Users with 2FA must use password + code (or a passkey).

📄 **Edit `src/libs/auth-magic-link.ts`:**

```ts
export type MagicLinkDecision = 'send' | 'skip-unknown-user' | 'skip-mfa-user';

export async function decideMagicLink(
  database: DbLike,
  { email, allowSignUp }: { email: string; allowSignUp: boolean },
): Promise<MagicLinkDecision> {
  const [existing] = await database
    .select({ id: user.id, twoFactorEnabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.email, email.toLowerCase()));

  if (!existing) return allowSignUp ? 'send' : 'skip-unknown-user';
  if (existing.twoFactorEnabled) return 'skip-mfa-user'; // never bypass the second factor
  return 'send';
}
```

The sender already logs the reason (`security` category) and the HTTP response stays identical, so nothing leaks.

📄 **Share the enrolment helper** — move `enrol` from `two-factor.test.ts` into `tests/utils/auth.ts`:

```ts
import { authenticator } from 'otplib';

export async function enrolTotp(auth: TestAuth, transport: MemoryTransport, email: string) {
  await signUpAndVerify(auth, transport, email);
  const device = await signIn(auth, email);
  const enabled = await auth.api.enableTwoFactor({
    body: { password: TEST_PASSWORD },
    headers: device.headers,
  });
  const secret = new URL(enabled.totpURI).searchParams.get('secret')!;
  await auth.api.verifyTOTP({
    body: { code: authenticator.generate(secret) },
    headers: device.headers,
  });
  return { secret, backupCodes: enabled.backupCodes };
}
```

(update `two-factor.test.ts` to call `enrolTotp(auth, transport, email)`).

📄 **Add to `tests/integration/magic-link.test.ts`:**

```ts
import { enrolTotp } from '../utils/auth';

describe('MFA policy', () => {
  it('never sends a magic link to an account protected by two-factor', async () => {
    const email = nextEmail();
    await enrolTotp(auth, transport, email);
    transport.clear();

    expect(await decideMagicLink(db, { email, allowSignUp: true })).toBe('skip-mfa-user');

    // End to end: the request "succeeds" (no enumeration) but no email is produced
    await auth.api.signInMagicLink({
      body: { email, callbackURL: '/dashboard' },
      headers: new Headers(),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(transport.outbox).toHaveLength(0);
  });
});
```

### 2. Never log second-factor material

📄 **Edit `src/libs/logger-redaction.ts`:**

```ts
const SENSITIVE_KEY =
  /pass(word)?|token|secret|authorization|cookie|api[-_]?key|otp|totp|backup.?codes?|verification.?code|private.?key/i;
```

📄 **Add to `src/libs/logger-redaction.test.ts`:**

```ts
it('masks second-factor and key material', () => {
  expect(
    redactValue({
      otp: '123456',
      totpSecret: 'ABC',
      backupCodes: ['a'],
      privateKey: 'k',
      code: 'NOT_FOUND',
    }),
  ).toEqual({
    otp: REDACTED,
    totpSecret: REDACTED,
    backupCodes: REDACTED,
    privateKey: REDACTED,
    code: 'NOT_FOUND', // error codes stay visible
  });
});
```

Then scan a verbose test run for leaks (Git Bash):

```bash
LOG_LEVEL=debug pnpm exec vitest run --project unit 2>&1 | grep -Ei "totpURI|otpauth://|backup|secret=" || echo "✅ no second-factor material in logs"
```

(Fixture strings inside tests may appear — judge each hit: **real** secrets must never print.)

### 3. Review checklist (record the outcome of each in the PR description)

| Area | Check | Where |
| --- | --- | --- |
| Trusted origins | Only `NEXT_PUBLIC_APP_URL` (+ `appleid.apple.com` when Apple is on) | `buildTrustedOrigins` test |
| Cookies | Session cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production builds | DevTools → Application → Cookies after `pnpm build && pnpm start` |
| CSRF/origin | A `POST /api/auth/*` with a foreign `Origin` header is rejected | `curl -H "origin: https://evil.example" -X POST …/api/auth/sign-out` → 403 |
| IP source | `x-forwarded-for` is overwritten by your platform (Vercel) — not client-controllable | `docs/guides/auth-security.md` |
| Passkey rpID | Matches the production domain; documented subdomain behaviour | `PASSKEY_RP_ID` |
| Secrets at rest | TOTP secrets & backup codes encrypted in DB | `two-factor.test.ts` |
| Rate limits | Code endpoints ≤ 5/10 min; magic link 3/min | `auth-rate-limit.test.ts` |
| Account linking | Only Google/GitHub trusted | `auth-linking.test.ts` |
| MFA coverage | Password+TOTP ✓, magic link blocked for 2FA users ✓, passkey = strong factor (by design), social = provider's own authentication | guide below |

### 4. Security guide

📄 **Create `docs/guides/auth-security.md`:**

```markdown
# Authentication security notes

| Method | What proves identity | MFA behaviour | Main risks → mitigations |
| --- | --- | --- | --- |
| Password | Knowledge | TOTP/backup/email-OTP required when enabled | Credential stuffing → per-IP rate limits (Arcjet in Sprint 6), 12+ chars |
| Magic link | Mailbox access | **Blocked** for users with 2FA (`decideMagicLink`) | Mailbox takeover → single-use, 5 min, no enumeration |
| Social (Google/GitHub) | The provider's own login (+ their MFA) | Not asked again | Email-based takeover → only verifying providers are trusted for linking |
| Passkey | Possession + biometrics/PIN (phishing-resistant) | Counts as a strong factor; no TOTP prompt | Lost device → register several passkeys, keep backup codes |
| TOTP / backup / email OTP | Possession | — | Brute force → 5 attempts / 10 min; codes single-use |

## Policies

- Sensitive actions (`deletePasskey`, account deletion…) require a **fresh** session (`requireFreshSession`, 10 min).
- 2FA secrets and backup codes are encrypted at rest; backup codes are shown **once**.
- Logs never contain codes, secrets or tokens (`logger-redaction.ts`). Emails in dev (`.emails/`) do contain links — never enable the console transport in production.
- The console email transport must not be used in production (`EMAIL_TRANSPORT=console` is for CI only).

## Known gaps (tracked)

- `TD-07` Facebook / X / Apple not E2E tested; account-linking takeover scenario verified manually.
- `TD-11` No server-side logging of passkey verification failures (e.g. signature-counter anomalies) beyond the library's own errors.
- `TD-12` "Trust this device" is not disabled for admins yet (decide in Sprint 4 with the admin role).
- `TD-13` Arcjet adds per-email and bot protection in Sprint 6; until then per-IP limits only.
```

Also update `docs/roadmap/04-dependencies-risks.md` — add `TD-11`, `TD-12`, `TD-13` as above.

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check
CI=1 pnpm e2e
```

Manual: with a 2FA account, request a magic link → same "Check your email" screen, **no** email in the terminal and a `security` log line "Magic link not sent: skip-mfa-user".

**🚢 Ship** — branch `feat/s3-t13-auth-hardening` · message: `feat(auth): block magic links for 2fa users, redact 2fa material and document security policy`

---

## 🧾 Sprint 3 wrap-up

**Branch:** `docs/s3-wrap-up`

```bash
git switch main && git pull && git switch -c docs/s3-wrap-up
```

### 1. Update `docs/guides/auth.md`

Add under **Flows**:

```markdown
| Magic link | `/sign-in` → "Email me a sign-in link" (`AUTH_MAGIC_LINK_ENABLED`) | | Social | Buttons appear per configured provider → `docs/guides/social-auth.md` | | Passkeys | Security page; sign in via button or email-field autofill | | Two-factor | Security page (enrol/manage); `/two-factor` challenge at sign-in |
```

and the new environment variables table:

```markdown
| `AUTH_MAGIC_LINK_ENABLED`, `AUTH_ALLOW_SIGNUP_VIA_MAGIC_LINK` | Magic-link switches | | `GOOGLE_*`, `GITHUB_*`, `FACEBOOK_*`, `TWITTER_*`, `APPLE_*` | Social providers — both values or neither | | `PASSKEY_RP_ID`, `PASSKEY_RP_NAME` | Passkey relying party (default: derived from `NEXT_PUBLIC_APP_URL`) | | `TOTP_ISSUER`, `AUTH_EMAIL_OTP_ENABLED` | 2FA issuer name; email OTP fallback |
```

Remove obsolete notes (e.g. "Per-IP limits only…" stays; add a link to `auth-security.md`).

### 2. Update `AGENTS.md`

**Commands:** `pnpm auth:redirect-uris`, `pnpm apple:secret`. **Security / conventions:**

```markdown
- A new sign-in method must be (1) enabled only by configuration, (2) mapped to i18n error keys, (3) consistent with the MFA policy in docs/guides/auth-security.md (never a bypass of the second factor).
- Sensitive Server Actions call `requireFreshSession()`; surface `REAUTH_REQUIRED` with `<ReauthNotice />`.
- Never log OTP/TOTP/backup codes/tokens; pass data as logger properties so redaction applies.
- Social providers: never trust a provider for account linking unless it verifies emails (`src/libs/auth-linking.ts`).
- Schema changes for auth plugins: `pnpm auth:schema`, adapt `src/db/schema/auth.ts`, then `pnpm db:generate`.
```

```bash
pnpm check:agents
```

### 3. Update `docs/roadmap/06-project-state.md`

- **Last completed sprint:** Sprint 3 · **Current sprint:** Sprint 4
- **Tables added:** `passkey`, `two_factor`; column `user.two_factor_enabled` (migrations `0002`, `0003`)
- **Env vars:** magic-link flags, 10 social vars, `PASSKEY_RP_*`, `TOTP_ISSUER`, `AUTH_EMAIL_OTP_ENABLED`
- **Routes:** `/two-factor`, security page cards; **helpers:** `requireFreshSession`, `getSecuritySnapshot`, `decideMagicLink`, `buildSocialProviders`, `ACCOUNT_LINKING`
- **Tested by hand:** Google ✅ / GitHub ✅ (date) · Facebook / X / Apple: config-ready only
- **Deviations:** list the ones from the decisions table + any Better Auth option/method names you had to change
- **Measured:** E2E duration, `--repeat-each=10` flakiness result

Tick the checkboxes in `docs/roadmap/sprint-03-auth-advanced.md`, then:

```bash
pnpm check
git add -A
git commit -m "docs: update auth guides and project state for sprint 3"
git push -u origin docs/s3-wrap-up
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
git tag -a v0.2.0-alpha -m "chore: sprint 3 complete — advanced authentication"
git push origin v0.2.0-alpha
```

---

## 🏁 Sprint 3 — Definition of Done

- [ ] Magic link works once, expires in 5 minutes, replay shows a readable error, unknown emails get the same response
- [ ] Google and GitHub sign-in verified by hand (checklist in `docs/guides/social-auth.md`); providers without credentials **don't render**
- [ ] Only Google/GitHub are trusted for linking; the last sign-in method can't be disconnected
- [ ] Passkeys: add, rename, delete (fresh session), sign in via button **and** autofill
- [ ] 2FA: enrol with QR + backup codes, password alone grants **no session**, backup codes single-use, disable/regenerate with password
- [ ] 2FA users can't receive magic links; passkey/social behaviour documented
- [ ] Sensitive endpoints rate-limited: codes 5 per 10 min, magic link 3 per min
- [ ] Security page: checkup score, passwordless hints, skeleton, fully translated (en/fr)
- [ ] No codes/secrets/tokens in logs (redaction tests)
- [ ] `pnpm test`, `pnpm test:browser`, `pnpm e2e` and `CI=1 pnpm e2e` green; passkey/TOTP specs pass `--repeat-each=10`
- [ ] `docs/guides/social-auth.md` and `docs/guides/auth-security.md` written; `06-project-state.md` updated; tag `v0.2.0-alpha` pushed

### 🎬 Sprint review — measurable acceptance

| Check | Expected |
| --- | --- |
| Magic link | signs in once; second use fails |
| Google / GitHub | sign in and connect/disconnect; last method can't be removed |
| Passkey | register → sign out → sign in with it |
| TOTP | enrol; password-only sign-in lands on the challenge; backup code works once |
| Missing provider env | its button is not rendered |
| 2FA user requests magic link | no email, same screen |
| `pnpm e2e` | advanced-auth specs green |

---

## 🧯 Troubleshooting (Sprint 3)

| Symptom | Likely cause → fix |
| --- | --- |
| `Cannot find module '@better-auth/passkey'` | Your version bundles it: import from `better-auth/plugins/passkey` / `better-auth/client/plugins` (or install the package) |
| Passkey prompt never appears / `SecurityError` | rpID doesn't match the site hostname, or the page isn't a secure context. Use `localhost` (http OK) or HTTPS; check `PASSKEY_RP_ID` |
| "The relying party ID is not a registrable domain suffix" | `PASSKEY_RP_ID` isn't the hostname or a parent of it |
| Autofill dropdown shows no passkey | Browser lacks conditional UI, no discoverable passkey saved, or the input lacks `autoComplete="username webauthn"` |
| TOTP codes always rejected | Clock drift (sync Windows time) — or you're entering the code of another account/issuer |
| `twoFactorRedirect` missing from sign-in response | `twoFactorClient()` not in `AuthClient.ts`, or 2FA never became active (no valid code was entered at enrolment) |
| Locked out of 2FA in dev | Use a backup code, or delete the `two_factor` row and set `user.two_factor_enabled=false` in Studio, or `pnpm db:reset` |
| Social button missing | One of the two env vars is missing (watch the boot warning) |
| `redirect_uri_mismatch` | Registered URI ≠ `{APP_URL}/api/auth/callback/<provider>` → `pnpm auth:redirect-uris` |
| OAuth works locally but not in production | Production URL not registered, `NEXT_PUBLIC_APP_URL` wrong, or (Apple) secret expired |
| `account_not_linked` after social sign-in | Email already registered and the provider isn't trusted/verified → sign in with the original method and use _Connect_ |
| Magic link email never arrives for a known user | The account has 2FA (by design), or `AUTH_MAGIC_LINK_ENABLED=false`; check the `security` log line |
| `auth.api.<method>` is not a function in tests | Method renamed in your Better Auth version — adjust the name, keep the assertion |
| Migration conflict between passkey and two-factor branches | You opened both PRs at once; merge one, then `git rebase main` and regenerate the other migration |
| E2E: `WebAuthn.addVirtualAuthenticator` fails | Not Chromium, or `page` is closed; the helper must run **before** the page triggers WebAuthn |
| E2E TOTP test takes ~30 s | By design: `nextTotp` waits for a fresh 30-second window instead of flaking |
| 🪟 Windows Hello prompt appears during manual tests | That's the real authenticator working — approve it, or use DevTools → WebAuthn virtual authenticator |

---

## ➡️ Next

Sprint 3 complete → **Sprint 4 — Multi-tenancy, RBAC, Admin & Impersonation** (`docs/roadmap/sprint-04-tenancy-rbac-admin.md`): organizations, invitations, roles and permissions, tenant-scoped data with isolation tests, admin console and impersonation. Same format: one branch per ticket, verify, PR, merge.
