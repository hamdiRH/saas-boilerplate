# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 7 — SEO, Marketing, i18n Sync, Performance & Accessibility

> Companion to `docs/roadmap/sprint-07-seo-marketing-perf.md`. Every `S7-Txx` section is one ticket. Tickets follow the sprint file's order. **Release gate: 0.8 Beta.** By the end the public face of the product is discoverable, fast, accessible and translatable — and _measured_ (Lighthouse and axe run in CI).

🪟 **Windows + Cmder:** use the **Git Bash tab**. Paths with `[brackets]`/`(parentheses)` must be quoted. Windows-specific notes are marked 🪟.

> ⚠️ **About versions.** Next.js metadata files, `next/og`, Lighthouse CI, the React Compiler and `@axe-core/playwright` evolve quickly; spots likely to differ are marked **🔍 Verify against docs**. Scores and budgets in this sprint are **targets you measure**, not numbers to trust.

---

## 📋 What you will have at the end

- A real **home page**, **pricing** (placeholder), **about** and **legal templates** (terms, privacy, cookies) — all in en/fr, all **statically generated**
- A working **contact form** that sends email, with honeypot + rate limit
- Complete **SEO**: unique titles/descriptions, canonical + hreflang, Open Graph/Twitter cards, **JSON-LD**, generated **OG images**, `sitemap.xml`, `robots.txt`, manifest and icons
- **Crowdin** translation sync, with `i18n-check` guarding the incoming translations
- **Loading skeletons** and **empty states** everywhere data loads
- **Lighthouse CI** with budgets, a measured **before/after**, verified **minification and cache-busting**, and a documented **React Compiler** decision
- **Accessibility**: axe in E2E, contrast tests on the theme tokens, skip link, reduced motion; **RTL** readiness verified
- The finalised **minimalist theme** with accent presets and a single brand config — rebrand in 10 minutes

## 🧭 Decisions & deviations (made once, here)

| Topic | Decision | Why |
| --- | --- | --- |
| FAQ widget | Native `<details>/<summary>`, no JS library | Zero JavaScript, accessible by default, helps Lighthouse |
| Marketing rendering | **Static** (`setRequestLocale` + `generateStaticParams`), relaxed CSP tier (S6-T11) | Speed and cacheability |
| Indexing | `SITE_INDEXING=false` by default → `robots.txt` disallows everything and pages say `noindex`; turn it **on in production** | Forks, previews and staging must never be indexed |
| Legal pages | Templates, marked "not legal advice", `noindex` while `LEGAL_NOINDEX=true` (default) | Nobody should publish an unreviewed policy |
| Metadata | One helper (`src/libs/seo.ts`) builds title, canonical, hreflang, OG, Twitter and robots | Consistency, and unit-testable |
| OG images | Generated with `next/og`, default font (no custom font bundled) | Fewer moving parts; custom fonts can be added later |
| Lighthouse | LHCI runs on a **clean build** (no Sentry/PostHog dummy keys) | Failing requests to fake vendors would pollute _Best Practices_ |
| Cache Components (`"use cache"`) | Evaluated, **not adopted** for v1.0 | Static marketing pages already cache fully; it would change semantics app-wide (documented in S7-T09) |
| React Compiler | Measured in S7-T10; adopt only if tests pass and the bundle doesn't grow | Decision recorded as `TD-09` |
| RTL | Verified with a **build-time** direction override; no Arabic translations shipped | Proves the layout; adding `ar` is a documented recipe |
| Brand strings | One config (`src/config/brand.ts`) + `{appName}` in messages; a test forbids the literal old name in code | Rebranding becomes a 10-minute job |

---

## 🔀 Git workflow (PR-based)

```bash
git switch main && git pull
git switch -c <type>/s7-tXX-<slug>
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

Each ticket ends with a **🚢 Ship** line. Run `pnpm pin` after adding dependencies. **Visual baselines change a lot this sprint** (new pages, footer, theme): regenerate them with the `update-snapshots` label (Sprint 5) after reviewing the diffs — never from your machine.

---

## ✅ Before you start

```bash
git switch main && git pull
pnpm install
pnpm check              # Sprint 6 must be green
```

Set **Current sprint: Sprint 7** in `docs/roadmap/06-project-state.md`. **Measure now and write down:** Lighthouse mobile scores of `/` (run it in Chrome DevTools → _Lighthouse_, or wait for S7-T08 for the proper baseline).

---

## 🎫 S7-T01 — Marketing pages

**Branch:** `feat/s7-t01-marketing-pages` · **Story:** US-070 · **3 SP**

```bash
git switch -c feat/s7-t01-marketing-pages
mkdir -p src/components/marketing src/config "src/app/[locale]/(marketing)/pricing" "src/app/[locale]/(marketing)/about"
```

### 1. A small brand config (completed in S7-T13)

📄 **Edit `src/libs/Env.ts`** (`client` + `runtimeEnv`):

```ts
    NEXT_PUBLIC_SUPPORT_EMAIL: z.email().default('support@example.com'),
```

`.env.example`: `NEXT_PUBLIC_SUPPORT_EMAIL=support@example.com`.

📄 **Create `src/config/brand.ts`:**

```ts
import { Env } from '@/libs/Env';

/** The single place that knows who we are. Rebranding starts here (see docs/guides/theming.md). */
export const brand = {
  name: Env.NEXT_PUBLIC_APP_NAME,
  url: Env.NEXT_PUBLIC_APP_URL,
  supportEmail: Env.NEXT_PUBLIC_SUPPORT_EMAIL,
  // Used for JSON-LD `sameAs` and the footer. Leave a value out to hide it.
  social: {
    github: undefined as string | undefined,
    x: undefined as string | undefined,
  },
} as const;
```

### 2. Copy (English)

📄 **`src/locales/en.json`** — in `nav` add `"pricing": "Pricing", "about": "About"`; in `footer` add `"terms": "Terms", "privacy": "Privacy", "cookies": "Cookies"`; **replace** the whole `marketing` object:

```json
  "marketing": {
    "hero": {
      "badge": "Open-source SaaS starter",
      "title": "Ship your SaaS in days, not months",
      "subtitle": "Authentication, organizations, roles, observability and a serious test suite — already wired, already secure.",
      "primary": "Get started",
      "secondary": "See pricing"
    },
    "features": {
      "title": "Everything a real product needs",
      "subtitle": "Opinionated where it matters, optional everywhere else.",
      "items": {
        "auth": { "title": "Modern authentication", "body": "Email, magic links, social sign-in, passkeys and two-factor — with sensible defaults." },
        "tenancy": { "title": "Multi-tenant by design", "body": "Organizations, invitations and roles, with tenant isolation proven by tests." },
        "i18n": { "title": "Multilingual", "body": "English and French out of the box, right-to-left ready, translations synced with Crowdin." },
        "quality": { "title": "Quality gates", "body": "Strict TypeScript plus unit, component, end-to-end and visual tests, enforced in CI." },
        "observability": { "title": "Observable and secure", "body": "Error tracking, structured logs, bot protection, a strict CSP and consent-aware analytics." },
        "performance": { "title": "Fast by default", "body": "Static marketing pages, small bundles and a Lighthouse score you can keep." }
      }
    },
    "faq": {
      "title": "Frequently asked questions",
      "items": {
        "q1": { "q": "Is {appName} really free?", "a": "Yes. The starter is open source. Third-party services such as email or monitoring have their own free tiers and are optional." },
        "q2": { "q": "Which database does it use?", "a": "PostgreSQL: an embedded database locally (no setup) and Neon in production. Other databases are on the roadmap." },
        "q3": { "q": "Can I remove features I don't need?", "a": "Yes. Every integration is optional and lives behind a small adapter, so you can switch it off or delete it." },
        "q4": { "q": "Does it include billing?", "a": "Not in version 1.0. The data model leaves room for plans and subscriptions." },
        "q5": { "q": "How do I add another language?", "a": "Add a locale to the routing configuration, create its message file and connect it in Crowdin. The guide lists every step." }
      }
    },
    "cta": {
      "title": "Ready to build?",
      "body": "Create your account and have a running, multi-tenant app in minutes.",
      "button": "Create your account"
    }
  },
  "pricing": {
    "title": "Simple pricing",
    "subtitle": "Placeholder plans — replace them with your own.",
    "note": "Billing is not included in version 1.0; these tiers are examples.",
    "tiers": {
      "starter": { "name": "Starter", "price": "$0", "period": "per month", "description": "For trying things out.", "cta": "Start free", "f1": "1 organization", "f2": "Up to 3 members", "f3": "Community support" },
      "team": { "name": "Team", "price": "$29", "period": "per month", "description": "For growing teams.", "cta": "Choose Team", "f1": "Unlimited organizations", "f2": "Up to 20 members", "f3": "Email support" },
      "enterprise": { "name": "Enterprise", "price": "Custom", "period": "", "description": "For larger organizations.", "cta": "Contact us", "f1": "Single sign-on", "f2": "Unlimited members", "f3": "Priority support" }
    }
  },
  "about": {
    "title": "About {appName}",
    "intro": "{appName} is a starting point for teams who want to focus on their product instead of rebuilding sign-in, tenancy and tooling.",
    "mission": { "title": "Our mission", "body": "Make the boring parts of a SaaS solid and reusable, so you can spend your time on what makes your product different." },
    "principles": {
      "title": "Principles",
      "p1": "Secure by default, with decisions written down.",
      "p2": "Optional integrations: nothing is forced on you.",
      "p3": "Everything is tested, from components to whole user journeys."
    }
  }
```

### …and French

📄 **`src/locales/fr.json`** — `nav`: `"pricing": "Tarifs", "about": "À propos"`; `footer`: `"terms": "Conditions", "privacy": "Confidentialité", "cookies": "Cookies"`; **replace** `marketing` and add `pricing`, `about`:

```json
  "marketing": {
    "hero": {
      "badge": "Starter SaaS open source",
      "title": "Lancez votre SaaS en quelques jours, pas en quelques mois",
      "subtitle": "Authentification, organisations, rôles, observabilité et une vraie batterie de tests — déjà branchés, déjà sécurisés.",
      "primary": "Commencer",
      "secondary": "Voir les tarifs"
    },
    "features": {
      "title": "Tout ce dont un vrai produit a besoin",
      "subtitle": "Des choix tranchés là où ça compte, tout le reste est optionnel.",
      "items": {
        "auth": { "title": "Authentification moderne", "body": "E-mail, liens magiques, connexion sociale, clés d'accès et double authentification — avec des réglages sensés." },
        "tenancy": { "title": "Multi-organisation par conception", "body": "Organisations, invitations et rôles, avec une isolation entre organisations prouvée par des tests." },
        "i18n": { "title": "Multilingue", "body": "Anglais et français d'emblée, prêt pour l'écriture de droite à gauche, traductions synchronisées avec Crowdin." },
        "quality": { "title": "Garde-fous qualité", "body": "TypeScript strict et tests unitaires, de composants, de bout en bout et visuels, appliqués en CI." },
        "observability": { "title": "Observable et sécurisé", "body": "Suivi d'erreurs, journaux structurés, protection anti-bots, CSP stricte et statistiques respectueuses du consentement." },
        "performance": { "title": "Rapide par défaut", "body": "Pages marketing statiques, bundles légers et un score Lighthouse que vous pouvez conserver." }
      }
    },
    "faq": {
      "title": "Questions fréquentes",
      "items": {
        "q1": { "q": "{appName} est-il vraiment gratuit ?", "a": "Oui. Le starter est open source. Les services tiers (e-mail, supervision) ont leurs propres offres gratuites et sont optionnels." },
        "q2": { "q": "Quelle base de données utilise-t-il ?", "a": "PostgreSQL : une base embarquée en local (aucune installation) et Neon en production. D'autres bases sont prévues." },
        "q3": { "q": "Puis-je retirer les fonctionnalités inutiles ?", "a": "Oui. Chaque intégration est optionnelle et vit derrière un petit adaptateur : vous pouvez la désactiver ou la supprimer." },
        "q4": { "q": "La facturation est-elle incluse ?", "a": "Pas dans la version 1.0. Le modèle de données laisse la place aux offres et abonnements." },
        "q5": { "q": "Comment ajouter une langue ?", "a": "Ajoutez une locale à la configuration de routage, créez son fichier de messages et reliez-la à Crowdin. Le guide détaille chaque étape." }
      }
    },
    "cta": {
      "title": "Prêt à construire ?",
      "body": "Créez votre compte et obtenez une application multi-organisation en quelques minutes.",
      "button": "Créer votre compte"
    }
  },
  "pricing": {
    "title": "Des tarifs simples",
    "subtitle": "Offres fictives — remplacez-les par les vôtres.",
    "note": "La facturation n'est pas incluse dans la version 1.0 ; ces offres sont des exemples.",
    "tiers": {
      "starter": { "name": "Starter", "price": "0 €", "period": "par mois", "description": "Pour essayer.", "cta": "Démarrer gratuitement", "f1": "1 organisation", "f2": "Jusqu'à 3 membres", "f3": "Support communautaire" },
      "team": { "name": "Équipe", "price": "29 €", "period": "par mois", "description": "Pour les équipes en croissance.", "cta": "Choisir Équipe", "f1": "Organisations illimitées", "f2": "Jusqu'à 20 membres", "f3": "Support par e-mail" },
      "enterprise": { "name": "Entreprise", "price": "Sur mesure", "period": "", "description": "Pour les grandes organisations.", "cta": "Nous contacter", "f1": "Authentification unique", "f2": "Membres illimités", "f3": "Support prioritaire" }
    }
  },
  "about": {
    "title": "À propos de {appName}",
    "intro": "{appName} est un point de départ pour les équipes qui veulent se concentrer sur leur produit plutôt que de refaire connexion, multi-organisation et outillage.",
    "mission": { "title": "Notre mission", "body": "Rendre solides et réutilisables les parties ingrates d'un SaaS, pour consacrer votre temps à ce qui différencie votre produit." },
    "principles": {
      "title": "Principes",
      "p1": "Sécurisé par défaut, avec des décisions documentées.",
      "p2": "Intégrations optionnelles : rien ne vous est imposé.",
      "p3": "Tout est testé, des composants aux parcours complets."
    }
  }
```

```bash
pnpm test        # the locale parity test must stay green
```

### 3. Sections (server components, no client JavaScript)

📄 **Create `src/components/marketing/hero-section.tsx`:**

```tsx
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export function HeroSection() {
  const t = useTranslations('marketing.hero');

  return (
    <section className="mx-auto max-w-3xl px-4 py-20 text-center md:py-28">
      <p className="bg-muted text-muted-foreground mx-auto mb-6 inline-block rounded-full px-3 py-1 text-xs font-medium">
        {t('badge')}
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
        {t('title')}
      </h1>
      <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-pretty">
        {t('subtitle')}
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/sign-up">{t('primary')}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/pricing">{t('secondary')}</Link>
        </Button>
      </div>
    </section>
  );
}
```

📄 **Create `src/components/marketing/feature-grid.tsx`:**

```tsx
import { Gauge, Languages, Layers, ShieldCheck, Users, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

const FEATURES = [
  { key: 'auth', icon: ShieldCheck },
  { key: 'tenancy', icon: Users },
  { key: 'i18n', icon: Languages },
  { key: 'quality', icon: Wrench },
  { key: 'observability', icon: Layers },
  { key: 'performance', icon: Gauge },
] as const;

export function FeatureGrid() {
  const t = useTranslations('marketing.features');

  return (
    <section className="bg-muted/40 border-y">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-muted-foreground mt-3">{t('subtitle')}</p>
        </div>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, icon: Icon }) => (
            <li key={key} className="bg-background rounded-lg border p-6">
              <Icon className="text-primary mb-4 size-6" aria-hidden />
              <h3 className="font-medium">{t(`items.${key}.title`)}</h3>
              <p className="text-muted-foreground mt-2 text-sm">{t(`items.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

📄 **Create `src/components/marketing/faq-section.tsx`** — native disclosure, shared with the JSON-LD in S7-T04:

```tsx
import { useTranslations } from 'next-intl';

import { brand } from '@/config/brand';

export const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;

export function FaqSection() {
  const t = useTranslations('marketing.faq');

  return (
    <section className="mx-auto max-w-3xl px-4 py-20">
      <h2 className="text-center text-3xl font-semibold tracking-tight">{t('title')}</h2>
      <div className="mt-10 divide-y rounded-lg border">
        {FAQ_KEYS.map((key) => (
          <details key={key} className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {t(`items.${key}.q`, { appName: brand.name })}
              <span
                aria-hidden
                className="text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="text-muted-foreground mt-3 text-sm">{t(`items.${key}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
```

📄 **Create `src/components/marketing/cta-section.tsx`:**

```tsx
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export function CtaSection() {
  const t = useTranslations('marketing.cta');

  return (
    <section className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h2 className="text-3xl font-semibold tracking-tight">{t('title')}</h2>
      <p className="text-muted-foreground mt-3">{t('body')}</p>
      <Button asChild size="lg" className="mt-8">
        <Link href="/sign-up">{t('button')}</Link>
      </Button>
    </section>
  );
}
```

### 4. The pages

📄 **Rewrite `src/app/[locale]/(marketing)/page.tsx`:**

```tsx
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { CtaSection } from '@/components/marketing/cta-section';
import { FaqSection } from '@/components/marketing/faq-section';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { HeroSection } from '@/components/marketing/hero-section';

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale); // keeps the page STATIC

  return (
    <>
      <HeroSection />
      <FeatureGrid />
      <FaqSection />
      <CtaSection />
    </>
  );
}
```

📄 **Create `…/(marketing)/pricing/page.tsx`:**

```tsx
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

const TIERS = [
  { key: 'starter', href: '/sign-up', featured: false },
  { key: 'team', href: '/sign-up', featured: true },
  { key: 'enterprise', href: '/contact', featured: false },
] as const;

export default function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('pricing');

  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-3">{t('subtitle')}</p>
      </header>

      <ul className="mt-12 grid gap-6 md:grid-cols-3">
        {TIERS.map(({ key, href, featured }) => (
          <li
            key={key}
            className={`flex flex-col rounded-lg border p-6 ${featured ? 'border-primary shadow-md' : ''}`}
          >
            <h2 className="text-lg font-medium">{t(`tiers.${key}.name`)}</h2>
            <p className="mt-4 text-3xl font-semibold">
              {t(`tiers.${key}.price`)}
              <span className="text-muted-foreground ms-1 text-sm font-normal">
                {t(`tiers.${key}.period`)}
              </span>
            </p>
            <p className="text-muted-foreground mt-2 text-sm">{t(`tiers.${key}.description`)}</p>
            <ul className="mt-6 flex-1 space-y-2 text-sm">
              {(['f1', 'f2', 'f3'] as const).map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="text-primary size-4 shrink-0" aria-hidden />
                  {t(`tiers.${key}.${feature}`)}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8" variant={featured ? 'default' : 'outline'}>
              <Link href={href}>{t(`tiers.${key}.cta`)}</Link>
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-8 text-center text-sm">{t('note')}</p>
    </section>
  );
}
```

📄 **Create `…/(marketing)/about/page.tsx`:**

```tsx
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { brand } from '@/config/brand';

export default function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('about');

  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-20">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">
          {t('title', { appName: brand.name })}
        </h1>
        <p className="text-muted-foreground mt-4 text-lg">{t('intro', { appName: brand.name })}</p>
      </header>
      <section>
        <h2 className="text-2xl font-semibold">{t('mission.title')}</h2>
        <p className="text-muted-foreground mt-2">{t('mission.body')}</p>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">{t('principles.title')}</h2>
        <ul className="text-muted-foreground mt-2 list-disc ps-6">
          <li>{t('principles.p1')}</li>
          <li>{t('principles.p2')}</li>
          <li>{t('principles.p3')}</li>
        </ul>
      </section>
    </article>
  );
}
```

### 5. Navigation

📄 **Edit `src/components/layout/site-header.tsx`** — links and brand:

```tsx
import { brand } from '@/config/brand';
// links:
    { href: '/', label: t('nav.home') },
    { href: '/pricing', label: t('nav.pricing') },
    { href: '/about', label: t('nav.about') },
    { href: '/contact', label: t('nav.contact') },
// brand text:  {brand.name}   (instead of t('common.appName'))
```

📄 **Edit `src/components/layout/site-footer.tsx`** — legal links (the pages arrive in S7-T02) and brand name:

```tsx
<nav aria-label="Legal" className="flex flex-wrap gap-4">
  <Link href="/terms">{t('footer.terms')}</Link>
  <Link href="/privacy">{t('footer.privacy')}</Link>
  <Link href="/cookies">{t('footer.cookies')}</Link>
  <CookieSettingsButton className="hover:text-foreground underline" />
</nav>
```

(`Link` from `@/i18n/navigation`; and `{brand.name}` in the copyright line.) Update the other `t('common.appName')` uses the same way for now (`app layout`, `auth` pages): `git grep -n "common.appName" src`.

### ✅ Verify

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm knip && pnpm i18n:check
pnpm build
```

1. The build output lists `/`, `/pricing`, `/about` (and `/fr/...`) as **static** (`○` / `●`), not dynamic (`ƒ`). If one is dynamic you read `headers()`/`cookies()` somewhere in the tree — find and remove it.
2. `pnpm dev`: `/`, `/pricing`, `/about` look right at **360 / 768 / 1280 px**, light and dark; `/fr` is entirely French (no English leftovers, FAQ uses the brand name).
3. FAQ opens and closes **without JavaScript** (disable JS in DevTools to prove it) and with the keyboard (Tab → Enter/Space).
4. Disable the network cache and check _Network → JS_: the home page loads no page-specific client code beyond the providers.

**🚢 Ship** — branch `feat/s7-t01-marketing-pages` · message: `feat(marketing): add home, pricing and about pages with brand config in en/fr`

---

## 🎫 S7-T02 — Contact form that works, and legal templates

**Branch:** `feat/s7-t02-contact-legal` · **Story:** US-070 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s7-t02-contact-legal
mkdir -p "src/app/[locale]/(marketing)/terms" "src/app/[locale]/(marketing)/privacy" "src/app/[locale]/(marketing)/cookies"
```

### 1. Email building blocks

📄 **Create `src/libs/email/sanitize.ts`:**

```ts
/** Header injection guard: user input that ends up in a subject or address must stay on ONE line. */
export const singleLine = (value: string) => value.replace(/[\r\n\u2028\u2029]+/g, ' ').trim();

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
```

📄 **Create `src/libs/email/sanitize.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { escapeHtml, singleLine } from './sanitize';

it('removes line breaks so nobody can inject extra headers', () => {
  expect(singleLine('Ada\r\nBcc: victim@example.com')).toBe('Ada Bcc: victim@example.com');
  expect(singleLine('  a\nb  ')).toBe('a b');
});

it('escapes HTML', () => {
  expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
  );
});
```

📄 **Edit `src/libs/email/types.ts`:** add `replyTo?: string;` to `EmailMessage`. 📄 **Edit `resend-transport.ts`:** add `...(message.replyTo ? { reply_to: message.replyTo } : {}),` to the JSON body.

### 2. The action sends a real message

📄 **Edit `src/validations/contact.ts`** — add the honeypot field:

```ts
  // Honeypot: invisible to people, tempting to bots. Anything in here means "not a human".
  website: z.string().max(200).optional(),
```

📄 **Edit `src/actions/contact.ts`:**

```ts
'use server';

import { brand } from '@/config/brand';
import { sendEmail } from '@/libs/email';
import { escapeHtml, singleLine } from '@/libs/email/sanitize';
import { getLogger } from '@/libs/Logger';
import { createAction } from '@/utils/action';
import { contactSchema } from '@/validations/contact';

const handleContact = createAction(contactSchema, async (input) => {
  // A filled honeypot = a bot. Pretend success (don't teach it anything) and send nothing.
  if (input.website) {
    getLogger('security').info('Contact honeypot triggered');
    return { received: true as const };
  }

  const name = singleLine(input.name);
  await sendEmail({
    to: brand.supportEmail,
    replyTo: input.email,
    subject: `New contact message from ${name}`,
    text: `From: ${name} <${input.email}>\n\n${input.message}`,
    html: `<p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(input.email)}&gt;</p><p>${escapeHtml(input.message).replace(/\n/g, '<br>')}</p>`,
    tags: { type: 'contact' },
  });

  getLogger('app').info('Contact message sent', { messageLength: input.message.length }); // never the content
  return { received: true as const };
});

export async function submitContact(input: unknown) {
  return handleContact(input);
}
```

📄 **Create `src/actions/contact.test.ts`:**

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import { submitContact } from './contact';

const transport = new MemoryTransport();
beforeEach(() => {
  transport.clear();
  setEmailTransport(transport);
});
afterEach(() => setEmailTransport(undefined));

const valid = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'Hello, this is a real question.',
};

it('emails the support address with the visitor as reply-to', async () => {
  const result = await submitContact({ ...valid, website: '' });

  expect(result.ok).toBe(true);
  expect(transport.outbox).toHaveLength(1);
  expect(transport.outbox[0]).toMatchObject({
    replyTo: 'ada@example.com',
    tags: { type: 'contact' },
  });
  expect(transport.outbox[0]?.subject).toContain('Ada Lovelace');
});

it('a filled honeypot looks successful but sends nothing', async () => {
  const result = await submitContact({ ...valid, website: 'https://spam.example' });
  expect(result.ok).toBe(true);
  expect(transport.outbox).toHaveLength(0);
});

it('cannot inject headers through the name, and HTML in the message is escaped', async () => {
  await submitContact({
    ...valid,
    name: 'Ada\r\nBcc: victim@example.com',
    message: '<img src=x onerror=alert(1)> hello there',
  });
  const [mail] = transport.outbox;

  expect(mail?.subject).not.toMatch(/[\r\n]/);
  expect(mail?.html).not.toContain('<img');
  expect(mail?.html).toContain('&lt;img');
});

it('still validates input on the server', async () => {
  expect(await submitContact({ ...valid, email: 'nope' })).toMatchObject({
    ok: false,
    error: { code: 'VALIDATION_ERROR' },
  });
});
```

📄 **Edit `src/components/forms/contact-form.tsx`** — add the honeypot to the form and to `defaultValues`:

```tsx
    defaultValues: { name: '', email: '', message: '', website: '' },
// …inside <form>, before the submit button:
        <input
          {...form.register('website')}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="sr-only"
        />
```

Update `contact-form.test.tsx`: the expected call now includes `website: ''`.

### 3. A rate limit specific to the contact form

📄 **Edit `src/libs/arcjet-routes.ts`:**

```ts
import { splitLocale } from '@/libs/route-guard';

export type RouteKind = 'page' | 'contact' | 'auth-api' | 'auth-signup' | 'auth-email-link' | 'auth-sign-in';

export function classifyRoute(pathname: string, method = 'GET'): RouteKind {
  // Server Actions are POSTs to the page URL
  if (method === 'POST' && splitLocale(pathname).path === '/contact') return 'contact';
  if (!pathname.startsWith('/api/auth')) return 'page';
  // …unchanged below…
```

📄 **Edit `src/libs/Arcjet.ts`:** a third client and the call site:

```ts
const contact: ProtectClient | undefined = Env.ARCJET_KEY
  ? arcjet({
      key: Env.ARCJET_KEY,
      characteristics: ['ip.src'],
      rules: [slidingWindow({ mode, interval: '1h', max: 5 })],
    })
  : undefined;

// Clients: add `contact?: ProtectClient`; in evaluate()'s `runs` list add:
//   ...(kind === 'contact' ? [{ client: clients.contact }] : []),

export async function protectRequest(request: Request, { pathname }: { pathname: string }) {
  const kind = classifyRoute(pathname, request.method);
  const address = kindsWithEmail.includes(kind) ? await readEmail(request) : undefined;
  return evaluate({ general, email, contact }, { request, pathname, email: address }, kind);
}
```

📄 **Extend tests** — `arcjet-routes.test.ts`: `expect(classifyRoute('/contact', 'POST')).toBe('contact'); expect(classifyRoute('/fr/contact', 'POST')).toBe('contact'); expect(classifyRoute('/contact', 'GET')).toBe('page');` and in `arcjet.test.ts` a case checking the `contact` client runs only for `kind === 'contact'`.

### 4. Legal templates

📄 **Edit `src/libs/Env.ts`** (`server` + `runtimeEnv`): `LEGAL_NOINDEX: flag('true'),` · `.env.example`: `LEGAL_NOINDEX=true  # set false only after a lawyer has reviewed your legal pages`.

📄 **`src/locales/en.json`** — add:

```json
  "legal": {
    "notice": "This page is a template, not legal advice. Have it reviewed by a qualified lawyer before you publish it.",
    "updated": "Template — adapt before use",
    "terms": {
      "title": "Terms of service",
      "s1": { "title": "Acceptance", "body": "By using {appName} you agree to these terms. If you do not agree, please do not use the service." },
      "s2": { "title": "Accounts", "body": "You are responsible for your account and for keeping your credentials safe. Tell us promptly about any unauthorised use." },
      "s3": { "title": "Acceptable use", "body": "Do not misuse the service: no attacks, no scraping at scale, no unlawful content." },
      "s4": { "title": "Liability and changes", "body": "The service is provided as is. We may update these terms; continued use means you accept the changes." }
    },
    "privacy": {
      "title": "Privacy policy",
      "s1": { "title": "Data we collect", "body": "Account data (name, email), organization data you create, and technical logs needed to run and secure the service." },
      "s2": { "title": "How we use it", "body": "To provide and secure the service, communicate with you, and — only if you consent — to improve it with analytics." },
      "s3": { "title": "Who processes it", "body": "Service providers such as hosting, database, email delivery, error tracking and, with your consent, analytics. List yours here." },
      "s4": { "title": "Your rights", "body": "You can access, correct, export or delete your data, and withdraw consent at any time from the cookie settings." },
      "s5": { "title": "Contact", "body": "Questions about privacy? Write to {email}." }
    },
    "cookies": {
      "title": "Cookie policy",
      "s1": { "title": "Essential cookies", "body": "Needed for sign-in, security, language and to remember your cookie choice. They are always on." },
      "s2": { "title": "Analytics", "body": "Anonymous usage statistics. Off until you agree; you can change your mind at any time." },
      "s3": { "title": "Error recordings", "body": "Short recordings around errors, with text and media masked. Off until you agree." },
      "manage": "Change your choices"
    }
  }
```

📄 **`src/locales/fr.json`:**

```json
  "legal": {
    "notice": "Cette page est un modèle, pas un avis juridique. Faites-la relire par un juriste avant de la publier.",
    "updated": "Modèle — à adapter avant usage",
    "terms": {
      "title": "Conditions d'utilisation",
      "s1": { "title": "Acceptation", "body": "En utilisant {appName}, vous acceptez ces conditions. Si vous êtes en désaccord, n'utilisez pas le service." },
      "s2": { "title": "Comptes", "body": "Vous êtes responsable de votre compte et de la sécurité de vos identifiants. Signalez-nous rapidement tout usage non autorisé." },
      "s3": { "title": "Usage acceptable", "body": "N'abusez pas du service : pas d'attaques, pas de collecte massive, pas de contenu illégal." },
      "s4": { "title": "Responsabilité et modifications", "body": "Le service est fourni en l'état. Nous pouvons modifier ces conditions ; continuer à l'utiliser vaut acceptation." }
    },
    "privacy": {
      "title": "Politique de confidentialité",
      "s1": { "title": "Données collectées", "body": "Données de compte (nom, e-mail), données d'organisation que vous créez, et journaux techniques nécessaires pour exploiter et sécuriser le service." },
      "s2": { "title": "Utilisation", "body": "Pour fournir et sécuriser le service, communiquer avec vous et — uniquement avec votre accord — l'améliorer grâce aux statistiques." },
      "s3": { "title": "Sous-traitants", "body": "Prestataires d'hébergement, de base de données, d'envoi d'e-mails, de suivi d'erreurs et, avec votre accord, de statistiques. Indiquez les vôtres ici." },
      "s4": { "title": "Vos droits", "body": "Vous pouvez accéder à vos données, les corriger, les exporter ou les supprimer, et retirer votre consentement à tout moment depuis les paramètres des cookies." },
      "s5": { "title": "Contact", "body": "Une question sur vos données ? Écrivez à {email}." }
    },
    "cookies": {
      "title": "Politique de cookies",
      "s1": { "title": "Cookies essentiels", "body": "Nécessaires à la connexion, à la sécurité, à la langue et pour mémoriser votre choix. Toujours actifs." },
      "s2": { "title": "Statistiques", "body": "Statistiques d'usage anonymes. Désactivées tant que vous n'avez pas accepté ; vous pouvez changer d'avis à tout moment." },
      "s3": { "title": "Enregistrements d'erreurs", "body": "Courts enregistrements autour des erreurs, textes et médias masqués. Désactivés tant que vous n'avez pas accepté." },
      "manage": "Modifier vos choix"
    }
  }
```

📄 **Create `src/components/marketing/legal-page.tsx`:**

```tsx
import { useTranslations } from 'next-intl';

import { CookieSettingsButton } from '@/components/consent/cookie-settings-button';
import { brand } from '@/config/brand';

const SECTIONS = {
  terms: ['s1', 's2', 's3', 's4'],
  privacy: ['s1', 's2', 's3', 's4', 's5'],
  cookies: ['s1', 's2', 's3'],
} as const;

export type LegalDoc = keyof typeof SECTIONS;

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const t = useTranslations('legal');
  const tDoc = useTranslations(`legal.${doc}`);

  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-16">
      <p role="note" className="bg-muted rounded-md border p-4 text-sm">
        {t('notice')}
      </p>
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">{tDoc('title')}</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t('updated')}</p>
      </header>
      {SECTIONS[doc].map((key) => (
        <section key={key}>
          <h2 className="text-xl font-semibold">{tDoc(`${key}.title` as never)}</h2>
          <p className="text-muted-foreground mt-2">
            {tDoc(
              `${key}.body` as never,
              { appName: brand.name, email: brand.supportEmail } as never,
            )}
          </p>
        </section>
      ))}
      {doc === 'cookies' ? (
        <p>
          <CookieSettingsButton className="font-medium underline" />
        </p>
      ) : null}
    </article>
  );
}
```

Three tiny pages:

```tsx
// src/app/[locale]/(marketing)/terms/page.tsx   (privacy → doc="privacy", cookies → doc="cookies")
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { LegalPage } from '@/components/marketing/legal-page';

export default function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <LegalPage doc="terms" />;
}
```

### ✅ Verify

```bash
pnpm test && pnpm check && pnpm build
pnpm dev
```

1. `/contact`: submit the form → the terminal prints the support email (**Reply-To** is the visitor). Invalid input shows translated errors.
2. DevTools: edit the DOM to type text into the invisible `website` field and submit → success toast, **no email** printed, a `security` log line "Contact honeypot triggered".
3. With `ARCJET_KEY` + `ARCJET_MODE=LIVE` temporarily: the 6th submission within an hour from one IP is blocked (429); revert.
4. `/terms`, `/privacy`, `/cookies` (and `/fr/...`): notice on top, sections, "Cookie settings" opens the dialog on the cookie page. They're **static** in `pnpm build` output.

**🚢 Ship** — branch `feat/s7-t02-contact-legal` · message: `feat(marketing): send contact messages with honeypot and rate limit, add legal page templates`

---

## 🎫 S7-T03 — Metadata: titles, canonical, hreflang, Open Graph

**Branch:** `feat/s7-t03-metadata` · **Story:** US-071 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s7-t03-metadata
```

### 1. Environment

📄 **Edit `src/libs/Env.ts`** (`server` + `runtimeEnv`):

```ts
    // Search engines may index the site ONLY when this is true — set it in production, nowhere else.
    SITE_INDEXING: flag('false'),
```

`.env.example`: `SITE_INDEXING=false  # true in production only`.

### 2. One helper builds everything (pure → testable)

📄 **Create `src/libs/seo.ts`:**

```ts
import type { Metadata } from 'next';

import { routing } from '@/i18n/routing';
import { localizedPath } from '@/libs/route-guard';

const OG_LOCALE: Record<string, string> = { en: 'en_US', fr: 'fr_FR' };

/** The public URL of a page in a language: https://site/fr/pricing */
export function pageUrl(baseUrl: string, locale: string, path: string): string {
  return new URL(localizedPath(locale, path), baseUrl).toString();
}

/** Canonical (self) + one hreflang per language + x-default (the default language). */
export function buildAlternates(baseUrl: string, locale: string, path: string) {
  return {
    canonical: pageUrl(baseUrl, locale, path),
    languages: {
      ...Object.fromEntries(routing.locales.map((code) => [code, pageUrl(baseUrl, code, path)])),
      'x-default': pageUrl(baseUrl, routing.defaultLocale, path),
    },
  };
}

type Input = {
  baseUrl: string;
  siteName: string;
  locale: string;
  path: string;
  title: string;
  description: string;
  /** Home uses the title as-is; other pages get the "… · Site" template from the root layout. */
  absoluteTitle?: boolean;
  indexable: boolean;
};

export function buildMetadata({
  baseUrl,
  siteName,
  locale,
  path,
  title,
  description,
  absoluteTitle,
  indexable,
}: Input): Metadata {
  const url = pageUrl(baseUrl, locale, path);

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: buildAlternates(baseUrl, locale, path),
    openGraph: {
      type: 'website',
      url,
      siteName,
      title,
      description,
      locale: OG_LOCALE[locale],
      alternateLocale: routing.locales
        .filter((code) => code !== locale)
        .map((code) => OG_LOCALE[code]!),
    },
    twitter: { card: 'summary_large_image', title, description },
    // Pages that must not appear in search results (and everything, while SITE_INDEXING is off)
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
  };
}
```

📄 **Create `src/libs/seo.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { buildAlternates, buildMetadata, pageUrl } from './seo';

const base = 'https://app.test';

describe('pageUrl', () => {
  it('omits the prefix for the default language', () => {
    expect(pageUrl(base, 'en', '/pricing')).toBe('https://app.test/pricing');
    expect(pageUrl(base, 'fr', '/pricing')).toBe('https://app.test/fr/pricing');
    expect(pageUrl(base, 'fr', '/')).toBe('https://app.test/fr');
  });
});

describe('buildAlternates', () => {
  it('canonical points at the page itself, in ITS language', () => {
    expect(buildAlternates(base, 'fr', '/about').canonical).toBe('https://app.test/fr/about');
  });

  it('hreflang is SYMMETRIC: every language lists the same set of URLs', () => {
    const fromEn = buildAlternates(base, 'en', '/pricing').languages;
    const fromFr = buildAlternates(base, 'fr', '/pricing').languages;
    expect(fromFr).toEqual(fromEn);
    expect(fromEn).toMatchObject({
      en: 'https://app.test/pricing',
      fr: 'https://app.test/fr/pricing',
      'x-default': 'https://app.test/pricing',
    });
  });
});

describe('buildMetadata', () => {
  const input = {
    baseUrl: base,
    siteName: 'Acme',
    locale: 'fr',
    path: '/pricing',
    title: 'Tarifs',
    description: 'Des tarifs simples',
    indexable: true,
  };

  it('fills title, description, Open Graph and Twitter consistently', () => {
    const meta = buildMetadata(input);
    expect(meta.title).toBe('Tarifs');
    expect(meta.openGraph).toMatchObject({
      url: 'https://app.test/fr/pricing',
      siteName: 'Acme',
      locale: 'fr_FR',
      alternateLocale: ['en_US'],
    });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', title: 'Tarifs' });
  });

  it('can use an absolute title (home page)', () => {
    expect(buildMetadata({ ...input, absoluteTitle: true }).title).toEqual({ absolute: 'Tarifs' });
  });

  it('noindex when not indexable', () => {
    expect(buildMetadata({ ...input, indexable: false }).robots).toEqual({
      index: false,
      follow: false,
    });
    expect(buildMetadata(input).robots).toEqual({ index: true, follow: true });
  });
});
```

### 3. Translated titles/descriptions, one wrapper

📄 **`src/locales/en.json`** — add `meta`:

```json
  "meta": {
    "home": { "title": "{appName} — ship your SaaS faster", "description": "An open-source SaaS starter with authentication, organizations, roles, observability and a serious test suite." },
    "pricing": { "title": "Pricing", "description": "Simple example plans for your product. Replace them with your own." },
    "about": { "title": "About", "description": "Why this starter exists and the principles behind it." },
    "contact": { "title": "Contact", "description": "Get in touch with the team." },
    "terms": { "title": "Terms of service", "description": "The terms that apply to using the service." },
    "privacy": { "title": "Privacy policy", "description": "How personal data is collected, used and protected." },
    "cookies": { "title": "Cookie policy", "description": "Which cookies we use and how to control them." },
    "signIn": { "title": "Sign in", "description": "Sign in to your account." },
    "signUp": { "title": "Create an account", "description": "Create your account in less than a minute." },
    "forgotPassword": { "title": "Forgot your password?", "description": "Receive a link to reset your password." }
  }
```

📄 **`src/locales/fr.json`:**

```json
  "meta": {
    "home": { "title": "{appName} — lancez votre SaaS plus vite", "description": "Un starter SaaS open source avec authentification, organisations, rôles, observabilité et une vraie batterie de tests." },
    "pricing": { "title": "Tarifs", "description": "Des offres d'exemple simples pour votre produit. Remplacez-les par les vôtres." },
    "about": { "title": "À propos", "description": "Pourquoi ce starter existe et les principes qui le guident." },
    "contact": { "title": "Contact", "description": "Contactez l'équipe." },
    "terms": { "title": "Conditions d'utilisation", "description": "Les conditions qui s'appliquent à l'utilisation du service." },
    "privacy": { "title": "Politique de confidentialité", "description": "Comment les données personnelles sont collectées, utilisées et protégées." },
    "cookies": { "title": "Politique de cookies", "description": "Les cookies que nous utilisons et comment les contrôler." },
    "signIn": { "title": "Se connecter", "description": "Connectez-vous à votre compte." },
    "signUp": { "title": "Créer un compte", "description": "Créez votre compte en moins d'une minute." },
    "forgotPassword": { "title": "Mot de passe oublié ?", "description": "Recevez un lien pour réinitialiser votre mot de passe." }
  }
```

📄 **Create `src/libs/site-metadata.ts`:**

```ts
import 'server-only';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { brand } from '@/config/brand';
import { Env } from '@/libs/Env';
import { buildMetadata } from '@/libs/seo';

type PageKey =
  | 'home'
  | 'pricing'
  | 'about'
  | 'contact'
  | 'terms'
  | 'privacy'
  | 'cookies'
  | 'signIn'
  | 'signUp'
  | 'forgotPassword';

/** `export async function generateMetadata({ params }) { return siteMetadata({ locale, key: 'pricing', path: '/pricing' }) }` */
export async function siteMetadata({
  locale,
  key,
  path,
  legal = false,
  noindex = false,
}: {
  locale: string;
  key: PageKey;
  path: string;
  legal?: boolean;
  noindex?: boolean;
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'meta' });

  const indexable = Env.SITE_INDEXING && !noindex && !(legal && Env.LEGAL_NOINDEX);

  return buildMetadata({
    baseUrl: brand.url,
    siteName: brand.name,
    locale,
    path,
    title: t(`${key}.title`, { appName: brand.name }),
    description: t(`${key}.description`),
    absoluteTitle: key === 'home',
    indexable,
  });
}
```

Add this to **every public page**:

```tsx
// e.g. src/app/[locale]/(marketing)/pricing/page.tsx
import type { Metadata } from 'next';

import { siteMetadata } from '@/libs/site-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return siteMetadata({ locale, key: 'pricing', path: '/pricing' });
}
```

Keys/paths: home `'/'`, pricing, about, contact, **terms/privacy/cookies with `legal: true`**, and for `sign-in`, `sign-up`, `forgot-password` pages `noindex: true`.

### 4. Root layout, app areas, icons, manifest

📄 **Edit `src/app/[locale]/layout.tsx`** — replace the static `metadata` with:

```tsx
import type { Metadata, Viewport } from 'next';

import { brand } from '@/config/brand';
import { Env } from '@/libs/Env';

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(brand.url),
    applicationName: brand.name,
    title: { default: brand.name, template: `%s · ${brand.name}` },
    // While indexing is off (previews, forks, staging) nothing is indexable, whatever the page says
    robots: Env.SITE_INDEXING ? undefined : { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};
```

📄 **Private areas are never indexable** — in `(app)/layout.tsx`, `(admin)/layout.tsx` **and** `(auth)/layout.tsx` add:

```tsx
export const metadata = { robots: { index: false, follow: false } };
```

📄 **Create `src/app/icon.tsx`** (a generated favicon, no binary assets to maintain):

```tsx
import { ImageResponse } from 'next/og';

import { brand } from '@/config/brand';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#ffffff',
        fontSize: 320,
        fontWeight: 700,
        borderRadius: 96,
      }}
    >
      {brand.name.slice(0, 1).toUpperCase()}
    </div>,
    size,
  );
}
```

📄 **Create `src/app/apple-icon.tsx`** — same markup with `size = { width: 180, height: 180 }` and `fontSize: 110, borderRadius: 0`. 📄 **Create `src/app/manifest.ts`:**

```ts
import type { MetadataRoute } from 'next';

import { brand } from '@/config/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0a0a0a',
    icons: [{ src: '/icon', sizes: '512x512', type: 'image/png' }], // 🔍 the generated icon route
  };
}
```

Delete the scaffold's `src/app/favicon.ico` if you want the generated icon to win (`git rm src/app/favicon.ico`).

### ✅ Verify

```bash
pnpm test && pnpm check && pnpm build
```

1. View-source on `/pricing` and `/fr/pricing`: unique `<title>`, `<meta name="description">`, `<link rel="canonical">` pointing at **itself**, `<link rel="alternate" hreflang="en|fr|x-default">` (3 entries), `og:*`, `twitter:*`. `<meta name="robots" content="noindex">` while `SITE_INDEXING=false`.
2. `SITE_INDEXING=true pnpm build && pnpm start` → public pages say `index, follow`; `/terms` (legal) still `noindex` (`LEGAL_NOINDEX=true`); `/sign-in`, `/dashboard/*` always `noindex`.
3. The browser tab shows the generated **icon**; `/manifest.webmanifest` is valid JSON.
4. [Google's Rich Results / Facebook Sharing Debugger / opengraph.xyz] on a deployed preview show the title and description (the image arrives in S7-T05).

**🚢 Ship** — branch `feat/s7-t03-metadata` · message: `feat(seo): add metadata helper with canonical, hreflang, open graph and indexing control`

---

## 🎫 S7-T04 — JSON-LD structured data

**Branch:** `feat/s7-t04-json-ld` · **Story:** US-071 · **1 SP**

```bash
git switch main && git pull && git switch -c feat/s7-t04-json-ld
mkdir -p src/components/seo
```

### 1. Builders and a safe serializer

📄 **Create `src/libs/json-ld.ts`:**

```ts
import { routing } from '@/i18n/routing';

const CONTEXT = 'https://schema.org';

/**
 * JSON inside a <script> tag must never be able to close it: escape `<` (and the two line separators
 * JSON allows but JavaScript doesn't).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export const organizationJsonLd = ({
  name,
  url,
  logo,
  sameAs = [],
}: {
  name: string;
  url: string;
  logo: string;
  sameAs?: string[];
}) => ({
  '@context': CONTEXT,
  '@type': 'Organization',
  name,
  url,
  logo,
  ...(sameAs.length > 0 ? { sameAs } : {}),
});

export const webSiteJsonLd = ({ name, url }: { name: string; url: string }) => ({
  '@context': CONTEXT,
  '@type': 'WebSite',
  name,
  url,
  inLanguage: [...routing.locales],
});

export const softwareApplicationJsonLd = ({
  name,
  description,
  url,
}: {
  name: string;
  description: string;
  url: string;
}) => ({
  '@context': CONTEXT,
  '@type': 'SoftwareApplication',
  name,
  description,
  url,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
});

export const faqPageJsonLd = (items: { question: string; answer: string }[]) => ({
  '@context': CONTEXT,
  '@type': 'FAQPage',
  mainEntity: items.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
});

export const breadcrumbJsonLd = (crumbs: { name: string; url: string }[]) => ({
  '@context': CONTEXT,
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.name,
    item: crumb.url,
  })),
});
```

📄 **Create `src/libs/json-ld.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from './json-ld';

describe('serializeJsonLd', () => {
  it('cannot be used to break out of the script tag', () => {
    const output = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(output).not.toContain('</script>');
    expect(output).not.toContain('<');
    expect(JSON.parse(output).name).toBe('</script><script>alert(1)</script>'); // still round-trips
  });
});

describe('builders contain the properties search engines require', () => {
  it('Organization', () => {
    expect(
      organizationJsonLd({
        name: 'Acme',
        url: 'https://acme.test',
        logo: 'https://acme.test/icon',
      }),
    ).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Acme',
      url: 'https://acme.test',
      logo: 'https://acme.test/icon',
    });
  });
  it('WebSite lists the languages', () => {
    expect(webSiteJsonLd({ name: 'Acme', url: 'https://acme.test' })).toMatchObject({
      '@type': 'WebSite',
      inLanguage: ['en', 'fr'],
    });
  });
  it('SoftwareApplication has category, OS and an offer', () => {
    const data = softwareApplicationJsonLd({ name: 'Acme', description: 'd', url: 'u' });
    expect(data).toMatchObject({
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer' },
    });
  });
  it('FAQPage mirrors the questions', () => {
    const data = faqPageJsonLd([{ question: 'Q1?', answer: 'A1' }]);
    expect(data.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: 'Q1?',
      acceptedAnswer: { '@type': 'Answer', text: 'A1' },
    });
  });
  it('BreadcrumbList positions start at 1', () => {
    const data = breadcrumbJsonLd([
      { name: 'Home', url: 'u1' },
      { name: 'Pricing', url: 'u2' },
    ]);
    expect(data.itemListElement.map((entry) => entry.position)).toEqual([1, 2]);
  });
});
```

📄 **Create `src/components/seo/json-ld.tsx`:**

```tsx
import { serializeJsonLd } from '@/libs/json-ld';

/**
 * A data block, not executable code → not subject to script-src (our CSP, S6-T11).
 * `dangerouslySetInnerHTML` is safe here ONLY because serializeJsonLd escapes `<`.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
```

### 2. Use them

📄 **Edit `(marketing)/layout.tsx`** — organization and site data on every public page:

```tsx
import { getLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/json-ld';
import { brand } from '@/config/brand';
import { organizationJsonLd, webSiteJsonLd } from '@/libs/json-ld';

// inside the layout's returned tree:
      <JsonLd data={organizationJsonLd({ name: brand.name, url: brand.url, logo: `${brand.url}/icon`, sameAs: Object.values(brand.social).filter((v): v is string => Boolean(v)) })} />
      <JsonLd data={webSiteJsonLd({ name: brand.name, url: brand.url })} />
```

📄 **Edit the home page** — add the product and FAQ blocks, built from the **same** translations the visible FAQ uses (so they can't disagree):

```tsx
import { getTranslations } from 'next-intl/server';

import { FAQ_KEYS } from '@/components/marketing/faq-section';
import { JsonLd } from '@/components/seo/json-ld';
import { brand } from '@/config/brand';
import { faqPageJsonLd, softwareApplicationJsonLd } from '@/libs/json-ld';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const faq = await getTranslations({ locale, namespace: 'marketing.faq' });
  const meta = await getTranslations({ locale, namespace: 'meta' });

  return (
    <>
      <JsonLd
        data={softwareApplicationJsonLd({
          name: brand.name,
          description: meta('home.description'),
          url: brand.url,
        })}
      />
      <JsonLd
        data={faqPageJsonLd(
          FAQ_KEYS.map((key) => ({
            question: faq(`items.${key}.q`, { appName: brand.name }),
            answer: faq(`items.${key}.a`),
          })),
        )}
      />
      <HeroSection />
      {/* …unchanged… */}
    </>
  );
}
```

Pricing and About get a breadcrumb: `<JsonLd data={breadcrumbJsonLd([{ name: t('nav.home'), url: pageUrl(brand.url, locale, '/') }, { name: …, url: pageUrl(brand.url, locale, '/pricing') }])} />`.

### ✅ Verify

```bash
pnpm test && pnpm check && pnpm build
```

1. View-source of `/` → several `<script type="application/ld+json">` blocks; copy one into <https://validator.schema.org> (or Google's **Rich Results Test** on a deployed preview): **no errors**; FAQ rich result is eligible.
2. `/fr`: the FAQ JSON-LD is in **French** and identical in content to the visible FAQ.
3. Browser console: **no CSP errors** (the data blocks aren't executed).
4. Set a brand name containing `</script>` in `NEXT_PUBLIC_APP_NAME` → the page still renders (escaping works). Revert.

**🚢 Ship** — branch `feat/s7-t04-json-ld` · message: `feat(seo): add safe json-ld for organization, website, software and faq`

---

## 🎫 S7-T05 — OG images, sitemap and robots

**Branch:** `feat/s7-t05-og-sitemap-robots` · **Story:** US-071 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s7-t05-og-sitemap-robots
```

### 1. Which pages are public (one list)

📄 **Create `src/config/site.ts`:**

```ts
export type PublicPage = {
  path: string;
  changeFrequency: 'weekly' | 'monthly' | 'yearly';
  priority: number;
  /** Legal templates stay out of the sitemap while LEGAL_NOINDEX is on. */
  legal?: boolean;
};

export const PUBLIC_PAGES: readonly PublicPage[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/about', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3, legal: true },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3, legal: true },
  { path: '/cookies', changeFrequency: 'yearly', priority: 0.3, legal: true },
];

/** URL prefixes that must never be crawled (any language). */
export const PRIVATE_PREFIXES = [
  '/dashboard',
  '/admin',
  '/api',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/two-factor',
  '/verify-email',
  '/accept-invitation',
] as const;
```

### 2. Sitemap and robots builders (pure)

📄 **Create `src/libs/sitemap.ts`:**

```ts
import type { MetadataRoute } from 'next';

import { PRIVATE_PREFIXES, type PublicPage } from '@/config/site';
import { routing } from '@/i18n/routing';
import { pageUrl } from '@/libs/seo';

export function buildSitemap({
  baseUrl,
  pages,
  indexing,
  includeLegal,
  lastModified,
}: {
  baseUrl: string;
  pages: readonly PublicPage[];
  indexing: boolean;
  includeLegal: boolean;
  lastModified: Date;
}): MetadataRoute.Sitemap {
  if (!indexing) return []; // nothing to advertise while the site must not be indexed

  return pages
    .filter((page) => includeLegal || !page.legal)
    .flatMap((page) =>
      routing.locales.map((locale) => ({
        url: pageUrl(baseUrl, locale, page.path),
        lastModified,
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        // Every language version points at all the others (hreflang in the sitemap)
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((code) => [code, pageUrl(baseUrl, code, page.path)]),
          ),
        },
      })),
    );
}

export function buildRobots({
  baseUrl,
  indexing,
}: {
  baseUrl: string;
  indexing: boolean;
}): MetadataRoute.Robots {
  if (!indexing) return { rules: [{ userAgent: '*', disallow: '/' }] }; // previews, forks, staging

  const prefixes = routing.locales.flatMap((locale) =>
    PRIVATE_PREFIXES.map(
      (prefix) => `${locale === routing.defaultLocale ? '' : `/${locale}`}${prefix}`,
    ),
  );

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: prefixes }],
    sitemap: new URL('/sitemap.xml', baseUrl).toString(),
  };
}
```

📄 **Create `src/libs/sitemap.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { PUBLIC_PAGES } from '@/config/site';

import { buildRobots, buildSitemap } from './sitemap';

const base = 'https://app.test';
const common = { baseUrl: base, pages: PUBLIC_PAGES, lastModified: new Date('2026-01-01') };

describe('buildSitemap', () => {
  it('lists every public page in every language, with hreflang alternates', () => {
    const entries = buildSitemap({ ...common, indexing: true, includeLegal: true });
    expect(entries).toHaveLength(PUBLIC_PAGES.length * 2);

    const pricingFr = entries.find((entry) => entry.url === 'https://app.test/fr/pricing');
    expect(pricingFr?.alternates?.languages).toEqual({
      en: 'https://app.test/pricing',
      fr: 'https://app.test/fr/pricing',
    });
  });

  it('keeps legal templates out while they are noindex', () => {
    const urls = buildSitemap({ ...common, indexing: true, includeLegal: false }).map(
      (entry) => entry.url,
    );
    expect(urls.some((url) => /terms|privacy|cookies/.test(url))).toBe(false);
    expect(urls).toContain('https://app.test/');
  });

  it('never exposes private areas', () => {
    const urls = buildSitemap({ ...common, indexing: true, includeLegal: true }).map(
      (entry) => entry.url,
    );
    expect(urls.some((url) => /dashboard|admin|sign-in|api/.test(url))).toBe(false);
  });

  it('is EMPTY while indexing is off', () => {
    expect(buildSitemap({ ...common, indexing: false, includeLegal: true })).toEqual([]);
  });
});

describe('buildRobots', () => {
  it('disallows everything while indexing is off', () => {
    expect(buildRobots({ baseUrl: base, indexing: false })).toEqual({
      rules: [{ userAgent: '*', disallow: '/' }],
    });
  });

  it('blocks private areas in every language and points at the sitemap', () => {
    const robots = buildRobots({ baseUrl: base, indexing: true });
    const rule = Array.isArray(robots.rules) ? robots.rules[0]! : robots.rules;
    expect(rule.disallow).toEqual(
      expect.arrayContaining([
        '/dashboard',
        '/fr/dashboard',
        '/admin',
        '/fr/admin',
        '/api',
        '/sign-in',
        '/fr/sign-in',
      ]),
    );
    expect(robots.sitemap).toBe('https://app.test/sitemap.xml');
  });
});
```

📄 **Create `src/app/sitemap.ts`** and **`src/app/robots.ts`:**

```ts
// src/app/sitemap.ts
import type { MetadataRoute } from 'next';

import { brand } from '@/config/brand';
import { PUBLIC_PAGES } from '@/config/site';
import { Env } from '@/libs/Env';
import { buildSitemap } from '@/libs/sitemap';

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap({
    baseUrl: brand.url,
    pages: PUBLIC_PAGES,
    indexing: Env.SITE_INDEXING,
    includeLegal: !Env.LEGAL_NOINDEX,
    lastModified: new Date(), // evaluated at build time (the route is static)
  });
}
```

```ts
// src/app/robots.ts
import type { MetadataRoute } from 'next';

import { brand } from '@/config/brand';
import { Env } from '@/libs/Env';
import { buildRobots } from '@/libs/sitemap';

export default function robots(): MetadataRoute.Robots {
  return buildRobots({ baseUrl: brand.url, indexing: Env.SITE_INDEXING });
}
```

> The proxy matcher **excludes** paths with a file extension (`robots.txt`, `sitemap.xml`), so neither is locale-prefixed or inspected.

### 3. Open Graph / Twitter images

📄 **Create `src/libs/og.tsx`:**

```tsx
import { getTranslations } from 'next-intl/server';
import { ImageResponse } from 'next/og';

import { brand } from '@/config/brand';

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** One renderer for both the Open Graph and the Twitter image. Default font: no files to bundle. */
export async function renderOgImage(locale: string) {
  const t = await getTranslations({ locale, namespace: 'meta' });

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: '#0a0a0a',
        color: '#ffffff',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, opacity: 0.9 }}>{brand.name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>
          {t('home.title', { appName: brand.name })}
        </div>
        <div style={{ fontSize: 32, opacity: 0.7 }}>{t('home.description')}</div>
      </div>
    </div>,
    OG_SIZE,
  );
}
```

📄 **Create `src/app/[locale]/opengraph-image.tsx`:**

```tsx
import { routing } from '@/i18n/routing';
import { OG_SIZE, renderOgImage } from '@/libs/og';

export const alt = 'Open Graph image';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return renderOgImage(locale);
}
```

📄 **Create `src/app/[locale]/twitter-image.tsx`** — identical content (metadata config exports must be written in each file, not re-exported).

> 🔍 Check that the generated `og:image` URL resolves for **both** `/` and `/fr` (see the E2E test below). If your next-intl/Next combination rewrites it oddly, follow next-intl's guidance for metadata image routes.

### 4. End-to-end proof of the whole SEO surface

📄 **Edit `playwright.config.ts`** → `appEnv`: `SITE_INDEXING: 'true', LEGAL_NOINDEX: 'true',` (the E2E build behaves like production).

📄 **Create `e2e/seo.spec.ts`:**

```ts
import { expect, test } from './fixtures';

const attr = async (page: import('@playwright/test').Page, selector: string, name: string) =>
  page.locator(selector).first().getAttribute(name);

for (const { path, locale } of [
  { path: '/pricing', locale: 'en' },
  { path: '/fr/pricing', locale: 'fr' },
]) {
  test(`${path}: unique title, description, canonical, hreflang, social tags`, async ({
    page,
    baseURL,
  }) => {
    await page.goto(path);

    await expect(page).toHaveTitle(/Pricing|Tarifs/);
    expect(await attr(page, 'meta[name="description"]', 'content')).toBeTruthy();
    expect(await attr(page, 'link[rel="canonical"]', 'href')).toBe(`${baseURL}${path}`);
    expect(await attr(page, 'meta[property="og:locale"]', 'content')).toBe(
      locale === 'fr' ? 'fr_FR' : 'en_US',
    );
    expect(await attr(page, 'meta[property="og:image"]', 'content')).toBeTruthy();

    const alternates = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('hreflang')));
    expect(alternates.sort()).toEqual(['en', 'fr', 'x-default']);
    expect(await attr(page, 'meta[name="robots"]', 'content')).toContain('index');
  });
}

test('the home page carries valid JSON-LD', async ({ page }) => {
  await page.goto('/');
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent ?? '')));
  expect(blocks.map((block) => block['@type']).sort()).toEqual([
    'FAQPage',
    'Organization',
    'SoftwareApplication',
    'WebSite',
  ]);
});

test('the Open Graph image renders', async ({ page, request }) => {
  await page.goto('/');
  const image = await page.locator('meta[property="og:image"]').first().getAttribute('content');
  const response = await request.get(image!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');
});

test('robots.txt hides private areas and points at the sitemap; the sitemap lists both languages', async ({
  request,
  baseURL,
}) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Disallow: \/dashboard/);
  expect(robots).toMatch(/Disallow: \/fr\/admin/);
  expect(robots).toContain(`Sitemap: ${baseURL}/sitemap.xml`);

  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain(`${baseURL}/pricing`);
  expect(sitemap).toContain(`${baseURL}/fr/pricing`);
  expect(sitemap).not.toMatch(/dashboard|admin|sign-in/);
  expect(sitemap).not.toMatch(/terms|privacy|cookies/); // legal templates are noindex
});

test('private areas are noindex', async ({ ownerPage, world }) => {
  await ownerPage.goto(`/dashboard/${world.orgSlug}`);
  expect(await attr(ownerPage, 'meta[name="robots"]', 'content')).toContain('noindex');
});
```

### ✅ Verify

```bash
pnpm test && pnpm check && pnpm e2e
```

1. `/opengraph-image-…` (copy the URL from `og:image`) opens a 1200×630 card in English; the `/fr` version shows the French title.
2. `/robots.txt` and `/sitemap.xml` look right with `SITE_INDEXING=true`; with it `false` robots says `Disallow: /` and the sitemap is empty.
3. Paste a deployed preview URL into LinkedIn/Slack/Discord to see the card (needs the image to be public).
4. Re-baseline the visual suite (new home, pricing, about, footer links): add the `update-snapshots` label on this PR, review the diffs, then re-run CI.

**🚢 Ship** — branch `feat/s7-t05-og-sitemap-robots` · message: `feat(seo): add generated og images, sitemap with hreflang and indexing-aware robots`

---

## 🎫 S7-T06 — Crowdin translation sync

**Branch:** `ci/s7-t06-crowdin` · **Story:** US-072 · **2 SP** · risk **R-14** (translation sync corrupts ICU/JSON)

> 🎯 Translators work in Crowdin; developers keep editing `en.json`. A workflow **uploads** English when it changes and **opens a pull request** with new translations. The PR goes through the _same_ CI as any other — including `i18n:check`, so a broken placeholder can't merge.

```bash
git switch main && git pull && git switch -c ci/s7-t06-crowdin
```

### 1. Crowdin configuration

📄 **Create `crowdin.yml`:**

```yaml
# Credentials come from the environment (never commit them)
project_id_env: CROWDIN_PROJECT_ID
api_token_env: CROWDIN_PERSONAL_TOKEN
base_path: .
preserve_hierarchy: true

files:
  - source: /src/locales/en.json
    # %two_letters_code% → fr.json, de.json… (use %locale% for regional codes such as pt-BR)
    translation: /src/locales/%two_letters_code%.json
```

📄 **Create `src/config/crowdin-config.test.ts`** — keeps the config honest when locales change:

```ts
import { existsSync, readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { routing } from '@/i18n/routing';

const config = readFileSync('crowdin.yml', 'utf8');

it('uploads the source-language file that really exists', () => {
  expect(config).toContain(`/src/locales/${routing.defaultLocale}.json`);
  expect(existsSync(`src/locales/${routing.defaultLocale}.json`)).toBe(true);
});

it('maps translations to the file names the app loads', () => {
  expect(config).toContain('/src/locales/%two_letters_code%.json');
  for (const locale of routing.locales)
    expect(existsSync(`src/locales/${locale}.json`), locale).toBe(true);
});

it('keeps credentials out of the repository', () => {
  expect(config).not.toMatch(/api_token:\s*['"]?[A-Za-z0-9]{20,}/);
  expect(config).toContain('api_token_env');
});
```

### 2. The workflow

📄 **Create `.github/workflows/crowdin.yml`:**

```yaml
name: Crowdin

on:
  push:
    branches: [main]
    paths: ['src/locales/en.json']
  schedule:
    - cron: '0 7 * * 1' # Mondays: pull the week's translations
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      CROWDIN_PROJECT_ID: ${{ secrets.CROWDIN_PROJECT_ID }}
      CROWDIN_PERSONAL_TOKEN: ${{ secrets.CROWDIN_PERSONAL_TOKEN }}
    steps:
      - uses: actions/checkout@v4

      - name: Not configured
        if: ${{ env.CROWDIN_PERSONAL_TOKEN == '' }}
        run: echo "Crowdin secrets are not set — skipping (optional integration)."

      # English changed on main → send the new source strings
      - name: Upload sources
        if: ${{ env.CROWDIN_PERSONAL_TOKEN != '' && github.event_name == 'push' }}
        uses: crowdin/github-action@v2
        with:
          upload_sources: true
          upload_translations: false
          download_translations: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      # Weekly / manual → fetch translations and open a PR
      - name: Download translations and open a PR
        if: ${{ env.CROWDIN_PERSONAL_TOKEN != '' && github.event_name != 'push' }}
        uses: crowdin/github-action@v2
        with:
          upload_sources: false
          download_translations: true
          skip_untranslated_strings: true # never overwrite French with English fallbacks
          export_only_approved: true # only reviewed translations reach the app
          localization_branch_name: l10n_crowdin
          create_pull_request: true
          pull_request_title: 'chore(i18n): update translations from Crowdin'
          pull_request_body: 'Translations synced from Crowdin. CI (including `i18n:check`) must pass before merging.'
          commit_message: 'chore(i18n): update translations from Crowdin'
        env:
          # A PR opened with the default token does NOT trigger CI → the required check would never run.
          # Use a personal access token (repo scope) stored as CROWDIN_PR_TOKEN when you want CI on these PRs.
          GITHUB_TOKEN: ${{ secrets.CROWDIN_PR_TOKEN || secrets.GITHUB_TOKEN }}
```

> 🔒 `export_only_approved` + `skip_untranslated_strings` mean a half-finished translation never ships: the French file only changes when a human approved it.

### 3. Document the whole i18n lifecycle

📄 **Append to `docs/guides/i18n.md`:**

```markdown
## Translation workflow (Crowdin)

1. Developers edit **`src/locales/en.json`** (source of truth) and the matching French keys in the same PR (CI requires parity).
2. When `en.json` changes on `main`, the **Crowdin** workflow uploads the new strings.
3. Translators work in Crowdin. Every Monday (or on demand: _Actions → Crowdin → Run workflow_) a PR `chore(i18n): update translations from Crowdin` is opened with approved translations only.
4. That PR must pass CI — `pnpm i18n:check` rejects missing keys and invalid ICU placeholders. Review the diff, merge. Setup: create the Crowdin project, add repository secrets `CROWDIN_PROJECT_ID` and `CROWDIN_PERSONAL_TOKEN` (and optionally `CROWDIN_PR_TOKEN`, a PAT, so CI runs on the sync PR). Dry run locally: `pnpm dlx @crowdin/cli upload sources --dryrun` (with the two variables exported).

## Adding a language (checklist)

1. `src/i18n/routing.ts` → add the code to `locales`.
2. Create `src/locales/<code>.json` (copy `en.json`; Crowdin will fill it).
3. `src/libs/seo.ts` → add the Open Graph locale (`OG_LOCALE`), e.g. `de: 'de_DE'`.
4. Language names for the switcher (`locale.<code>` in every message file) and a flag/label in `LocaleSwitcher`.
5. Right-to-left language? Add the code to the direction map (see S7-T12) — layout is already logical-property based.
6. Crowdin → add the target language.
7. Run `pnpm i18n:check && pnpm test && pnpm e2e && pnpm e2e:visual` (re-baseline with the `update-snapshots` label). Sitemap, hreflang, canonical URLs and the consent text follow automatically from the routing config and message files.
```

### ✅ Verify

```bash
pnpm test && pnpm check
```

1. The new config test passes; change `/src/locales/%two_letters_code%.json` in `crowdin.yml` to something wrong → it fails. Revert.
2. Workflow file lints (`gh workflow view crowdin.yml`), and on the PR it only prints the "not configured" line (no secrets yet) — green.
3. _(Optional, needs a Crowdin account)_ create a project, add the two secrets, run the workflow manually: a PR appears. Corrupt a placeholder in Crowdin (`{email}` → `{mail}`) and approve it → the PR's `Quality` job **fails** on `i18n:check`. That's the guard working.

**🚢 Ship** — branch `ci/s7-t06-crowdin` · message: `ci(i18n): add crowdin config, sync workflow and translation lifecycle docs`

---

## 🎫 S7-T07 — Loading skeletons and empty states

**Branch:** `feat/s7-t07-loading-empty` · **Story:** US-073 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s7-t07-loading-empty
pnpm dlx shadcn@latest add skeleton
```

### 1. Strings

📄 **`src/locales/en.json`** — `common`: add `"loading": "Loading…"`; new object:

```json
  "empty": {
    "projects": { "title": "No projects yet", "description": "Projects group the work of your organization. Create the first one to get started.", "action": "Create a project" },
    "search": { "title": "No results", "description": "Nothing matches “{query}”. Try a different search." },
    "invitations": { "title": "No pending invitations", "description": "Invite teammates from the form above." },
    "passkeys": { "title": "No passkeys yet", "description": "Passkeys let you sign in with your fingerprint, face or device PIN." },
    "users": { "title": "No users found", "description": "Try another search term." }
  }
```

📄 **`src/locales/fr.json`** — `common`: `"loading": "Chargement…"`;

```json
  "empty": {
    "projects": { "title": "Aucun projet pour l'instant", "description": "Les projets regroupent le travail de votre organisation. Créez le premier pour commencer.", "action": "Créer un projet" },
    "search": { "title": "Aucun résultat", "description": "Rien ne correspond à « {query} ». Essayez une autre recherche." },
    "invitations": { "title": "Aucune invitation en attente", "description": "Invitez des collègues depuis le formulaire ci-dessus." },
    "passkeys": { "title": "Aucune clé d'accès pour l'instant", "description": "Les clés d'accès permettent de se connecter avec une empreinte, un visage ou le code de l'appareil." },
    "users": { "title": "Aucun utilisateur trouvé", "description": "Essayez un autre terme de recherche." }
  }
```

### 2. Reusable pieces

📄 **Create `src/components/layout/empty-state.tsx`:**

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed p-10 text-center">
      <Icon className="text-muted-foreground mb-4 size-10" aria-hidden />
      <h2 className="font-medium">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
```

📄 **Create `src/components/layout/skeletons.tsx`** — shapes close to the real pages, so content **doesn't jump** when it arrives (CLS):

```tsx
import { Skeleton } from '@/components/ui/skeleton';

/** Screen readers get one polite announcement instead of a wall of grey boxes. */
function Busy({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

export function ListSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <Busy label={label}>
      <PageHeaderSkeleton />
      <Skeleton className="h-10 w-full max-w-sm" aria-hidden />
      <div className="divide-y rounded-lg border" aria-hidden>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between p-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </Busy>
  );
}

export function FormSkeleton({ label, fields = 3 }: { label: string; fields?: number }) {
  return (
    <Busy label={label}>
      <PageHeaderSkeleton />
      <div className="max-w-md space-y-5" aria-hidden>
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-32" />
      </div>
    </Busy>
  );
}
```

Route-level skeletons (Next shows `loading.tsx` while the page's data streams in):

```tsx
// src/app/[locale]/(app)/dashboard/[orgSlug]/projects/loading.tsx
// (the same two lines for members/loading.tsx and (admin)/admin/users/loading.tsx)
import { useTranslations } from 'next-intl';

import { ListSkeleton } from '@/components/layout/skeletons';

export default function Loading() {
  return <ListSkeleton label={useTranslations('common')('loading')} />;
}
```

```tsx
// …/[orgSlug]/settings/loading.tsx  and  …/dashboard/account/loading.tsx
import { useTranslations } from 'next-intl';

import { FormSkeleton } from '@/components/layout/skeletons';

export default function Loading() {
  return <FormSkeleton label={useTranslations('common')('loading')} />;
}
```

> `useTranslations` in a server component only needs `setRequestLocale` (done in the layouts) — no client JavaScript.

### 3. Use `EmptyState` where lists can be empty

Replace the plain "nothing here" text in each place (pattern shown for projects):

```tsx
import { FolderPlus, SearchX } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';

{projects.length === 0 ? (
  query ? (
    <EmptyState icon={SearchX} title={t('empty.search.title')} description={t('empty.search.description', { query })} />
  ) : (
    <EmptyState
      icon={FolderPlus}
      title={t('empty.projects.title')}
      description={t('empty.projects.description')}
      action={<Can permission={{ project: ['create'] }}><Button asChild><Link href={`/dashboard/${orgSlug}/projects/new`}>{t('empty.projects.action')}</Link></Button></Can>}
    />
  )
) : (
  /* …the table… */
)}
```

| Where | Icon | Message keys |
| --- | --- | --- |
| Projects list | `FolderPlus` / `SearchX` | `empty.projects.*` / `empty.search.*` |
| Pending invitations | `MailCheck` | `empty.invitations.*` |
| Passkeys card | `KeyRound` | `empty.passkeys.*` |
| Admin users (search) | `UserSearch` | `empty.users.*` |
| Members and sessions can't be empty (you are in the list), so they don't need one. |

### 4. One place for toasts

📄 **Create `src/libs/notify.ts`:**

```ts
import { toast } from 'sonner';

/** Consistent feedback: success disappears quickly, errors stay long enough to be read. */
export const notify = {
  success: (message: string) => toast.success(message, { duration: 4000 }),
  error: (message: string) => toast.error(message, { duration: 8000 }),
  info: (message: string) => toast(message, { duration: 5000 }),
};
```

Move existing calls over (Git Bash, GNU sed — on macOS use `sed -i ''`):

```bash
for f in $(git grep -l "from 'sonner'" -- 'src/**/*.tsx' ':!src/components/ui/sonner.tsx'); do
  sed -i "s#import { toast } from 'sonner';#import { notify } from '@/libs/notify';#; s#toast\.success(#notify.success(#g; s#toast\.error(#notify.error(#g" "$f"
done
git grep -n "toast" -- 'src/**/*.tsx' ':!src/components/ui/sonner.tsx'    # anything left needs a manual look (toast.promise, toast.info…)
```

📄 **Create `src/libs/notify.test.ts`:**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

const ALLOWED = new Set([
  path.join('src', 'libs', 'notify.ts'),
  path.join('src', 'components', 'ui', 'sonner.tsx'),
]);

it('only notify.ts talks to sonner, so every toast behaves the same', () => {
  const files = (readdirSync('src', { recursive: true }) as string[])
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => path.join('src', file));

  const offenders = files.filter(
    (file) => !ALLOWED.has(file) && /from ['"]sonner['"]/.test(readFileSync(file, 'utf8')),
  );
  expect(offenders, `Use notify from '@/libs/notify':\n${offenders.join('\n')}`).toEqual([]);
});
```

### 5. Stories and tests

📄 **Create `src/components/layout/states.stories.tsx`:**

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FolderPlus } from 'lucide-react';

import { EmptyState } from '@/components/layout/empty-state';
import { FormSkeleton, ListSkeleton } from '@/components/layout/skeletons';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'Layout/States',
  component: EmptyState,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    icon: FolderPlus,
    title: 'No projects yet',
    description: 'Create the first one to get started.',
  },
};
export const EmptyWithAction: Story = {
  args: { icon: FolderPlus, title: 'No projects yet', action: <Button>Create a project</Button> },
};
export const LoadingList: Story = { render: () => <ListSkeleton label="Loading…" /> };
export const LoadingForm: Story = { render: () => <FormSkeleton label="Loading…" /> };
```

📄 **Create `src/components/layout/empty-state.test.tsx`:**

```tsx
import { FolderPlus } from 'lucide-react';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { EmptyState } from './empty-state';
import { ListSkeleton } from './skeletons';

test('an empty state explains and offers the next step', async () => {
  const screen = await render(
    <EmptyState
      icon={FolderPlus}
      title="No projects yet"
      description="Create one."
      action={<button type="button">Create</button>}
    />,
  );
  await expect.element(screen.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Create' })).toBeVisible();
});

test('a skeleton is announced once to assistive technology', async () => {
  const screen = await render(<ListSkeleton label="Loading…" />);
  await expect.element(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  await expect.element(screen.getByText('Loading…')).toBeInTheDocument();
});
```

📄 **Add to `e2e/rbac-ui.spec.ts`** (or a new `e2e/empty-states.spec.ts`) — a brand-new user has an empty organization:

```ts
import { apiContext, signInApi } from './helpers/api';
import { queryDb } from './helpers/db';
import { createUser } from './helpers/users';

test('a brand-new organization shows a helpful empty state with a call to action', async ({
  browser,
  baseURL,
}) => {
  const api = await apiContext(baseURL!);
  const person = await createUser(api, baseURL!);
  await signInApi(api, person.email, person.password);
  const [org] = await queryDb<{ slug: string }>(
    `select o.slug from organization o join member m on m.organization_id = o.id join "user" u on u.id = m.user_id where u.email = $1`,
    [person.email],
  );

  const context = await browser.newContext({ baseURL, storageState: await api.storageState() });
  const page = await context.newPage();
  await page.goto(`/dashboard/${org!.slug}/projects`);

  await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create a project' })).toBeVisible();
  await context.close();
});
```

_(add the consent cookie to that context as in `openAs` if the banner covers the page)_

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check && pnpm e2e
pnpm storybook
```

1. DevTools → **Network → Slow 3G** (or _Fast 3G_) and open `/dashboard/<org>/projects`: a skeleton of the **same shape** appears instantly, then the content replaces it **without the page jumping**.
2. Screen reader/inspector: the skeleton region is `role="status"` with a single "Loading…" announcement.
3. A new account sees the empty state with a working **Create a project** button (only for roles allowed to create).
4. Search for a nonsense term in projects → "No results … Nothing matches “xyz”".
5. `git grep "from 'sonner'" src` → only `notify.ts` and `ui/sonner.tsx`.
6. Storybook shows 4 new states, with **0 a11y violations**.

**🚢 Ship** — branch `feat/s7-t07-loading-empty` · message: `feat(ui): add skeleton loading states, empty states and a single toast helper`

---

## 🎫 S7-T08 — Lighthouse CI and a measured baseline

**Branch:** `ci/s7-t08-lighthouse` · **Story:** US-074 · **3 SP**

> 🎯 _"Fast"_ is a claim until a robot checks it on every PR. We run Lighthouse against a **production build** of the four main pages, **record the baseline before tuning** (S7-T09), start with warnings, and only then flip to errors.

```bash
git switch main && git pull && git switch -c ci/s7-t08-lighthouse
pnpm add -D @lhci/cli
```

### 1. Share the E2E environment

The Lighthouse server must be the same stack as E2E (own database, own port). Move the constants out of the Playwright config so both can use them.

📄 **Create `e2e/env.ts`** (cut these from `playwright.config.ts`):

```ts
export const E2E_PORT = 3100;
export const E2E_DB_PORT = 5434;
export const baseURL = `http://localhost:${E2E_PORT}`;

// Same environment everywhere → "works on my machine" == "works in CI"
export const appEnv = {
  PORT: String(E2E_PORT),
  NEXT_PUBLIC_APP_URL: baseURL,
  DB_SERVER_PORT: String(E2E_DB_PORT),
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres`,
  AUTH_RATE_LIMIT: 'on',
  EMAIL_TRANSPORT: 'console',
  GITHUB_CLIENT_ID: 'e2e-github-id',
  GITHUB_CLIENT_SECRET: 'e2e-github-secret',
  SITE_INDEXING: 'true',
  LEGAL_NOINDEX: 'true',
  CSP_MODE: 'enforce',
  // Dummy values that switch client integrations ON (CSP/E2E coverage). Lighthouse blanks them out.
  NEXT_PUBLIC_SENTRY_DSN: 'https://public@o0.ingest.sentry.io/0',
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_e2e_dummy',
  NEXT_PUBLIC_POSTHOG_HOST: 'https://eu.i.posthog.com',
};
```

📄 **Edit `playwright.config.ts`:** `import { appEnv, baseURL, E2E_DB_PORT } from './e2e/env';` and delete the duplicated constants (keep the rest unchanged).

### 2. One script runs the whole thing (Windows-safe)

📄 **Create `scripts/lighthouse.ts`:**

```ts
// Builds the app, starts the database + app on the E2E ports, runs Lighthouse CI, and cleans up.
// Usage: pnpm lighthouse            (LH_PREBUILT=1 skips the build)
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';

import { appEnv, baseURL, E2E_DB_PORT } from '../e2e/env';

// Measure what a visitor on a production site gets WITHOUT vendors we can't reach from CI:
// fake Sentry/PostHog endpoints would log failed requests and pollute "Best practices".
const env = {
  ...process.env,
  ...appEnv,
  NEXT_PUBLIC_SENTRY_DSN: '',
  NEXT_PUBLIC_POSTHOG_KEY: '',
  DB_DATA_DIR: './local.lhci.db',
};
const children: ChildProcess[] = [];

function start(command: string, extra: Record<string, string> = {}) {
  const child = spawn(command, {
    shell: true,
    stdio: 'inherit',
    env: { ...env, ...extra },
    detached: process.platform !== 'win32',
  });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }
}
process.on('SIGINT', () => {
  stopAll();
  process.exit(130);
});

async function waitFor(url: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let exitCode = 1;
try {
  if (!process.env.LH_PREBUILT) {
    const build = spawnSync('pnpm build', { shell: true, stdio: 'inherit', env });
    if (build.status !== 0) throw new Error('build failed');
  }
  start('pnpm db:server', { DB_SERVER_PORT: String(E2E_DB_PORT) });
  start('pnpm start');
  await waitFor(`${baseURL}/api/health`);

  exitCode =
    spawnSync('pnpm exec lhci autorun', { shell: true, stdio: 'inherit', env }).status ?? 1;
} finally {
  stopAll();
}
process.exit(exitCode);
```

📄 **Edit `package.json`:** `"lighthouse": "tsx scripts/lighthouse.ts"` · 📄 `.gitignore`: add `.lighthouseci` and `local.lhci.db*`. 📄 **Edit `knip.config.ts`** → `entry`: `'scripts/lighthouse.ts'`.

### 3. The assertions — as **warnings** first

📄 **Create `lighthouserc.json`:**

```json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:3100/",
        "http://localhost:3100/fr",
        "http://localhost:3100/pricing",
        "http://localhost:3100/sign-in"
      ],
      "numberOfRuns": 3,
      "settings": {
        "chromeFlags": "--no-sandbox --headless=new",
        "onlyCategories": ["performance", "accessibility", "best-practices", "seo"]
      }
    },
    "assert": {
      "assertMatrix": [
        {
          "matchingUrlPattern": "^http://localhost:3100/(fr|pricing)?$",
          "assertions": {
            "categories:performance": ["warn", { "minScore": 0.95 }],
            "categories:accessibility": ["warn", { "minScore": 0.95 }],
            "categories:best-practices": ["warn", { "minScore": 0.95 }],
            "categories:seo": ["warn", { "minScore": 0.95 }],
            "largest-contentful-paint": ["warn", { "maxNumericValue": 2500 }],
            "cumulative-layout-shift": ["warn", { "maxNumericValue": 0.05 }],
            "total-blocking-time": ["warn", { "maxNumericValue": 200 }],
            "resource-summary:script:size": ["warn", { "maxNumericValue": 153600 }]
          }
        },
        {
          "matchingUrlPattern": "/sign-in$",
          "assertions": {
            "categories:performance": ["warn", { "minScore": 0.9 }],
            "categories:accessibility": ["warn", { "minScore": 0.95 }],
            "categories:best-practices": ["warn", { "minScore": 0.95 }],
            "categories:seo": ["off"],
            "cumulative-layout-shift": ["warn", { "maxNumericValue": 0.05 }]
          }
        }
      ]
    },
    "upload": { "target": "filesystem", "outputDir": ".lighthouseci" }
  }
}
```

> `/sign-in` is `noindex` by design → its SEO category is switched off. The script budget (150 KB, transferred/compressed) is a **starting guess** — S7-T09 replaces it with _measured + 10 %_.

### 4. Record the baseline

```bash
pnpm lighthouse
```

(the first run builds; ~3–5 min. 🪟 It needs Chrome installed; if `lhci` can't find it: `set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe` — or run it in CI/WSL.)

📄 **Create `docs/guides/performance.md`:**

```markdown
# Performance

## How it is measured

`pnpm lighthouse` builds the app, starts it on the E2E ports and runs Lighthouse CI (mobile profile, simulated slow 4G, 3 runs per URL, median) on `/`, `/fr`, `/pricing` and `/sign-in`. Reports: `.lighthouseci/`. CI uploads them as an artifact. Config: `lighthouserc.json`. Built WITHOUT Sentry/PostHog keys (see `scripts/lighthouse.ts` for why).

## Baseline (before tuning) — fill in from your run

| Page       | Perf | A11y | Best practices | SEO | LCP | CLS | TBT | JS (gz) |
| ---------- | ---- | ---- | -------------- | --- | --- | --- | --- | ------- |
| `/`        |      |      |                |     |     |     |     |         |
| `/fr`      |      |      |                |     |     |     |     |         |
| `/pricing` |      |      |                |     |     |     |     |         |
| `/sign-in` |      |      |                |     |     |     |     |         |

## After tuning (S7-T09)

_(same table)_

## Budgets

_(filled in S7-T09)_
```

Fill the **Baseline** table from the terminal summary (or open `.lighthouseci/*.html`).

### 5. CI job

📄 **Edit `.github/workflows/ci.yml`** — a new job (it builds its own clean copy, in parallel with the rest), and add it to `ci-ok`'s `needs`:

```yaml
lighthouse:
  name: Lighthouse
  needs: changes
  if: needs.changes.outputs.code == 'true'
  runs-on: ubuntu-latest
  timeout-minutes: 25
  env:
    # Blank the dummy vendor keys that the shared workflow env sets for the E2E build
    NEXT_PUBLIC_SENTRY_DSN: ''
    NEXT_PUBLIC_POSTHOG_KEY: ''
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup
    - uses: actions/cache@v4
      with:
        path: .next/cache
        key: nextjs-lh-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ hashFiles('src/**') }}
        restore-keys: nextjs-lh-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
    - run: pnpm lighthouse
    - uses: actions/upload-artifact@v4
      if: always()
      with:
        name: lighthouse-report
        path: .lighthouseci
        retention-days: 7
```

`ci-ok.needs`: `[changes, quality, test, build, storybook, e2e, visual, lighthouse, commitlint]`.

> While assertions are `warn`, the job **passes** and prints the warnings; it fails only if the build/servers fail. S7-T09 turns warnings into errors.

### ✅ Verify

```bash
pnpm check
pnpm lighthouse
```

1. The run ends with a table of assertions (warnings are fine **now**); `.lighthouseci/` holds HTML reports — open one and look at the _Opportunities_: these are your S7-T09 to-do list.
2. Servers are cleaned up (nothing left on 3100/5434: `netstat -ano | findstr :3100` empty).
3. CI: the `Lighthouse` job is green and the artifact contains the reports.
4. The **Baseline** table is filled in and committed.

**🚢 Ship** — branch `ci/s7-t08-lighthouse` · message: `ci(perf): add lighthouse ci with a reproducible production run and recorded baseline`

---

## 🎫 S7-T09 — Performance tuning (measure → change → measure)

**Branch:** `perf/s7-t09-tuning` · **Story:** US-074 · **5 SP**

> 🎯 Don't guess. Open the baseline report, fix what it names, re-measure. The changes below are the usual suspects **for this codebase**; apply them in order and keep only the ones that move a number.

```bash
git switch main && git pull && git switch -c perf/s7-t09-tuning
pnpm analyze        # the bundle analyzer (Sprint 0): note the 5 biggest client chunks
```

### 1. Don't download analytics code for people who said no

Sprint 6 imported `posthog-js` statically — it ships to **every** visitor even if analytics never starts. Load it only when consent is given.

📄 **Rewrite `src/libs/analytics/client.ts`:**

```ts
import type { AnalyticsEvents } from '@/libs/analytics/events';
import { analyticsUrl, posthogUiHost } from '@/libs/analytics/hosts';

type PostHog = typeof import('posthog-js').default;

let posthog: PostHog | undefined;
let active = false;
let wanted = false; // the latest instruction (activation may finish after consent was withdrawn)

export const isAnalyticsActive = () => active;

/** Called only after the visitor consented. posthog-js is downloaded HERE, never before. */
export async function activateAnalytics({
  key,
  host,
}: {
  key: string;
  host: string;
}): Promise<void> {
  wanted = true;
  if (!posthog) {
    const loaded = (await import('posthog-js')).default;
    if (!wanted) return; // consent was withdrawn while the library was downloading
    loaded.init(key, {
      api_host: '/ingest',
      ui_host: posthogUiHost(host),
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      disable_session_recording: true,
      person_profiles: 'identified_only',
      respect_dnt: true,
    });
    posthog = loaded;
  }
  if (!wanted) return;
  posthog.opt_in_capturing();
  active = true;
}

export function deactivateAnalytics(): void {
  wanted = false;
  if (!active || !posthog) return;
  posthog.opt_out_capturing();
  posthog.reset();
  active = false;
}

export function capturePageview(pathname: string): void {
  if (!active || !posthog) return;
  posthog.capture('$pageview', {
    $current_url: analyticsUrl(window.location.origin, pathname),
    $pathname: pathname.split(/[?#]/)[0],
  });
}

export function trackEvent<E extends keyof AnalyticsEvents>(
  event: E,
  properties: AnalyticsEvents[E],
): void {
  if (!active || !posthog) return;
  posthog.capture(event, properties);
}

export function identifyUser(userId: string): void {
  if (!active || !posthog) return;
  posthog.identify(userId);
}

export function groupOrganization(orgId: string): void {
  if (!active || !posthog) return;
  posthog.group('organization', orgId);
}

export function resetAnalytics(): void {
  if (!active || !posthog) return;
  posthog.reset();
}
```

📄 **Edit `src/components/analytics/analytics-provider.tsx`:**

```tsx
if (choice.analytics) {
  void activateAnalytics({ key, host: Env.NEXT_PUBLIC_POSTHOG_HOST }).then(() =>
    setReady(isAnalyticsActive()),
  );
} else {
  deactivateAnalytics();
  setReady(false);
}
```

(import `isAnalyticsActive`).

📄 **Update the tests:**

- `client.test.ts`: `await analytics.activateAnalytics(...)` everywhere, and add the race:

```ts
it('consent withdrawn while the library downloads → analytics never starts', async () => {
  const analytics = await load();
  const pending = analytics.activateAnalytics({ key: 'phc_x', host: 'https://eu.i.posthog.com' });
  analytics.deactivateAnalytics();
  await pending;

  analytics.trackEvent('org_created', { via: 'form' });
  expect(posthog.capture).not.toHaveBeenCalled();
  expect(posthog.opt_in_capturing).not.toHaveBeenCalled();
});
```

- `analytics-provider.test.tsx`: the mock becomes `activateAnalytics: vi.fn().mockResolvedValue(undefined), isAnalyticsActive: () => true,`.

### 2. Lazy-load what isn't needed on first paint

📄 **Create `src/components/layout/lazy-toaster.tsx`:**

```tsx
'use client';

import dynamic from 'next/dynamic';

// Toasts appear after user actions, never during first paint: keep sonner out of the initial bundle.
const Toaster = dynamic(() => import('@/components/ui/sonner').then((module) => module.Toaster), {
  ssr: false,
});

export function LazyToaster() {
  return <Toaster richColors />;
}
```

In `src/app/[locale]/layout.tsx` replace `<Toaster richColors />` with `<LazyToaster />`.

📄 **Split the consent dialog** — move `SettingsDialog` from `consent-banner.tsx` into `src/components/consent/consent-settings-dialog.tsx` (named export `ConsentSettingsDialog`, unchanged code), then in the banner:

```tsx
import dynamic from 'next/dynamic';

const ConsentSettingsDialog = dynamic(() =>
  import('@/components/consent/consent-settings-dialog').then(
    (module) => module.ConsentSettingsDialog,
  ),
);
// …in the JSX, instead of <SettingsDialog />:
{
  settingsOpen ? <ConsentSettingsDialog /> : null;
}
```

(take `settingsOpen` from `useConsent()`). The banner itself stays eager — it is the first thing a new visitor needs.

📄 **Mobile menu** — the navigation drawer (Radix `Sheet`) is only needed after a tap. Keep a tiny button that **loads the drawer on first open**:

```tsx
// src/components/layout/mobile-nav.tsx  (adapt to your existing file)
'use client';

import { Menu } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

const MobileMenu = dynamic(() =>
  import('@/components/layout/mobile-menu').then((module) => module.MobileMenu),
);

export function MobileNav({
  links,
  label,
}: {
  links: { href: string; label: string }[];
  label: string;
}) {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label={label}
        onClick={() => setOpened(true)}
      >
        <Menu aria-hidden />
      </Button>
      {opened ? <MobileMenu links={links} defaultOpen onClose={() => setOpened(false)} /> : null}
    </>
  );
}
```

(`mobile-menu.tsx` = the existing `Sheet` markup, opened by default and calling `onClose` from `onOpenChange`.)

### 3. Fonts without layout shift or extra downloads

📄 **Edit the font setup in `src/app/[locale]/layout.tsx`:**

```tsx
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'], display: 'swap' });
// Monospace is used in a handful of places (backup codes): don't preload it on every page
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});
```

(`next/font` self-hosts the files and adjusts the fallback metrics, which is what keeps CLS near zero.)

### 4. Measure again — and decide about Sentry

```bash
pnpm build && pnpm analyze
pnpm lighthouse
```

- Compare the biggest chunks with the baseline: `posthog-js`, `sonner`, `@radix-ui/react-dialog/-dialog` should have left the shared/initial chunks.
- **Sentry's cost.** Build once with and once without `NEXT_PUBLIC_SENTRY_DSN` (`pnpm bundle:size`), note the difference in `docs/guides/performance.md`. Our decision: **keep early initialisation** (catching errors that happen during load is the point), unless the measurement shows marketing pages cannot reach their targets — in which case lazy-initialise the client SDK after the `load` event on marketing routes only.
- **Caching decision (write it down):** marketing pages are already fully static and CDN-cacheable; **Cache Components / `"use cache"` is _not_ adopted for v1.0** — it changes rendering semantics app-wide and brings no measurable gain here. Revisit when dashboards need data caching.
- **Images:** none on marketing pages today (icons are SVG, OG images are generated). Rule for the future: use `next/image` with explicit `width/height` (or `sizes`), `priority` only for the single LCP image, AVIF/WebP via Next's optimizer.

### 5. Turn warnings into errors, set the budget from the measurement

In `lighthouserc.json`:

- change every `"warn"` to `"error"` (`sed -i 's/"warn"/"error"/g' lighthouserc.json`);
- set `resource-summary:script:size` to **your measured script transfer size + 10 %** (bytes; e.g. measured 105 KB → `115500`).

If a page still misses a target, open its report, fix the named cause, and only as a **last resort** lower that one threshold with a comment explaining why.

📄 **Fill the "After tuning" and "Budgets" sections of `docs/guides/performance.md`** (scores, LCP/CLS/TBT, JS size, what changed, the Sentry measurement, the two decisions above).

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check && pnpm e2e && pnpm lighthouse
```

1. `pnpm lighthouse` ends with **no assertion errors**: performance ≥ 95 on `/`, `/fr`, `/pricing`; LCP ≤ 2.5 s, CLS ≤ 0.05, TBT ≤ 200 ms; JS within budget.
2. Before/after table in the docs shows a real improvement from the lazy-loading changes (initial JS down by tens of KB).
3. Analytics still works after consent (E2E `analytics.spec.ts` green): the library downloads **at the moment of "Accept all"** (Network tab).
4. The consent banner and the mobile menu still work with keyboard and screen reader; toasts still appear.
5. CI's `Lighthouse` job is now **blocking**: make a throw-away change that adds a large import to the home page → the job fails. Revert.

**🚢 Ship** — branch `perf/s7-t09-tuning` · message: `perf: lazy-load analytics, toaster, consent dialog and mobile menu, and enforce lighthouse budgets`

---

## 🎫 S7-T10 — Verify the production output, evaluate the React Compiler

**Branch:** `perf/s7-t10-build-output` · **Story:** US-075 · **2 SP** · decision **TD-09**

### 1. Prove what we ship: minified, hashed, compressed, cacheable, no leaks

```bash
git switch main && git pull && git switch -c perf/s7-t10-build-output
```

📄 **Create `e2e/build-output.spec.ts`** (E2E runs the **production** build):

```ts
import { expect, test } from './fixtures';

type Asset = { url: string; kind: 'js' | 'css' | 'font'; cacheControl: string };

test('production assets are content-hashed, immutable, compressed, minified and carry no source maps', async ({
  page,
  request,
}) => {
  const assets: Asset[] = [];
  page.on('response', (response) => {
    const url = response.url();
    const kind = /\.js(\?|$)/.test(url)
      ? 'js'
      : /\.css(\?|$)/.test(url)
        ? 'css'
        : /\.woff2?(\?|$)/.test(url)
          ? 'font'
          : undefined;
    if (kind && url.includes('/_next/static/'))
      assets.push({ url, kind, cacheControl: response.headers()['cache-control'] ?? '' });
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(assets.length).toBeGreaterThan(3);

  for (const asset of assets) {
    // cache busting: the file name carries a content hash …
    expect(new URL(asset.url).pathname, asset.url).toMatch(/[A-Za-z0-9_-]{8,}\.(js|css|woff2?)$/);
    // … which is what makes a one-year immutable cache safe
    expect(asset.cacheControl, asset.url).toMatch(/max-age=31536000/);
    expect(asset.cacheControl, asset.url).toContain('immutable');
  }

  for (const asset of assets.filter((entry) => entry.kind !== 'font')) {
    const response = await request.get(asset.url, { headers: { 'accept-encoding': 'gzip, br' } });
    expect(['gzip', 'br'], `${asset.url} must be compressed`).toContain(
      response.headers()['content-encoding'],
    );

    const body = await response.text();
    expect(body, `${asset.url} must not reference a source map`).not.toMatch(/sourceMappingURL=/);
    // minified code has very long lines
    const lines = body.split('\n').length;
    if (body.length > 20_000)
      expect(body.length / lines, `${asset.url} looks unminified`).toBeGreaterThan(150);
  }
});

test('HTML is compact, cacheable at the edge and free of development leftovers', async ({
  request,
}) => {
  const response = await request.get('/');
  const html = await response.text();

  expect(response.headers()['cache-control'] ?? '').toMatch(/s-maxage=\d+/); // static page → CDN-cacheable 🔍 header form varies by host
  expect(html).not.toMatch(/\n\s{2,}</); // no pretty-printed indentation
  expect(html).not.toMatch(/react-refresh|webpack-hmr|__nextjs_original-stack-frame/);
  expect(html.length).toBeLessThan(120_000);
});

test('CSS is minified', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="stylesheet"]').first().getAttribute('href');
  const css = await (await request.get(href!)).text();
  expect(css.length / css.split('\n').length).toBeGreaterThan(150);
});
```

> 🔍 If your host adds/removes `s-maxage` (Vercel manages it at the edge), keep the assertion only for `next start` and note it. Everything else holds on any host.

Manual **dev-mode** counterpart (write the result in the PR): `pnpm dev` → editing a component hot-reloads without a full refresh; an error shows the overlay; **View source** shows readable code and source maps.

### 2. The React Compiler: measure, then decide

The compiler auto-memoises components. It can reduce wasted renders in client-heavy screens (dashboards, tables) at the price of a slower build and a slightly different bundle. Evaluate it **objectively**:

```bash
pnpm add -D babel-plugin-react-compiler
```

📄 **Edit `next.config.ts`** — an opt-in switch for the experiment:

```ts
const nextConfig: NextConfig = {
  // …existing…
  reactCompiler: process.env.REACT_COMPILER === '1', // 🔍 Next 16 stable option; see the React Compiler docs
};
```

Measure **both** ways (🪟 Git Bash syntax; in `cmd.exe` use `set REACT_COMPILER=1&& …`):

```bash
# A) without
pnpm build && pnpm bundle:size
# B) with
REACT_COMPILER=1 pnpm build && REACT_COMPILER=1 pnpm bundle:size
REACT_COMPILER=1 pnpm test:browser && REACT_COMPILER=1 CI=1 pnpm e2e
```

📄 **Record it in `docs/guides/performance.md`:**

```markdown
## React Compiler evaluation (TD-09)

|  | Without | With |
| --- | --- | --- |
| Build time |  |  |
| Total JS (gz) |  |  |
| Browser tests | ✅/❌ | ✅/❌ |
| E2E | ✅/❌ | ✅/❌ |
| Lighthouse TBT (`/sign-in`) |  |  |
| **Decision rule:** adopt only if all tests pass, JS grows ≤ 2 %, build time grows ≤ 50 %, and there is a visible benefit. |
| **Decision:** _adopted / not adopted_ — _reason_. |
```

Then apply the decision: **adopted** → hard-code `reactCompiler: true`; **not adopted** → remove the experiment code (`reactCompiler` line and the dependency) and leave the table as the record. Update `TD-09` in `docs/roadmap/04-dependencies-risks.md` accordingly.

### ✅ Verify

```bash
pnpm test && pnpm check && CI=1 pnpm e2e
```

1. `e2e/build-output.spec.ts` is green; sabotage it to prove it bites: set `productionBrowserSourceMaps: true` in `next.config.ts`, rebuild → _"must not reference a source map"_ fails. Revert.
2. `curl -I -H "accept-encoding: gzip" http://localhost:3100/_next/static/chunks/<file>.js` shows `content-encoding: gzip` and `cache-control: public, max-age=31536000, immutable`.
3. The compiler table is filled in and the decision applied; `pnpm lighthouse` still passes.

**🚢 Ship** — branch `perf/s7-t10-build-output` · message: `perf: verify minification, cache busting and compression in e2e and record the react compiler decision`

---

## 🎫 S7-T11 — Accessibility (WCAG 2.2 AA)

**Branch:** `feat/s7-t11-a11y` · **Story:** US-076 · **3 SP**

> 🎯 Automated tools find roughly a third of accessibility problems — the cheap, repeatable third. We gate on them (axe in E2E, contrast maths on the theme tokens) and cover the rest with a **keyboard and screen-reader checklist**.

```bash
git switch main && git pull && git switch -c feat/s7-t11-a11y
pnpm add -D @axe-core/playwright culori @types/culori
```

### 1. A skip link, reduced motion, and a reliable `#main`

📄 **`src/locales/en.json`** → `common`: `"skipToContent": "Skip to content"` · **`fr.json`**: `"skipToContent": "Aller au contenu"`.

📄 **Create `src/components/layout/skip-link.tsx`:**

```tsx
import { useTranslations } from 'next-intl';

/** Invisible until keyboard focus reaches it: lets keyboard and screen-reader users bypass the navigation. */
export function SkipLink() {
  const t = useTranslations('common');
  return (
    <a
      href="#main"
      className="bg-background sr-only rounded-md px-4 py-2 shadow focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50"
    >
      {t('skipToContent')}
    </a>
  );
}
```

📄 **Render it first** in `src/app/[locale]/layout.tsx` (`<body>` → `<SkipLink />` before everything else) and make sure **every** layout's main region is the target:

```bash
git grep -n "<main" src/app          # each of (marketing), (auth), (app), (admin) must have <main id="main" tabIndex={-1} …>
```

📄 **Edit `src/styles/global.css`** — respect "reduce motion":

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 2. Contrast, calculated from the real tokens

📄 **Create `src/styles/contrast.test.ts`:**

```ts
import { existsSync, readFileSync } from 'node:fs';

import { parse, wcagContrast } from 'culori';
import { describe, expect, it } from 'vitest';

// Reads the same CSS the browser reads — no copy of the colours to keep in sync.
const css = ['src/styles/global.css', 'src/styles/theme.css']
  .filter(existsSync)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

function block(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const declaration of match[1]!.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g))
      tokens[declaration[1]!] = declaration[2]!.trim();
  }
  return tokens;
}

const root = block(':root');
const dark = block('.dark');
const ACCENTS = ['blue', 'green'] as const;

// The cascade, exactly as the browser applies it
const contexts: { name: string; tokens: Record<string, string> }[] = [
  { name: 'light', tokens: root },
  { name: 'dark', tokens: { ...root, ...dark } },
  ...ACCENTS.flatMap((accent) => {
    const light = block(`:root[data-accent='${accent}']`);
    const night = block(`.dark[data-accent='${accent}']`);
    return Object.keys(light).length === 0
      ? []
      : [
          { name: `light + ${accent}`, tokens: { ...root, ...light } },
          { name: `dark + ${accent}`, tokens: { ...root, ...dark, ...light, ...night } },
        ];
  }),
];

/** [foreground, background, minimum ratio]: 4.5 for text (AA), 3 for focus rings and component edges. */
const PAIRS: [string, string, number][] = [
  ['foreground', 'background', 4.5],
  ['card-foreground', 'card', 4.5],
  ['popover-foreground', 'popover', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['secondary-foreground', 'secondary', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['accent-foreground', 'accent', 4.5],
  ['destructive', 'background', 4.5], // error text
  ['ring', 'background', 3], // focus indicator (WCAG 1.4.11)
];

describe.each(contexts)('contrast · $name', ({ tokens }) => {
  it.each(PAIRS)('%s on %s ≥ %f:1', (foreground, background, minimum) => {
    const fg = tokens[foreground] ? parse(tokens[foreground]) : undefined;
    const bg = tokens[background] ? parse(tokens[background]) : undefined;
    expect(fg, `--${foreground} is missing or not a plain colour`).toBeTruthy();
    expect(bg, `--${background} is missing or not a plain colour`).toBeTruthy();

    expect(wcagContrast(fg!, bg!)).toBeGreaterThanOrEqual(minimum);
  });
});
```

```bash
pnpm test src/styles/contrast.test.ts
```

Any red row is a **real** problem: darken the foreground (or lighten the background) token until it passes. S7-T13 finalises the tokens; if a row fails _now_, fix that one value in `global.css` and move on.

### 3. axe in the E2E suite

📄 **Create `e2e/a11y.spec.ts`:**

```ts
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Serious and critical violations block; the rest are recorded as advisories on the test. */
async function blockingViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  for (const violation of violations.filter(
    (v) => v.impact !== 'serious' && v.impact !== 'critical',
  )) {
    test.info().annotations.push({
      type: 'a11y-advisory',
      description: `${violation.id}: ${violation.help}`,
    });
  }
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.impact} · ${v.id}: ${v.help}\n    ${v.nodes
          .slice(0, 3)
          .map((node) => node.target.join(' '))
          .join('\n    ')}`,
    );
}

const PUBLIC_PAGES = [
  '/',
  '/pricing',
  '/about',
  '/contact',
  '/terms',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
];

for (const prefix of ['', '/fr']) {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`public pages · ${prefix || 'en'} · ${scheme}`, () => {
      test.use({ colorScheme: scheme });

      for (const path of PUBLIC_PAGES) {
        test(path, async ({ page }) => {
          await page.goto(`${prefix}${path}`);
          await page.waitForLoadState('networkidle');
          expect(await blockingViolations(page)).toEqual([]);
        });
      }
    });
  }
}

test.describe('signed-in pages', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`organization pages · ${scheme}`, async ({ ownerPage, world }) => {
      await ownerPage.emulateMedia({ colorScheme: scheme });
      for (const path of ['', '/projects', '/members', '/settings']) {
        await ownerPage.goto(`/dashboard/${world.orgSlug}${path}`);
        await ownerPage.waitForLoadState('networkidle');
        expect(await blockingViolations(ownerPage), `/dashboard/${world.orgSlug}${path}`).toEqual(
          [],
        );
      }
    });

    test(`account and admin pages · ${scheme}`, async ({ ownerPage, platformAdminPage }) => {
      await ownerPage.emulateMedia({ colorScheme: scheme });
      for (const path of ['/dashboard/account', '/dashboard/account/security']) {
        await ownerPage.goto(path);
        await ownerPage.waitForLoadState('networkidle');
        expect(await blockingViolations(ownerPage), path).toEqual([]);
      }

      await platformAdminPage.emulateMedia({ colorScheme: scheme });
      await platformAdminPage.goto('/admin/users');
      await platformAdminPage.waitForLoadState('networkidle');
      expect(await blockingViolations(platformAdminPage), '/admin/users').toEqual([]);
    });
  }
});

test.describe('interactive states', () => {
  test('the consent banner and its settings dialog are accessible and keyboard-operable', async ({
    page,
    context,
  }) => {
    await context.clearCookies(); // a first-time visitor sees the banner
    await page.goto('/');
    expect(await blockingViolations(page)).toEqual([]);

    const customize = page.getByRole('button', { name: 'Customize' });
    await customize.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(customize).toBeFocused(); // focus returns to what opened the dialog
  });

  test('the skip link is the first tab stop and jumps to the main content', async ({ page }) => {
    await page.goto('/pricing');
    await page.keyboard.press('Tab');

    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('form errors move focus to the first invalid field and are exposed to assistive technology', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Sign in' }).click();

    const email = page.getByLabel('Email', { exact: true });
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAttribute('aria-describedby', /.+/);
  });
});
```

### 4. The human part

📄 **Create `docs/guides/accessibility.md`:**

```markdown
# Accessibility (WCAG 2.2 AA)

## Automated (runs in CI)

- `e2e/a11y.spec.ts`: axe on public + signed-in pages × light/dark × en/fr. **Serious/critical = failure**; others are annotated.
- `src/styles/contrast.test.ts`: every text/background token pair ≥ 4.5:1, focus ring ≥ 3:1, in every theme and accent.
- Storybook's a11y panel on every component story.

## Manual checklist (before every release, ~20 minutes)

Keyboard only (unplug the mouse):

- [ ] Tab order is logical on: home, sign-up, sign-in (passkey autofill), 2FA, org switcher, invite, members table, project form.
- [ ] A focus ring is ALWAYS visible; nothing traps focus except modal dialogs — which trap it **and** return it on close.
- [ ] Esc closes dialogs, menus and the consent banner's settings.
- [ ] No keyboard-only dead ends (everything clickable is a button or link). Screen reader (NVDA on Windows is free; VoiceOver on macOS):
- [ ] Page title and one `<h1>` per page; headings descend without gaps.
- [ ] Landmarks: banner, navigation, main, contentinfo.
- [ ] Form errors are announced, tied to their fields; required fields are identified.
- [ ] Toasts and loading states are announced politely (not stealing focus).
- [ ] Icon-only buttons have names; decorative icons are `aria-hidden`. Visual:
- [ ] 200 % zoom and 320 px width: no horizontal scroll, nothing cut off (reflow).
- [ ] Reduced motion honoured. Not colour alone to convey meaning.

## Rules for new UI

Use real `<button>`/`<a>`; label every control; never remove outlines without a replacement; keep tokens in `theme.css` (the contrast test will tell you when you break one).
```

### ✅ Verify

```bash
pnpm test && pnpm check && pnpm e2e
```

1. `pnpm e2e e2e/a11y.spec.ts` — green. If it reports violations, **fix the component** (label, contrast, heading order, landmark…), not the test. Anything that truly can't be fixed this sprint gets a one-line exclusion in the test (`.exclude('selector')`) **plus** a `TD-` entry.
2. Proof the contrast test bites: set `--muted-foreground: oklch(0.8 0 0)` in the light theme → _muted-foreground on background ≥ 4.5:1_ fails. Revert.
3. Walk through the **manual checklist** once with NVDA/VoiceOver and write findings into `docs/guides/accessibility.md` → _Known issues_.
4. Press Tab on any page: the skip link appears at the top-start corner; Enter jumps to `#main`.

**🚢 Ship** — branch `feat/s7-t11-a11y` · message: `feat(a11y): add skip link, reduced motion, axe e2e gate and token contrast tests`

---

## 🎫 S7-T12 — RTL readiness

**Branch:** `feat/s7-t12-rtl` · **Story:** US-077 · **2 SP**

> 🎯 We don't ship Arabic or Hebrew — but we make sure _adding one is a translation job, not a redesign_. We use **logical CSS** everywhere (`ms-`, `pe-`, `text-start`…), prove it with a forced-RTL run, and add a test that stops physical properties from creeping back.

```bash
git switch main && git pull && git switch -c feat/s7-t12-rtl
pnpm add @radix-ui/react-direction
```

### 1. Direction as data

📄 **Create `src/i18n/direction.ts`:**

```ts
const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

/** Add a right-to-left language by listing its code in routing.ts — this function does the rest. */
export const getDirection = (locale: string): 'ltr' | 'rtl' =>
  RTL_LOCALES.has(locale.split('-')[0]!) ? 'rtl' : 'ltr';
```

📄 **Create `src/i18n/direction.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { getDirection } from './direction';

it('knows which languages read right to left', () => {
  expect(getDirection('ar')).toBe('rtl');
  expect(getDirection('he')).toBe('rtl');
  expect(getDirection('fa-IR')).toBe('rtl');
  expect(getDirection('en')).toBe('ltr');
  expect(getDirection('fr')).toBe('ltr');
});
```

📄 **Edit `src/libs/Env.ts`** (`client` + `runtimeEnv`): `NEXT_PUBLIC_FORCE_DIR: z.enum(['ltr', 'rtl']).optional(),` · `.env.example`: `# NEXT_PUBLIC_FORCE_DIR=rtl   # review tool only: forces right-to-left on every locale (build-time)`.

📄 **Edit `src/app/[locale]/layout.tsx`:**

```tsx
import { DirectionProvider } from '@radix-ui/react-direction';
import { getDirection } from '@/i18n/direction';
import { Env } from '@/libs/Env';

  const dir = Env.NEXT_PUBLIC_FORCE_DIR ?? getDirection(locale);

  <html lang={locale} dir={dir} suppressHydrationWarning /* …existing props… */>
    <body …>
      <DirectionProvider dir={dir}>{/* …providers and children… */}</DirectionProvider>
```

> Radix (dropdowns, selects, tabs, sliders) reads `dir` from this provider: menus open on the correct side and arrow keys move the right way.

### 2. A guard against physical properties

📄 **Create `src/styles/logical-properties.test.ts`:**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const files = (readdirSync('src', { recursive: true }) as string[])
  .map((file) => path.join('src', file))
  .filter(
    (file) =>
      file.endsWith('.tsx') &&
      !/\.(test|stories)\.tsx$/.test(file) &&
      !file.includes(path.join('components', 'ui')),
  );

// Physical utilities that do NOT flip with the writing direction → use the logical twin
const PHYSICAL: [RegExp, string][] = [
  [/(?<![\w-])-?(?:ml|mr|pl|pr)-(?:\d|\[|px|auto)/, 'ml/mr/pl/pr → ms/me/ps/pe'],
  [/(?<![\w-])text-(?:left|right)(?![\w-])/, 'text-left/right → text-start/end'],
  [/(?<![\w-])-?(?:left|right)-(?:\d|\[|px|auto|full|1\/2)/, 'left-/right- → start-/end-'],
  [/(?<![\w-])border-(?:l|r)(?:-|(?![\w]))/, 'border-l/r → border-s/e'],
  [/(?<![\w-])rounded-(?:l|r|tl|tr|bl|br)(?:-|(?![\w]))/, 'rounded-l/r → rounded-s/e'],
  [/(?<![\w-])float-(?:left|right)/, 'float-left/right → float-start/end'],
];
// Directional icons must be mirrored in RTL
const DIRECTIONAL_ICON = /<(?:ChevronRight|ChevronLeft|ArrowRight|ArrowLeft)\b(?![^>]*rtl:)/;
const ARROW_CHARACTERS = /[←→]/;

describe('logical properties only (add `rtl-ok` on a line to allow a deliberate exception)', () => {
  it('no physical margin/padding/position/border/radius/float utilities', () => {
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (line.includes('rtl-ok')) return;
          for (const [pattern, hint] of PHYSICAL)
            if (pattern.test(line))
              offenders.push(`${file}:${index + 1}  ${hint}\n    ${line.trim()}`);
        });
    }
    expect(offenders, `\n${offenders.join('\n')}`).toEqual([]);
  });

  it('directional icons carry rtl:rotate-180 and no arrow characters are hard-coded', () => {
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (line.includes('rtl-ok')) return;
          if (DIRECTIONAL_ICON.test(line))
            offenders.push(`${file}:${index + 1}  add className="rtl:rotate-180"`);
          if (ARROW_CHARACTERS.test(line))
            offenders.push(`${file}:${index + 1}  use an icon with rtl:rotate-180 instead of ← →`);
        });
    }
    expect(offenders, `\n${offenders.join('\n')}`).toEqual([]);
  });
});
```

```bash
pnpm test src/styles/logical-properties.test.ts
```

Fix every offender it lists. Typical conversions: `ml-2 → ms-2`, `pr-4 → pe-4`, `text-left → text-start`, `left-2 → start-2`, `border-l → border-s`, `rounded-r-md → rounded-e-md`. The admin user page's literal `←` back-link becomes:

```tsx
<ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
```

(Vendored shadcn files under `components/ui` are excluded from the test — open them once, `git grep -nE "(ml|mr|pl|pr|left|right)-" src/components/ui`, and convert the few that remain.)

### 3. Prove it with a forced-RTL run

📄 **Edit `e2e/env.ts`** — append to `appEnv`:

```ts
  // Review mode (`pnpm e2e:rtl`): the direction is baked in at build time
  ...(process.env.E2E_RTL ? { NEXT_PUBLIC_FORCE_DIR: 'rtl' } : {}),
```

📄 **Edit `package.json`:** `"e2e:rtl": "cross-env E2E_RTL=1 playwright test e2e/rtl.spec.ts"` 📄 **Create `e2e/rtl.spec.ts`:**

```ts
import { expect, test } from './fixtures';

test.skip(
  !process.env.E2E_RTL,
  'Runs with E2E_RTL=1 (pnpm e2e:rtl): the direction is fixed at build time',
);

const PAGES = ['/', '/pricing', '/about', '/contact', '/sign-in', '/sign-up', '/terms'];

for (const path of PAGES) {
  for (const width of [1280, 360]) {
    test(`${path} @${width}px: direction is rtl and nothing overflows horizontally`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'horizontal scroll bar').toBeLessThanOrEqual(1);
    });
  }
}

test('the header is mirrored: brand on the right, navigation to its left', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const header = page.getByRole('banner');
  const brand = await header.getByRole('link').first().boundingBox();
  const pricing = await header.getByRole('link', { name: 'Pricing' }).boundingBox();
  expect(brand!.x).toBeGreaterThan(pricing!.x);
});

test('the signed-in shell does not overflow either', async ({ ownerPage, world }) => {
  for (const path of ['', '/projects', '/members']) {
    await ownerPage.goto(`/dashboard/${world.orgSlug}${path}`);
    await ownerPage.waitForLoadState('networkidle');
    const overflow = await ownerPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
```

📄 **Weekly safety net** — `.github/workflows/rtl.yml`:

```yaml
name: RTL review

on:
  schedule:
    - cron: '0 6 * * 2'
  workflow_dispatch:

permissions:
  contents: read

env:
  NEXT_PUBLIC_APP_NAME: SaaS Boilerplate
  BETTER_AUTH_SECRET: ci-only-secret-ci-only-secret-0123456789

jobs:
  rtl:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e:rtl
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: rtl-report
          path: |
            playwright-report
            test-results
```

### 4. Storybook gets a direction switch

📄 **Edit `.storybook/preview.tsx`:**

```tsx
import { DirectionProvider } from '@radix-ui/react-direction';

const withDirection: Decorator = (Story, context) => {
  const dir = (context.globals.direction ?? 'ltr') as 'ltr' | 'rtl';
  document.documentElement.dir = dir;
  return (
    <DirectionProvider dir={dir}>
      <Story />
    </DirectionProvider>
  );
};
// decorators: [..., withIntl, withDirection]
// globalTypes: add
    direction: {
      description: 'Text direction',
      toolbar: { title: 'Direction', icon: 'transfer', items: [{ value: 'ltr', title: 'Left to right' }, { value: 'rtl', title: 'Right to left' }], dynamicTitle: true },
    },
// initialGlobals: add  direction: 'ltr'
```

### 5. Document the recipe

📄 **Append to `docs/guides/i18n.md`:**

```markdown
## Right-to-left languages

Layout is built with logical properties (a test enforces it). To add Arabic/Hebrew:

1. Add the code to `routing.locales` (the direction map in `src/i18n/direction.ts` already knows `ar`, `he`, `fa`, `ur`).
2. Create the message file and run the checklist in _Adding a language_.
3. **Fonts:** Geist has no Arabic/Hebrew glyphs — add a `next/font` family for the script (e.g. Noto Sans Arabic) and apply it for that locale.
4. Review with `pnpm e2e:rtl` (forces `dir="rtl"` on every page) and the Storybook _Direction_ toolbar item.
5. Numerals, dates and plurals come from ICU/`Intl`; check them with a native speaker.
```

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm e2e:rtl          # 🪟 first run builds the app in RTL mode
```

1. `pnpm e2e:rtl` is green: every page is `dir="rtl"`, no horizontal overflow at 1280 and 360 px, the header mirrored.
2. **Look at it:** run `NEXT_PUBLIC_FORCE_DIR=rtl pnpm dev` (🪟 `set NEXT_PUBLIC_FORCE_DIR=rtl&& pnpm dev`) and click through home, sign-in, dashboard, a dropdown and a dialog: text aligns right, the sidebar/menus appear on the correct side, chevrons point the right way, keyboard arrows in menus follow the direction.
3. Add `className="ml-2"` to a component → the logical-properties test **fails** with the file and line; revert.
4. Storybook's _Direction_ toolbar flips the stories.
5. Remember to run the normal `pnpm e2e` afterwards — it rebuilds in LTR (the RTL flag was only in that process's environment).

**🚢 Ship** — branch `feat/s7-t12-rtl` · message: `feat(i18n): make the layout rtl-ready with logical properties, direction provider and a forced-rtl review run`

---

## 🎫 S7-T13 — Final theme and one brand config

**Branch:** `feat/s7-t13-theme-brand` · **Story:** US-078 · **3 SP**

> 🎯 The boilerplate's face: **minimalist, neutral, accessible**, with a one-line accent switch and a rebrand that takes **ten minutes**. Colours live in one file; the name lives in one config; a test stops either from leaking into the code.

```bash
git switch main && git pull && git switch -c feat/s7-t13-theme-brand
```

### 1. Tokens in their own file

📄 **Create `src/styles/theme.css`** — **move** the `:root { … }` and `.dark { … }` blocks out of `global.css` into this file _as they are_ (keep the `--chart-*` and `--sidebar-*` variables), then **set these values** (they are the ones the accessibility tests care about):

```css
/* Design tokens. Everything visual that a rebrand touches is in this file. */
:root {
  --radius: 0.5rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.5 0 0); /* ≥ 4.5:1 on background AND muted */
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.55 0.22 27);
  --border: oklch(0.922 0 0);
  --input: oklch(
    0.65 0 0
  ); /* ≥ 3:1 against the background: field edges are "UI components" (WCAG 1.4.11) */
  --ring: oklch(0.55 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(0.3 0 0);
  --input: oklch(0.5 0 0);
  --ring: oklch(0.6 0 0);
}

/* Accent presets: only what changes. Selected with NEXT_PUBLIC_ACCENT (neutral = no attribute). */
:root[data-accent='blue'] {
  --primary: oklch(0.488 0.243 264.376);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.488 0.243 264.376);
}
.dark[data-accent='blue'] {
  --primary: oklch(0.707 0.165 254.624);
  --primary-foreground: oklch(0.145 0 0);
  --ring: oklch(0.707 0.165 254.624);
}
:root[data-accent='green'] {
  --primary: oklch(0.527 0.154 150.069);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.527 0.154 150.069);
}
.dark[data-accent='green'] {
  --primary: oklch(0.723 0.219 149.579);
  --primary-foreground: oklch(0.145 0 0);
  --ring: oklch(0.723 0.219 149.579);
}
```

📄 **Edit `src/styles/global.css`:** `@import './theme.css';` right after `@import 'tailwindcss';` (the `@theme inline { … }` mapping stays where it is).

📄 **Add the field-edge check** to `src/styles/contrast.test.ts` → `PAIRS`: `['input', 'background', 3], // field borders (WCAG 1.4.11)` — and run it:

```bash
pnpm test src/styles/contrast.test.ts      # light, dark, and every accent in both modes
```

If an accent row fails, nudge that accent's lightness until it passes.

### 2. Accent switch and layout wiring

📄 **Edit `src/libs/Env.ts`** (`client` + `runtimeEnv`): `NEXT_PUBLIC_ACCENT: z.enum(['neutral', 'blue', 'green']).default('neutral'),` · `.env.example`: `NEXT_PUBLIC_ACCENT=neutral  # neutral | blue | green`. 📄 **Edit `src/app/[locale]/layout.tsx`:** on `<html>`: `data-accent={Env.NEXT_PUBLIC_ACCENT === 'neutral' ? undefined : Env.NEXT_PUBLIC_ACCENT}`. 📄 **Storybook** — add an _Accent_ toolbar global in `.storybook/preview.tsx` that sets `document.documentElement.dataset.accent` (same pattern as _Direction_).

### 3. A logo, used everywhere

📄 **Create `src/components/layout/logo.tsx`:**

```tsx
import { brand } from '@/config/brand';

/** A simple mark + the name. Replace the mark with your own SVG when you rebrand. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold ${className ?? ''}`}>
      <span
        aria-hidden
        className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-sm"
      >
        {brand.name.slice(0, 1).toUpperCase()}
      </span>
      <span>{brand.name}</span>
    </span>
  );
}
```

Use `<Logo />` in `site-header.tsx`, the auth layout and the app shell instead of the plain brand text.

### 4. One brand, enforced

📄 **Remove `common.appName`** from both message files (`git grep -n "common.appName" src` must return nothing), then:

📄 **Create `src/config/brand.test.ts`:**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

const DEFAULT_NAME = 'SaaS Boilerplate';
const ALLOWED = new Set([path.join('src', 'libs', 'Env.ts')]); // the default value lives here

it('the product name is never hard-coded: it comes from NEXT_PUBLIC_APP_NAME via brand.ts or {appName}', () => {
  const offenders = (readdirSync('src', { recursive: true }) as string[])
    .map((file) => path.join('src', file))
    .filter(
      (file) =>
        /\.(ts|tsx|json|css)$/.test(file) &&
        !/\.(test|stories)\.tsx?$/.test(file) &&
        !ALLOWED.has(file),
    )
    .filter((file) => readFileSync(file, 'utf8').includes(DEFAULT_NAME));

  expect(
    offenders,
    `Use brand.name / {appName} instead of the literal name in:\n${offenders.join('\n')}`,
  ).toEqual([]);
});
```

Fix whatever it finds (emails, error pages, metadata…): `brand.name` in code, `{appName}` in messages.

### 5. The ten-minute rebrand drill

📄 **Create `docs/guides/theming.md`:**

```markdown
# Theming and rebranding

## Where things live

| What | Where |
| --- | --- |
| Product name, URL, support email, social links | `.env` (`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`) + `src/config/brand.ts` |
| Colours, radius | `src/styles/theme.css` (OKLCH tokens, light + dark) |
| Accent colour | `NEXT_PUBLIC_ACCENT=neutral\|blue\|green` (presets in `theme.css`) |
| Logo mark | `src/components/layout/logo.tsx` |
| Favicon / app icon / OG image | `src/app/icon.tsx`, `apple-icon.tsx`, `src/libs/og.tsx` |
| Copy (hero, features, FAQ, legal, meta) | `src/locales/*.json` (`{appName}` is filled in automatically) |
| Fonts | `src/app/[locale]/layout.tsx` (`next/font`) |

## The 10-minute rebrand

1. `.env.local`: name, URL, support email, `NEXT_PUBLIC_ACCENT` — **1 min**
2. `src/config/brand.ts`: social links (leave out what you don't have) — **1 min**
3. Pick a colour: use a preset, or edit `--primary` / `--primary-foreground` / `--ring` in `theme.css` (both modes) — **3 min**
4. `logo.tsx`, `icon.tsx`, `apple-icon.tsx`: your mark — **3 min**
5. `pnpm test` — the **contrast test** tells you at once if your colour is unreadable; `brand.test.ts` finds leftover names — **1 min**
6. Skim `/`, `/pricing`, `/sign-in` in light and dark — **1 min** Then rewrite the copy in `en.json`/`fr.json` (not part of the 10 minutes) and add the `update-snapshots` label to regenerate the visual baselines.

## Rules

- Never write a colour literal in a component: use tokens (`bg-primary`, `text-muted-foreground`).
- A new accent = two blocks in `theme.css` + its name in `contrast.test.ts` and `Env.ts`.
```

**Do the drill for real**: change the name to something else, pick `blue`, change the logo letter — **time it**, write the minutes in `06-project-state.md` (target ≤ 10 for steps 1–6), then undo.

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check && pnpm build
```

1. `NEXT_PUBLIC_ACCENT=blue pnpm dev` → buttons, focus rings and links turn blue in light **and** dark; `green` likewise; `neutral` is the monochrome default.
2. Contrast tests green for all 8 combinations; the visible **input borders** are noticeably firmer than the default shadcn (that's WCAG 1.4.11 at work).
3. Rename the product via `.env.local` only → header, footer, titles, emails, OG image, manifest, JSON-LD and legal pages all show the new name (and **nothing** shows the old one).
4. Re-run the axe E2E spec: still zero blocking violations. Toggle theme: persists across reloads.
5. Open the PR and add the **`update-snapshots`** label: review the new baselines (home, pricing, about, footer, borders) — they should look deliberate, not accidental — then push the empty "re-run checks" commit.

**🚢 Ship** — branch `feat/s7-t13-theme-brand` · message: `feat(theme): finalise minimalist tokens with accent presets, logo and a single brand config`

---

## 🧾 Sprint 7 wrap-up

**Branch:** `docs/s7-wrap-up`

```bash
git switch main && git pull && git switch -c docs/s7-wrap-up
```

### 1. SEO guide for the people who add pages later

📄 **Create `docs/guides/seo.md`:**

```markdown
# SEO

## Adding a public page

1. Create it under `src/app/[locale]/(marketing)/…` as a **static** server component (`setRequestLocale(locale)`; no `headers()`/`cookies()`).
2. Strings in both message files, plus `meta.<key>.title|description`.
3. `export async function generateMetadata` → `siteMetadata({ locale, key, path })` (`legal: true` for legal pages, `noindex: true` for utility pages).
4. Add it to `PUBLIC_PAGES` in `src/config/site.ts` (sitemap) — private areas go in `PRIVATE_PREFIXES` instead.
5. Structured data? Add a builder in `src/libs/json-ld.ts` (+ test) and render `<JsonLd />`.
6. Add the path to `e2e/a11y.spec.ts` and, if it matters visually, `e2e/visual/pages.visual.ts`.

## Switches

`SITE_INDEXING` (true in production **only**) · `LEGAL_NOINDEX` (false only after legal review) · `NEXT_PUBLIC_APP_URL` (canonical base).

## Checks

Unit: `seo.test.ts` (canonical/hreflang symmetry), `sitemap.test.ts`, `json-ld.test.ts`. E2E: `e2e/seo.spec.ts`. Manual on a deployed preview: Rich Results Test, Facebook/LinkedIn debuggers, Search Console (after launch).
```

### 2. Update `AGENTS.md`

**Commands:** `pnpm lighthouse`, `pnpm e2e:rtl`. **Conventions:**

```markdown
- Public marketing pages must stay STATIC (no headers()/cookies()); metadata via `siteMetadata`, JSON-LD via `src/libs/json-ld.ts`.
- Brand name only via `brand.name` / `{appName}` — never the literal; colours only via tokens in `src/styles/theme.css`.
- Layout uses LOGICAL properties (`ms-`, `pe-`, `text-start`…) — physical ones fail `logical-properties.test.ts`; directional icons get `rtl:rotate-180`.
- Toasts only through `notify` (`src/libs/notify.ts`); loading UI = `loading.tsx` + skeletons; empty lists = `EmptyState`.
- New page or component → check it with axe (`e2e/a11y.spec.ts`) and keep contrast tokens passing (`contrast.test.ts`).
- Performance budgets are enforced by Lighthouse CI (`lighthouserc.json`): don't import heavy libraries into marketing pages; lazy-load what isn't needed for first paint.
- Translations: edit `en.json` + `fr.json` together; Crowdin syncs via PR (`i18n:check` guards it).
```

```bash
pnpm check:agents
```

### 3. Update `docs/roadmap/06-project-state.md`

- **Last completed sprint:** Sprint 7 · **Current sprint:** Sprint 8
- **New env vars:** `NEXT_PUBLIC_SUPPORT_EMAIL`, `SITE_INDEXING`, `LEGAL_NOINDEX`, `NEXT_PUBLIC_FORCE_DIR`, `NEXT_PUBLIC_ACCENT`
- **New routes/files:** `/pricing`, `/about`, `/terms`, `/privacy`, `/cookies`, `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, generated icons and OG images
- **Measured (fill in):** Lighthouse before → after (perf/a11y/best-practices/SEO, LCP, CLS, TBT, JS KB) · axe result (0 blocking) · React Compiler decision · rebrand drill minutes · Sentry bundle cost
- **Decisions:** Cache Components not adopted; legal pages are `noindex` templates; Sentry initialised early
- **Debt:** `TD-09` outcome, translated legal text needs lawyer review, Arabic fonts not bundled, a11y advisories list (moderate/minor)

Tick the checkboxes in `docs/roadmap/sprint-07-seo-marketing-perf.md`, then:

```bash
pnpm check
git add -A
git commit -m "docs: add seo guide and update project state for sprint 7"
git push -u origin docs/s7-wrap-up
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
git tag -a v0.8.0-beta -m "chore: sprint 7 complete — 0.8 beta (seo, marketing, performance, accessibility)"
git push origin v0.8.0-beta
```

---

## 🏁 Sprint 7 — Definition of Done

- [ ] Home, pricing, about, contact and legal templates exist in **en and fr**, statically generated, with unique titles/descriptions
- [ ] Contact form sends email with Reply-To; honeypot and rate limit work; no header/HTML injection (tests)
- [ ] Canonical + **symmetric hreflang**, Open Graph/Twitter tags, valid **JSON-LD** (Organization, WebSite, SoftwareApplication, FAQPage, breadcrumbs), OG images, `sitemap.xml`, `robots.txt`, manifest and icons
- [ ] `SITE_INDEXING` and `LEGAL_NOINDEX` behave as designed (robots/sitemap/meta all agree); private areas always `noindex`
- [ ] Crowdin config + sync workflow; `i18n:check` guards incoming translations; i18n guide covers adding a language
- [ ] Every data-loading route has a skeleton; empty lists use `EmptyState`; toasts only via `notify`
- [ ] **Lighthouse CI blocking**: performance ≥ 95 (marketing), accessibility/best-practices/SEO ≥ 95, LCP ≤ 2.5 s, CLS ≤ 0.05, TBT ≤ 200 ms, JS within budget — **with a recorded before/after**
- [ ] Production assets verified: minified, content-hashed, immutable-cached, compressed, no source maps
- [ ] React Compiler measured and the decision (with numbers) recorded as TD-09
- [ ] axe: **zero** serious/critical violations (public + signed-in, light/dark, en/fr); skip link; reduced motion; contrast tests pass for every theme and accent
- [ ] RTL: logical-properties test green, `pnpm e2e:rtl` green, Storybook direction switch
- [ ] Minimalist theme finalised, accent presets, one `brand.ts`; **10-minute rebrand drill timed**
- [ ] `docs/guides/{performance,accessibility,seo,theming}.md` written; `06-project-state.md` updated; tag `v0.8.0-beta`

### 🎬 Sprint review — measurable acceptance

| Check | Expected |
| --- | --- |
| `pnpm lighthouse` | all four pages meet the budgets; reports in `.lighthouseci/` |
| View-source of `/fr/pricing` | canonical = itself, hreflang `en`/`fr`/`x-default`, OG + Twitter tags |
| Rich Results Test on `/` | Organization + FAQ detected, no errors |
| `GET /robots.txt`, `/sitemap.xml` | private areas disallowed; both languages listed; legal absent |
| axe (CI) | 0 serious/critical on every scanned page |
| `pnpm e2e:rtl` | green: mirrored, no horizontal scroll |
| Rename the product in `.env.local` | the new name everywhere, the old name nowhere |
| Add `ml-2` to a component | `logical-properties.test.ts` fails |
| Delete a French translation | `i18n:check` fails |

---

## 🧯 Troubleshooting (Sprint 7)

| Symptom | Likely cause → fix |
| --- | --- |
| A marketing page shows as `ƒ` (dynamic) in the build output | Something reads `headers()`/`cookies()`/`searchParams` — typically a layout calling a session helper; keep marketing layouts free of it, and call `setRequestLocale(locale)` |
| `og:image` URL 404s on `/` or `/fr` | The metadata image route and next-intl's rewrite disagree → follow next-intl's note on metadata routes; the E2E "OG image renders" test catches it |
| `robots.txt` says `Disallow: /` in production | `SITE_INDEXING` isn't `true` in the production environment |
| Pages `noindex` after enabling indexing | Legal pages: `LEGAL_NOINDEX=true` by design; auth/app pages are always `noindex` |
| Lighthouse "Best practices" < 95 | Console errors (a vendor key set during the run), or deprecated APIs. The script blanks Sentry/PostHog; check the report's _Issues_ |
| Lighthouse scores differ run to run | Expected ±3; the median of 3 runs is used. Close other heavy programs; compare in CI |
| `pnpm lighthouse` can't find Chrome | 🪟 `set CHROME_PATH=…chrome.exe`; or run it in CI/WSL |
| Servers keep running after Lighthouse failed | 🪟 `taskkill /F /IM node.exe` (careful: kills all Node) or find the PIDs with `netstat -ano \| findstr :3100` |
| `posthog-js` still in the initial bundle | A static import remains (`git grep "from 'posthog-js'" src` → only `client.ts` via dynamic `import()`); re-check the analyzer |
| axe: `color-contrast` fails in dark mode only | A token pair (the contrast test names it) or a hard-coded colour in a component |
| axe: `region`/`heading-order` advisories | Not blocking; fix when convenient (landmark wrapping, heading levels) |
| Consent banner appears in axe/visual runs | The consent cookie isn't set in that context (fixtures add it) |
| `logical-properties.test.ts` flags third-party class strings | Add `// rtl-ok` on that line with a reason, or move the code into `components/ui` |
| `pnpm e2e:rtl` shows LTR | The env var didn't reach the **build** (`E2E_RTL=1` must be in the same command) — PowerShell/cmd syntax differs: use `cross-env` (already in the script) |
| Crowdin PR never gets CI checks | PRs opened with the default `GITHUB_TOKEN` don't trigger workflows → set `CROWDIN_PR_TOKEN` (PAT) |
| Visual diffs everywhere after theming | Expected: add `update-snapshots`, review the images, re-run checks |
| `brand.test.ts` finds the old name in an email template | Use `Env.NEXT_PUBLIC_APP_NAME`/`brand.name` there too |

---

## ➡️ Next

Sprint 7 complete → **Sprint 8 — Release & launch** (`docs/roadmap/sprint-08-release-launch.md`): Semantic Release and the changelog, deployment to Vercel + Neon, production hardening checks, final documentation, the "template-ready" cleanup, and the 1.0 launch checklist. Same format: one branch per ticket, verify, PR, merge.
