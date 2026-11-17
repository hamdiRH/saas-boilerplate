# Sprint 2.6 — PWA & Service Worker Infrastructure

> **Status:** planned, awaiting backlog approval. **Planning only:** no package is installed, no manifest or service worker is created, no application code is touched by this document. **Position:** after Sprint 2.3, before Sprint 3. This sprint adds installability, a service worker, a safe caching layer, offline UX and web push as **reusable infrastructure**. It adds no product feature and does not change the Sprint 3 scope.

## 1. Goal

Turn the boilerplate into an installable, resilient PWA **without weakening its security model**: authenticated data is never cached or served from a cache, nothing crosses users, tenants or sessions, and every capability degrades gracefully when the browser does not support it.

## 2. Inspection summary

Facts verified in the repository (branch `fix/audit-sprint-2`, 2026-11-17) and in the current Next.js docs (PWA guide, last updated 2026-07-30; offline-support guide, 2026-10-15).

| Area | Finding | Consequence |
| --- | --- | --- |
| Framework | Next.js 16 App Router, `cacheComponents: true`, `partialPrefetching: true`, `typedRoutes`, React 19 | Exactly the setup the Next.js offline guide assumes; the App Shell is prefetched per `<Link>` |
| Manifest | None. The framework supports `src/app/manifest.ts` (`MetadataRoute.Manifest`), served at `/manifest.webmanifest` | T01 uses the file convention; no library needed |
| Icons / assets | `public/` holds only the default `file/globe/next/vercel/window.svg`; only `src/app/favicon.ico`. No 192/512/maskable/apple-touch icons, no `viewport.themeColor` | T01 needs a brand asset set (decision D6) |
| Service worker | None. Registration with `updateViaCache: 'none'` and a no-cache header on `sw.js` is the documented pattern | T02 owns build, scope, headers, update flow |
| Edge/proxy | `src/proxy.ts` matcher is `/((?!api\|trpc\|_next\|_vercel\|.*\\..*).*)`, so `/sw.js`, `/manifest.webmanifest` and icons bypass the locale and auth proxy | Good: no redirect can hit the worker or manifest. Page routes are still proxied |
| Auth | Better Auth, session cookie, DAL (`requireSession`) authoritative, `proxy.ts` optimistic (ADR-003). Every `(app)`/`(admin)` page calls `requireSession()` | A cached copy of any protected page would **bypass the DAL**. Protected HTML/RSC must never be served from a cache |
| Security headers | `getSecurityHeaders()` sets nosniff, Referrer-Policy, `X-Frame-Options: DENY`, HSTS (prod) and **`Permissions-Policy: camera=(), microphone=(), geolocation=()`**. CSP is planned for Sprint 6 | T07's camera/location features are **blocked by the current policy** (D5); the future CSP must allow `worker-src 'self'` and the push endpoints (coordinate with Sprint 6) |
| i18n | next-intl, `localePrefix: as-needed`, `en` + `fr` | The offline page and install UI exist in both locales; precache must cover both |
| Fonts | Self-hosted Geist (audit fix) | No third-party font request, so the shell works offline |
| Env | `src/libs/env.ts` is the only reader of `process.env`; `check:env` enforces it | VAPID keys are added to the schema and `.env.example`; the private key is server-only |
| Database | Drizzle + PGlite/Neon, migrations generated, `db:check` in CI | Push subscriptions need a table, a schema change (ask first) |
| Tooling | pnpm 12, cross-platform scripts only, Knip, Oxlint/Oxfmt, Vitest unit + browser, Playwright (CI uses a production build) | SW build step is a Node script; unit tests for pure policy code; e2e against a production build |
| Commit scopes | Allowed: deps, auth, db, i18n, ui, ci, docs, tests, config, org, admin, seo, obs, sec. **No `pwa` scope** | Use `ui`, `config`, `sec`, `db`, `tests`, `docs`, or add a `pwa` scope (D11) |
| Public pages | Marketing group, `/sign-in`, `/sign-up` etc. | Only a dedicated static `/offline` page is ever served from cache as a navigation fallback |

Next.js specifics confirmed from the docs and used in this plan:

- Manifest via `app/manifest.ts`; icons live in `public/` or via the `icon` file conventions.
- The documented push example keeps one subscription in a **module variable**. That is a demo only; this plan persists subscriptions per user in the database.
- `beforeinstallprompt` is not cross-browser (not on iOS Safari), so the install UX is progressive: native prompt when available, manual instructions on iOS.
- iOS web push works only for apps **installed to the Home Screen** (iOS 16.4+).
- `experimental.useOffline` plus `useOffline()` (from `next/offline`) retries failed soft navigations, prefetches and Server Actions once connectivity returns. It does **not** make a full page load work offline; that needs a service worker.
- Offline behaviour must be tested on `next build && next start`, not in dev.

## 3. Architectural principles (non-negotiable)

1. **Never cache authenticated or sensitive responses.** No cache entry for `/api/*`, `/api/auth/*`, any request carrying the session cookie to a protected route, RSC payloads (`RSC`, `Next-Router-State-Tree`, `Next-Router-Prefetch`, `_rsc`), Server Action POSTs, or any response with `Set-Cookie` or `Cache-Control: no-store/private`.
2. **Allow-list, not block-list.** The worker caches only what a policy function explicitly allows: hashed static assets (`/_next/static/*`), public icons/fonts/images, the manifest, and the `/offline` page. Everything else is network-only.
3. **No cross-user or cross-tenant leakage.** Nothing user-specific is stored by the worker. If a later ticket needs it, caches are namespaced per user (and per tenant from Sprint 4) and purged on sign-out, session expiry and account switch.
4. **Clear on logout.** Sign-out and session-expiry handling purge all worker caches, unsubscribe push, and clear PWA IndexedDB, but keep the worker itself registered so the shell keeps working.
5. **Private VAPID key is server-only.** Only the public key reaches the browser; the private key is read in `env.ts`, never logged, never in `NEXT_PUBLIC_*`.
6. **Progressive enhancement.** Every feature is feature-detected; unsupported browsers see the normal site, never an error.
7. **Kill switch.** One documented way to disable the worker for all users (a self-unregistering `sw.js` served via a flag), plus `Clear-Site-Data` guidance, because a broken worker is the highest-impact failure mode of this sprint.
8. **Pure, testable policy code.** The "may this request be cached?" logic lives in a plain module with exhaustive unit tests; the worker only wires events to it.
9. **No hidden network.** The worker never calls third parties; tests use no real network (project rule).
10. **Cross-platform.** Build steps are Node scripts, file names are case-exact, LF endings.

## 4. Dependency graph and execution order

```text
T01 ──► T02 ─┬─► T03 ──┐
             ├─► T04 ──┼─► T06 ──┐
             │     └─► T08 ──────┤
             ├─► T05 ────────────┼─► T09
             └─► T07 ────────────┘
```

Order: **T01 → T02 → (T03 ∥ T04 ∥ T05 ∥ T07) → T06 → T08 (optional) → T09.** T05 needs T02 plus its own backend work (table, server code); the push toggle UI is part of T05, T06 provides the shared PWA hooks and components.

| Ticket   | Title                             | Priority | Effort   | Depends on          |
| -------- | --------------------------------- | -------- | -------- | ------------------- |
| S2.6-T01 | PWA foundation & manifest         | P0       | 1 day    | —                   |
| S2.6-T02 | Service worker infrastructure     | P0       | 2 days   | T01                 |
| S2.6-T03 | Installation & network experience | P1       | 1.5 days | T02                 |
| S2.6-T04 | Caching & offline infrastructure  | P0       | 2 days   | T02                 |
| S2.6-T05 | Push notifications                | P1       | 2.5 days | T02 (+ new backend) |
| S2.6-T06 | PWA developer API & UI            | P1       | 2 days   | T02, T03, T04       |
| S2.6-T07 | Native-like capabilities          | P2       | 1.5 days | T02                 |
| S2.6-T08 | Advanced offline (optional)       | P2       | 3 days   | T04                 |
| S2.6-T09 | Testing, security & documentation | P0       | 2 days   | all                 |

## 5. Prerequisites, risks and assumptions

### Prerequisites

- Brand assets: app name, short name, theme/background colors, a square source icon at least 512×512 (D6). Placeholder icons may be generated, and clearly marked, to unblock T01.
- Production-like HTTPS for real-device testing (localhost is a secure context for desktop tests).
- For push: approval of `web-push` as a dependency and of the `push_subscription` table (both "ask first").
- Real-device access (at least one Android Chrome and one iOS 16.4+ device) for the manual checklist in T09.

### Risks

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | **A cached protected page is served to a signed-out or different user** | Medium | Critical | Allow-list policy (principle 2), RSC/auth exclusions, unit tests that enumerate forbidden requests, e2e "sign out then go offline", purge on logout |
| R2 | A buggy worker bricks the site for returning users | Medium | Critical | Kill switch, `updateViaCache: 'none'`, `no-cache` on `sw.js`, versioned caches, staged rollout notes, rehearsed recovery in T09 |
| R3 | Stale assets after deploy (old shell + new API) | Medium | High | Build-id-versioned precache, update prompt flow, old cache cleanup on `activate` |
| R4 | Next.js RSC/prefetch caching conflicts with the worker | Medium | High | Treat RSC and prefetch requests as network-only; rely on `useOffline` for soft-navigation resilience (D3) |
| R5 | Future CSP (Sprint 6) blocks the worker or push | Medium | Medium | Document required directives (`worker-src 'self'`, `manifest-src 'self'`, `connect-src` push services) now; add a header test |
| R6 | iOS limits: no `beforeinstallprompt`, push only when installed, storage eviction | High | Medium | iOS manual instructions, push UI explains the requirement, nothing critical stored client-side |
| R7 | Permission-prompt fatigue lowers push opt-in | Medium | Medium | Ask only after a user action, never on load; explain value first; remember dismissals |
| R8 | `experimental.useOffline` changes or is removed | Medium | Low | Wrap it behind `usePwa().isOffline`; fall back to `online/offline` events |
| R9 | Dev-mode behaviour differs from production | High | Low | Worker disabled in dev by default; all SW tests run on a production build |
| R10 | Subscription data is personal data | Medium | Medium | Store minimum fields, delete on unsubscribe/sign-out/account deletion, document in privacy notes |
| R11 | New dependency or CI change slips in unreviewed | Low | Medium | Both are listed in decisions and tickets, nothing is added silently |
| R12 | Playwright and CI time grow with a production-build e2e project | Medium | Low | Run PWA e2e in a separate project/job; cache build output |

### Assumptions

- Sprint 2.3 may or may not be complete; this sprint does not depend on it. If Azure CI exists it runs the same `pnpm` scripts.
- Single-tenant at this stage; tenant-scoped data arrives in Sprint 4, so nothing here caches tenant data.
- The service worker scope is `/` and the app is served from a single origin.

## 6. Decisions needing your approval

| ID | Decision | Recommendation |
| --- | --- | --- |
| **D1** | Worker tooling: (a) small hand-written TypeScript worker built by a Node script (`scripts/build-sw.mjs`, bundler already in the toolchain, to be confirmed as a direct devDependency); (b) Serwist (new dependency, Next.js integration examples exist); (c) a plain static `public/sw.js` | **(a)**: smallest surface, no framework coupling, fully unit-testable policy module. Choose (b) only if you want precache generation maintained by a library |
| **D2** | Offline scope: shell + `/offline` page only; or also cached public marketing pages; or authenticated data | **Shell + `/offline` page only.** Public-page caching can follow; authenticated data is out of scope for this sprint |
| **D3** | Adopt `experimental.useOffline` for soft-navigation/Server Action retry | **Yes, behind a wrapper** (`usePwa().isOffline`), with a plain-events fallback; it is experimental |
| **D4** | Push: add the `web-push` dependency (exact version) and a `push_subscription` table; scope user-level only (no tenant yet); no marketing/broadcast pushes | **Yes**, plus an env-guarded feature flag so the boilerplate works with push disabled |
| **D5** | Relax `Permissions-Policy` for camera/geolocation (`self`) only for features you approve in T07 | **Keep strict by default**; enable per feature behind approval |
| **D6** | Branding: who supplies name, colors and icon; accept generated placeholders | Placeholders now, replaced by your assets before launch |
| **D7** | Manifest strategy: one manifest vs locale-specific | **One manifest**, `lang: en`, `start_url` `/?source=pwa`, stable `id` |
| **D8** | iOS support level | Installable + manual instructions + push when installed; documented as "best effort" |
| **D9** | T08 advanced offline (queued mutations, background sync): include now, or defer | **Defer until after Sprint 4** (tenancy/RBAC), because queued data must be tenant- and user-scoped; keep it as an approved-later P2 |
| **D10** | Update strategy: auto `skipWaiting` or prompt the user | **Prompt** (toast with "Reload"), activate on confirm |
| **D11** | Add a `pwa` commit scope to `commitlint.config.mjs` and `AGENTS.md` | Yes, one small `config` commit at the start of T01 (changes tooling rules, so needs your OK) |
| **D12** | Edits to `AGENTS.md` and project state for PWA rules (never cache auth, kill switch) | Yes, in T09 |

### Decisions log

| ID | Status | Outcome (2026-11-17) |
| --- | --- | --- |
| D1 | **Approved** | Small hand-written TypeScript worker built by `scripts/build-sw.mjs`. No Serwist. Confirm the bundler becomes a direct, exactly pinned devDependency (that is a dependency change, approved here only for the bundler the toolchain already uses) |
| D4 | **Approved** | `web-push` (exact version) and the `push_subscription` table, user-scoped, with a `PUSH_ENABLED` flag |
| D6 | **Approved** | Brand **Nexora**, see "Brand tokens" below |
| T08 / D9 | **Deferred** | Advanced offline moves out of Sprint 2.6, to after Sprint 4. The sprint has 8 active tickets |
| D2, D3, D5, D7, D8, D10, D11, D12 | Pending | The recommendations stay in force as defaults. Say so if you want any changed |
| D13 (new) | Pending | Apply the Nexora tokens to the app theme (`src/styles/global.css`, shadcn tokens) and rename the default `NEXT_PUBLIC_APP_NAME`. Recommended as a small separate `ui` ticket right after T01, so the PWA ticket stays about PWA. Also decide the font: the brand board names Plus Jakarta Sans (or Inter), while the repo now self-hosts Geist |

### Brand tokens (from the approved Nexora board)

Sources: `docs/brand/nexora-icon-source.png` (layered-stack mark, 1254×1254) and `docs/brand/nexora-brand-board.png`.

| Token            | Hex       | Use in this sprint                                       |
| ---------------- | --------- | -------------------------------------------------------- |
| Primary          | `#635BFF` | Manifest `theme_color`, install UI accents               |
| Primary hover    | `#5145E5` | Hover/pressed state                                      |
| Background dark  | `#0F172A` | Manifest `background_color` (splash), dark `theme-color` |
| Foreground       | `#0F172A` | Text on light                                            |
| Muted            | `#94A3B8` | Secondary UI, **not body text on white**                 |
| Border           | `#E5E7EB` | Borders                                                  |
| Background light | `#FFFFFF` | Light `theme-color`                                      |

Name: **Nexora**; short name: **Nexora**; tagline: "Build · Launch · Scale".

Contrast checks (WCAG 2.x, computed from the hex values) that T01/T03 must respect:

- `#635BFF` on `#FFFFFF`: about 4.7:1. Passes AA for normal text, so primary buttons with white text are fine.
- `#94A3B8` on `#FFFFFF`: about 2.6:1. Fails AA for text. Use it for icons and decoration only, or a darker muted tone for text.
- `#635BFF` on `#0F172A`: about 3.8:1. Large text and UI components only; small text on dark needs a lighter tint of the primary.

Icon work for T01: derive 192, 512, maskable 512 (safe-zone padded on `#0F172A`), 180 apple-touch and favicon sizes from the source mark. The source has transparency, so the maskable and apple-touch variants need a solid background.

Out of scope: native app store packaging (TWA, Capacitor), background periodic sync, payment/billing flows, caching tenant data, analytics for PWA events (Sprint 6).

## 7. Testing strategy

| Level | What | Tooling |
| --- | --- | --- |
| Unit | Cache policy (allow-list and exhaustive deny cases), precache manifest builder, URL/locale helpers, VAPID/push payload validation, subscription action (guard before validation), `usePwa` state machine | Vitest (unit) |
| Component | Install button, update toast, offline banner, push toggle, iOS instructions, in both locales | Vitest browser mode |
| Integration | Push action against the in-memory database (`createTestDb`), send path with a mocked transport, cleanup of dead subscriptions | Vitest unit |
| End-to-end | Production build: worker registers, offline page appears when offline, protected page is **not** served after sign-out + offline, update prompt appears after a new build, manifest and icons valid | Playwright (own project, `context.setOffline`) |
| Security | Header tests for `sw.js`/manifest, grep-style test that the private key is not in the client bundle, forbidden-request matrix | Vitest + build output check |
| Manual | Real-device install (Android, iOS), push receipt, update flow, kill switch rehearsal | Checklist in T09 |

Rule from the project: tests are deterministic, no real network, no arbitrary sleeps.

## 8. Documentation plan

- `docs/guides/pwa.md`: architecture, cache policy table, update flow, kill switch, push setup (VAPID generation), iOS notes, troubleshooting, testing recipes.
- `docs/adr/015-service-worker-and-cache-policy.md` (D1/D2/principles) and `016-web-push.md` (D4).
- `AGENTS.md`: structure lines for `src/sw/` and `src/libs/pwa/`, plus the rules "never cache auth/RSC" and "do not edit the generated `public/sw.js`" (D12).
- `README.md` feature list, `docs/README.md` index, `.env.example`, `docs/roadmap/06-project-state.md`, and the sprint tutorial (only after backlog approval).

## 9. Tickets

Branch pattern: `feat/s2.6-t0N-<slug>`. Commit scopes from the allowed list (or `pwa` if D11 is approved). Each ticket ends with `pnpm check` green.

---

### S2.6-T01 — PWA foundation & manifest

- **Priority:** P0 · **Effort:** 1 day · **Depends on:** none
- **Objective:** the app is installable-ready: valid manifest, icons, theme color and metadata.
- **User story:** As a visitor, I want to add the app to my home screen with the right name and icon so that it feels like an app.

**Tasks**

- [ ] (D11) Add the `pwa` commit scope if approved.
- [ ] Add `src/app/manifest.ts` returning `MetadataRoute.Manifest`: `id`, `name`, `short_name`, `description`, `start_url` (`/?source=pwa`), `scope`, `display: 'standalone'`, `background_color`, `theme_color`, `lang`, `icons`, optional `shortcuts` (dashboard) after review.
- [ ] Add icon set under `public/icons/`: 192, 512, maskable 512, `apple-touch-icon` 180, favicon variants. Placeholder generation script if D6 assets are missing.
- [ ] Add `viewport` export with `themeColor` (light/dark) and `appleWebApp` metadata in `src/app/[locale]/layout.tsx` metadata.
- [ ] Source app name/colors from one constants module so rebranding is a one-place change; names are not user-facing i18n strings in the manifest (D7).
- [ ] Confirm the manifest and icons bypass `proxy.ts` (matcher) and are served with correct content types and long cache for hashed assets.
- [ ] Extend `getSecurityHeaders` tests if any header changes.

**Tests:** unit test that the manifest object satisfies required fields and every icon path exists (case-exact); Playwright check that `/manifest.webmanifest` returns 200 JSON and icons return 200 images.

**Acceptance criteria**

- [ ] `GET /manifest.webmanifest` returns 200, `application/manifest+json`, with `name`, `short_name`, `start_url`, `display`, `theme_color`, `background_color`, and icons 192 + 512 + maskable.
- [ ] Every icon URL in the manifest returns 200 with an image content type.
- [ ] The page `<head>` contains the manifest link, theme-color and an apple touch icon.
- [ ] The manifest URL is not redirected to a locale or sign-in route.
- [ ] Chrome DevTools → Application → Manifest shows no errors (manual, recorded).
- [ ] No new dependency; `pnpm check` green.

**Definition of done:** criteria verified; branding constants documented; `.env.example` unchanged unless a variable is added to `env.ts` too.

---

### S2.6-T02 — Service worker infrastructure

- **Priority:** P0 · **Effort:** 2 days · **Depends on:** T01
- **Objective:** a build-integrated, versioned, safely updatable service worker with registration, scope, headers and a kill switch, and **no caching behaviour yet beyond a stub**.
- **User story:** As the maintainer, I want a worker I can ship, update and disable safely so that PWA features never put the site at risk.

**Tasks**

- [ ] (D1) Create `src/sw/sw.ts` (worker entry) and `src/libs/pwa/` (pure helpers: `cache-policy.ts`, `version.ts`, `messages.ts`).
- [ ] Add `scripts/build-sw.mjs` (cross-platform): bundles the worker to `public/sw.js`, injects a build id and the precache list; wire it into `build` via a `prebuild`-style script; add `public/sw.js` to `.gitignore` and Knip ignore as needed.
- [ ] Registration module (client, loaded once from the root layout): registers `/sw.js` with `scope: '/'` and `updateViaCache: 'none'`; production only; feature-detected; never registers on protected-route-specific code paths.
- [ ] Lifecycle: `install` (precache stub), `activate` (delete old caches by prefix/version, `clients.claim` only per D10), `message` channel (`SKIP_WAITING`, `CLEAR_CACHES`, `GET_VERSION`).
- [ ] Headers in `next.config.ts`: `sw.js` gets `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate`, and a restrictive CSP; manifest and icons get appropriate cache headers. Add header unit tests.
- [ ] **Kill switch:** env-guarded flag (`PWA_ENABLED`, schema + `.env.example`) so `sw.js` becomes a self-unregistering worker that also clears caches; documented rollout/recovery steps.
- [ ] Logging: no `console.log` in `src/`; worker diagnostics behind a debug flag stripped in production.
- [ ] Update `AGENTS.md` structure lines (D12) in T09, not here.

**Tests:** unit tests for version/message helpers and registration guard (no registration in dev or when unsupported); script test that the build output contains the build id; header tests.

**Acceptance criteria**

- [ ] After `pnpm build && pnpm start`, `/sw.js` is served with `no-cache` and the worker registers at scope `/` (verified in Playwright via `navigator.serviceWorker.getRegistration()`).
- [ ] `sw.js` contains a build id that changes when the app changes and is identical for identical builds.
- [ ] In `pnpm dev` the worker is not registered.
- [ ] With the kill switch set, a previously installed worker unregisters itself and clears caches on the next load.
- [ ] A new build triggers an `updatefound` and the old worker stays active until the update flow completes.
- [ ] The build script runs on Windows and Linux (no shell-specific syntax) and `pnpm check` is green; Knip reports nothing new.

**Definition of done:** criteria verified; ADR 015 drafted; recovery runbook written.

---

### S2.6-T03 — Installation & network experience

- **Priority:** P1 · **Effort:** 1.5 days · **Depends on:** T02
- **Objective:** a respectful install flow and clear connectivity feedback on every platform.
- **User story:** As a user, I want to be offered installation at a sensible moment and to know when I am offline so that I am never confused by a frozen UI.

**Tasks**

- [ ] `InstallPrompt` logic: capture `beforeinstallprompt`, expose `canInstall`/`promptInstall`, detect `display-mode: standalone` and `appinstalled`, iOS detection with manual "Share → Add to Home Screen" instructions.
- [ ] Dismissal memory (per-viewer convenience in `localStorage`, wrapped in try/catch) with a cooldown; never prompt on first paint.
- [ ] Connectivity state: `isOffline` from `useOffline()` when enabled (D3) with `online`/`offline` event fallback; `OfflineBanner` (`role="status"`) in the root layout.
- [ ] Update-available UI: toast with "Reload" that posts `SKIP_WAITING` and reloads on `controllerchange` (D10).
- [ ] `src/app/[locale]/offline/page.tsx`: static, public, no session code, localized, with retry button.
- [ ] Add every new string to `en.json` and `fr.json`; use shadcn primitives, `buttonVariants()` for links, `Link` from `@/i18n/navigation`.
- [ ] If D3 is approved: set `experimental.useOffline: true` in `next.config.ts`.

**Tests:** browser-mode tests for the install, offline and update components (EN and FR); unit tests for the state machine; e2e: set the context offline and assert the banner and offline page.

**Acceptance criteria**

- [ ] On Chromium, the install control appears only when the browser reports installability and disappears after install or dismissal.
- [ ] On iOS user agents the manual instructions are shown instead of a native prompt; in standalone mode nothing is shown.
- [ ] Going offline shows the banner within 2 seconds and hides it after reconnection.
- [ ] A hard navigation offline shows the localized offline page, not the browser error.
- [ ] Dismissal is remembered for the configured cooldown and the page works when storage throws.
- [ ] All new strings exist in both locales; axe checks on the new components report no violations.

**Definition of done:** criteria verified; `pnpm check` green; screenshots of EN/FR states attached to the PR.

---

### S2.6-T04 — Caching & offline infrastructure

- **Priority:** P0 · **Effort:** 2 days · **Depends on:** T02
- **Objective:** a conservative, allow-list caching layer that makes the shell and static assets resilient without ever storing sensitive data.
- **User story:** As a user on a bad connection, I want the app shell and assets to load fast and survive drops so that the product feels reliable, while my private data stays private.

**Tasks**

- [ ] Implement `cache-policy.ts`: `classifyRequest(request)` returns one of `precache`, `static-immutable`, `public-asset`, `offline-fallback`, `network-only`; default is `network-only`.
- [ ] Strategies: precache + cache-first for `/_next/static/*` and versioned icons/fonts; stale-while-revalidate only for approved public assets; navigation requests are **network-first with the `/offline` page as the only fallback**; everything else network-only.
- [ ] Hard exclusions encoded and tested: non-GET, `/api/*`, `/api/auth/*`, RSC/prefetch headers or `_rsc` param, responses with `Set-Cookie`, `Cache-Control: no-store|private`, status ≠ 200, opaque or cross-origin responses, requests with `Authorization`, protected path prefixes (derived from `src/libs/route-guard.ts` so there is one source of truth).
- [ ] Cache names are `pwa-<kind>-<buildId>`; `activate` deletes other versions; size and entry limits with eviction.
- [ ] `CLEAR_CACHES` message and a client helper `clearPwaData()` (caches + PWA IndexedDB) called from the sign-out flow and on session expiry; document the hook point in the auth client wrapper without modifying auth logic until approved (ask-first: auth code).
- [ ] Precache list built from the build manifest (shell assets, `/offline` in both locales).
- [ ] Storage-quota and failure handling: cache errors never break the response.

**Tests:** table-driven unit tests with 40+ request/response cases including every exclusion; test that the protected-prefix list matches `route-guard`; Playwright: after sign-in, sign-out and going offline, `/dashboard` shows the offline page and the cache contains no HTML for protected routes.

**Acceptance criteria**

- [ ] No cache entry ever exists for `/api/**`, RSC/prefetch requests, non-GET requests or responses with `Set-Cookie` (asserted by listing `caches` in e2e).
- [ ] After sign-out, all `pwa-*` caches are empty of user-specific content and a protected route is never served offline.
- [ ] The second load of a page transfers hashed static assets from the cache (verified via the Cache Storage listing, not timing).
- [ ] After a deploy, old caches are removed on activation and no entry from the previous build id remains.
- [ ] Policy unit tests fail if a forbidden class is turned into a cacheable one (mutation check in review).
- [ ] No auth, DAL or `proxy.ts` code was changed.

**Definition of done:** criteria verified; cache policy table in `docs/guides/pwa.md`; security review note added to the PR.

---

### S2.6-T05 — Push notifications

- **Priority:** P1 · **Effort:** 2.5 days · **Depends on:** T02 (+ new backend work)
- **Objective:** opt-in web push with server-side storage of subscriptions, safe sending and clean unsubscribe.
- **User story:** As a signed-in user, I want to opt in to notifications on a device and turn them off any time so that I only get messages I chose.

**Tasks**

- [ ] (D4) Add `web-push` at an exact version (ask-first, documented) and the env vars `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` plus `PUSH_ENABLED` to `src/libs/env.ts` (private key server-only, production requires all three when enabled) and `.env.example`; `pnpm setup:env` gains a key-generation option or a documented command.
- [ ] Schema `src/db/schema/push.ts`: `push_subscription` (`id`, `user_id` FK cascade, `endpoint` unique, `p256dh`, `auth`, `user_agent`, `created_at`, `last_used_at`, `expires_at`), indexes; generate the migration with `pnpm db:generate` (never hand-edit).
- [ ] `src/services/push.ts` (business logic): `saveSubscription`, `removeSubscription`, `sendToUser`, `pruneDead` (delete on 404/410), payload builder with size limit and allow-listed fields; transport injectable for tests.
- [ ] Server Actions via `createAction(schema, handler, { guard: getSessionOrThrow })`: `subscribePush`, `unsubscribePush`, `sendTestPush`; Zod schema validates endpoint (https URL) and keys; users can only manage their own rows.
- [ ] Worker handlers: `push` (validate payload shape, show notification with localized title/body from the payload, no secrets), `notificationclick` (open a same-origin URL only; reject others), `pushsubscriptionchange` (resubscribe via message to the page).
- [ ] UI: `PushToggle` component and `/dashboard/account/notifications` section (page calls `requireSession()`), permission-state handling (default/granted/denied), asks only after a user click, explains the iOS "installed only" requirement; strings in both locales.
- [ ] Remove the user's subscriptions on sign-out of that device, on unsubscribe and on account deletion (database cascade is already in place via the FK).
- [ ] Extend `db:cleanup` to delete expired subscriptions.
- [ ] Rate-limit `sendTestPush` per user.

**Tests:** unit tests for the service with `createTestDb` and a fake transport (success, 410 pruning, payload size); action tests (guard runs before validation; cannot delete another user's subscription); component tests for permission states; e2e with a fake push transport (no real network): subscribe, see the row, unsubscribe, row removed.

**Acceptance criteria**

- [ ] A signed-in user can subscribe from the notifications page; exactly one row exists for that endpoint and user, and re-subscribing the same endpoint does not duplicate it.
- [ ] An unauthenticated call to any push action fails with the generic auth error before input validation.
- [ ] A user cannot read, change or delete another user's subscription (tested).
- [ ] `sendToUser` removes a subscription when the push service answers 404/410.
- [ ] `VAPID_PRIVATE_KEY` does not appear in the client bundle or in any log (build-output grep test).
- [ ] `notificationclick` never opens a cross-origin URL (unit-tested handler).
- [ ] The permission prompt is never shown without a user click; a denied state shows guidance, not an error.
- [ ] With `PUSH_ENABLED=false` the UI is hidden and the app works unchanged.
- [ ] Migration generated and committed, `pnpm db:check` green.

**Definition of done:** criteria verified; ADR 016; `docs/guides/pwa.md` push section with VAPID generation; privacy note on stored fields.

---

### S2.6-T06 — PWA developer API & UI

- **Priority:** P1 · **Effort:** 2 days · **Depends on:** T02, T03, T04
- **Objective:** one small, documented API and a UI kit so future features use PWA capabilities without touching the worker.
- **User story:** As a developer building Sprint 3+ features, I want hooks and components for install, updates, connectivity and cache control so that I never write service-worker code.

**Tasks**

- [ ] `src/hooks/use-pwa.ts`: `{ isSupported, isInstalled, canInstall, promptInstall, isOffline, updateAvailable, applyUpdate, version }`; SSR-safe (no browser access during render).
- [ ] `PwaProvider` mounted once in the root layout (registration, listeners, shared state); components consume it.
- [ ] Components: `InstallButton`, `UpdateToast`, `OfflineBanner` (from T03 refactored onto the provider), `PwaStatus` (settings/diagnostics: version, worker state, cache size, "clear offline data").
- [ ] Settings panel at `/dashboard/account/pwa` (or section of an existing page): install state, offline-data size, "Clear offline data", push toggle from T05 when available.
- [ ] Public API surface documented (types in `src/types/`), named exports, no business logic in components.
- [ ] Typed message protocol between page and worker (`src/libs/pwa/messages.ts`) shared by both sides.
- [ ] Strings in `en.json` and `fr.json`; shadcn primitives only.

**Tests:** hook tests (state transitions, SSR-safe), component tests in both locales, e2e for "Clear offline data" emptying caches.

**Acceptance criteria**

- [ ] `usePwa()` renders on the server without errors and hydrates without mismatch warnings.
- [ ] Every component works when service workers are unsupported (renders nothing or a clear message, never throws).
- [ ] "Clear offline data" empties every `pwa-*` cache and the PWA IndexedDB, confirmed in e2e.
- [ ] A new feature can read install/offline/update state with one hook and zero worker knowledge (shown by the example in the guide).
- [ ] Settings page calls `requireSession()` and the guard-coverage test passes.
- [ ] Knip clean: no unused exports in the PWA API.

**Definition of done:** criteria verified; API reference in `docs/guides/pwa.md`; `pnpm check` green.

---

### S2.6-T07 — Native-like capabilities (optional, P2)

- **Priority:** P2 · **Effort:** 1.5 days · **Depends on:** T02
- **Objective:** a small set of opt-in, feature-detected native-like capabilities, each individually approved.
- **User story:** As a mobile user, I want share, badge and shortcut integration so that the app behaves like part of my device.

**Tasks**

- [ ] Manifest `shortcuts` for key routes (public-safe titles, localized via the default language only).
- [ ] `share()` helper using the Web Share API with clipboard fallback (feature-detected).
- [ ] App Badging API helper (`setBadge`, `clearBadge`), no-op when unsupported; cleared on sign-out.
- [ ] (D5, only if approved) Camera/geolocation helpers with the narrowest `Permissions-Policy` change (`self`) and a permission-explainer pattern; otherwise documented as intentionally blocked.
- [ ] `display_override` and `launch_handler` evaluated and recorded in the ADR (adopt only with a measured benefit).
- [ ] Documentation of what is deliberately **not** included (file handlers, protocol handlers).

**Tests:** unit tests for feature detection and fallbacks; header test proving `Permissions-Policy` stays strict unless D5 approved.

**Acceptance criteria**

- [ ] Each helper returns a typed "unsupported" result instead of throwing on unsupported browsers.
- [ ] The shortcut URLs resolve and require authentication where the target page does (they never leak a protected page).
- [ ] Badge count is cleared on sign-out (tested).
- [ ] `Permissions-Policy` is unchanged unless D5 was approved, and any relaxation is limited to `self` for the approved feature.

**Definition of done:** criteria verified; guide section lists supported/unsupported browsers; deferred items listed.

---

### S2.6-T08 — Advanced offline (P2, DEFERRED until after Sprint 4)

- **Priority:** P2 · **Effort:** 3 days · **Depends on:** T04
- **Objective:** queue user-initiated mutations while offline and replay them safely.
- **User story:** As a user on an unreliable connection, I want my changes to be kept and sent when I reconnect so that I do not lose work.

**Status:** **deferred until after Sprint 4** (D9 approved). Included here so the design is on record and the dependency (T04) is explicit.

**Tasks (when approved)**

- [ ] Decide queue scope: only idempotent, user-scoped mutations; each carries an idempotency key.
- [ ] IndexedDB queue namespaced by user id (and tenant id after Sprint 4), encrypted-at-rest is **not** claimed (document the limitation).
- [ ] Replay on reconnect via `useOffline` retry (preferred) or Background Sync where supported; exponential backoff, max age, and dead-letter handling.
- [ ] Conflict policy (last-write-wins vs. reject) per mutation type, documented.
- [ ] Purge queue on sign-out and account switch; never replay under a different user.
- [ ] UI: pending/failed indicators and a manual retry/discard.

**Tests:** unit tests for queue ordering, idempotency, expiry and user-scoping; e2e offline-edit-reconnect on a fixture mutation.

**Acceptance criteria**

- [ ] A queued mutation is sent exactly once after reconnect (server-side idempotency key honored).
- [ ] Signing out empties the queue; signing in as another user never replays the previous user's items.
- [ ] Items older than the maximum age are discarded and surfaced to the user.
- [ ] Nothing in the queue contains credentials or tokens.

**Definition of done:** only if approved; criteria verified; ADR recorded.

---

### S2.6-T09 — Testing, security & documentation

- **Priority:** P0 · **Effort:** 2 days · **Depends on:** all previous tickets
- **Objective:** prove the PWA layer is safe and complete, and leave it maintainable.
- **User story:** As the maintainer, I want evidence and documentation so that I can trust and extend the PWA layer.

**Tasks**

- [ ] Add a Playwright project for PWA tests on a production build (`next build && next start`), wired into CI as a separate job (change to CI workflow: approval needed, ask-first).
- [ ] Security test suite: forbidden-request matrix, sign-out-then-offline leak test, two-users-on-one-browser test (user B never sees user A data offline), private-key-not-in-bundle check, header assertions for `sw.js`/manifest, no third-party requests from the worker.
- [ ] Failure drills, recorded in the guide: kill switch, broken-worker recovery, stale-version rollout, deploy with a changed build id, storage quota exceeded.
- [ ] Manual real-device checklist (Android Chrome install + push, iOS install + push, update prompt, offline page) with results.
- [ ] Performance check: worker registration does not delay first render; record before/after Core Web Vitals on a production build for the home and sign-in pages.
- [ ] Accessibility pass on all new UI (keyboard, focus, announcements for offline/update).
- [ ] Docs: `docs/guides/pwa.md`, ADR 015/016, `AGENTS.md` (D12), `README.md`, `docs/README.md`, `.env.example`, `docs/roadmap/06-project-state.md`; tutorial `sprint-02.6-tutorial.md` only after backlog approval.
- [ ] Update the sprint checklist and the roadmap index.

**Acceptance criteria**

- [ ] All security tests above pass in CI on a production build; the leak tests fail when the cache policy is deliberately weakened (demonstrated once in the PR).
- [ ] The two-user test proves no cross-user data is retrievable offline.
- [ ] Every drill has a written procedure that was executed once.
- [ ] The real-device checklist is completed for at least one Android and one iOS device, or any gap is recorded with a reason.
- [ ] Registration adds no measurable regression to LCP on the recorded pages (numbers in the guide).
- [ ] `pnpm check:agents` and `pnpm check` are green; every path in the docs exists with exact casing and every link resolves.
- [ ] A developer who did not write the code can enable push, disable the worker with the kill switch, and clear offline data using only the guide.

**Definition of done:** all P0/P1 tickets verified; ADRs accepted; docs merged; sprint closed in `docs/roadmap/README.md` and the state file.

---

## 10. Definition of done (sprint)

- Every ticket meets its own DoD and the roadmap DoD (`README.md` §3).
- Decisions D1–D12 recorded; ADR 015 and 016 accepted.
- The principles in §3 are enforced by tests, not by convention.
- The worker can be disabled with the documented kill switch and recovery was rehearsed.
- `docs/roadmap/06-project-state.md` is updated, and the tutorial is written only after approval.
