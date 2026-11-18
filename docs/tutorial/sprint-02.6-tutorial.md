# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 2.6 — PWA & Service Worker Infrastructure (Nexora)

> Companion to `docs/roadmap/sprint-02.6-pwa.md`. Every `S2.6-Txx` section is one ticket. Follow them **in the order shown here**. All code below was built and verified in a scratch implementation of the repo at the end of Sprint 2 (typecheck, lint, knip, unit tests, production build, and a Playwright e2e against `pnpm start`).

🪟 **Windows + Cmder:** use the **Git Bash tab**. Bash syntax and Node scripts only. Windows-specific notes are marked 🪟.

> ⚠️ **What was and was not verified.** ✅ = executed in the scratch build. 🔍 **Verify** = could not be executed in the authoring environment (real push delivery, browser-mode component tests, `experimental.useOffline` behaviour, an update across two real builds, installing the app on a phone). Run those yourself and record deviations in `docs/roadmap/06-project-state.md`.

> 🛑 **Golden rules (from the backlog).** Never cache anything private. Never ship a worker you cannot switch off. Push is opt-in, per user, and gated by `PUSH_ENABLED`. No secret is committed (the VAPID private key is server-only).

---

## 📋 What you will have at the end

- An installable **Nexora** app: manifest, icons (any + maskable + Apple touch), theme colour, standalone display
- A **hand-written TypeScript service worker** bundled by `scripts/build-sw.mjs` (no Serwist), versioned by build id, with an allow-list cache policy
- A standalone **offline page** (EN + FR), an offline banner, an update toast and an install prompt (incl. iOS instructions)
- **Web Push** (VAPID, `web-push`, a user-scoped `push_subscription` table, opt-in toggle, test push, rate-limited)
- A `usePwa()` hook and two account pages: **Notifications** and **App**
- Caches purged on sign-out, a **kill switch** (`NEXT_PUBLIC_PWA_ENABLED=false`), unit tests and a Playwright spec

## 🔢 Ticket order used in this tutorial

| Order | Ticket | Why |
| --- | --- | --- |
| 1 | **S2.6-T01** Foundation & manifest | Brand, icons, env flags — everything else reads them |
| 2 | **S2.6-T02** Service worker infrastructure | Build script, registration, headers, kill switch |
| 3 | **S2.6-T04** Caching & offline policy | Pure, heavily unit-tested allow-list policy the worker imports |
| 4 | **S2.6-T03** Install & network experience | UI on top of the worker (offline page, banner, update, install) |
| 5 | **S2.6-T05** Push notifications | Adds a dependency, a table and worker handlers |
| 6 | **S2.6-T06** Developer API & UI | `usePwa()`, status page, sign-out cleanup |
| 7 | **S2.6-T07** Native-like capabilities (P2) | Optional; guidance only, not built |
| 8 | **S2.6-T09** Tests, security, docs | E2E, ADRs, kill-switch drill |
| — | **S2.6-T08** Advanced offline (P2) | **Deferred until after Sprint 4** (approved) |

> 📝 The tutorial order differs from the numbering on purpose: T04 (pure cache policy + tests) is built before T03 because the worker and the UI both consume it.

### Decisions applied (approved with the backlog)

| ID | Decision taken |
| --- | --- |
| D1 | Hand-written TS worker built by `scripts/build-sw.mjs`; **esbuild becomes an exact-pinned devDependency**; no Serwist |
| D4 | Push uses **`web-push`** + a `push_subscription` table (user-scoped), behind `PUSH_ENABLED` |
| D6 | Brand **Nexora** — tokens below |
| T08 | Advanced offline **deferred until after Sprint 4** |
| D2, D3, D5, D7, D8, D10, D11, D12 | Recommended defaults from the backlog (update prompt via the existing toast, etc.) |
| D13 | **Approved and delivered separately** in `feat/d13-nexora-brand`: Nexora theme tokens, app name `Nexora`, Plus Jakarta Sans (Inter fallback). Merge it **before** starting T01. The layout diff in §1.5 was captured before D13, so its context lines (fonts, title) may differ slightly — apply only the lines about metadata, viewport and the PWA components |

| Brand token        | Value                  |
| ------------------ | ---------------------- |
| Name               | Nexora                 |
| Primary            | `#635BFF`              |
| Primary hover      | `#5145E5`              |
| Background (dark)  | `#0F172A`              |
| Foreground         | `#0F172A`              |
| Muted              | `#94A3B8`              |
| Border             | `#E5E7EB`              |
| Background (light) | `#FFFFFF`              |
| Tagline            | Build · Launch · Scale |

---

## 🔀 Git workflow (PR-based, same as earlier sprints)

```bash
git switch main && git pull
git switch -c <type>/s2.6-tXX-<slug>
# … work, then verify …
pnpm check
git add -A
git commit -m "<type>(<scope>): <message>"
git push -u origin <branch>
gh pr create --fill --base main
```

> ⚠️ **Commit scopes.** `pwa` is **not** an allowed scope (allowed: deps, auth, db, i18n, ui, ci, docs, tests, config, org, admin, seo, obs, sec). Use `ui` for UI/manifest, `config` for build/env, `sec` for headers/push security, `db` for the migration, `tests`, `docs`. If you approved D11 (add a `pwa` scope), update `commitlint.config.*`, `lefthook.yml` and `AGENTS.md` first.

> ⚠️ **Ask-first rule.** Adding a dependency and changing the DB schema both require approval in `AGENTS.md`. You approved `web-push` and the `push_subscription` table with the backlog; esbuild + `@types/web-push` ride along with those approvals — mention them in the PR description.

---

## S2.6-T01 — PWA foundation & manifest

### 1.1 Branch

```bash
git switch -c feat/s2.6-t01-manifest
```

### 1.2 Environment variables

Add the flags to the schema **and** `.env.example` (the only place `process.env` may be read is `src/libs/env.ts`). `NEXT_PUBLIC_PWA_ENABLED` is the kill switch; the three VAPID values are only required when `PUSH_ENABLED=true` (enforced by a `superRefine`).

🚢 **Ship**

**`src/libs/env.ts`** (edit)

```diff
@@ -6,4 +6,8 @@ export const Env = createEnv({
     NEXT_PUBLIC_APP_NAME: z.string().min(1),
     NEXT_PUBLIC_APP_URL: z.url(),
+    // Kill switch: "false" at build time ships a worker that unregisters itself (docs/guides/pwa.md).
+    NEXT_PUBLIC_PWA_ENABLED: z.stringbool().default(true),
+    // Public half of the VAPID key pair. The private half NEVER gets a NEXT_PUBLIC_ name.
+    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
   },
   // Production-only safety checks (see the refinements below). Server-side only.
@@ -14,4 +18,20 @@ export const Env = createEnv({
     }
     return schema.superRefine((env, ctx) => {
+      if (env.PUSH_ENABLED) {
+        const missing = (
+          [
+            ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', env.NEXT_PUBLIC_VAPID_PUBLIC_KEY],
+            ['VAPID_PRIVATE_KEY', env.VAPID_PRIVATE_KEY],
+            ['VAPID_SUBJECT', env.VAPID_SUBJECT],
+          ] as const
+        ).filter(([, value]) => !value);
+        for (const [name] of missing) {
+          ctx.addIssue({
+            code: 'custom',
+            message: `${name} is required when PUSH_ENABLED=true (generate keys: pnpm exec web-push generate-vapid-keys)`,
+            path: [name],
+          });
+        }
+      }
       if (env.NODE_ENV !== 'production' || env.ALLOW_LOCAL_SERVICES) {
         return;
@@ -49,6 +69,11 @@ export const Env = createEnv({
     NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
     NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
+    NEXT_PUBLIC_PWA_ENABLED: process.env.NEXT_PUBLIC_PWA_ENABLED,
+    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
     NODE_ENV: process.env.NODE_ENV,
+    PUSH_ENABLED: process.env.PUSH_ENABLED,
     RESEND_API_KEY: process.env.RESEND_API_KEY,
+    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
+    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
   },
   server: {
@@ -73,5 +98,14 @@ export const Env = createEnv({
     LOG_LEVEL: z.enum(['debug', 'info', 'warning', 'error']).default('info'),
     NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
+    // Web push is off unless enabled; when on, all three VAPID values are required (see above).
+    PUSH_ENABLED: z.stringbool().default(false),
     RESEND_API_KEY: z.string().min(1).optional(),
+    // SERVER ONLY. Never log it, never expose it to the client.
+    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
+    // Contact for push services, e.g. "mailto:ops@example.com" or an https URL.
+    VAPID_SUBJECT: z
+      .string()
+      .regex(/^(?:mailto:|https:\/\/)/u)
+      .optional(),
   },
   skipValidation: !!process.env.SKIP_ENV_VALIDATION,
```

**`src/libs/env.test.ts`** (edit)

```diff
@@ -89,4 +89,39 @@ describe('Env', () => {
     });

+    it('requires all VAPID values when PUSH_ENABLED=true', async () => {
+      vi.spyOn(console, 'error').mockImplementation(() => {});
+      baseline();
+      vi.stubEnv('DATABASE_URL', 'postgres://user:pw@db.example.com/app?sslmode=require');
+      vi.stubEnv('EMAIL_TRANSPORT', 'resend');
+      vi.stubEnv('PUSH_ENABLED', 'true');
+
+      await expect(import('./env')).rejects.toThrow(/Invalid environment variables/iu);
+    });
+
+    it('accepts push when every VAPID value is present', async () => {
+      baseline();
+      vi.stubEnv('DATABASE_URL', 'postgres://user:pw@db.example.com/app?sslmode=require');
+      vi.stubEnv('EMAIL_TRANSPORT', 'resend');
+      vi.stubEnv('PUSH_ENABLED', 'true');
+      vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
+      vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
+      vi.stubEnv('VAPID_SUBJECT', 'mailto:ops@example.com');
+
+      const { Env } = await import('./env');
+
+      expect(Env.PUSH_ENABLED).toBe(true);
+    });
+
+    it('leaves push disabled by default and the PWA enabled', async () => {
+      baseline();
+      vi.stubEnv('DATABASE_URL', 'postgres://user:pw@db.example.com/app?sslmode=require');
+      vi.stubEnv('EMAIL_TRANSPORT', 'resend');
+
+      const { Env } = await import('./env');
+
+      expect(Env.PUSH_ENABLED).toBe(false);
+      expect(Env.NEXT_PUBLIC_PWA_ENABLED).toBe(true);
+    });
+
     it('defaults the trusted IP header to x-forwarded-for', async () => {
       vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
```

**`.env.example`** (edit)

```diff
@@ -32,2 +32,12 @@ AUTH_IP_HEADER=x-forwarded-for
 # Never set this on a real deployment.
 ALLOW_LOCAL_SERVICES=false
+
+# ─── PWA & web push (Sprint 2.6) ───────────────────
+# "false" at build time ships a self-unregistering worker (kill switch, see docs/guides/pwa.md).
+NEXT_PUBLIC_PWA_ENABLED=true
+# Web push is off by default. To enable: generate keys with `pnpm exec web-push generate-vapid-keys`.
+PUSH_ENABLED=false
+NEXT_PUBLIC_VAPID_PUBLIC_KEY=
+# SERVER ONLY. Never expose, never commit.
+VAPID_PRIVATE_KEY=
+VAPID_SUBJECT=mailto:you@example.com
```

### 1.3 Brand constants and icons

One file holds the brand so the manifest, the layout and the offline page cannot drift apart.

🚢 **Ship**

**`src/libs/pwa/brand.ts`** (new)

```ts
/** One place for everything the manifest, icons and browser chrome need (rebrand here). */
export const PWA_BRAND = {
  /** Splash-screen background (matches the dark brand background). */
  backgroundColor: '#0F172A',
  description: 'The Next.js boilerplate for modern SaaS. Build, launch and scale.',
  lang: 'en',
  startUrl: '/?source=pwa',
  /** Browser UI color when installed. */
  themeColor: '#635BFF',
  themeColorDark: '#0F172A',
  themeColorLight: '#FFFFFF',
} as const;

export interface PwaIcon {
  purpose?: 'any' | 'maskable';
  sizes: string;
  src: string;
  type: 'image/png';
}

/** Files produced by `pnpm pwa:icons` (see scripts/generate-pwa-icons.mjs). */
export const PWA_ICONS: readonly PwaIcon[] = [
  { purpose: 'any', sizes: '192x192', src: '/icons/icon-192.png', type: 'image/png' },
  { purpose: 'any', sizes: '512x512', src: '/icons/icon-512.png', type: 'image/png' },
  { purpose: 'maskable', sizes: '512x512', src: '/icons/icon-maskable-512.png', type: 'image/png' },
];

export const APPLE_TOUCH_ICON = '/icons/apple-touch-icon.png';
```

Icons are generated from `docs/brand/nexora-icon-source.png` by a Playwright canvas script (trims transparent margins, so the mark fills the icon). The three maskable-safe sizes and the Apple touch icon are committed under `public/icons/`.

🚢 **Ship**

**`scripts/generate-pwa-icons.mjs`** (new)

```js
// Generates the PWA icon set from docs/brand/nexora-icon-source.png.
// Uses Playwright's Chromium (already a devDependency) so no image library is needed.
// Run: pnpm pwa:icons   (needs `pnpm exec playwright install chromium` once)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const SOURCE = 'docs/brand/nexora-icon-source.png';
const OUT_DIR = 'public/icons';
const BRAND_BACKGROUND = '#0F172A';

/**
 * scale = share of the canvas the mark's visible area (transparent margins trimmed) may use.
 * Maskable icons keep the mark inside the central safe zone (platforms crop up to ~20%).
 */
const TARGETS = [
  { background: null, file: 'icon-192.png', scale: 0.88, size: 192 },
  { background: null, file: 'icon-512.png', scale: 0.88, size: 512 },
  { background: BRAND_BACKGROUND, file: 'icon-maskable-512.png', scale: 0.58, size: 512 },
  { background: BRAND_BACKGROUND, file: 'apple-touch-icon.png', scale: 0.68, size: 180 },
];

const render = (page, dataUrl, { background, scale, size }) =>
  page.evaluate(
    async ({ background: bg, dataUrl: src, scale: ratio, size: edge }) => {
      const image = new Image();
      image.src = src;
      await image.decode();

      const canvas = document.createElement('canvas');
      canvas.width = edge;
      canvas.height = edge;
      const context = canvas.getContext('2d');
      if (bg) {
        context.fillStyle = bg;
        context.fillRect(0, 0, edge, edge);
      }
      // Trim the source's transparent margins so `scale` refers to the visible mark.
      const probe = document.createElement('canvas');
      probe.width = image.width;
      probe.height = image.height;
      const probeContext = probe.getContext('2d');
      probeContext.drawImage(image, 0, 0);
      const { data } = probeContext.getImageData(0, 0, image.width, image.height);
      let [left, top, right, bottom] = [image.width, image.height, 0, 0];
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          if (data[(y * image.width + x) * 4 + 3] > 8) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
        }
      }
      const cropWidth = right - left + 1;
      const cropHeight = bottom - top + 1;

      context.imageSmoothingQuality = 'high';
      const box = edge * ratio;
      const fit = Math.min(box / cropWidth, box / cropHeight);
      const width = cropWidth * fit;
      const height = cropHeight * fit;
      context.drawImage(
        image,
        left,
        top,
        cropWidth,
        cropHeight,
        (edge - width) / 2,
        (edge - height) / 2,
        width,
        height,
      );
      return canvas.toDataURL('image/png');
    },
    { background, dataUrl, scale, size },
  );

const main = async () => {
  const source = await readFile(SOURCE);
  const dataUrl = `data:image/png;base64,${source.toString('base64')}`;
  await mkdir(OUT_DIR, { recursive: true });

  // CHROMIUM_PATH is optional: point it at an existing Chromium/Chrome instead of Playwright's download.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const rendered = await Promise.all(
      TARGETS.map(async (target) => ({ data: await render(page, dataUrl, target), target })),
    );
    await Promise.all(
      rendered.map(({ data, target }) =>
        writeFile(
          path.join(OUT_DIR, target.file),
          Buffer.from(data.replace(/^data:image\/png;base64,/u, ''), 'base64'),
        ),
      ),
    );
    for (const { target } of rendered) {
      console.log(`✅ ${OUT_DIR}/${target.file} (${target.size}×${target.size})`);
    }
  } finally {
    await browser.close();
  }
};

try {
  await main();
} catch (error) {
  console.error(
    '❌ Icon generation failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
```

```bash
pnpm pkg set scripts.pwa:icons="node scripts/generate-pwa-icons.mjs"
# If Playwright's Chromium is not installed (CI images, sandboxes):
#   CHROMIUM_PATH=/path/to/chrome pnpm pwa:icons
pnpm pwa:icons
```

✅ Produces `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`. 🪟 On Windows set `CHROMIUM_PATH` with Git Bash syntax: `CHROMIUM_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe" pnpm pwa:icons` (a Node script, so no `cross-env` needed when you run it by hand).

### 1.4 The manifest (typed route) and its test

`src/app/manifest.ts` is a Next metadata route. The test also checks that every icon file exists **with exact casing** (Linux CI is case-sensitive).

🚢 **Ship**

**`src/app/manifest.ts`** (new)

```ts
import type { MetadataRoute } from 'next';

import { Env } from '@/libs/env';
import { PWA_BRAND, PWA_ICONS } from '@/libs/pwa/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: PWA_BRAND.backgroundColor,
    description: PWA_BRAND.description,
    display: 'standalone',
    icons: PWA_ICONS.map((icon) => ({ ...icon })),
    id: '/',
    lang: PWA_BRAND.lang,
    name: Env.NEXT_PUBLIC_APP_NAME,
    scope: '/',
    short_name: Env.NEXT_PUBLIC_APP_NAME.slice(0, 12),
    start_url: PWA_BRAND.startUrl,
    theme_color: PWA_BRAND.themeColor,
  };
}
```

**`src/app/manifest.test.ts`** (new)

```ts
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { APPLE_TOUCH_ICON, PWA_ICONS } from '@/libs/pwa/brand';

import manifest from './manifest';

const publicDir = path.join(process.cwd(), 'public');

/** Case-exact check: Linux is case-sensitive even if the developer's machine is not. */
function existsExact(publicPath: string): boolean {
  const relative = publicPath.replace(/^\//u, '');
  const directory = path.dirname(relative);
  const file = path.basename(relative);
  const folder = path.join(publicDir, directory);
  return existsSync(folder) && readdirSync(folder).includes(file);
}

describe('web app manifest', () => {
  const value = manifest();

  it('has the fields browsers need to offer installation', () => {
    expect(value.name).toBeTruthy();
    expect(value.short_name).toBeTruthy();
    expect(value.start_url).toBe('/?source=pwa');
    expect(value.display).toBe('standalone');
    expect(value.scope).toBe('/');
    expect(value.theme_color).toBe('#635BFF');
    expect(value.background_color).toBe('#0F172A');
  });

  it('keeps the short name short enough for a home screen', () => {
    expect(value.short_name?.length).toBeLessThanOrEqual(12);
  });

  it('declares 192, 512 and a maskable icon', () => {
    const icons = value.icons ?? [];
    expect(icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any')).toBe(true);
    expect(icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true);
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('only references icon files that exist, with exact casing', () => {
    for (const icon of [...PWA_ICONS, { src: APPLE_TOUCH_ICON }]) {
      expect(existsExact(icon.src), icon.src).toBe(true);
    }
  });
});
```

### 1.5 Layout metadata

Theme colour, Apple icon, `appleWebApp`, and (later tickets) the PWA providers go into the root layout. Only the metadata part is needed now; the component lines are added in T03/T06 — they are shown in the same diff for reference, **apply them when you reach those tickets**.

🚢 **Ship**

**`src/app/[locale]/layout.tsx`** (edit — metadata/viewport now, provider/banner/prompt/toast in T03 and T06)

```diff
@@ -1,5 +1,5 @@
 import { GeistMono } from 'geist/font/mono';
 import { GeistSans } from 'geist/font/sans';
-import type { Metadata } from 'next';
+import type { Metadata, Viewport } from 'next';
 import { hasLocale, NextIntlClientProvider } from 'next-intl';
 import { notFound } from 'next/navigation';
@@ -7,14 +7,28 @@ import type { ReactNode } from 'react';

 import { ThemeProvider } from '@/components/providers/theme-provider';
+import { InstallPrompt } from '@/components/pwa/install-prompt';
+import { OfflineBanner } from '@/components/pwa/offline-banner';
+import { PwaProvider } from '@/components/pwa/pwa-provider';
+import { UpdateToast } from '@/components/pwa/update-toast';
 import { Toaster } from '@/components/ui/sonner';
 import { routing } from '@/i18n/routing';
+import { APPLE_TOUCH_ICON, PWA_BRAND } from '@/libs/pwa/brand';

 import '@/styles/global.css';

 export const metadata: Metadata = {
+  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'SaaS Boilerplate' },
   description: 'Production-ready SaaS starter',
+  icons: { apple: APPLE_TOUCH_ICON },
   title: 'SaaS Boilerplate',
 };

+export const viewport: Viewport = {
+  themeColor: [
+    { color: PWA_BRAND.themeColorLight, media: '(prefers-color-scheme: light)' },
+    { color: PWA_BRAND.themeColorDark, media: '(prefers-color-scheme: dark)' },
+  ],
+};
+
 export function generateStaticParams() {
   return routing.locales.map((locale) => ({ locale }));
@@ -42,5 +56,10 @@ export default async function RootLayout({
             disableTransitionOnChange
           >
-            {children}
+            <PwaProvider>
+              <OfflineBanner />
+              {children}
+              <InstallPrompt />
+              <UpdateToast />
+            </PwaProvider>
             <Toaster richColors />
           </ThemeProvider>
```

✅ **Verify**

```bash
pnpm typecheck && pnpm lint && pnpm test
curl -s localhost:3000/manifest.webmanifest | head -c 600   # after pnpm dev
```

Chrome DevTools → Application → Manifest shows **Nexora**, three icons and no warnings.

🔍 **Verify** (manual): on Android Chrome the "Install app" entry appears only after T02 (a worker is required by some browsers).

### 1.6 Commit

```bash
git add -A && git commit -m "feat(ui): add Nexora web app manifest, icons and PWA env flags"
```

---

## S2.6-T02 — Service worker infrastructure

### 2.1 Branch

```bash
git switch -c feat/s2.6-t02-service-worker
```

### 2.2 Dependency (approved, D1)

```bash
pnpm add -D esbuild
pnpm pin          # keep exact versions (project rule)
```

Verified with **esbuild 0.28.2**. The version `pnpm add` resolves today may be newer — that is fine as long as it is exact in `package.json`.

### 2.3 Worker sources

The worker lives in `src/sw/` and is **excluded from the root tsconfig** (it needs the `webworker` lib, not `dom`). It has its own `tsconfig.json`, and `typecheck` runs both.

🚢 **Ship**

**`src/sw/tsconfig.json`** (new)

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "incremental": false,
    "lib": ["esnext", "webworker"],
    "noEmit": true,
    "paths": { "@/*": ["../*"] },
    "plugins": [],
    "types": []
  },
  "include": ["./*.ts", "../libs/pwa/*.ts"],
  "exclude": ["../libs/pwa/*.test.ts"]
}
```

**`src/sw/globals.d.ts`** (new)

```ts
/** Replaced at build time by scripts/build-sw.mjs (esbuild `define`). */
declare const __BUILD_ID__: string;
declare const __PRECACHE__: readonly string[];
```

**`src/libs/pwa/messages.ts`** (new)

```ts
/** Typed protocol between the page and the service worker (shared by both sides). */
export type SwMessage =
  | { type: 'CLEAR_CACHES' }
  | { type: 'GET_VERSION' }
  | { type: 'SKIP_WAITING' };

export type SwReply =
  | { type: 'CACHES_CLEARED' }
  | { type: 'PUSH_SUBSCRIPTION_CHANGED' }
  | { type: 'VERSION'; version: string };

const MESSAGE_TYPES: ReadonlySet<string> = new Set(['CLEAR_CACHES', 'GET_VERSION', 'SKIP_WAITING']);

export function isSwMessage(value: unknown): value is SwMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }
  return typeof value.type === 'string' && MESSAGE_TYPES.has(value.type);
}
```

### 2.4 The build script

`scripts/build-sw.mjs` bundles `src/sw/sw.ts` → `public/sw.js` (IIFE, minified), injects a **build id** (`PWA_BUILD_ID` → `GITHUB_SHA` → `VERCEL_GIT_COMMIT_SHA` → `BUILD_SOURCEVERSION` → content hash) so caches are versioned, and — when `NEXT_PUBLIC_PWA_ENABLED=false` — bundles `src/sw/kill.ts` instead (a worker that deletes our caches and unregisters itself).

🚢 **Ship**

**`scripts/build-sw.mjs`** (new)

```js
// Bundles src/sw/sw.ts into public/sw.js (or the kill-switch worker when the PWA is disabled).
// Cross-platform: plain Node + esbuild. Runs before `next build` (see package.json "build").
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { build } from 'esbuild';

const OUTFILE = 'public/sw.js';
const TSCONFIG = 'src/sw/tsconfig.json';
// Only PUBLIC files that must work with zero network. Never add pages or user data here.
const PRECACHE = ['/offline.html'];

const killSwitch = process.env.NEXT_PUBLIC_PWA_ENABLED === 'false';
const entry = killSwitch ? 'src/sw/kill.ts' : 'src/sw/sw.ts';

const bundle = (buildId, write) =>
  build({
    bundle: true,
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
      __PRECACHE__: JSON.stringify(PRECACHE),
    },
    entryPoints: [entry],
    format: 'iife',
    legalComments: 'none',
    minify: true,
    outfile: OUTFILE,
    platform: 'browser',
    target: 'es2020',
    tsconfig: TSCONFIG,
    write,
  });

/**
 * Build id: the commit when CI/hosting provides one, otherwise a hash of the worker bundle and
 * the precached files, so it changes whenever the worker or its offline page changes.
 */
const resolveBuildId = async () => {
  const fromEnvironment =
    process.env.PWA_BUILD_ID ??
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.BUILD_SOURCEVERSION;
  if (fromEnvironment) {
    return fromEnvironment.slice(0, 12);
  }

  const dry = await bundle('pending', false);
  const hash = createHash('sha256');
  for (const file of dry.outputFiles) {
    hash.update(file.contents);
  }
  const offline = await Promise.all(PRECACHE.map((url) => readFile(`public${url}`)));
  for (const content of offline) {
    hash.update(content);
  }
  return hash.digest('hex').slice(0, 12);
};

const main = async () => {
  const buildId = await resolveBuildId();
  await bundle(buildId, true);
  console.log(
    `✅ ${OUTFILE} built (${killSwitch ? 'KILL SWITCH' : 'worker'}, build id ${buildId})`,
  );
};

try {
  await main();
} catch (error) {
  console.error(
    '❌ Service worker build failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
```

**`src/sw/kill.ts`** (new)

```ts
/// <reference lib="webworker" />
import { isOurCache } from '@/libs/pwa/cache-policy';

declare const self: ServiceWorkerGlobalScope;

/**
 * Kill-switch worker (built when NEXT_PUBLIC_PWA_ENABLED=false). Browsers fetch /sw.js on every
 * navigation, so an installed worker picks this up, wipes our caches and unregisters itself.
 */
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter(isOurCache).map((name) => caches.delete(name)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(windows.map((client) => client.navigate(client.url)));
    })(),
  );
});
```

### 2.5 The worker itself

It imports the **pure** cache policy from T04. Create that file first if you are following strictly in order (§4.2), or paste both now and run the tests in T04.

🚢 **Ship**

**`src/sw/sw.ts`** (new)

```ts
/// <reference lib="webworker" />
import './push';
import {
  cacheName,
  classifyRequest,
  isCacheableResponse,
  isOurCache,
  staleCaches,
} from '@/libs/pwa/cache-policy';
import { isSwMessage } from '@/libs/pwa/messages';
import type { SwReply } from '@/libs/pwa/messages';

declare const self: ServiceWorkerGlobalScope;

const BUILD_ID = __BUILD_ID__;
const PRECACHE = __PRECACHE__;
const OFFLINE_URL = '/offline.html';
const MAX_STATIC_ENTRIES = 200;
const MAX_PUBLIC_ENTRIES = 50;

const precacheName = cacheName('precache', BUILD_ID);
const staticName = cacheName('static', BUILD_ID);
const publicName = cacheName('public', BUILD_ID);

async function trim(cache: Cache, max: number): Promise<void> {
  const keys = await cache.keys();
  const excess = keys.slice(0, Math.max(0, keys.length - max));
  await Promise.all(excess.map((key) => cache.delete(key)));
}

/** A failing cache write (quota, private mode) must never break the response. */
async function store(cache: Cache, request: Request, response: Response, max: number) {
  try {
    await cache.put(request, response);
    await trim(cache, max);
  } catch {
    // ignore: the network response is still returned to the page
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(staticName);
  const hit = await cache.match(request);
  if (hit) {
    return hit;
  }
  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    await store(cache, request, response.clone(), MAX_STATIC_ENTRIES);
  }
  return response;
}

async function staleWhileRevalidate(event: FetchEvent): Promise<Response> {
  const { request } = event;
  const cache = await caches.open(publicName);
  const hit = await cache.match(request);

  const refresh = fetch(request).then(async (response) => {
    if (isCacheableResponse(response)) {
      await store(cache, request, response.clone(), MAX_PUBLIC_ENTRIES);
    }
    return response;
  });

  if (hit) {
    event.waitUntil(refresh.catch(() => null));
    return hit;
  }
  return refresh;
}

/** Pages always come from the network. The offline page is only a fallback, never a copy of a page. */
async function networkWithOfflineFallback(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(precacheName);
    const fallback = await cache.match(OFFLINE_URL);
    return fallback ?? Response.error();
  }
}

async function clearUserVisibleCaches(): Promise<void> {
  const names = await caches.keys();
  // Keep the (public) offline page; everything else we created goes.
  await Promise.all(
    names
      .filter((name) => isOurCache(name) && name !== precacheName)
      .map((name) => caches.delete(name)),
  );
}

async function reply(event: ExtendableMessageEvent, message: SwReply): Promise<void> {
  const { source } = event;
  if (source) {
    // Client.postMessage has no targetOrigin argument (that is a window.postMessage rule).
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    source.postMessage(message);
  }
  await Promise.resolve();
}

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page asks for it after the user agrees to reload (decision D10).
  event.waitUntil(caches.open(precacheName).then((cache) => cache.addAll([...PRECACHE])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(staleCaches(names, BUILD_ID).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const kind = classifyRequest(event.request, self.location.origin);

  switch (kind) {
    case 'static-immutable': {
      event.respondWith(cacheFirst(event.request));
      break;
    }
    case 'public-asset': {
      event.respondWith(staleWhileRevalidate(event));
      break;
    }
    case 'navigation': {
      event.respondWith(networkWithOfflineFallback(event.request));
      break;
    }
    default: {
      // network-only: do not intercept, the browser does its normal thing.
      break;
    }
  }
});

self.addEventListener('message', (event) => {
  const data: unknown = event.data;
  if (!isSwMessage(data)) {
    return;
  }

  switch (data.type) {
    case 'SKIP_WAITING': {
      void self.skipWaiting();
      break;
    }
    case 'GET_VERSION': {
      event.waitUntil(reply(event, { type: 'VERSION', version: BUILD_ID }));
      break;
    }
    case 'CLEAR_CACHES': {
      event.waitUntil(
        clearUserVisibleCaches().then(() => reply(event, { type: 'CACHES_CLEARED' })),
      );
      break;
    }
    default: {
      break;
    }
  }
});
```

### 2.6 Wire it into the toolchain

🚢 **Ship**

**`package.json`** (edit — scripts build/build:sw/typecheck/pwa:icons and deps)

```diff
@@ -5,7 +5,8 @@
   "scripts": {
     "dev": "concurrently -k -n db,web -c blue,green \"pnpm db:server\" \"next dev\"",
-    "build": "next build",
+    "build": "node scripts/build-sw.mjs && next build",
+    "build:sw": "node scripts/build-sw.mjs",
     "start": "next start",
-    "typecheck": "tsc --noEmit",
+    "typecheck": "tsc --noEmit && tsc --noEmit -p src/sw/tsconfig.json",
     "check:env": "node scripts/check-env-usage.mjs",
     "git:pr": "node scripts/git-commit-push-pr.mjs",
@@ -35,4 +36,5 @@
     "db:migrate": "tsx scripts/migrate.ts",
     "db:reset": "tsx scripts/db-reset.ts && pnpm db:seed",
+    "pwa:icons": "node scripts/generate-pwa-icons.mjs",
     "db:cleanup": "tsx scripts/cleanup-expired.ts",
     "db:seed": "tsx --conditions=react-server scripts/seed.ts",
@@ -67,4 +69,5 @@
     "sonner": "2.0.8",
     "tw-animate-css": "1.4.0",
+    "web-push": "4.0.0",
     "zod": "4.6.7"
   },
@@ -84,4 +87,5 @@
     "@types/react": "19.3.0",
     "@types/react-dom": "19.3.0",
+    "@types/web-push": "3.6.4",
     "@vitejs/plugin-react": "6.3.0",
     "@vitest/browser": "5.1.0",
@@ -93,4 +97,5 @@
     "cz-conventional-changelog": "3.3.0",
     "drizzle-kit": "0.31.11",
+    "esbuild": "0.28.2",
     "jiti": "2.7.0",
     "knip": "6.44.2",
```

**`tsconfig.json`** (edit — exclude src/sw)

```diff
@@ -35,4 +35,4 @@
     "**/*.mts"
   ],
-  "exclude": ["node_modules"]
+  "exclude": ["node_modules", "src/sw"]
 }
```

**`knip.config.ts`** (edit — worker entries)

```diff
@@ -9,4 +9,6 @@ const config: KnipConfig = {
     'src/templates/emails/**/*.tsx',
     'scripts/**/*.{ts,mjs}',
+    // Service worker entries are bundled by scripts/build-sw.mjs, not imported by the app.
+    'src/sw/{sw,kill}.ts',
     // 'e2e/**/*.ts',
     // 'src/**/*.stories.{ts,tsx}',
```

**`.gitignore`** (edit — public/sw.js is a build artifact)

```diff
@@ -67,2 +67,5 @@ e2e/.auth
 # Vitest browser-mode artifacts
 .vitest/
+
+# Generated by scripts/build-sw.mjs on every build. Never edit or commit.
+/public/sw.js
```

**`next.config.ts`** (edit — sw.js headers, experimental.useOffline)

```diff
@@ -15,4 +15,6 @@ const nextConfig: NextConfig = {
   experimental: {
     agentFeedback: true,
+    // Retries failed soft navigations and Server Actions when the network returns (usePwa().isOffline).
+    useOffline: true,
   },
   async headers() {
@@ -26,4 +28,13 @@ const nextConfig: NextConfig = {
         source: '/:path*',
       },
+      {
+        // The worker must always be revalidated so updates reach users, and may never be sniffed or framed.
+        headers: [
+          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
+          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
+          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
+        ],
+        source: '/sw.js',
+      },
     ];
   },
```

🪟 `build` is `node scripts/build-sw.mjs && next build` — no `VAR=x cmd`, so it is cross-platform. `public/sw.js` is **generated and git-ignored**; never commit it.

### 2.7 Registration helper

🚢 **Ship**

**`src/libs/pwa/register.ts`** (new)

```ts
import { isOurCache, isPrecacheName } from './cache-policy';
import type { SwMessage } from './messages';

const SERVICE_WORKER_URL = '/sw.js';

export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Production only: a worker in `next dev` would cache stale chunks and confuse hot reload. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return Promise.resolve(null);
  }
  // updateViaCache: 'none' makes the browser always revalidate sw.js, so updates are never delayed.
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, {
    scope: '/',
    updateViaCache: 'none',
  });
}

export function postToWorker(worker: ServiceWorker | null | undefined, message: SwMessage): void {
  // ServiceWorker.postMessage has no targetOrigin argument (that is a window.postMessage rule).
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  worker?.postMessage(message);
}

/**
 * Removes everything the app stored for offline use (runtime caches). The public precache,
 * which holds only the offline page, stays so the offline fallback keeps working.
 * Call on sign-out, session expiry and from the "clear offline data" button.
 */
export async function clearPwaData(): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => isOurCache(name) && !isPrecacheName(name))
      .map((name) => caches.delete(name)),
  );
}
```

✅ **Verify**

```bash
pnpm build
curl -sI localhost:3000/sw.js | grep -i "cache-control\|content-security"   # after pnpm start
# Cache-Control: no-cache, no-store, must-revalidate
# Content-Security-Policy: default-src 'self'; script-src 'self'
NEXT_PUBLIC_PWA_ENABLED=false pnpm build:sw && head -c 300 public/sw.js   # kill worker
```

> ⚠️ **Why the headers matter.** If `/sw.js` is cached by the HTTP cache or a CDN, users never get updates. `no-cache` on the worker script is the single most important PWA header.

### 2.8 Commit

```bash
git add -A && git commit -m "feat(config): add service worker build pipeline and kill switch"
```

---

## S2.6-T04 — Caching & offline policy

### 4.1 Branch

```bash
git switch -c feat/s2.6-t04-cache-policy
```

### 4.2 The pure policy (the security heart of the sprint)

Allow-list, not block-list: anything not explicitly allowed is `network-only`. Only two kinds of response are ever stored — **immutable static** (`/_next/static/**`) and **public assets** (`/icons/**`, `/offline.html`, the manifest). **Page navigations always go to the network**; `/offline.html` is only a fallback when the network fails, and the page response itself is never stored, so a protected page can never be replayed. Never cached either: `/api/**`, RSC/prefetch/`_rsc`/Server Action requests, non-GET, responses with `Set-Cookie`, `no-store`/`private`, and anything cross-origin.

🚢 **Ship**

**`src/libs/pwa/cache-policy.ts`** (new)

```ts
/**
 * What the service worker may cache. Pure functions, no browser APIs, fully unit-tested.
 *
 * The rule is an ALLOW-LIST: anything not explicitly allowed is `network-only`, so a new
 * route can never be cached by accident. Authenticated pages, RSC payloads, API calls and
 * Server Actions are never cacheable.
 */
export type RequestClass = 'navigation' | 'network-only' | 'public-asset' | 'static-immutable';

export interface RequestLike {
  headers: { get: (name: string) => string | null };
  method: string;
  mode: string;
  url: string;
}

export interface ResponseLike {
  headers: { get: (name: string) => string | null };
  status: number;
  type: string;
}

/** Headers that mean "framework data or private traffic": never cached. */
const FORBIDDEN_REQUEST_HEADERS = [
  'authorization',
  'next-action',
  'next-router-prefetch',
  'next-router-state-tree',
  'rsc',
] as const;

const PUBLIC_ASSET_PREFIXES = ['/icons/'] as const;
const PUBLIC_ASSET_FILES = new Set(['/manifest.webmanifest', '/offline.html']);

export function classifyRequest(request: RequestLike, origin: string): RequestClass {
  if (request.method !== 'GET') {
    return 'network-only';
  }

  const url = new URL(request.url);
  if (url.origin !== origin) {
    return 'network-only';
  }

  if (FORBIDDEN_REQUEST_HEADERS.some((name) => request.headers.get(name) !== null)) {
    return 'network-only';
  }
  if (url.searchParams.has('_rsc')) {
    return 'network-only';
  }

  const { pathname } = url;
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    return 'network-only';
  }
  if (pathname.startsWith('/_next/static/')) {
    return 'static-immutable';
  }
  if (
    PUBLIC_ASSET_FILES.has(pathname) ||
    PUBLIC_ASSET_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return 'public-asset';
  }

  // Page loads are always fetched from the network. The offline page is only a fallback,
  // the response itself is never stored (so a protected page can never be replayed).
  if (request.mode === 'navigate') {
    return 'navigation';
  }

  return 'network-only';
}

/** Only successful, same-origin, non-private, cookie-free responses may be stored. */
export function isCacheableResponse(response: ResponseLike): boolean {
  if (response.status !== 200 || response.type !== 'basic') {
    return false;
  }
  if (response.headers.get('set-cookie') !== null) {
    return false;
  }
  const cacheControl = (response.headers.get('cache-control') ?? '').toLowerCase();
  if (cacheControl.includes('no-store') || cacheControl.includes('private')) {
    return false;
  }
  return response.headers.get('vary')?.trim() !== '*';
}

const CACHE_PREFIX = 'pwa-';

export type CacheKind = 'precache' | 'public' | 'static';

export function cacheName(kind: CacheKind, buildId: string): string {
  return `${CACHE_PREFIX}${kind}-${buildId}`;
}

export function isOurCache(name: string): boolean {
  return name.startsWith(CACHE_PREFIX);
}

/** The precache holds only public files (the offline page), so sign-out can keep it. */
export function isPrecacheName(name: string): boolean {
  return name.startsWith(`${CACHE_PREFIX}precache-`);
}

/** Caches created by an older build (or by nothing we know about under our prefix). */
export function staleCaches(names: readonly string[], buildId: string): string[] {
  return names.filter((name) => isOurCache(name) && !name.endsWith(`-${buildId}`));
}
```

**`src/libs/pwa/cache-policy.test.ts`** (new)

```ts
import { describe, expect, it } from 'vitest';

import { isProtectedPath } from '../route-guard';
import {
  cacheName,
  classifyRequest,
  isCacheableResponse,
  isOurCache,
  isPrecacheName,
  staleCaches,
} from './cache-policy';
import type { RequestLike, ResponseLike } from './cache-policy';

const ORIGIN = 'https://app.example.com';

function request(
  path: string,
  init: { headers?: Record<string, string>; method?: string; mode?: string } = {},
) {
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    method: init.method ?? 'GET',
    mode: init.mode ?? 'cors',
    url: path.startsWith('http') ? path : `${ORIGIN}${path}`,
  } satisfies RequestLike;
}

function response(init: { status?: number; type?: string; headers?: Record<string, string> } = {}) {
  const headerMap = new Map(
    Object.entries(init.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    status: init.status ?? 200,
    type: init.type ?? 'basic',
  } satisfies ResponseLike;
}

describe('classifyRequest — allowed', () => {
  it.each([
    ['/_next/static/chunks/app-123.js', 'static-immutable'],
    ['/_next/static/css/abc.css', 'static-immutable'],
    ['/icons/icon-192.png', 'public-asset'],
    ['/manifest.webmanifest', 'public-asset'],
    ['/offline.html', 'public-asset'],
  ])('%s → %s', (path, expected) => {
    expect(classifyRequest(request(path), ORIGIN)).toBe(expected);
  });

  it('treats page loads as navigations', () => {
    expect(classifyRequest(request('/', { mode: 'navigate' }), ORIGIN)).toBe('navigation');
    expect(classifyRequest(request('/fr/dashboard', { mode: 'navigate' }), ORIGIN)).toBe(
      'navigation',
    );
  });
});

describe('classifyRequest — never cached', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s', (method) => {
    expect(classifyRequest(request('/_next/static/a.js', { method }), ORIGIN)).toBe('network-only');
  });

  it.each(['/api/auth/get-session', '/api/auth/sign-in/email', '/api/health', '/api'])(
    'rejects API route %s',
    (path) => {
      expect(classifyRequest(request(path), ORIGIN)).toBe('network-only');
    },
  );

  it.each<Record<string, string>>([
    { rsc: '1' },
    { 'next-router-prefetch': '1' },
    { 'next-router-state-tree': '%5B%5D' },
    { 'next-action': 'abc' },
    { authorization: 'Bearer x' },
  ])('rejects framework/private header %o even for a cacheable path', (headers) => {
    expect(classifyRequest(request('/_next/static/a.js', { headers }), ORIGIN)).toBe(
      'network-only',
    );
  });

  it('rejects RSC payload URLs', () => {
    expect(classifyRequest(request('/dashboard?_rsc=abc'), ORIGIN)).toBe('network-only');
    expect(classifyRequest(request('/icons/icon-192.png?_rsc=abc'), ORIGIN)).toBe('network-only');
  });

  it('rejects other origins', () => {
    expect(classifyRequest(request('https://cdn.example.com/_next/static/a.js'), ORIGIN)).toBe(
      'network-only',
    );
  });

  it('rejects the worker file itself, image optimizer and unknown subresources', () => {
    expect(classifyRequest(request('/sw.js'), ORIGIN)).toBe('network-only');
    expect(classifyRequest(request('/_next/image?url=%2Fa.png&w=64&q=75'), ORIGIN)).toBe(
      'network-only',
    );
    expect(classifyRequest(request('/some/data.json'), ORIGIN)).toBe('network-only');
  });

  it('never allows a protected path to become cacheable', () => {
    for (const path of ['/dashboard', '/dashboard/account/security', '/admin']) {
      expect(isProtectedPath(path)).toBe(true);
      const cls = classifyRequest(request(path), ORIGIN);
      expect(cls).toBe('network-only');
      // as a navigation the response is still never stored (see isCacheableResponse usage in sw.ts)
      expect(classifyRequest(request(path, { mode: 'navigate' }), ORIGIN)).toBe('navigation');
    }
  });
});

describe('isCacheableResponse', () => {
  it('accepts a plain 200 same-origin response', () => {
    expect(isCacheableResponse(response())).toBe(true);
  });

  it.each([
    ['non-200', response({ status: 204 })],
    ['redirect', response({ status: 302 })],
    ['error', response({ status: 500 })],
    ['opaque', response({ type: 'opaque' })],
    ['cors', response({ type: 'cors' })],
    ['set-cookie', response({ headers: { 'set-cookie': 'a=b' } })],
    ['no-store', response({ headers: { 'cache-control': 'no-store' } })],
    ['private', response({ headers: { 'cache-control': 'private, max-age=60' } })],
    ['NO-STORE uppercase', response({ headers: { 'Cache-Control': 'No-Store' } })],
    ['vary *', response({ headers: { vary: '*' } })],
  ])('rejects %s', (_label, value) => {
    expect(isCacheableResponse(value)).toBe(false);
  });

  it('accepts public cacheable assets', () => {
    expect(
      isCacheableResponse(
        response({ headers: { 'cache-control': 'public, max-age=31536000, immutable' } }),
      ),
    ).toBe(true);
  });
});

describe('cache names', () => {
  it('namespaces and versions caches', () => {
    expect(cacheName('static', 'abc123')).toBe('pwa-static-abc123');
    expect(isOurCache('pwa-static-abc123')).toBe(true);
    expect(isOurCache('workbox-precache')).toBe(false);
  });

  it('recognises the public precache', () => {
    expect(isPrecacheName('pwa-precache-abc')).toBe(true);
    expect(isPrecacheName('pwa-static-abc')).toBe(false);
  });

  it('marks only OUR caches from other builds as stale', () => {
    const names = ['pwa-static-old', 'pwa-precache-old', 'pwa-static-new', 'other-app-cache'];
    expect(staleCaches(names, 'new')).toEqual(['pwa-static-old', 'pwa-precache-old']);
  });
});
```

### 4.3 The standalone offline page

🧭 **Deviation from the backlog (on purpose).** The backlog said "a Next offline page". A Next page needs JS chunks that are not available offline, so the verified implementation is a **self-contained static `public/offline.html`** (inline CSS, no JS, Nexora colours; the English and French messages are shown one after the other, since a static file cannot read the visitor locale). It is precached at install.

🚢 **Ship**

**`public/offline.html`** (new)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta name="theme-color" content="#0F172A" />
    <title>Offline</title>
    <!-- Self-contained on purpose: no scripts, no external files, so it works with zero network. -->
    <style>
      :root {
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #0f172a;
        color: #ffffff;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        text-align: center;
      }
      main {
        max-width: 28rem;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.5rem;
      }
      p {
        margin: 0 0 16px;
        color: #cbd5e1;
        line-height: 1.5;
      }
      a {
        display: inline-block;
        padding: 10px 18px;
        border-radius: 8px;
        background: #635bff;
        color: #ffffff;
        font-weight: 600;
        text-decoration: none;
      }
      a:hover {
        background: #5145e5;
      }
      a:focus-visible {
        outline: 3px solid #ffffff;
        outline-offset: 2px;
      }
      section + section {
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid #334155;
      }
    </style>
  </head>
  <body>
    <main>
      <section lang="en">
        <h1>You are offline</h1>
        <p>
          Check your connection, then try again. Your account data is never stored on this device
          for offline use.
        </p>
        <a href="/">Try again</a>
      </section>
      <section lang="fr">
        <h1>Vous êtes hors ligne</h1>
        <p>
          Vérifiez votre connexion puis réessayez. Les données de votre compte ne sont jamais
          conservées sur cet appareil pour un usage hors ligne.
        </p>
        <a href="/fr">Réessayer</a>
      </section>
    </main>
  </body>
</html>
```

### 4.4 Clear on sign-out

🚢 **Ship**

**`src/components/layout/user-menu.tsx`** (edit — calls clearPwaData() after signOut)

```diff
@@ -15,4 +15,5 @@ import {
 import { useRouter } from '@/i18n/navigation';
 import { authClient } from '@/libs/auth-client';
+import { clearPwaData } from '@/libs/pwa/register';

 interface Props {
@@ -36,4 +37,6 @@ export function UserMenu({ user }: Props) {
     // invalidates the session server-side and clears the cookie
     await authClient.signOut();
+    // Nothing from this session may stay readable on a shared device.
+    await clearPwaData();
     router.replace('/');
     router.refresh();
```

✅ **Verify**

```bash
pnpm test -- src/libs/pwa        # 40+ policy cases
pnpm typecheck && pnpm lint && pnpm knip
```

### 4.5 Commit

```bash
git add -A && git commit -m "feat(sec): add allow-list cache policy and offline page"
```

---

## S2.6-T03 — Installation & network experience

### 3.1 Branch

```bash
git switch -c feat/s2.6-t03-install-offline-update
```

### 3.2 Pure helpers

🚢 **Ship**

**`src/libs/pwa/install.ts`** (new)

```ts
/** Platform detection used by the install UI. Pure, so it is testable without a browser. */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/u.test(userAgent)) {
    return true;
  }
  // iPadOS 13+ reports itself as a Mac but has a touch screen.
  return /Macintosh/u.test(userAgent) && maxTouchPoints > 1;
}

/** Already running as an installed app? `iosStandalone` is Safari's `navigator.standalone`. */
export function isInstalledDisplay(
  displayModeStandalone: boolean,
  iosStandalone?: boolean,
): boolean {
  return displayModeStandalone || iosStandalone === true;
}
```

**`src/libs/pwa/install.test.ts`** (new)

```ts
import { describe, expect, it } from 'vitest';

import { isInstalledDisplay, isIosDevice } from './install';

describe('isIosDevice', () => {
  it('detects iPhone and iPad user agents', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
  });

  it('detects iPadOS posing as a Mac', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
  });

  it('does not flag desktops or Android', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });
});

describe('isInstalledDisplay', () => {
  it('is true for standalone display mode or iOS standalone', () => {
    expect(isInstalledDisplay(true)).toBe(true);
    expect(isInstalledDisplay(false, true)).toBe(true);
  });

  it('is false in a normal tab', () => {
    expect(isInstalledDisplay(false)).toBe(false);
    expect(isInstalledDisplay(false, false)).toBe(false);
  });
});
```

### 3.3 Provider and hook

`PwaProvider` owns registration, online/offline state, the waiting-worker update flag and the `beforeinstallprompt` event. It uses `useSyncExternalStore` for browser state because the repo's React Compiler lint rules reject `setState` inside effects.

🚢 **Ship**

**`src/hooks/use-pwa.ts`** (new)

```ts
'use client';

import { createContext, useContext } from 'react';

export interface PwaState {
  /** Ask the waiting worker to take over, then reload when it does. */
  applyUpdate: () => void;
  /** Wipe runtime caches (sign-out, "clear offline data"). */
  clearOfflineData: () => Promise<void>;
  /** The browser offered installation and it has not been used or dismissed. */
  canInstall: boolean;
  /** Running as an installed app (standalone display). */
  isInstalled: boolean;
  isIos: boolean;
  isOffline: boolean;
  isSupported: boolean;
  /** Shows the native install dialog. Resolves true when the user accepted. */
  promptInstall: () => Promise<boolean>;
  updateAvailable: boolean;
  version: string | null;
}

export const PwaContext = createContext<PwaState | null>(null);

/** Install, update and connectivity state. Safe on the server: it renders nothing browser-specific. */
export function usePwa(): PwaState {
  const value = useContext(PwaContext);
  if (!value) {
    throw new Error('usePwa must be used inside <PwaProvider>');
  }
  return value;
}
```

**`src/components/pwa/pwa-provider.tsx`** (new)

```tsx
'use client';

import { useOffline } from 'next/offline';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { PwaContext } from '@/hooks/use-pwa';
import type { PwaState } from '@/hooks/use-pwa';
import { Env } from '@/libs/env';
import { isInstalledDisplay, isIosDevice } from '@/libs/pwa/install';
import type { SwReply } from '@/libs/pwa/messages';
import {
  clearPwaData,
  isServiceWorkerSupported,
  postToWorker,
  registerServiceWorker,
} from '@/libs/pwa/register';

/** The event Chromium fires when the app is installable. Not in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaProviderProps {
  children: ReactNode;
}

function noUnsubscribe() {
  // nothing to clean up
}

/** For values that never change after load: there is nothing to subscribe to. */
function neverChanges() {
  return noUnsubscribe;
}

function subscribeToConnectivity(onChange: () => void) {
  globalThis.addEventListener('online', onChange);
  globalThis.addEventListener('offline', onChange);
  return () => {
    globalThis.removeEventListener('online', onChange);
    globalThis.removeEventListener('offline', onChange);
  };
}

function subscribeToDisplayMode(onChange: () => void) {
  const query = globalThis.matchMedia('(display-mode: standalone)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const readOffline = () => !navigator.onLine;
const readSupported = () => isServiceWorkerSupported();
const readIos = () => isIosDevice(navigator.userAgent, navigator.maxTouchPoints);
const readInstalled = () =>
  isInstalledDisplay(
    globalThis.matchMedia('(display-mode: standalone)').matches,
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );
const serverFalse = () => false;

export function PwaProvider({ children }: PwaProviderProps) {
  const frameworkOffline = useOffline();
  // Browser-only facts are read with useSyncExternalStore: false on the server and during
  // hydration (no mismatch), the real value right after.
  const browserOffline = useSyncExternalStore(subscribeToConnectivity, readOffline, serverFalse);
  const isSupported = useSyncExternalStore(neverChanges, readSupported, serverFalse);
  const isIos = useSyncExternalStore(neverChanges, readIos, serverFalse);
  const installedByDisplay = useSyncExternalStore(
    subscribeToDisplayMode,
    readInstalled,
    serverFalse,
  );
  const [installedNow, setInstalledNow] = useState(false);
  const isInstalled = installedByDisplay || installedNow;
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setInstalledNow(true);
    };

    globalThis.addEventListener('beforeinstallprompt', onPrompt);
    globalThis.addEventListener('appinstalled', onInstalled);
    return () => {
      globalThis.removeEventListener('beforeinstallprompt', onPrompt);
      globalThis.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Register the worker (production only) and watch for updates.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !Env.NEXT_PUBLIC_PWA_ENABLED) {
      return;
    }

    let cancelled = false;
    const cleanups: (() => void)[] = [];

    const trackInstalling = (registration: ServiceWorkerRegistration) => {
      const { installing } = registration;
      if (!installing) {
        return;
      }
      const onChange = () => {
        // "installed" with an active controller means a NEW version is waiting.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }
      };
      installing.addEventListener('statechange', onChange);
      cleanups.push(() => installing.removeEventListener('statechange', onChange));
    };

    const onMessage = (event: MessageEvent<SwReply>) => {
      if (event.data.type === 'VERSION') {
        setVersion(event.data.version);
      }
    };

    const onControllerChange = () => {
      if (reloading.current) {
        globalThis.location.reload();
      }
    };

    const register = async () => {
      const registration = await registerServiceWorker();
      if (cancelled || !registration) {
        return;
      }
      if (registration.waiting && navigator.serviceWorker.controller) {
        setWaiting(registration.waiting);
      }
      registration.addEventListener('updatefound', () => trackInstalling(registration));
      postToWorker(registration.active, { type: 'GET_VERSION' });
    };
    void register();

    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('message', onMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, []);

  const applyUpdate = useCallback(() => {
    reloading.current = true;
    postToWorker(waiting, { type: 'SKIP_WAITING' });
  }, [waiting]);

  const promptInstall = useCallback(async () => {
    if (!installEvent) {
      return false;
    }
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    // The event can only be used once.
    setInstallEvent(null);
    return outcome === 'accepted';
  }, [installEvent]);

  const value = useMemo<PwaState>(
    () => ({
      applyUpdate,
      canInstall: installEvent !== null && !isInstalled,
      clearOfflineData: clearPwaData,
      isInstalled,
      isIos,
      isOffline: frameworkOffline || browserOffline,
      isSupported,
      promptInstall,
      updateAvailable: waiting !== null,
      version,
    }),
    [
      applyUpdate,
      browserOffline,
      frameworkOffline,
      installEvent,
      isInstalled,
      isIos,
      isSupported,
      promptInstall,
      version,
      waiting,
    ],
  );

  return <PwaContext value={value}>{children}</PwaContext>;
}
```

### 3.4 UI

🚢 **Ship**

**`src/components/pwa/offline-banner.tsx`** (new)

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { usePwa } from '@/hooks/use-pwa';

export function OfflineBanner() {
  const t = useTranslations('pwa.offline');
  const { isOffline } = usePwa();

  if (!isOffline) {
    return null;
  }

  return (
    <output className="bg-foreground text-background block px-4 py-2 text-center text-sm">
      {t('banner')}
    </output>
  );
}
```

**`src/components/pwa/update-toast.tsx`** (new)

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { usePwa } from '@/hooks/use-pwa';

const TOAST_ID = 'pwa-update';

/** Offers the reload instead of forcing it, so nobody loses a half-filled form (decision D10). */
export function UpdateToast() {
  const t = useTranslations('pwa.update');
  const { applyUpdate, updateAvailable } = usePwa();

  useEffect(() => {
    if (!updateAvailable) {
      return;
    }
    toast(t('message'), {
      action: { label: t('action'), onClick: applyUpdate },
      duration: Infinity,
      id: TOAST_ID,
    });
    return () => {
      toast.dismiss(TOAST_ID);
    };
  }, [applyUpdate, t, updateAvailable]);

  return null;
}
```

**`src/components/pwa/install-prompt.tsx`** (new)

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState, useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { usePwa } from '@/hooks/use-pwa';

const DISMISSED_KEY = 'pwa-install-dismissed-at';
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Per-viewer convenience only: storage can throw or be empty, and the UI must still work.
 * Read through useSyncExternalStore so the server render and hydration both see `false`.
 */
function readCoolingDown(): boolean {
  try {
    const dismissedAt = Number(globalThis.localStorage.getItem(DISMISSED_KEY) ?? 0);
    return Date.now() - dismissedAt < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function writeDismissedAt(value: number): void {
  try {
    globalThis.localStorage.setItem(DISMISSED_KEY, String(value));
  } catch {
    // ignore: the prompt simply comes back next visit
  }
}

function subscribeToNothing() {
  return () => {
    // nothing to clean up
  };
}

export function InstallPrompt() {
  const t = useTranslations('pwa.install');
  const { canInstall, isInstalled, isIos, promptInstall } = usePwa();
  const coolingDown = useSyncExternalStore(subscribeToNothing, readCoolingDown, () => false);
  const [dismissedNow, setDismissedNow] = useState(false);

  if (isInstalled || dismissedNow || coolingDown) {
    return null;
  }
  // Chromium offers a native prompt; iOS Safari has none, so we explain the manual steps.
  if (!canInstall && !isIos) {
    return null;
  }

  const dismiss = () => {
    writeDismissedAt(Date.now());
    setDismissedNow(true);
  };

  return (
    <aside
      aria-label={t('title')}
      className="bg-card text-card-foreground fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border p-4 shadow-lg"
    >
      <p className="font-medium">{t('title')}</p>
      <p className="text-muted-foreground mt-1 text-sm">
        {canInstall ? t('description') : t('iosHint')}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" onClick={dismiss}>
          {t('dismiss')}
        </Button>
        {canInstall ? (
          <Button
            onClick={async () => {
              await promptInstall();
            }}
          >
            {t('action')}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
```

### 3.5 Translations (add keys to **both** `en.json` and `fr.json`)

🚢 **Ship**

**`src/locales/en.json`** (edit)

```diff
@@ -109,5 +109,10 @@
   },
   "account": {
-    "nav": { "profile": "Profile", "security": "Security" },
+    "nav": {
+      "profile": "Profile",
+      "security": "Security",
+      "notifications": "Notifications",
+      "pwa": "App"
+    },
     "profile": {
       "title": "Profile",
@@ -235,4 +240,48 @@
       "ignore": "If you didn't ask for this, secure your account right away."
     }
+  },
+  "pwa": {
+    "offline": {
+      "banner": "You are offline. Pending requests will retry when you are back online."
+    },
+    "install": {
+      "title": "Install the app",
+      "description": "Add it to your home screen for faster access and a full-screen experience.",
+      "action": "Install",
+      "iosHint": "On iPhone or iPad, tap Share, then \"Add to Home Screen\".",
+      "dismiss": "Not now"
+    },
+    "update": {
+      "message": "A new version is available.",
+      "action": "Reload"
+    },
+    "status": {
+      "title": "App and offline data",
+      "description": "Installation status and what this device stores for offline use.",
+      "installed": "Installed",
+      "notInstalled": "Not installed",
+      "version": "Version",
+      "unsupported": "Offline features are not supported in this browser.",
+      "clear": "Clear offline data",
+      "cleared": "Offline data cleared.",
+      "clearFailed": "Could not clear offline data."
+    }
+  },
+  "push": {
+    "title": "Notifications",
+    "description": "Choose whether this device receives push notifications.",
+    "enable": "Enable notifications",
+    "disable": "Disable notifications",
+    "enabled": "Notifications are on for this device.",
+    "disabled": "Notifications are off for this device.",
+    "denied": "Notifications are blocked. Allow them in your browser settings, then try again.",
+    "unsupported": "This browser does not support push notifications.",
+    "iosInstalledOnly": "On iPhone and iPad, install the app to your home screen first to receive notifications.",
+    "unavailable": "Notifications are not available right now.",
+    "test": "Send a test notification",
+    "testSent": "Test notification sent.",
+    "error": "Something went wrong. Please try again.",
+    "testTitle": "Test notification",
+    "testBody": "Notifications work on this device."
   }
 }
```

**`src/locales/fr.json`** (edit)

```diff
@@ -114,5 +114,10 @@
   },
   "account": {
-    "nav": { "profile": "Profil", "security": "Sécurité" },
+    "nav": {
+      "profile": "Profil",
+      "security": "Sécurité",
+      "notifications": "Notifications",
+      "pwa": "Application"
+    },
     "profile": {
       "title": "Profil",
@@ -240,4 +245,48 @@
       "ignore": "Si vous n'êtes pas à l'origine de cette demande, sécurisez votre compte immédiatement."
     }
+  },
+  "pwa": {
+    "offline": {
+      "banner": "Vous êtes hors ligne. Les requêtes en attente seront relancées au retour de la connexion."
+    },
+    "install": {
+      "title": "Installer l'application",
+      "description": "Ajoutez-la à votre écran d'accueil pour un accès plus rapide et un affichage plein écran.",
+      "action": "Installer",
+      "iosHint": "Sur iPhone ou iPad, touchez Partager, puis « Sur l'écran d'accueil ».",
+      "dismiss": "Plus tard"
+    },
+    "update": {
+      "message": "Une nouvelle version est disponible.",
+      "action": "Recharger"
+    },
+    "status": {
+      "title": "Application et données hors ligne",
+      "description": "État de l'installation et ce que cet appareil conserve pour un usage hors ligne.",
+      "installed": "Installée",
+      "notInstalled": "Non installée",
+      "version": "Version",
+      "unsupported": "Les fonctions hors ligne ne sont pas prises en charge par ce navigateur.",
+      "clear": "Effacer les données hors ligne",
+      "cleared": "Données hors ligne effacées.",
+      "clearFailed": "Impossible d'effacer les données hors ligne."
+    }
+  },
+  "push": {
+    "title": "Notifications",
+    "description": "Choisissez si cet appareil reçoit des notifications push.",
+    "enable": "Activer les notifications",
+    "disable": "Désactiver les notifications",
+    "enabled": "Les notifications sont activées sur cet appareil.",
+    "disabled": "Les notifications sont désactivées sur cet appareil.",
+    "denied": "Les notifications sont bloquées. Autorisez-les dans les réglages du navigateur, puis réessayez.",
+    "unsupported": "Ce navigateur ne prend pas en charge les notifications push.",
+    "iosInstalledOnly": "Sur iPhone et iPad, installez d'abord l'application sur l'écran d'accueil pour recevoir des notifications.",
+    "unavailable": "Les notifications ne sont pas disponibles pour le moment.",
+    "test": "Envoyer une notification de test",
+    "testSent": "Notification de test envoyée.",
+    "error": "Une erreur est survenue. Veuillez réessayer.",
+    "testTitle": "Notification de test",
+    "testBody": "Les notifications fonctionnent sur cet appareil."
   }
 }
```

✅ **Verify**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

🔍 **Verify** (not executed here): component tests in browser mode (`pnpm test:browser`) for the banner/toast/prompt — the repo rule is "new client component ⇒ browser-mode test"; write them against `PwaContext` with a stub value. The authoring sandbox had no Chromium matching the repo's Playwright version.

🔍 **Verify** (manual): DevTools → Network → **Offline**, reload a page you visited: the Nexora offline page appears; toggle back online and the banner disappears. To test the update flow, build twice with different `PWA_BUILD_ID` values and reload — the toast offers "Reload".

### 3.6 Commit

```bash
git add -A && git commit -m "feat(ui): add install prompt, offline banner and update toast"
```

---

## S2.6-T05 — Push notifications

> ⚠️ Needs your approvals: **new dependency** (`web-push`) and **schema change** (`push_subscription`). Both were approved with the backlog.

### 5.1 Branch and dependencies

```bash
git switch -c feat/s2.6-t05-push
pnpm add web-push
pnpm add -D @types/web-push
pnpm pin
```

Verified with **web-push 4.0.0** and **@types/web-push 3.6.4**. 🔍 `web-push` v4 has **no default export** — use named imports (`import { sendNotification, setVapidDetails } from 'web-push'`), otherwise lint and runtime fail.

### 5.2 Generate the VAPID keys (once per environment)

```bash
pnpm exec web-push generate-vapid-keys
```

Put them in `.env.local` (never commit):

```dotenv
PUSH_ENABLED=true
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>      # server-only
VAPID_SUBJECT=mailto:you@example.com  # or https://your-domain
```

### 5.3 Schema and migration

🚢 **Ship**

**`src/db/schema/push.ts`** (new)

```ts
import { index, text, timestamp, pgTable, uniqueIndex } from 'drizzle-orm/pg-core';

import { user } from './auth';

const tz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * One row per browser/device that opted in to web push. `endpoint` is a secret capability URL
 * issued by the push service, so it is unique and never shown to other users.
 */
export const pushSubscription = pgTable(
  'push_subscription',
  {
    auth: text('auth').notNull(),
    createdAt: tz('created_at').notNull().defaultNow(),
    endpoint: text('endpoint').notNull(),
    expiresAt: tz('expires_at'),
    id: text('id').primaryKey(),
    lastUsedAt: tz('last_used_at'),
    p256dh: text('p256dh').notNull(),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('push_subscription_endpoint_idx').on(table.endpoint),
    index('push_subscription_user_id_idx').on(table.userId),
  ],
);
```

**`src/db/schema/index.ts`** (edit — named re-exports; `export *` violates the no-barrel-file rule)

```diff
@@ -1 +1,2 @@
-export * from './auth';
+export { account, rateLimit, session, user, verification } from './auth';
+export { pushSubscription } from './push';
```

```bash
pnpm db:generate     # creates drizzle/0004_<random_name>.sql — the file name varies, commit whatever it generates
pnpm db:migrate
pnpm db:check
```

The generated SQL is committed as-is (never hand-edit generated SQL). For reference, the verified migration:

**`drizzle/0004_slow_felicia_hardy.sql`** (new)

```sql
CREATE TABLE "push_subscription" (
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"endpoint" text NOT NULL,
	"expires_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"last_used_at" timestamp with time zone,
	"p256dh" text NOT NULL,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_idx" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscription_user_id_idx" ON "push_subscription" USING btree ("user_id");
```

### 5.4 Service, transport, validation, actions

Security properties built in and tested (8 unit tests): **takeover protection** — an existing endpoint is only reassigned to another user if the auth secret matches (otherwise `ConflictError`), the test push is **rate-limited from the DB** (no in-memory state), a `410/404` from the push service deletes the subscription, and payloads are capped at 3500 bytes.

🚢 **Ship**

**`src/libs/pwa/push-payload.ts`** (new)

```ts
/**
 * Push payload contract, shared by the server (which builds it) and the service worker
 * (which must never trust it). No dependencies, so it is safe to bundle into the worker.
 */
export interface PushPayload {
  body: string;
  /** Path (same origin) opened when the notification is clicked. */
  url: string;
  title: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
}

/** Push services cap payloads around 4 KB; stay below. */
export const MAX_PUSH_PAYLOAD_BYTES = 3500;

/**
 * Turns whatever the push carried into a same-origin path. Anything else (other origin,
 * `javascript:`, protocol-relative, garbage) falls back to the home page.
 */
export function safeNotificationUrl(value: unknown, origin: string): string {
  if (typeof value !== 'string' || value === '' || value.startsWith('//')) {
    return '/';
  }
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) {
      return '/';
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

/** Defensive parse of an incoming push. Returns null when it is not a usable notification. */
export function parsePushPayload(raw: unknown, origin: string): PushPayload | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const { body, tag, title, url } = raw as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '') {
    return null;
  }
  return {
    body: typeof body === 'string' ? body : '',
    title: title.slice(0, 120),
    url: safeNotificationUrl(url, origin),
    ...(typeof tag === 'string' && tag !== '' ? { tag: tag.slice(0, 64) } : {}),
  };
}

/** Server side: serialize and refuse payloads the push service would reject. */
export function serializePushPayload(payload: PushPayload): string {
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).length > MAX_PUSH_PAYLOAD_BYTES) {
    throw new RangeError('Push payload is too large');
  }
  return json;
}
```

**`src/libs/pwa/push-payload.test.ts`** (new)

```ts
import { describe, expect, it } from 'vitest';

import {
  MAX_PUSH_PAYLOAD_BYTES,
  parsePushPayload,
  safeNotificationUrl,
  serializePushPayload,
} from './push-payload';

const ORIGIN = 'https://app.example.com';

describe('safeNotificationUrl', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/dashboard?tab=1#x', '/dashboard?tab=1#x'],
    ['https://app.example.com/fr/dashboard', '/fr/dashboard'],
  ])('keeps same-origin %s', (input, expected) => {
    expect(safeNotificationUrl(input, ORIGIN)).toBe(expected);
  });

  it.each([
    'https://evil.example.com/phish',
    '//evil.example.com',
    ['java', 'script:alert(1)'].join(''),
    'data:text/html,<script>1</script>',
    '',
    undefined,
    null,
    42,
    {},
  ])('falls back to "/" for %o', (input) => {
    expect(safeNotificationUrl(input, ORIGIN)).toBe('/');
  });
});

describe('parsePushPayload', () => {
  it('parses a valid payload and sanitizes the url', () => {
    expect(
      parsePushPayload({ body: 'Hi', title: 'Hello', url: 'https://evil.test/x' }, ORIGIN),
    ).toEqual({ body: 'Hi', title: 'Hello', url: '/' });
  });

  it('keeps a bounded tag', () => {
    const parsed = parsePushPayload({ tag: 'a'.repeat(200), title: 'T' }, ORIGIN);
    expect(parsed?.tag).toHaveLength(64);
  });

  it.each([null, undefined, 'text', 1, [], {}, { title: '' }, { title: '   ' }, { title: 5 }])(
    'rejects %o',
    (input) => {
      expect(parsePushPayload(input, ORIGIN)).toBeNull();
    },
  );
});

describe('serializePushPayload', () => {
  it('serializes small payloads', () => {
    expect(JSON.parse(serializePushPayload({ body: 'b', title: 't', url: '/' }))).toEqual({
      body: 'b',
      title: 't',
      url: '/',
    });
  });

  it('refuses oversized payloads', () => {
    const body = 'x'.repeat(MAX_PUSH_PAYLOAD_BYTES);
    expect(() => serializePushPayload({ body, title: 't', url: '/' })).toThrow(RangeError);
  });
});
```

**`src/libs/pwa/vapid.ts`** (new)

```ts
/** Converts the base64url VAPID public key into the bytes `pushManager.subscribe` expects. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = `${base64Url}${padding}`.replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.codePointAt(index) ?? 0;
  }
  return output;
}
```

**`src/libs/pwa/vapid.test.ts`** (new)

```ts
import { describe, expect, it } from 'vitest';

import { urlBase64ToUint8Array } from './vapid';

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    // "hello" → aGVsbG8 (base64url, unpadded)
    expect([...urlBase64ToUint8Array('aGVsbG8')]).toEqual([104, 101, 108, 108, 111]);
  });

  it('handles the url-safe alphabet (- and _)', () => {
    // bytes 251, 255, 190 → "-_--" in base64url ("+/+-" would be standard base64 "+/++")
    expect([...urlBase64ToUint8Array('-_--')]).toEqual([251, 255, 190]);
  });

  it('decodes a 65-byte uncompressed P-256 public key to 65 bytes', () => {
    const key = Buffer.alloc(65, 7).toString('base64url');
    expect(urlBase64ToUint8Array(key)).toHaveLength(65);
  });
});
```

**`src/services/push.ts`** (new)

```ts
import { randomUUID } from 'node:crypto';

import { and, desc, eq, sql } from 'drizzle-orm';

import { pushSubscription } from '@/db/schema';
import type { DbLike } from '@/db/types';
import { ConflictError, RateLimitError } from '@/libs/errors';
import { serializePushPayload } from '@/libs/pwa/push-payload';
import type { PushPayload } from '@/libs/pwa/push-payload';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { auth: string; p256dh: string };
  expirationTime?: number | null;
  userAgent?: string | null;
}

/** Thrown by a transport when the push service says the subscription no longer exists (404/410). */
export class PushGoneError extends Error {
  override readonly name = 'PushGoneError';
}

/** Sends one already-serialized payload. Injected so tests never touch the network. */
export interface PushTransport {
  send: (
    subscription: { endpoint: string; keys: { auth: string; p256dh: string } },
    payload: string,
  ) => Promise<void>;
}

/** Minimum gap between test pushes for one user. */
export const TEST_PUSH_INTERVAL_MS = 10_000;

/**
 * Saves (or refreshes) a device subscription for `userId`.
 *
 * The same endpoint can only move to another user when the caller proves it holds the same
 * auth secret. That covers a shared browser where someone else signs in, and stops anybody who
 * merely learned an endpoint URL from taking over another user's subscription.
 */
export async function saveSubscription(
  db: DbLike,
  userId: string,
  input: PushSubscriptionInput,
): Promise<void> {
  const values = {
    auth: input.keys.auth,
    endpoint: input.endpoint,
    expiresAt:
      input.expirationTime === null || input.expirationTime === undefined
        ? null
        : new Date(input.expirationTime),
    id: randomUUID(),
    p256dh: input.keys.p256dh,
    userAgent: input.userAgent?.slice(0, 255) ?? null,
    userId,
  };

  const written = await db
    .insert(pushSubscription)
    .values(values)
    .onConflictDoUpdate({
      set: {
        auth: values.auth,
        expiresAt: values.expiresAt,
        p256dh: values.p256dh,
        userAgent: values.userAgent,
        userId,
      },
      setWhere: eq(pushSubscription.auth, values.auth),
      target: pushSubscription.endpoint,
    })
    .returning({ id: pushSubscription.id });

  if (written.length === 0) {
    // The endpoint exists with a different secret: do not reveal whose it is.
    throw new ConflictError();
  }
}

/** Removes ONE of the user's own subscriptions. Other users' rows are never touched. */
export async function removeSubscription(
  db: DbLike,
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const removed = await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)))
    .returning({ id: pushSubscription.id });
  return removed.length > 0;
}

export async function removeAllSubscriptions(db: DbLike, userId: string): Promise<number> {
  const removed = await db
    .delete(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .returning({ id: pushSubscription.id });
  return removed.length;
}

export async function countSubscriptions(db: DbLike, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId));
  return row?.total ?? 0;
}

/** Sends to every device of one user. Dead subscriptions (404/410) are deleted on the way. */
export async function sendToUser(
  db: DbLike,
  transport: PushTransport,
  userId: string,
  payload: PushPayload,
  now: Date = new Date(),
): Promise<{ failed: number; removed: number; sent: number }> {
  const body = serializePushPayload(payload);
  const rows = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));

  const outcomes = await Promise.all(
    rows.map(async (row) => {
      try {
        await transport.send(
          { endpoint: row.endpoint, keys: { auth: row.auth, p256dh: row.p256dh } },
          body,
        );
        await db
          .update(pushSubscription)
          .set({ lastUsedAt: now })
          .where(eq(pushSubscription.id, row.id));
        return 'sent' as const;
      } catch (error) {
        if (error instanceof PushGoneError) {
          await db.delete(pushSubscription).where(eq(pushSubscription.id, row.id));
          return 'removed' as const;
        }
        return 'failed' as const;
      }
    }),
  );

  return {
    failed: outcomes.filter((outcome) => outcome === 'failed').length,
    removed: outcomes.filter((outcome) => outcome === 'removed').length,
    sent: outcomes.filter((outcome) => outcome === 'sent').length,
  };
}

/** Database-backed throttle (works on serverless, unlike an in-memory counter). */
export async function assertTestPushAllowed(
  db: DbLike,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const [latest] = await db
    .select({ lastUsedAt: pushSubscription.lastUsedAt })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .orderBy(desc(pushSubscription.lastUsedAt))
    .limit(1);

  if (latest?.lastUsedAt && now.getTime() - latest.lastUsedAt.getTime() < TEST_PUSH_INTERVAL_MS) {
    throw new RateLimitError();
  }
}
```

**`src/services/push.test.ts`** (new)

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pushSubscription, user } from '@/db/schema';
import { ConflictError, RateLimitError } from '@/libs/errors';

import { createTestDb } from '../../tests/utils/test-db';
import {
  assertTestPushAllowed,
  countSubscriptions,
  PushGoneError,
  removeAllSubscriptions,
  removeSubscription,
  saveSubscription,
  sendToUser,
  TEST_PUSH_INTERVAL_MS,
} from './push';
import type { PushTransport } from './push';

const subscription = (endpoint: string, auth = 'auth-secret') => ({
  endpoint,
  keys: { auth, p256dh: 'p256dh-key' },
});

describe('push service', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    testDb = await createTestDb();
    await testDb.db.insert(user).values([
      { email: 'a@example.com', id: 'user-a', name: 'A' },
      { email: 'b@example.com', id: 'user-b', name: 'B' },
    ]);
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  it('saves a subscription once per endpoint', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/a1'));
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/a1'));

    expect(await countSubscriptions(db, 'user-a')).toBe(1);
    await removeAllSubscriptions(db, 'user-a');
  });

  it('lets a shared browser move to the next user when the secret matches', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/shared'));
    await saveSubscription(db, 'user-b', subscription('https://push.example.com/shared'));

    expect(await countSubscriptions(db, 'user-a')).toBe(0);
    expect(await countSubscriptions(db, 'user-b')).toBe(1);
    await removeAllSubscriptions(db, 'user-b');
  });

  it('refuses to take over an endpoint with a different secret', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/victim'));

    await expect(
      saveSubscription(db, 'user-b', subscription('https://push.example.com/victim', 'guessed')),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await countSubscriptions(db, 'user-a')).toBe(1);
    expect(await countSubscriptions(db, 'user-b')).toBe(0);
    await removeAllSubscriptions(db, 'user-a');
  });

  it("never removes another user's subscription", async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/mine'));

    expect(await removeSubscription(db, 'user-b', 'https://push.example.com/mine')).toBe(false);
    expect(await countSubscriptions(db, 'user-a')).toBe(1);
    expect(await removeSubscription(db, 'user-a', 'https://push.example.com/mine')).toBe(true);
    expect(await countSubscriptions(db, 'user-a')).toBe(0);
  });

  it('sends to every device and prunes the ones the push service reports gone', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/alive'));
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/gone'));
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/flaky'));

    const delivered: string[] = [];
    const transport: PushTransport = {
      send: (target, payload) => {
        if (target.endpoint.endsWith('/gone')) {
          return Promise.reject(new PushGoneError());
        }
        if (target.endpoint.endsWith('/flaky')) {
          return Promise.reject(new Error('push service unavailable'));
        }
        delivered.push(payload);
        return Promise.resolve();
      },
    };

    const result = await sendToUser(db, transport, 'user-a', {
      body: 'Hi',
      title: 'Hello',
      url: '/',
    });

    expect(result).toEqual({ failed: 1, removed: 1, sent: 1 });
    expect(JSON.parse(delivered[0] ?? '{}')).toEqual({ body: 'Hi', title: 'Hello', url: '/' });
    // alive + flaky remain, gone is deleted
    expect(await countSubscriptions(db, 'user-a')).toBe(2);
    await removeAllSubscriptions(db, 'user-a');
  });

  it('only sends to the requested user', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-b', subscription('https://push.example.com/b-only'));
    const endpoints: string[] = [];
    const transport: PushTransport = {
      send: (target) => {
        endpoints.push(target.endpoint);
        return Promise.resolve();
      },
    };

    await sendToUser(db, transport, 'user-a', { body: '', title: 'T', url: '/' });

    expect(endpoints).toEqual([]);
    await removeAllSubscriptions(db, 'user-b');
  });

  it('throttles test pushes per user', async () => {
    const { db } = testDb;
    await saveSubscription(db, 'user-a', subscription('https://push.example.com/throttle'));
    const transport: PushTransport = { send: () => Promise.resolve() };
    const now = new Date('2026-11-17T12:00:00Z');

    await expect(assertTestPushAllowed(db, 'user-a', now)).resolves.toBeUndefined();
    await sendToUser(db, transport, 'user-a', { body: '', title: 'T', url: '/' }, now);

    await expect(
      assertTestPushAllowed(db, 'user-a', new Date(now.getTime() + 1000)),
    ).rejects.toBeInstanceOf(RateLimitError);
    await expect(
      assertTestPushAllowed(db, 'user-a', new Date(now.getTime() + TEST_PUSH_INTERVAL_MS)),
    ).resolves.toBeUndefined();
    await removeAllSubscriptions(db, 'user-a');
  });

  it('deletes subscriptions when the user is deleted (cascade)', async () => {
    const { db } = testDb;
    await db.insert(user).values({ email: 'c@example.com', id: 'user-c', name: 'C' });
    await saveSubscription(db, 'user-c', subscription('https://push.example.com/c'));

    await db.delete(user).where(eq(user.id, 'user-c'));

    const rows = await db.select().from(pushSubscription);
    expect(rows.some((row) => row.userId === 'user-c')).toBe(false);
  });
});
```

**`src/libs/push/web-push-transport.ts`** (new)

```ts
import 'server-only';
import { sendNotification, setVapidDetails, WebPushError } from 'web-push';

import { Env } from '@/libs/env';
import { ExternalServiceError } from '@/libs/errors';
import { PushGoneError } from '@/services/push';
import type { PushTransport } from '@/services/push';

/** Push messages that cannot be delivered within a minute are not worth delivering. */
const TTL_SECONDS = 60;

export function createWebPushTransport(): PushTransport {
  const publicKey = Env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = Env.VAPID_PRIVATE_KEY;
  const subject = Env.VAPID_SUBJECT;

  if (!Env.PUSH_ENABLED || !publicKey || !privateKey || !subject) {
    throw new ExternalServiceError();
  }

  setVapidDetails(subject, publicKey, privateKey);

  return {
    async send(subscription, payload) {
      try {
        await sendNotification(subscription, payload, { TTL: TTL_SECONDS });
      } catch (error) {
        if (error instanceof WebPushError && [404, 410].includes(error.statusCode)) {
          throw new PushGoneError();
        }
        throw error;
      }
    },
  };
}
```

**`src/validations/push.ts`** (new)

```ts
import { z } from 'zod';

// Messages are i18n KEYS (see src/locales/*.json → "validation")
const httpsEndpoint = z
  .url({ message: 'validation.invalid' })
  .max(2048, { message: 'validation.invalid' })
  .refine((value) => value.startsWith('https://'), { message: 'validation.invalid' });

export const pushSubscriptionSchema = z.object({
  endpoint: httpsEndpoint,
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    auth: z.string().min(1).max(64),
    p256dh: z.string().min(1).max(256),
  }),
});

export const unsubscribePushSchema = z.object({ endpoint: httpsEndpoint });
```

**`src/actions/push.ts`** (new)

```ts
'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { z } from 'zod';

import { getSessionOrThrow } from '@/data/session';
import { withAuth } from '@/data/with-auth';
import { db } from '@/db/client';
import { Env } from '@/libs/env';
import { NotFoundError } from '@/libs/errors';
import { createWebPushTransport } from '@/libs/push/web-push-transport';
import {
  assertTestPushAllowed,
  removeSubscription,
  saveSubscription,
  sendToUser,
} from '@/services/push';
import { createAction } from '@/utils/action';
import { pushSubscriptionSchema, unsubscribePushSchema } from '@/validations/push';

/** The feature flag is checked on the server too: hiding the UI is not a control. */
function assertPushEnabled() {
  if (!Env.PUSH_ENABLED) {
    throw new NotFoundError();
  }
}

const handleSubscribe = createAction(
  pushSubscriptionSchema,
  withAuth(async (input, { session }) => {
    assertPushEnabled();
    const requestHeaders = await headers();
    await saveSubscription(db, session.user.id, {
      ...input,
      userAgent: requestHeaders.get('user-agent'),
    });
    return { subscribed: true as const };
  }),
  { guard: getSessionOrThrow },
);

export async function subscribePush(input: unknown) {
  const result = await handleSubscribe(input);
  return result;
}

const handleUnsubscribe = createAction(
  unsubscribePushSchema,
  withAuth(async ({ endpoint }, { session }) => {
    // Works even when push is disabled, so users can always clean up.
    const removed = await removeSubscription(db, session.user.id, endpoint);
    return { removed };
  }),
  { guard: getSessionOrThrow },
);

export async function unsubscribePush(input: unknown) {
  const result = await handleUnsubscribe(input);
  return result;
}

const handleSendTest = createAction(
  z.object({}),
  withAuth(async (_input, { session }) => {
    assertPushEnabled();
    await assertTestPushAllowed(db, session.user.id);

    const locale = await getLocale();
    const t = await getTranslations({ locale, namespace: 'push' });
    // The content is fixed on purpose: this action is not a way to send arbitrary text.
    const result = await sendToUser(db, createWebPushTransport(), session.user.id, {
      body: t('testBody'),
      tag: 'test',
      title: t('testTitle'),
      url: '/dashboard/account/notifications',
    });
    return result;
  }),
  { guard: getSessionOrThrow },
);

export async function sendTestPush(input: unknown = {}) {
  const result = await handleSendTest(input);
  return result;
}
```

### 5.5 Worker handlers

🚢 **Ship**

**`src/sw/push.ts`** (new)

```ts
/// <reference lib="webworker" />
import { parsePushPayload, safeNotificationUrl } from '@/libs/pwa/push-payload';

declare const self: ServiceWorkerGlobalScope;

const ICON = '/icons/icon-192.png';

self.addEventListener('push', (event) => {
  let raw: unknown = null;
  try {
    raw = event.data?.json();
  } catch {
    raw = null;
  }

  const payload = parsePushPayload(raw, self.location.origin);
  // Browsers require a visible notification for every push (userVisibleOnly), so an
  // unusable payload still shows a neutral one instead of being silently dropped.
  const title = payload?.title ?? 'Notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      badge: ICON,
      body: payload?.body ?? '',
      data: { url: payload?.url ?? '/' },
      icon: ICON,
      ...(payload?.tag ? { tag: payload.tag } : {}),
    }),
  );
});

async function openOrFocus(path: string): Promise<void> {
  const target = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  const existing = windows.find((client) => client.url === target);
  if (existing) {
    await existing.focus();
    return;
  }
  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const url = safeNotificationUrl(
    typeof data === 'object' && data !== null && 'url' in data ? data.url : undefined,
    self.location.origin,
  );
  event.waitUntil(openOrFocus(url));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // The browser rotated the subscription: ask an open page to subscribe again and save it.
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((windows) =>
      Promise.all(
        windows.map((client) =>
          // Client.postMessage has no targetOrigin argument (that is a window.postMessage rule).
          // oxlint-disable-next-line unicorn/require-post-message-target-origin
          client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }),
        ),
      ),
    ),
  );
});
```

(`sw.ts` from T02 already imports `./push` for the `push`, `notificationclick` and `pushsubscriptionchange` events. `notificationclick` only opens **same-origin** URLs via `safeNotificationUrl`.)

### 5.6 UI

🚢 **Ship**

**`src/components/pwa/push-toggle.tsx`** (new)

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';

import { sendTestPush, subscribePush, unsubscribePush } from '@/actions/push';
import { Button } from '@/components/ui/button';
import { usePwa } from '@/hooks/use-pwa';
import { Env } from '@/libs/env';
import { urlBase64ToUint8Array } from '@/libs/pwa/vapid';

type Environment = 'checking' | 'denied' | 'iosInstallFirst' | 'ok' | 'unsupported';

function noUnsubscribe() {
  // nothing to clean up
}

/** Permission and support only change through our own button, which re-renders the component. */
function subscribeToNothing() {
  return noUnsubscribe;
}

function readEnvironment(isIos: boolean, isInstalled: boolean): Environment {
  if (isIos && !isInstalled) {
    return 'iosInstallFirst';
  }
  const supported =
    'serviceWorker' in navigator && 'PushManager' in globalThis && 'Notification' in globalThis;
  if (!supported) {
    return 'unsupported';
  }
  return Notification.permission === 'denied' ? 'denied' : 'ok';
}

export function PushToggle() {
  const t = useTranslations('push');
  const { isInstalled, isIos } = usePwa();
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);

  const environment = useSyncExternalStore<Environment>(
    subscribeToNothing,
    () => readEnvironment(isIos, isInstalled),
    () => 'checking',
  );

  useEffect(() => {
    if (environment !== 'ok') {
      return;
    }
    let cancelled = false;
    const load = async () => {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) {
        setSubscribed(existing !== null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [environment]);

  async function enable() {
    const publicKey = Env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      toast.error(t('unavailable'));
      return;
    }
    setBusy(true);
    try {
      // Asked only here, after a click: never on page load.
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToUint8Array(publicKey),
          userVisibleOnly: true,
        });
        const result = await subscribePush(subscription.toJSON());
        if (result.ok) {
          setSubscribed(true);
        } else {
          await subscription.unsubscribe();
          toast.error(t('error'));
        }
      }
    } catch {
      toast.error(t('error'));
    }
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      toast.error(t('error'));
    }
    setBusy(false);
  }

  async function sendTest() {
    setBusy(true);
    try {
      const result = await sendTestPush({});
      if (result.ok) {
        toast.success(t('testSent'));
      } else {
        toast.error(t('error'));
      }
    } catch {
      toast.error(t('error'));
    }
    setBusy(false);
  }

  const message = (() => {
    if (environment === 'denied') {
      return t('denied');
    }
    if (environment === 'iosInstallFirst') {
      return t('iosInstalledOnly');
    }
    if (environment === 'unsupported') {
      return t('unsupported');
    }
    if (environment === 'ok' && subscribed !== null) {
      return subscribed ? t('enabled') : t('disabled');
    }
    return '';
  })();
  const ready = environment === 'ok' && subscribed !== null;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        {ready && !subscribed ? (
          <Button onClick={enable} disabled={busy}>
            {t('enable')}
          </Button>
        ) : null}
        {ready && subscribed ? (
          <>
            <Button variant="outline" onClick={disable} disabled={busy}>
              {t('disable')}
            </Button>
            <Button variant="secondary" onClick={sendTest} disabled={busy}>
              {t('test')}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
```

**`src/app/[locale]/(app)/dashboard/account/notifications/page.tsx`** (new)

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { PushToggle } from '@/components/pwa/push-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requireSession } from '@/data/session';
import { Env } from '@/libs/env';

interface NotificationsPageProps {
  params: Promise<{ locale: string }>;
}

async function NotificationsContent({ params }: NotificationsPageProps) {
  const { locale } = await params;
  setRequestLocale(locale as 'fr' | 'en');
  await requireSession();
  const t = await getTranslations('push');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {Env.PUSH_ENABLED ? (
          <PushToggle />
        ) : (
          <p className="text-muted-foreground text-sm">{t('unavailable')}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function NotificationsPage({ params }: NotificationsPageProps) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" aria-hidden="true" />}>
      <NotificationsContent params={params} />
    </Suspense>
  );
}
```

**`src/components/account/account-nav.tsx`** (edit — Notifications + App links)

```diff
@@ -9,4 +9,6 @@ const ITEMS = [
   { href: '/dashboard/account/profile', key: 'profile' },
   { href: '/dashboard/account/security', key: 'security' },
+  { href: '/dashboard/account/notifications', key: 'notifications' },
+  { href: '/dashboard/account/pwa', key: 'pwa' },
 ] as const;

```

✅ **Verify**

```bash
pnpm test -- src/services/push src/libs/pwa
pnpm typecheck && pnpm lint && pnpm knip && pnpm check:env
```

🔍 **Verify** (not executed here — needs a real browser and real keys): sign in → Account → Notifications → enable → "Send test notification". Expect the notification within a few seconds; clicking it opens the app. Disable → the row is deleted. Try the test button twice quickly: the second call must be rejected by the throttle.

> 📱 **iOS:** Web Push only works for an app **added to the Home Screen** (iOS 16.4+). The install prompt shows the instructions.

### 5.7 Commit

```bash
git add -A
git commit -m "feat(db): add push_subscription table"   # schema + migration first if you want separate commits
git commit -m "feat(sec): add web push subscriptions, service and worker handlers"
```

---

## S2.6-T06 — PWA developer API & UI

### 6.1 Branch

```bash
git switch -c feat/s2.6-t06-pwa-api
```

`usePwa()` and the provider already exist from T03. This ticket adds the **App** status page (installed or not, the active worker version/build id, and a "Clear offline data" button).

🚢 **Ship**

**`src/components/pwa/pwa-status.tsx`** (new)

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { usePwa } from '@/hooks/use-pwa';

export function PwaStatus() {
  const t = useTranslations('pwa.status');
  const { clearOfflineData, isInstalled, isSupported, version } = usePwa();
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    try {
      await clearOfflineData();
      toast.success(t('cleared'));
    } catch {
      toast.error(t('clearFailed'));
    }
    setBusy(false);
  }

  if (!isSupported) {
    return <p className="text-muted-foreground text-sm">{t('unsupported')}</p>;
  }

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">
          {isInstalled ? t('installed') : t('notInstalled')}
        </dt>
        <dd />
        <dt className="text-muted-foreground">{t('version')}</dt>
        <dd className="font-mono">{version ?? '–'}</dd>
      </dl>
      <Button variant="outline" onClick={clear} disabled={busy}>
        {t('clear')}
      </Button>
    </div>
  );
}
```

**`src/app/[locale]/(app)/dashboard/account/pwa/page.tsx`** (new)

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { PwaStatus } from '@/components/pwa/pwa-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requireSession } from '@/data/session';

interface PwaPageProps {
  params: Promise<{ locale: string }>;
}

async function PwaContent({ params }: PwaPageProps) {
  const { locale } = await params;
  setRequestLocale(locale as 'fr' | 'en');
  await requireSession();
  const t = await getTranslations('pwa.status');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <PwaStatus />
      </CardContent>
    </Card>
  );
}

export default function PwaPage({ params }: PwaPageProps) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" aria-hidden="true" />}>
      <PwaContent params={params} />
    </Suspense>
  );
}
```

> 🔐 Every page under `(app)` **must** call `requireSession()` (enforced by `src/data/guard-coverage.test.ts`). Both new pages do; a layout is never a guard.

✅ **Verify**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

### 6.2 Commit

```bash
git add -A && git commit -m "feat(ui): add PWA status page"
```

---

## S2.6-T07 — Native-like capabilities (optional, P2)

Not implemented in the verified build. If you want it, pick **one** capability per PR (Badging API, Web Share, Share Target, shortcuts in the manifest). Rules: feature-detect, degrade silently, no new dependency, no capability that needs a permission prompt without a user gesture. Add a unit test for the detection helper and document it in `docs/guides/pwa.md`.

---

## S2.6-T09 — Testing, security & documentation

### 9.1 Branch

```bash
git switch -c feat/s2.6-t09-tests-docs
```

### 9.2 Playwright spec

The spec runs against a **production build** (`pnpm build && pnpm start`, as in CI) because the worker is not served by `next dev`. It is skipped unless `CI` or `PWA_E2E` is set, so local `pnpm e2e` stays fast.

🚢 **Ship**

**`e2e/pwa.spec.ts`** (new)

```ts
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { createUser } from './helpers/users';

// The worker is only registered by a production build (CI runs `pnpm build && pnpm start`).
// Locally, run `pnpm build && pnpm start` and set PWA_E2E=1 to include these tests.
test.skip(!process.env.CI && !process.env.PWA_E2E, 'needs a production build');

/** Waits until a worker is registered AND controls this page (reload once after first install). */
async function waitForControlledPage(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
}

/** Every URL stored in any Cache Storage cache. */
function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const lists = await Promise.all(
      names.map(async (name) => {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        return requests.map((request) => request.url);
      }),
    );
    return lists.flat();
  });
}

test('serves a valid manifest and icons', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('manifest+json');

  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/?source=pwa');

  const icons = manifest.icons as { src: string }[];
  const responses = await Promise.all(icons.map((icon) => request.get(icon.src)));
  for (const [index, iconResponse] of responses.entries()) {
    expect(iconResponse.status(), icons[index]?.src).toBe(200);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
  }
});

test('serves the worker uncached and registers it at scope /', async ({ page, request }) => {
  const worker = await request.get('/sw.js');
  expect(worker.status()).toBe(200);
  expect(worker.headers()['content-type']).toContain('javascript');
  expect(worker.headers()['cache-control']).toContain('no-cache');

  await page.goto('/');
  await waitForControlledPage(page);
  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(new URL(scope).pathname).toBe('/');
});

test('shows the offline page when a navigation fails', async ({ context, page }) => {
  await page.goto('/');
  await waitForControlledPage(page);

  await context.setOffline(true);
  await page.goto('/contact').catch(() => null);
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
});

test('never stores API, RSC or protected-page responses, and signs out cleanly', async ({
  context,
  page,
  request,
  baseURL,
}) => {
  const user = await createUser(request, baseURL);

  await page.goto('/sign-in');
  await waitForControlledPage(page);
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await page.goto('/dashboard/account/security');
  await expect(page.getByText('Active sessions', { exact: true })).toBeVisible();

  // While signed in, nothing private is in any cache.
  const whileSignedIn = await cachedUrls(page);
  for (const url of whileSignedIn) {
    const { pathname, search } = new URL(url);
    expect(pathname, url).not.toMatch(/^\/(?:api|dashboard|admin)(?:\/|$)/u);
    expect(search, url).not.toContain('_rsc');
  }

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');

  // Signed out and offline: a protected page is NOT replayed from any cache.
  await context.setOffline(true);
  await page.goto('/dashboard').catch(() => null);
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await expect(page.getByText('Welcome back')).toHaveCount(0);
  await context.setOffline(false);

  // Only public, immutable assets may be cached again after sign-out (the page reloads and re-fetches them).
  const afterSignOut = await cachedUrls(page);
  for (const url of afterSignOut) {
    const { pathname, search } = new URL(url);
    expect(pathname, url).toMatch(
      /^\/(?:_next\/static\/|icons\/|offline\.html$|manifest\.webmanifest$)/u,
    );
    expect(search, url).not.toContain('_rsc');
  }
});
```

```bash
pnpm build && pnpm start &         # or let playwright.config.ts start it
PWA_E2E=1 pnpm e2e -- e2e/pwa.spec.ts
```

✅ 4 tests passed against the production build: manifest + icons, worker headers + scope `/`, offline fallback, no private entries in any cache and sign-out purge.

> 📝 The post-sign-out assertion allows **public** static assets to be re-cached (the page reloads and re-fetches `/_next/static/**`); it fails if anything under `/api`, `/dashboard`, `/admin` or with `_rsc` appears.

### 9.3 Security checklist

- `/sw.js` served with `Cache-Control: no-cache…` and a restrictive CSP (done in `next.config.ts`)
- Cache policy is an allow-list; 40+ unit cases including `Set-Cookie`, `no-store`, cross-origin, `_rsc`, non-GET
- Caches purged on sign-out; protected pages never replayed offline (e2e)
- VAPID private key is server-only (`env.ts`), never `NEXT_PUBLIC_`
- Subscriptions are user-scoped, takeover-protected, auth-guarded (`createAction` + `getSessionOrThrow`, `withAuth`)
- `notificationclick` opens same-origin URLs only; payload size capped
- `Permissions-Policy` stays strict (`camera=(), microphone=(), geolocation=()`) — push does not need it changed

### 9.4 Documentation and ADRs

Create `docs/guides/pwa.md` (how it works, cache policy table, env vars, kill-switch drill, iOS notes, how to test offline) and two ADRs:

- `docs/adr/015-pwa-service-worker-tooling.md` — D1: hand-written worker + esbuild, why not Serwist, trade-offs (we own cache correctness; no Workbox features such as background sync)
- `docs/adr/016-web-push.md` — D4: `web-push`, per-user subscriptions, takeover protection, opt-in, `PUSH_ENABLED`

Update `AGENTS.md` (commands `pwa:icons`, `build:sw`; structure `src/sw/`, `src/libs/pwa/`; the rule "never cache private data in the worker") and `docs/roadmap/06-project-state.md`.

### 9.5 Kill-switch drill (do this once before launch)

```bash
# 1. Production is serving the normal worker.
# 2. Set NEXT_PUBLIC_PWA_ENABLED=false in the environment and redeploy.
# 3. Reload the app twice: the kill worker deletes pwa-* caches and unregisters itself.
# 4. DevTools → Application → Service Workers: none registered; Cache Storage: empty of pwa-*.
# 5. Set the flag back to true and redeploy to re-enable.
```

🔍 **Verify** the drill on a staging deployment; the kill output was verified locally (`NEXT_PUBLIC_PWA_ENABLED=false pnpm build:sw`).

### 9.6 Final gate and commit

```bash
pnpm check
git add -A && git commit -m "docs(docs): add PWA guide, ADRs and e2e coverage"
```

---

## ⏭️ S2.6-T08 — Advanced offline (DEFERRED)

Deferred until **after Sprint 4** (approved): offline queues/mutations depend on the tenant model (`tenantDb`). Leave the checkbox unticked in `docs/roadmap/sprint-02.6-pwa.md` with the note "deferred — revisit after Sprint 4".

---

## 🧯 Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Worker never updates | `/sw.js` is cached — check the `Cache-Control` header and any CDN rule |
| Old UI after deploy | Build id unchanged. Set `PWA_BUILD_ID` (or rely on `GITHUB_SHA`); the toast appears when a new worker is waiting |
| `web-push` default import error | v4 has no default export — use named imports |
| `pnpm pwa:icons` cannot launch Chromium | Set `CHROMIUM_PATH` or run `pnpm exec playwright install chromium` |
| `pnpm lint` rejects `setState` in an effect | Use `useSyncExternalStore` (see `pwa-provider.tsx`) |
| Migration file name differs from the tutorial | Normal — drizzle picks a random suffix; commit the one it generates |
| Push works on desktop, not on iOS | App must be installed to the Home Screen (iOS 16.4+) |
| Cases differ on CI only | Icon paths are case-sensitive on Linux; `manifest.test.ts` checks exact casing |

## ✅ Definition of done (sprint)

- [ ] `pnpm check` green
- [ ] Manifest valid, installable, Lighthouse PWA checks pass 🔍 (run once manually)
- [ ] Offline page works; no private data in any cache; sign-out purges caches
- [ ] Push opt-in/out works end to end 🔍; `PUSH_ENABLED=false` hides the UI
- [ ] Kill switch drilled 🔍
- [ ] Guide + ADR 015/016 + `AGENTS.md` + project state updated
- [ ] T08 recorded as deferred; D13 (Nexora theme) merged before T01
