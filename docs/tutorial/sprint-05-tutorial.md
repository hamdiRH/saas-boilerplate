# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 5 — Quality & Testing Maturity

> Companion to `docs/roadmap/sprint-05-quality-testing.md`. Every `S5-Txx` section is one ticket. Tickets follow the sprint file's order.
> This sprint adds **no product features**. It turns a working MVP into a **regression-proof** codebase: Storybook, visual regression, coverage gates, a fast parallel CI, reusable test infrastructure and a security regression suite.

🪟 **Windows + Cmder:** use the **Git Bash tab**. One rule matters more than ever this sprint: **visual baselines are never generated on Windows** (see the decisions table). Windows-specific notes are marked 🪟.

> ⚠️ **About versions.** Storybook (framework + addons), Codecov, Playwright screenshot options and `@lingual/i18n-check` move fast. Spots likely to differ are marked **🔍 Verify against docs**.

---

## 📋 What you will have at the end

- **Storybook** with a11y checks, a theme switcher and an en/fr switcher — 15+ stories of our real components
- An **isolated E2E stack** (own database on port 5434, own app on port 3100) and **ready-made sessions per role** (`storageState`) — E2E tests stop signing in through the UI
- **Visual regression** for 8 key pages × light/dark × en/fr × desktop/mobile — baselines produced by **CI on Linux**
- **Coverage thresholds** enforced + **Codecov**
- **CI in parallel jobs** with caches, E2E sharding, build-artifact reuse, a bundle-size budget and a single required check (`CI OK`)
- **i18n-check** (missing / invalid keys) as a gate
- An **authorization matrix test** that runs the *real* Server Actions against a real (in-memory) database for every role — and **fails when a new action isn't covered**
- IDOR / injection / mass-assignment regression tests, and component tests that raise coverage on forms, auth, org and account UI

## 🧭 Decisions & deviations (made once, here)

| Topic | Decision | Why |
|---|---|---|
| Visual baselines | Generated **only by CI** (Linux) through a manual workflow | Fonts/anti-aliasing differ between Windows, macOS and Linux → diffs on every machine (risk **R-09**). A Docker recipe is given for Linux/macOS developers |
| E2E stack | Dedicated ports **3100 / 5434**, data dir `./local.e2e.db`, started by Playwright in **local and CI alike** | Tests can't pollute your dev database, and "works locally" == "works in CI". Local runs use a production build (`E2E_DEV=1` switches to the dev server) |
| Authz matrix | A **real integration test**: the global DB module is swapped for an in-memory database, then the real actions and real Better Auth run | Mocks would test the mocks; this tests the wiring |
| Coverage thresholds | **Ratchet**: measure first, set just below, raise in S5-T13 | A threshold nobody can meet gets disabled |
| Bundle budget | Total **gzipped JS + CSS** from `.next/static`, compared with a committed budget | Next 16's build output no longer lists per-route *First Load JS* 🔍 |
| Unused translation keys | `i18n-check` **missing + invalid** keys block; **unused** keys are report-only | We build keys dynamically (`t(\`strength.${x}\`)`, Zod messages, error maps) — static analysis can't see them |
| Schema drift | Weekly scheduled workflow, not on every PR | Needs the Better Auth CLI download; flaky networks shouldn't block merges |
| Storybook | `@storybook/nextjs-vite`; Server Actions and the auth client are **stubbed** | Stories must not hit servers; `'use server'` modules don't belong in a browser bundle |

---

## 🔀 Git workflow (PR-based)

```bash
git switch main && git pull
git switch -c <type>/s5-tXX-<slug>
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
Each ticket ends with a **🚢 Ship** line. Run `pnpm pin` after adding dependencies. **S5-T08 rewrites the CI workflow** — if you open its PR while others are in flight, expect to rebase.

---

## ✅ Before you start

```bash
git switch main && git pull
pnpm install
pnpm check              # Sprint 4 must be green
CI=1 pnpm e2e           # 🪟 cmd.exe: set CI=1&& pnpm e2e  — also green (stop `pnpm dev` first)
```
Set **Current sprint: Sprint 5** in `docs/roadmap/06-project-state.md` and **write down the baselines you will improve**: total `pnpm e2e` time, PR CI time (GitHub → Actions), `pnpm test:coverage` totals (you'll have them after S5-T07).

---

## 🎫 S5-T01 — Storybook setup

**Branch:** `chore/s5-t01-storybook` · **Story:** US-050 · **3 SP** · 🔍 Read the Storybook docs for **Next.js + Vite** first

```bash
git switch -c chore/s5-t01-storybook
pnpm add -D storybook @storybook/nextjs-vite @storybook/addon-a11y @storybook/addon-themes
mkdir -p .storybook/stubs
```
> 🔎 We write the config by hand instead of running `storybook init`: the wizard edits many files (and may re-add scripts/ESLint pieces we removed in Sprint 0). If you prefer the wizard, run it on a throw-away branch and copy the result.

### 1. Main config

📄 **Create `.storybook/main.ts`:**
```ts
import path from 'node:path';

import type { StorybookConfig } from '@storybook/nextjs-vite';

const stub = (name: string) => path.resolve(import.meta.dirname, 'stubs', name);

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-themes'],
  framework: '@storybook/nextjs-vite',
  staticDirs: ['../public'],

  viteFinal: async (viteConfig) => {
    // Stories never talk to servers: Server Actions and the auth client are replaced by stubs
    const stubs = [
      { find: /^@\/actions\/.*$/, replacement: stub('actions.ts') },
      { find: '@/libs/AuthClient', replacement: stub('auth-client.ts') },
    ];
    const existing = viteConfig.resolve?.alias;
    const current = Array.isArray(existing)
      ? existing
      : Object.entries(existing ?? {}).map(([find, replacement]) => ({ find, replacement }));

    viteConfig.resolve = { ...viteConfig.resolve, alias: [...stubs, ...current] };
    return viteConfig;
  },
};

export default config;
```

### 2. Stubs

📄 **Create `.storybook/stubs/auth-client.ts`:**
```ts
// A permissive fake: any call such as authClient.signIn.email(...) resolves to "nothing happened".
const noop = async () => ({ data: null, error: null });

const deep: object = new Proxy(noop, {
  // `then` must be undefined, otherwise `await authClient.x` would treat the proxy as a thenable
  get: (_target, property) => (property === 'then' ? undefined : deep),
});

export const authClient = deep;
```
📄 **Create `.storybook/stubs/actions.ts`** — one stub per Server Action name that components import:
```ts
const ok = async () => ({ ok: true as const, data: {} });

export const submitContact = ok;
export const changePassword = ok;
export const revokeSession = ok;
export const revokeOtherSessions = ok;
export const deletePasskey = ok;
export const createProject = ok;
export const updateProject = ok;
export const deleteProject = ok;
export const deleteOrganization = ok;
export const updateMemberRole = ok;
export const removeMember = ok;
export const leaveOrganization = ok;
export const transferOwnership = ok;
export const banUser = ok;
export const unbanUser = ok;
export const revokeUserSessions = ok;
export const setUserRole = ok;
export const startImpersonation = ok;
export const stopImpersonation = ok;
```
> When you add a Server Action, add its name here — the authz-matrix meta-test in S5-T11 will remind you for the real registry; Storybook will simply fail to build if a story imports a missing name.

### 3. Preview: global CSS, theme, language

📄 **Create `.storybook/preview.tsx`:**
```tsx
import { withThemeByClassName } from '@storybook/addon-themes';
import type { Decorator, Preview } from '@storybook/nextjs-vite';
import { NextIntlClientProvider } from 'next-intl';

import en from '../src/locales/en.json';
import fr from '../src/locales/fr.json';
import '../src/styles/global.css';

const messages = { en, fr } as const;

// Every story gets the translations of the language chosen in the toolbar
const withIntl: Decorator = (Story, context) => {
  const locale = (context.globals.locale ?? 'en') as keyof typeof messages;
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <Story />
    </NextIntlClientProvider>
  );
};

const preview: Preview = {
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light' }),
    withIntl,
  ],
  globalTypes: {
    locale: {
      description: 'Language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'fr', title: 'Français' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: 'en' },
  parameters: {
    layout: 'centered',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // Accessibility violations FAIL a story (relax per story with a comment if truly needed)
    a11y: { test: 'error' },
  },
};

export default preview;
```

### 4. Scripts and tool config

📄 **Edit `package.json`:**
```json
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build"
```
📄 **Edit `.oxlintrc.json`** — Storybook files use default exports by convention; extend the overrides block:
```json
{
  "files": ["**/*.stories.tsx", ".storybook/**"],
  "rules": {}
}
```
(Add whatever rule names your Ultracite version flags for default exports/`any`-free stubs — **never** relax `no-explicit-any`.)

📄 **Edit `knip.config.ts`** — the stubs are referenced by alias strings, which Knip can't see:
```ts
  entry: [
    // …existing…
    '.storybook/stubs/*.ts',
  ],
```
📄 **Edit `.gitignore`:** add `storybook-static`.

### 5. A first story to prove the pipeline

📄 **Create `src/components/ui/button.stories.tsx`:**
```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from './button';

const meta = {
  title: 'UI/Button',
  component: Button,
  args: { children: 'Save changes' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete' } };
export const Disabled: Story = { args: { disabled: true } };
```

### ✅ Verify
```bash
pnpm storybook                 # http://localhost:6006
```
- The Button stories render with Tailwind styles. **Theme** and **Language** switchers appear in the toolbar.
- Open the **Accessibility** panel: no violations.
```bash
pnpm build-storybook           # must succeed (also run by CI in S5-T08)
pnpm check                     # lint, knip, types still green
```
🪟 If port 6006 is busy: `pnpm storybook -- -p 6010`.

**🚢 Ship** — branch `chore/s5-t01-storybook` · message: `chore(ui): add storybook with a11y, theme and locale switchers`

---

## 🎫 S5-T02 — Stories for the core UI (15+)

**Branch:** `test/s5-t02-stories` · **Story:** US-050 · **2 SP**

```bash
git switch main && git pull && git switch -c test/s5-t02-stories
```

> 🎯 Every story shows a **state a user can meet**: default, error, empty, long text, French, dark. If a component can't be rendered in Storybook without a server, extract a presentational piece or stub the dependency — never call a real backend from a story.

### 1. Forms

📄 **Create `src/components/forms/forms.stories.tsx`:**
```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { PasswordField } from '@/components/forms/password-field';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Form } from '@/components/ui/form';

/** Fields need an RHF context: this shell provides one (and can pre-set an error). */
function FormShell({ children, error }: { children: ReactNode; error?: { field: string; message: string } }) {
  const form = useForm({ defaultValues: { email: '', password: '' } });
  useEffect(() => {
    if (error) form.setError(error.field as 'email', { message: error.message });
  }, [error, form]);
  return (
    <Form {...form}>
      <form className="w-80 space-y-4">{children}</form>
    </Form>
  );
}

const meta = { title: 'Forms/Fields', component: FormShell } satisfies Meta<typeof FormShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {
  render: () => (
    <FormShell>
      <TextField name="email" label="Email" type="email" />
    </FormShell>
  ),
};

/** Zod messages are i18n KEYS — the field translates them. Switch the toolbar to Français. */
export const TextWithError: Story = {
  render: () => (
    <FormShell error={{ field: 'email', message: 'validation.email' }}>
      <TextField name="email" label="Email" type="email" />
    </FormShell>
  ),
};

export const Password: Story = {
  render: () => (
    <FormShell>
      <PasswordField name="password" label="Password" />
    </FormShell>
  ),
};

export const PasswordWithError: Story = {
  render: () => (
    <FormShell error={{ field: 'password', message: 'validation.passwordComplexity' }}>
      <PasswordField name="password" label="Password" />
    </FormShell>
  ),
};

export const Submit: Story = {
  render: () => (
    <FormShell>
      <SubmitButton>Create account</SubmitButton>
    </FormShell>
  ),
};
```

### 2. Auth widgets

📄 **Create `src/components/auth/auth.stories.tsx`:**
```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

import { PasswordStrength } from '@/components/auth/password-strength';
import { SocialButtons } from '@/components/auth/social-buttons';

function Strength({ value }: { value: string }) {
  const form = useForm({ defaultValues: { password: '' } });
  useEffect(() => form.setValue('password', value), [form, value]);
  return (
    <FormProvider {...form}>
      <div className="w-72">
        <PasswordStrength name="password" />
      </div>
    </FormProvider>
  );
}

const meta = { title: 'Auth/Widgets', component: Strength } satisfies Meta<typeof Strength>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StrengthWeak: Story = { args: { value: 'password' } };
export const StrengthFair: Story = { args: { value: 'Password1234' } };
export const StrengthStrong: Story = { args: { value: 'Str0ng-Passw0rd-Is-Long!' } };

const providers = [
  { id: 'google' as const, label: 'Google' },
  { id: 'github' as const, label: 'GitHub' },
  { id: 'facebook' as const, label: 'Facebook' },
];

export const SocialAll: Story = {
  render: () => (
    <div className="w-72">
      <SocialButtons providers={providers} callbackUrl="/dashboard" errorCallbackUrl="/sign-in" />
    </div>
  ),
};

export const SocialGithubOnly: Story = {
  render: () => (
    <div className="w-72">
      <SocialButtons providers={providers.slice(1, 2)} callbackUrl="/dashboard" errorCallbackUrl="/sign-in" />
    </div>
  ),
};
```

### 3. Account and security

📄 **Create `src/components/account/account.stories.tsx`:**
```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BackupCodes } from '@/components/account/backup-codes';
import { SecurityScore } from '@/components/account/security-score';

const meta = { title: 'Account/Security', component: SecurityScore } satisfies Meta<typeof SecurityScore>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ScoreOneOfThree: Story = { args: { emailVerified: true, twoFactorEnabled: false, passkeyCount: 0 } };
export const ScoreTwoOfThree: Story = { args: { emailVerified: true, twoFactorEnabled: true, passkeyCount: 0 } };
export const ScoreAll: Story = { args: { emailVerified: true, twoFactorEnabled: true, passkeyCount: 2 } };

export const BackupCodesList: Story = {
  render: () => (
    <div className="w-96">
      <BackupCodes
        onDone={() => undefined}
        codes={['a1b2c-d3e4f', 'g5h6i-j7k8l', 'm9n0o-p1q2r', 's3t4u-v5w6x', 'y7z8a-b9c0d', 'e1f2g-h3i4j']}
      />
    </div>
  ),
};
```

### 4. Layout

📄 **Create `src/components/layout/layout.stories.tsx`:**
```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ErrorView } from '@/components/layout/error-view';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { PageHeader } from '@/components/layout/page-header';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';

const meta = { title: 'Layout/Pieces', component: PageHeader } satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Header: Story = { args: { title: 'Projects', description: 'Work in this organization.' } };

export const HeaderWithActions: Story = {
  args: { title: 'Projects', description: 'Work in this organization.', actions: <Button>New project</Button> },
  parameters: { layout: 'padded' },
};

export const HeaderLongText: Story = {
  args: {
    title: 'A really long organization name that keeps going and going and going',
    description: 'Long descriptions must wrap instead of overflowing the layout, even on small screens.',
  },
  parameters: { layout: 'padded' },
};

export const Theme: Story = { render: () => <ThemeToggle /> };
export const Locales: Story = { render: () => <LocaleSwitcher /> };

export const ErrorWithReference: Story = { render: () => <ErrorView digest="abc123" onRetry={() => undefined} /> };
export const ErrorPlain: Story = { render: () => <ErrorView /> };
```

### 5. Organizations

📄 **Create `src/components/org/org.stories.tsx`:**
```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MembersTable } from '@/components/org/members-table';
import { OrgSwitcher } from '@/components/org/org-switcher';
import { PendingInvitations } from '@/components/org/pending-invitations';

const members = [
  { memberId: 'm1', name: 'Olivia Owner', email: 'olivia@example.com', role: 'owner', joinedAt: '2026-01-10T10:00:00Z' },
  { memberId: 'm2', name: 'Adam Admin', email: 'adam@example.com', role: 'admin', joinedAt: '2026-02-01T10:00:00Z' },
  { memberId: 'm3', name: 'Mia Member', email: 'mia@example.com', role: 'member', joinedAt: '2026-03-15T10:00:00Z' },
];

const meta = { title: 'Org/Members', component: MembersTable, parameters: { layout: 'padded' } } satisfies Meta<typeof MembersTable>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The same table, three viewpoints: what each role is allowed to do changes the controls. */
export const AsOwner: Story = { args: { orgSlug: 'acme', members, currentMemberId: 'm1', actorRole: 'owner' } };
export const AsAdmin: Story = { args: { orgSlug: 'acme', members, currentMemberId: 'm2', actorRole: 'admin' } };
export const AsMember: Story = { args: { orgSlug: 'acme', members, currentMemberId: 'm3', actorRole: 'member' } };

export const Switcher: Story = {
  render: () => (
    <OrgSwitcher
      organizations={[
        { id: '1', name: 'Acme Inc', slug: 'acme' },
        { id: '2', name: 'Second Company', slug: 'second' },
      ]}
    />
  ),
};

export const InvitationsEmpty: Story = {
  render: () => <PendingInvitations organizationId="1" canManage invitations={[]} />,
  parameters: { layout: 'padded' },
};

export const InvitationsPending: Story = {
  render: () => (
    <PendingInvitations
      organizationId="1"
      canManage
      invitations={[
        { id: 'i1', email: 'new@example.com', role: 'member', expiresAt: '2099-01-01T00:00:00Z' },
        { id: 'i2', email: 'late@example.com', role: 'admin', expiresAt: '2020-01-01T00:00:00Z' },
      ]}
    />
  ),
  parameters: { layout: 'padded' },
};
```

### ✅ Verify
```bash
pnpm storybook
```
- Count them: **Button 5 + Fields 5 + Auth 5 + Account 4 + Layout 7 + Org 7 = 33 stories** (≥ 15 ✓).
- Click through **dark** and **Français** on each; long text must wrap; no horizontal overflow at the "Mobile" viewport.
- The **Accessibility** panel shows **0 violations**. If a violation is real (e.g. low contrast in dark mode), **fix the component or theme token** — only downgrade a story with `parameters: { a11y: { test: 'todo' } }` plus a comment and a `TD-` entry.
```bash
pnpm build-storybook && pnpm check
```

**🚢 Ship** — branch `test/s5-t02-stories` · message: `test(ui): add 33 stories for forms, auth, account, layout and org components`

---

## 🎫 S5-T03 — Factories and a standard test "world"

**Branch:** `test/s5-t03-factories-world` · **Story:** US-054 · **3 SP**

> 🎯 Sprints 2–4 each hand-built their own users, organizations and cookies. This ticket creates **one** way to do it, so the security suites (S5-T11/T12) can share the same cast of characters.

```bash
git switch main && git pull && git switch -c test/s5-t03-factories-world
```

### 1. Factories

📄 **Create `tests/factories/org.factory.ts`:**
```ts
import { randomUUID } from 'node:crypto';

import type { invitation, member, organization, project } from '@/db/schema';

import { defineFactory, faker } from './factory';

export const orgFactory = defineFactory<typeof organization.$inferInsert>((n) => ({
  id: randomUUID(),
  name: faker.company.name(),
  slug: `org-${n}-${faker.string.alphanumeric(5).toLowerCase()}`,
}));

type MemberInsert = typeof member.$inferInsert;
export const memberFactory = (input: Pick<MemberInsert, 'organizationId' | 'userId'> & Partial<MemberInsert>): MemberInsert => ({
  id: randomUUID(),
  role: 'member',
  ...input,
});

type ProjectInsert = typeof project.$inferInsert;
export const projectFactory = (input: Pick<ProjectInsert, 'organizationId'> & Partial<ProjectInsert>): ProjectInsert => ({
  id: randomUUID(),
  name: faker.commerce.productName(),
  ...input,
});

type InvitationInsert = typeof invitation.$inferInsert;
export const invitationFactory = (
  input: Pick<InvitationInsert, 'organizationId' | 'inviterId'> & Partial<InvitationInsert>,
): InvitationInsert => ({
  id: randomUUID(),
  email: faker.internet.email().toLowerCase(),
  role: 'member',
  status: 'pending',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ...input,
});
```

### 2. Session helpers

📄 **Append to `tests/utils/auth.ts`:**
```ts
import { eq } from 'drizzle-orm';

import { user } from '@/db/schema';

import type { TestDb } from './test-db';

let counter = 0;
export const uniqueTestEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${++counter}@example.com`;

/** A verified user with a live session. `headers` carry its cookies. */
export async function createUserWithSession(
  { db, auth, transport }: { db: TestDb; auth: TestAuth; transport: MemoryTransport },
  email = uniqueTestEmail(),
) {
  await signUpAndVerify(auth, transport, email);
  const [row] = await db.select().from(user).where(eq(user.email, email));
  const { headers } = await signIn(auth, email);
  return { id: row!.id, email, headers };
}
```

### 3. The standard world

📄 **Create `tests/utils/world.ts`:**
```ts
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { createOrganizationWithOwner } from '@/data/org-queries';
import { createTenantDb } from '@/data/tenant-db';
import { member, user } from '@/db/schema';
import type { MemoryTransport } from '@/libs/email/memory-transport';

import { memberFactory } from '../factories/org.factory';

import { createUserWithSession, signIn, type TestAuth } from './auth';
import type { TestDb } from './test-db';

/**
 * Two organizations, one user per role, a platform admin and two outsiders.
 *
 *   org-a: ownerA (owner) · adminA (admin) · memberA (member)       + 2 projects
 *   org-b: ownerB (owner)                                           + 1 project
 *   outsider = signed in, member of NOTHING we care about · platformAdmin = platform role 'admin'
 *
 * Every person has real cookies (`headers`) so tests can call the real auth/actions.
 */
export const WORLD_ROLES = ['ownerA', 'adminA', 'memberA', 'ownerB', 'outsider', 'platformAdmin'] as const;
export type WorldRole = (typeof WORLD_ROLES)[number];

export async function buildWorld(context: { db: TestDb; auth: TestAuth; transport: MemoryTransport }) {
  const { db } = context;

  const people = {} as Record<WorldRole, Awaited<ReturnType<typeof createUserWithSession>>>;
  for (const role of WORLD_ROLES) {
    people[role] = await createUserWithSession(context, `${role.toLowerCase()}-${randomUUID().slice(0, 6)}@example.com`);
  }
  // The role must exist BEFORE the session is created: Better Auth's cookie cache would keep serving the
  // old role. So: promote, then sign in again to obtain fresh cookies.
  await db.update(user).set({ role: 'admin' }).where(eq(user.id, people.platformAdmin.id));
  people.platformAdmin = {
    ...people.platformAdmin,
    headers: (await signIn(context.auth, people.platformAdmin.email)).headers,
  };

  const orgA = await createOrganizationWithOwner(db, { name: 'Org A', slug: 'org-a', ownerId: people.ownerA.id });
  const orgB = await createOrganizationWithOwner(db, { name: 'Org B', slug: 'org-b', ownerId: people.ownerB.id });
  await db.insert(member).values([
    memberFactory({ organizationId: orgA.id, userId: people.adminA.id, role: 'admin' }),
    memberFactory({ organizationId: orgA.id, userId: people.memberA.id, role: 'member' }),
  ]);

  const repoA = createTenantDb(db, orgA.id).projects;
  const repoB = createTenantDb(db, orgB.id).projects;
  const projects = {
    a: [await repoA.create({ name: 'A one' }, people.ownerA.id), await repoA.create({ name: 'A two' }, people.ownerA.id)],
    b: [await repoB.create({ name: 'B secret' }, people.ownerB.id)],
  };

  return { orgA, orgB, people, projects };
}

export type World = Awaited<ReturnType<typeof buildWorld>>;
```
> Personal workspaces are also created for these users (the Better Auth hook runs). That's fine — the world's two named organizations are what the security tests target.

### 4. A test using the world (and proving it works)

📄 **Create `tests/utils/world.test.ts`:**
```ts
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createAuth } from '@/libs/Auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import { createTestDb, type TestDb } from './test-db';
import { buildWorld, type World } from './world';

let db: TestDb;
let destroy: () => Promise<void>;
let world: World;
const transport = new MemoryTransport();

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
  const auth = createAuth(db);
  setEmailTransport(transport);
  world = await buildWorld({ db, auth, transport });
}, 90_000);
afterAll(async () => {
  setEmailTransport(undefined);
  await destroy();
});

it('builds a complete cast: real sessions, two tenants, projects', async () => {
  expect(Object.keys(world.people)).toHaveLength(6);
  for (const person of Object.values(world.people)) expect(person.headers.get('cookie')).toContain('session_token');
  expect(world.projects.a).toHaveLength(2);
  expect(world.projects.b).toHaveLength(1);
  expect(world.orgA.slug).toBe('org-a');
});
```

### 5. Document it

📄 **Replace `docs/guides/testing.md`:**
````markdown
# Testing

| Command | What it runs |
|---|---|
| `pnpm test` | Unit + integration tests (node, in-memory PGlite) |
| `pnpm test:browser` | Component tests in real Chromium |
| `pnpm test:coverage` | Both, with coverage thresholds |
| `pnpm e2e` | End-to-end (own database + own app, ports 5434/3100) |
| `pnpm e2e:visual` | Screenshot comparison against committed baselines |
| `pnpm storybook` | Component workshop (a11y checks included) |

## Building blocks
- **Factories** `tests/factories/*` — `userFactory`, `orgFactory`, `memberFactory`, `projectFactory`, `invitationFactory`.
- **`createTestDb()`** — fresh in-memory Postgres with all migrations.
- **`createUserWithSession()` / `signIn()`** — real users with real cookies.
- **`buildWorld()`** — two organizations, one user per role, a platform admin, projects. Use it for anything about permissions.
- **E2E personas** — `ownerPage`, `adminPage`, `memberPage`, `platformAdminPage` fixtures start already signed in.

## Rules
- A new permission/action/route that touches tenant data → extend the world-based suites (`tests/security/*`).
- No arbitrary sleeps. Wait for a condition (`expect.poll`, `vi.waitFor`, Playwright auto-waiting).
- UI sign-in happens **only** in `e2e/auth*.spec.ts`; every other spec uses persona fixtures.
- Visual baselines come from CI — never commit screenshots made on your own machine.
````

### ✅ Verify
```bash
pnpm test && pnpm check
```
`world.test.ts` takes a few seconds (six sign-ups + sign-ins with real password hashing). Note the duration in `06-project-state.md`.

**🚢 Ship** — branch `test/s5-t03-factories-world` · message: `test: add organization factories, session helper and a standard multi-tenant world`

---

## 🎫 S5-T04 — Isolated E2E stack and per-role sessions

**Branch:** `test/s5-t04-e2e-personas` · **Story:** US-054 · **2 SP**

> 🎯 Two improvements in one ticket, both about **speed and trust**:
> 1. E2E runs against **its own database and app** (never your dev data), identically locally and in CI.
> 2. A global setup creates one user per role **through the app's API** and saves their cookies; specs start already signed in.

```bash
git switch main && git pull && git switch -c test/s5-t04-e2e-personas
mkdir -p e2e/.auth
```

### 1. The database server learns where to keep its data

📄 **Edit `scripts/db-server.ts`:**
```ts
const dataDir = process.env.DB_DATA_DIR ?? './local.db';
```
📄 **Edit `.gitignore`:** add `local.e2e.db` and `local.e2e.db-*`.

📄 **Create `scripts/e2e-reset.mjs`:**
```js
// Deletes the E2E database so the next run starts empty. Safe: it never touches ./local.db
import { rmSync } from 'node:fs';

rmSync('local.e2e.db', { recursive: true, force: true });
rmSync('e2e/.auth', { recursive: true, force: true });
rmSync('.emails', { recursive: true, force: true });
console.log('🧹 E2E state cleared');
```
📄 **Edit `package.json`:** `"e2e:reset": "node scripts/e2e-reset.mjs"`

### 2. One config for local and CI

📄 **Rewrite `playwright.config.ts`:**
```ts
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const E2E_PORT = 3100;
const E2E_DB_PORT = 5434;
export const baseURL = `http://localhost:${E2E_PORT}`;

// Same environment everywhere → "works on my machine" == "works in CI"
const appEnv = {
  PORT: String(E2E_PORT),
  NEXT_PUBLIC_APP_URL: baseURL,
  DB_SERVER_PORT: String(E2E_DB_PORT),
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${E2E_DB_PORT}/postgres`,
  AUTH_RATE_LIMIT: 'on',
  EMAIL_TRANSPORT: 'console', // writes .emails/*.json that the tests read
  // Dummy values: they only make the GitHub button appear — no real OAuth flow is ever completed
  GITHUB_CLIENT_ID: 'e2e-github-id',
  GITHUB_CLIENT_SECRET: 'e2e-github-secret',
};

// Local default: production build (identical to CI). `E2E_DEV=1` uses the dev server for quick iterations.
// CI sets E2E_PREBUILT=1 once a build artifact is available (S5-T09).
const useDevServer = !isCI && process.env.E2E_DEV === '1';
const appCommand = useDevServer ? 'pnpm dev:web' : process.env.E2E_PREBUILT ? 'pnpm start' : 'pnpm build && pnpm start';

export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['**/visual/**'],
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm db:server',
      port: E2E_DB_PORT,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: { DB_SERVER_PORT: String(E2E_DB_PORT), DB_DATA_DIR: './local.e2e.db' },
    },
    { command: appCommand, url: baseURL, reuseExistingServer: false, timeout: 300_000, env: appEnv },
  ],
});
```
> 🔎 `reuseExistingServer: false` for the app is deliberate: a leftover server with the wrong environment is the #1 cause of confusing E2E failures. If port 3100 is busy, stop that process.
> 🪟 The first run on Windows builds the app (~1–2 minutes). Use `E2E_DEV=1 pnpm e2e` while iterating (🪟 cmd.exe: `set E2E_DEV=1&& pnpm e2e`).

### 3. Update the helpers that knew about the old ports

📄 **Edit `e2e/helpers/db.ts`:** use port **5434**:
```ts
const connectionString = 'postgres://postgres:postgres@127.0.0.1:5434/postgres';
// …and in the Pool: new Pool({ connectionString, max: 1 })
// Also fix the doc comment: "global setup may INSERT fixture rows; specs should only read."
```
📄 **Edit `e2e/helpers/admin.ts`:**
```ts
execSync('pnpm admin:grant', {
  env: { ...process.env, ADMIN_EMAILS: email, DB_SERVER_PORT: '5434' },
  stdio: 'pipe',
});
```
📄 **Remove the "only with CI=1" skips** — the E2E server now **always** has rate limiting on and the GitHub dummy credentials:
- `e2e/auth.spec.ts` → in *"repeated failed sign-ins are rate limited"* delete the `test.skip(!process.env.CI, …)` call.
- `e2e/auth-advanced.spec.ts` → in `test.describe('social sign-in')` delete the `test.skip(!process.env.CI, …)` line.
- Replace hard-coded `http://localhost:3000` in specs with the `baseURL` fixture or `new URL(page.url()).origin`:
  `expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3100/api/auth/callback/github');` and the open-redirect test's `toHaveURL(/localhost:3100\/dashboard$/)`.

### 4. The global setup: one user per role, created through the app

📄 **Create `e2e/helpers/api.ts`:**
```ts
import { expect, request } from '@playwright/test';

import { randomIp } from './users';

/** An API client with its own cookie jar and client IP. */
export async function apiContext(baseURL: string) {
  return request.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL, 'x-forwarded-for': randomIp() },
  });
}

export async function signInApi(context: Awaited<ReturnType<typeof apiContext>>, email: string, password: string) {
  const response = await context.post('/api/auth/sign-in/email', { data: { email, password } });
  expect(response.ok(), `sign-in failed for ${email}`).toBeTruthy();
}
```
📄 **Create `e2e/global-setup.ts`:**
```ts
import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, type FullConfig } from '@playwright/test';

import { makeAdmin } from './helpers/admin';
import { apiContext, signInApi } from './helpers/api';
import { queryDb } from './helpers/db';
import { waitForEmail } from './helpers/inbox';
import { createUser } from './helpers/users';

export type Persona = { email: string; password: string; state: string };
export type World = {
  orgSlug: string;
  orgId: string;
  owner: Persona;
  orgAdmin: Persona;
  member: Persona;
  platformAdmin: Persona;
  project: { id: string; name: string };
};

const AUTH_DIR = 'e2e/.auth';

/**
 * Runs once per `playwright test`, AFTER the servers are up.
 * Everything goes through the app's HTTP API (sign-up, invitations, role changes); only the
 * single fixture project row is inserted directly because no public API creates projects.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!;
  mkdirSync(AUTH_DIR, { recursive: true });

  const people = {
    owner: await createUser(await apiContext(baseURL), baseURL),
    orgAdmin: await createUser(await apiContext(baseURL), baseURL),
    member: await createUser(await apiContext(baseURL), baseURL),
    platformAdmin: await createUser(await apiContext(baseURL), baseURL),
  };
  makeAdmin(people.platformAdmin.email);

  const sessions = {} as Record<keyof typeof people, Awaited<ReturnType<typeof apiContext>>>;
  for (const key of Object.keys(people) as (keyof typeof people)[]) {
    sessions[key] = await apiContext(baseURL);
    await signInApi(sessions[key], people[key].email, people[key].password);
  }

  // The owner's personal workspace (created at sign-up) is the shared organization
  const [org] = await queryDb<{ id: string; slug: string }>(
    `select o.id, o.slug from organization o
       join member m on m.organization_id = o.id join "user" u on u.id = m.user_id
      where u.email = $1 and m.role = 'owner'`,
    [people.owner.email],
  );
  expect(org, 'owner has no organization').toBeTruthy();

  // Invite → accept → (for the admin) promote
  for (const key of ['orgAdmin', 'member'] as const) {
    const since = Date.now();
    const invite = await sessions.owner.post('/api/auth/organization/invite-member', {
      data: { email: people[key].email, role: 'member', organizationId: org!.id },
    });
    expect(invite.ok(), `invite ${key}`).toBeTruthy();

    const mail = await waitForEmail(people[key].email, { since });
    const invitationId = /accept-invitation\/([^/?#\s]+)/.exec(mail.links[0] ?? '')?.[1];
    expect(invitationId, 'invitation link').toBeTruthy();

    const accepted = await sessions[key].post('/api/auth/organization/accept-invitation', { data: { invitationId } });
    expect(accepted.ok(), `accept ${key}`).toBeTruthy();
  }

  const [adminMember] = await queryDb<{ id: string }>(
    `select m.id from member m join "user" u on u.id = m.user_id where u.email = $1 and m.organization_id = $2`,
    [people.orgAdmin.email, org!.id],
  );
  const promoted = await sessions.owner.post('/api/auth/organization/update-member-role', {
    data: { memberId: adminMember!.id, role: 'admin', organizationId: org!.id },
  });
  expect(promoted.ok(), 'promote to admin').toBeTruthy();

  // One deterministic project for visual and permission tests
  const projectId = crypto.randomUUID();
  await queryDb(`insert into project (id, organization_id, name, status) values ($1, $2, 'Launch plan', 'active')`, [
    projectId,
    org!.id,
  ]);

  const personas = {} as Record<keyof typeof people, Persona>;
  for (const key of Object.keys(people) as (keyof typeof people)[]) {
    const state = `${AUTH_DIR}/${key}.json`;
    await sessions[key].storageState({ path: state });
    personas[key] = { ...people[key], state };
    await sessions[key].dispose();
  }

  const world: World = { orgSlug: org!.slug, orgId: org!.id, ...personas, project: { id: projectId, name: 'Launch plan' } };
  writeFileSync(`${AUTH_DIR}/world.json`, JSON.stringify(world, null, 2));
}
```
> 🔍 The three `/api/auth/organization/*` endpoint names follow the plugin's current routes — confirm them in your version (the integration tests in S4-T15 use the same operations through `auth.api`).

### 5. Persona fixtures

📄 **Rewrite `e2e/fixtures.ts`:**
```ts
import { readFileSync } from 'node:fs';

import { type Browser, type Page, test as base } from '@playwright/test';

import type { Persona, World } from './global-setup';
import { randomIp } from './helpers/users';

type PersonaPages = {
  world: World;
  ownerPage: Page;
  adminPage: Page; // organization admin (NOT the platform admin)
  memberPage: Page;
  platformAdminPage: Page;
  _clientIp: void;
};

async function openAs(browser: Browser, baseURL: string | undefined, persona: Persona) {
  const context = await browser.newContext({
    baseURL,
    storageState: persona.state,
    extraHTTPHeaders: { 'x-forwarded-for': randomIp() }, // per-IP rate limits never interfere
  });
  return { page: await context.newPage(), close: () => context.close() };
}

export const test = base.extend<PersonaPages>({
  world: async ({}, use) => use(JSON.parse(readFileSync('e2e/.auth/world.json', 'utf8')) as World),

  ownerPage: async ({ browser, baseURL, world }, use) => {
    const opened = await openAs(browser, baseURL, world.owner);
    await use(opened.page);
    await opened.close();
  },
  adminPage: async ({ browser, baseURL, world }, use) => {
    const opened = await openAs(browser, baseURL, world.orgAdmin);
    await use(opened.page);
    await opened.close();
  },
  memberPage: async ({ browser, baseURL, world }, use) => {
    const opened = await openAs(browser, baseURL, world.member);
    await use(opened.page);
    await opened.close();
  },
  platformAdminPage: async ({ browser, baseURL, world }, use) => {
    const opened = await openAs(browser, baseURL, world.platformAdmin);
    await use(opened.page);
    await opened.close();
  },

  // Auto fixture: every test's own browser context gets its own client IP
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

### 6. A fast spec built on personas

📄 **Create `e2e/rbac-ui.spec.ts`:**
```ts
import { expect, test } from './fixtures';

// No UI sign-in anywhere in this file: each persona starts with a live session.

test.describe('role-dependent UI', () => {
  test('owner: settings with a danger zone, project deletion, member management', async ({ ownerPage, world }) => {
    await ownerPage.goto(`/dashboard/${world.orgSlug}/settings`);
    await expect(ownerPage.getByRole('heading', { name: 'Organization settings' })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: 'Delete organization' })).toBeVisible();

    await ownerPage.goto(`/dashboard/${world.orgSlug}/projects/${world.project.id}`);
    await expect(ownerPage.getByRole('button', { name: 'Delete' })).toBeVisible();

    await ownerPage.goto(`/dashboard/${world.orgSlug}/members`);
    await expect(ownerPage.getByRole('button', { name: 'Transfer ownership' })).toBeVisible();
  });

  test('org admin: settings yes, danger zone no, project deletion yes', async ({ adminPage, world }) => {
    await adminPage.goto(`/dashboard/${world.orgSlug}/settings`);
    await expect(adminPage.getByRole('heading', { name: 'Organization settings' })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: 'Delete organization' })).toHaveCount(0);

    await adminPage.goto(`/dashboard/${world.orgSlug}/projects/${world.project.id}`);
    await expect(adminPage.getByRole('button', { name: 'Delete' })).toBeVisible();
  });

  test('member: no settings, no deletion, no invitations — but can read and edit', async ({ memberPage, world }) => {
    await memberPage.goto(`/dashboard/${world.orgSlug}/settings`);
    await expect(memberPage).toHaveURL(new RegExp(`/dashboard/${world.orgSlug}$`)); // bounced to the overview

    await memberPage.goto(`/dashboard/${world.orgSlug}/projects/${world.project.id}`);
    await expect(memberPage.getByRole('heading', { name: world.project.name })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(memberPage.getByRole('button', { name: 'Save changes' })).toBeVisible();

    await memberPage.goto(`/dashboard/${world.orgSlug}/members`);
    await expect(memberPage.getByRole('button', { name: 'Send invitation' })).toHaveCount(0);
  });

  test('platform admin reaches the console; an organization owner does not', async ({ platformAdminPage, ownerPage }) => {
    await platformAdminPage.goto('/admin/users');
    await expect(platformAdminPage.getByRole('heading', { name: 'Users' })).toBeVisible();

    const denied = await ownerPage.goto('/admin/users');
    expect(denied?.status()).toBe(404);
  });
});
```

### ✅ Verify
```bash
pnpm e2e:reset
pnpm e2e                      # 🪟 first run builds the app; then runs setup + every spec
```
1. Terminal shows two servers starting (`db:server` on **5434**, the app on **3100**) — your own `pnpm dev` on 3000/5433 can keep running.
2. `e2e/.auth/` now contains `owner.json`, `orgAdmin.json`, `member.json`, `platformAdmin.json`, `world.json` (git-ignored — double-check with `git status`).
3. `e2e/rbac-ui.spec.ts` passes in a few seconds (no sign-in UI).
4. `ls local.e2e.db` exists; `local.db` is untouched.
5. **Measure**: total `pnpm e2e` time vs your pre-sprint number; the persona spec should be ≥ 5× faster than the equivalent UI-sign-in flow. Record both in `06-project-state.md` (target: suite ≥ 40 % faster once the older specs migrate).
6. `CI=1 pnpm e2e` also works (same servers; retries on).

> 🧭 **Migrating older specs:** `tenancy.spec.ts` and `admin.spec.ts` keep UI sign-in on purpose for the *flows under test*, but their *setup* can use personas. Convert them opportunistically; `auth*.spec.ts` stay UI-driven.

**🚢 Ship** — branch `test/s5-t04-e2e-personas` · message: `test(e2e): add isolated e2e stack, per-role sessions and persona fixtures`

---

## 🎫 S5-T05 — Visual regression harness

**Branch:** `test/s5-t05-visual-harness` · **Story:** US-051 · **3 SP** · risk **R-09** (cross-OS pixel noise)

> 🎯 A screenshot suite that catches *unintended* visual changes: **8 pages × light/dark × en/fr × desktop/mobile = 64 images**. This ticket builds the harness; **S5-T06 generates the official baselines in CI** (never on your Windows machine).

```bash
git switch main && git pull && git switch -c test/s5-t05-visual-harness
mkdir -p e2e/visual
```

### 1. A dedicated Playwright config

It reuses the E2E stack from S5-T04 (own database and app, personas) — only the *what* and the *how it compares* change.

📄 **Create `playwright.visual.config.ts`:**
```ts
import { defineConfig, devices } from '@playwright/test';

import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: 'e2e/visual',
  testIgnore: [],
  testMatch: '**/*.visual.ts',
  workers: process.env.CI ? 2 : undefined,
  retries: 0, // a screenshot diff is not a flake — don't retry it away
  // e2e/visual/__screenshots__/<project>/<name>.png
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.01, // 1 % of pixels may differ (sub-pixel anti-aliasing)
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // A narrow desktop browser (not a device emulation): small, deterministic images
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
});
```
📄 **Edit `package.json`:**
```json
"e2e:visual": "playwright test -c playwright.visual.config.ts",
"e2e:visual:update": "playwright test -c playwright.visual.config.ts --update-snapshots"
```

### 2. Make pages deterministic

Anything that changes between runs must be frozen or hidden. Our one offender: the footer prints the current year.

📄 **Edit `src/components/layout/site-footer.tsx`:** add `data-visual-mask` to the element that prints the year:
```tsx
      <div data-visual-mask className="text-muted-foreground mx-auto max-w-6xl px-4 py-6 text-sm">
```
📄 **Create `e2e/visual/helpers.ts`:**
```ts
import type { Page } from '@playwright/test';

/** Wait until the page can't change by itself any more. */
export async function settle(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready); // web fonts shift text if captured too early
}

/** Elements that legitimately differ between runs (dates, random ids…). */
export const masks = (page: Page) => [page.locator('[data-visual-mask]')];
```

### 3. The matrix

📄 **Create `e2e/visual/pages.visual.ts`:**
```ts
import { expect, test } from '../fixtures';

import { masks, settle } from './helpers';

const LOCALES = ['en', 'fr'] as const;
const SCHEMES = ['light', 'dark'] as const;
const prefix = (locale: string) => (locale === 'en' ? '' : `/${locale}`);

const PUBLIC_PAGES = [
  { name: 'home', path: '/' },
  { name: 'sign-in', path: '/sign-in' },
  { name: 'sign-up', path: '/sign-up' },
  { name: 'forgot-password', path: '/forgot-password' },
  { name: 'contact', path: '/contact' },
  { name: 'not-found', path: '/does-not-exist' },
] as const;

for (const locale of LOCALES) {
  for (const scheme of SCHEMES) {
    test.describe(`public · ${locale} · ${scheme}`, () => {
      test.use({ colorScheme: scheme }); // next-themes follows the system preference

      for (const entry of PUBLIC_PAGES) {
        test(entry.name, async ({ page }) => {
          await page.goto(`${prefix(locale)}${entry.path}`);
          await settle(page);
          await expect(page).toHaveScreenshot(`${entry.name}-${locale}-${scheme}.png`, {
            fullPage: true,
            mask: masks(page),
          });
        });
      }
    });

    test.describe(`app · ${locale} · ${scheme}`, () => {
      test.use({ colorScheme: scheme, storageState: 'e2e/.auth/owner.json' }); // signed in as the owner

      test('overview', async ({ page, world }) => {
        await page.goto(`${prefix(locale)}/dashboard/${world.orgSlug}`);
        await settle(page);
        await expect(page).toHaveScreenshot(`overview-${locale}-${scheme}.png`, { fullPage: true, mask: masks(page) });
      });

      test('projects', async ({ page, world }) => {
        await page.goto(`${prefix(locale)}/dashboard/${world.orgSlug}/projects`);
        await settle(page);
        await expect(page).toHaveScreenshot(`projects-${locale}-${scheme}.png`, { fullPage: true, mask: masks(page) });
      });
    });
  }
}
```
> 🔎 The owner's organization is called "E2E User's workspace" and the single project "Launch plan" — fixed by the global setup, so these pages are stable. Pages that show **emails or random slugs** (members, settings) are deliberately **not** in the matrix.

### ✅ Verify (harness only — do **not** commit the images)
```bash
pnpm e2e:reset
pnpm e2e:visual:update          # writes e2e/visual/__screenshots__/{desktop,mobile}/…  (64 PNG files)
```
1. Open a few PNGs: `home-fr-dark.png` should be French on a dark background; `projects-en-light.png` shows "Launch plan".
2. Run again **without** `:update`:
```bash
pnpm e2e:visual                 # all green on the machine that made them
```
3. Break something visible (e.g. change a button label in `en.json`), rerun → the affected tests **fail** and `test-results/` contains `*-expected.png`, `*-actual.png`, `*-diff.png`. Revert.
4. **Delete the generated images** (`rm -rf e2e/visual/__screenshots__`) — the official baselines come from CI in the next ticket. 🪟 A Windows-made baseline would fail on every Linux run (and vice versa).
```bash
pnpm check
```

**🚢 Ship** — branch `test/s5-t05-visual-harness` · message: `test(visual): add screenshot matrix for 8 pages across theme, language and viewport`

---

## 🎫 S5-T06 — Baselines produced in CI (Linux)

**Branch:** `ci/s5-t06-visual-baselines` · **Story:** US-051 · **2 SP**

> 🎯 One environment makes all baselines: the CI runner. A **label** on a pull request (`update-snapshots`) makes a workflow regenerate them and commit them to the PR branch.

```bash
git switch main && git pull && git switch -c ci/s5-t06-visual-baselines
```

### 1. The workflow

📄 **Create `.github/workflows/visual-update.yml`:**
```yaml
name: Update visual snapshots

on:
  pull_request:
    types: [labeled]
  workflow_dispatch:

permissions:
  contents: write # push the new baselines to the PR branch
  pull-requests: write # remove the label afterwards

env:
  NEXT_PUBLIC_APP_NAME: SaaS Boilerplate
  BETTER_AUTH_SECRET: ci-only-secret-ci-only-secret-0123456789

jobs:
  update:
    name: Regenerate baselines
    # Same-repo PRs only (forks have no write access), and only for our label
    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event.label.name == 'update-snapshots' &&
       github.event.pull_request.head.repo.full_name == github.repository)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.ref || github.ref_name }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e:visual:update # CI=true → production build + isolated servers (see playwright.config.ts)

      - name: Commit the new baselines
        env:
          LEFTHOOK: '0' # the local guard that forbids committing screenshots must not block the bot
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add e2e/visual/__screenshots__
          if git diff --cached --quiet; then
            echo "No visual change."
          else
            git commit -m "test(visual): update snapshots"
            git push
          fi

      - name: Remove the label so it can be used again
        if: github.event_name == 'pull_request'
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh pr edit ${{ github.event.pull_request.number }} --remove-label update-snapshots

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-update-report
          path: |
            playwright-report
            test-results
          retention-days: 7
```
> 🔒 Why this is safe: it runs **only** for same-repository branches (no secrets are exposed to fork code), and the only thing it writes is the screenshots folder.

### 2. A guard against accidentally committing local screenshots

📄 **Edit `lefthook.yml`** — under `pre-commit.commands` add:
```yaml
    visual-baselines:
      glob: 'e2e/visual/__screenshots__/**'
      run: >-
        echo "❌ Visual baselines must come from CI. Add the 'update-snapshots' label to your PR instead." && exit 1
```
(`glob` limits the command to commits that actually stage files in that folder.)

### 3. How to review baseline changes

📄 **Create `docs/guides/visual-testing.md`:**
````markdown
# Visual regression testing

`pnpm e2e:visual` compares screenshots (8 pages × light/dark × en/fr × desktop/mobile = 64) with the baselines
in `e2e/visual/__screenshots__/`.

## When a visual test fails
1. Download the **playwright-report** artifact of the failed `Visual` job (or open `test-results/*-diff.png` locally).
2. **Intended change?** → add the **`update-snapshots`** label to the PR. A workflow regenerates the baselines on
   Linux and pushes a commit `test(visual): update snapshots`. Then:
   ```bash
   git pull
   git commit --allow-empty -m "ci: re-run checks" && git push   # pushes made by the bot don't trigger CI themselves
   ```
3. **Unintended change?** → fix the code, not the baseline.

## Reviewing a baseline commit
GitHub renders PNG diffs in the *Files changed* tab (2-up / swipe / onion skin). Check: spacing, truncated text,
dark-mode contrast, French text overflow, mobile layout. A baseline PR is a design review.

## Rules
- **Never** generate or commit baselines from your own machine (fonts and anti-aliasing differ per OS).
- Pages with emails, random slugs, relative dates must be **masked** (`data-visual-mask`) or left out.
- Linux/macOS developers who want local baselines can run the Playwright Docker image **in a clean clone**
  (a container that shares your `node_modules` would overwrite it with Linux binaries):
  `docker run --rm -v "$PWD":/work -w /work -e CI=1 mcr.microsoft.com/playwright:v<VERSION>-noble bash -c "corepack enable && pnpm install --frozen-lockfile && pnpm e2e:visual:update"`
  (`<VERSION>` = `pnpm exec playwright --version`).
````

### ✅ Verify
1. Merge the **S5-T05** PR first. Then, in **this** PR: push the branch, open the PR, and add the label:
```bash
git add -A && git commit -m "ci(visual): add workflow to regenerate baselines and a guard against local screenshots"
git push -u origin ci/s5-t06-visual-baselines
gh pr create --fill --base main
gh label create update-snapshots --description "Regenerate visual baselines in CI" --color BFD4F2   # once
gh pr edit --add-label update-snapshots
```
2. In the **Actions** tab, *Update visual snapshots* runs (≈ 6–10 min) and pushes `test(visual): update snapshots` with **64 PNGs** (32 per project).
3. Locally: `git pull`, then **review the images** in the PR's *Files changed* (swipe through a few: dark mode, French, mobile).
4. Re-trigger the normal checks: `git commit --allow-empty -m "ci: re-run checks" && git push`; wait for green (the visual job itself arrives in S5-T09).
5. **Guard test:** `git add` any file under `e2e/visual/__screenshots__` locally and try to commit → blocked by the hook ("Visual baselines must come from CI").
6. Merge the PR.

**🚢 Ship** — branch `ci/s5-t06-visual-baselines` · message: `ci(visual): add snapshot-update workflow, local guard and the first baselines`

---

## 🎫 S5-T07 — Coverage thresholds and Codecov

**Branch:** `test/s5-t07-coverage` · **Story:** US-052 · **3 SP**

> 🎯 Coverage is a **smoke alarm**, not a goal: it must be trusted (measured on code that matters), enforced (CI fails below the threshold) and **visible** (Codecov comments, badge). We use a *ratchet*: measure first, set the floor just below, raise it in S5-T13.

```bash
git switch main && git pull && git switch -c test/s5-t07-coverage
```

### 1. What counts as "our code"

Pages, layouts and other route files are server-rendered glue covered by E2E; counting them in unit coverage only adds noise.

📄 **Edit the `coverage` block in `vitest.config.ts`:**
```ts
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/components/ui/**', // shadcn primitives (TD-08)
        'src/**/*.stories.*',
        'src/**/*.d.ts',
        'src/types/**',
        'src/locales/**',
        '**/*.test.*',
        // Route files are glue; E2E covers them (and the guard-coverage test checks their guards)
        'src/app/**/{page,layout,loading,error,global-error,not-found,default,template}.tsx',
        'src/proxy.ts',
      ],
      // Thresholds are added in step 3 — after measuring.
    },
```

### 2. Measure

```bash
pnpm test:coverage
```
(runs the unit **and** browser projects and merges their coverage; the browser project needs Chromium — `pnpm exec playwright install chromium` if missing)

Note the **text summary** and open `coverage/index.html` for the per-file view. A helper prints the per-folder picture:

📄 **Create `scripts/coverage-summary.mjs`:**
```js
// Usage: pnpm coverage:summary  (after pnpm test:coverage) — lines % per top-level folder under src/
import { readFileSync } from 'node:fs';
import path from 'node:path';

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const folders = new Map();

for (const [file, data] of Object.entries(summary)) {
  if (file === 'total') continue;
  const rel = path.relative(process.cwd(), file).split(path.sep).join('/');
  const key = rel.split('/').slice(0, 3).join('/'); // e.g. src/components/forms
  const entry = folders.get(key) ?? { covered: 0, total: 0 };
  entry.covered += data.lines.covered;
  entry.total += data.lines.total;
  folders.set(key, entry);
}

console.log(`TOTAL lines: ${summary.total.lines.pct}%  branches: ${summary.total.branches.pct}%\n`);
for (const [folder, { covered, total }] of [...folders].sort()) {
  console.log(`${String(total ? ((covered / total) * 100).toFixed(0) : 100).padStart(3)}%  ${folder}  (${covered}/${total})`);
}
```
📄 **Edit `package.json`:** `"coverage:summary": "node scripts/coverage-summary.mjs"`
```bash
pnpm coverage:summary
```
Write the numbers into `06-project-state.md` — they are your **baseline**.

### 3. Set the floor (just below what you measured)

📄 **Add to the `coverage` block** — replace the example numbers with *your measured values minus 2 points* (rounded down):
```ts
      thresholds: {
        lines: 60, // ← your measured total − 2
        functions: 60,
        statements: 60,
        branches: 50,
        // The security-critical layers must be tested much harder — set these from your measurements too
        'src/data/**': { lines: 80 },
        'src/libs/**': { lines: 80 },
      },
```
> 🔎 S5-T13 raises the totals to **80 / 80 / 70** and the two folders to **85**.

```bash
pnpm test:coverage              # must now pass (exit code 0)
```
Sabotage check: set `lines: 99` temporarily → the command **fails** with a threshold error. Revert.

### 4. Codecov configuration

📄 **Create `codecov.yml`:**
```yaml
coverage:
  status:
    project:
      default:
        target: auto # must not drop versus the base branch…
        threshold: 1% # …by more than 1 point
    patch:
      default:
        target: 70% # new code in a PR needs ≥ 70 % coverage

ignore:
  - 'src/components/ui/**'
  - '**/*.stories.*'
  - 'src/locales/**'
  - 'e2e/**'
  - 'tests/**'
  - 'scripts/**'
  - '.storybook/**'

comment:
  layout: 'diff, files'
  require_changes: true
```
One-time account setup (outside the repo):
1. Sign in at <https://about.codecov.io> with GitHub, add the repository, copy its **upload token**.
2. ```bash
   gh secret set CODECOV_TOKEN        # paste the token
   ```
3. Add the badge to `README.md` (replace `OWNER`):
```markdown
[![codecov](https://codecov.io/gh/OWNER/saas-boilerplate/graph/badge.svg)](https://codecov.io/gh/OWNER/saas-boilerplate)
```
The **upload step** lives in the CI rewrite (S5-T08).

📄 **Document the exclusions** — append to `docs/roadmap/04-dependencies-risks.md` under the debt register:
```markdown
| TD-08 | Coverage excludes shadcn primitives and Next route files (pages/layouts) | Vendor-style/glue code; E2E + guard tests cover them | Reassess v1.1 |
```
(if the row already exists, just confirm the wording)

### ✅ Verify
```bash
pnpm test:coverage && pnpm coverage:summary && pnpm check
```
`coverage/` is git-ignored (S0). Put the *before* numbers next to the *floor* you chose in `06-project-state.md`.

**🚢 Ship** — branch `test/s5-t07-coverage` · message: `test: enforce coverage thresholds with a ratchet and add codecov configuration`

---

## 🎫 S5-T08 — CI: parallel jobs, caching and one required check

**Branch:** `ci/s5-t08-parallel-ci` · **Story:** US-053 · **3 SP**

> 🎯 **Goal: a PR pipeline under 10 minutes**, with docs-only PRs finishing in seconds, and **one** required check (`CI OK`) so adding or renaming a job never means reconfiguring branch protection again.

```bash
git switch main && git pull && git switch -c ci/s5-t08-parallel-ci
mkdir -p .github/actions/setup
```

### 1. A reusable setup step

📄 **Create `.github/actions/setup/action.yml`:**
```yaml
name: Setup
description: pnpm + Node (cached) + frozen install

runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@v4 # version comes from "packageManager" in package.json
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
        cache: pnpm
    - run: pnpm install --frozen-lockfile
      shell: bash
```

### 2. The workflow

📄 **Rewrite `.github/workflows/ci.yml`** (the E2E and Visual jobs are added in S5-T09):
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

env:
  # Valid dummy values so the build passes env validation (no real secrets in PR CI)
  NEXT_PUBLIC_APP_URL: http://localhost:3100 # must match the E2E app URL: NEXT_PUBLIC_* is baked in at build time
  NEXT_PUBLIC_APP_NAME: SaaS Boilerplate
  BETTER_AUTH_SECRET: ci-only-secret-ci-only-secret-0123456789

jobs:
  # Docs-only PRs skip the heavy jobs
  changes:
    name: Changes
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      code: ${{ steps.filter.outputs.code }}
    steps:
      - uses: actions/checkout@v4
      - id: filter
        uses: dorny/paths-filter@v3
        with:
          filters: |
            code:
              - '**'
              - '!docs/**'
              - '!**/*.md'

  quality:
    name: Quality
    needs: changes
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm knip
      - run: pnpm check:env
      - run: pnpm check:agents
      - run: pnpm db:check

  test:
    name: Tests + coverage
    needs: changes
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:coverage # unit + browser, merged, thresholds enforced
      - uses: codecov/codecov-action@v5
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: coverage/lcov.info
          fail_ci_if_error: false # forks have no token; a Codecov outage must not block merges

  build:
    name: Build
    needs: changes
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - uses: actions/cache@v4
        with:
          path: .next/cache
          key: nextjs-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ hashFiles('src/**') }}
          restore-keys: nextjs-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-
      - run: pnpm build

  storybook:
    name: Storybook
    needs: changes
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm build-storybook

  commitlint:
    name: Commit messages
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: wagoid/commitlint-github-action@v6
        with:
          configFile: commitlint.config.mjs

  # The ONLY check branch protection needs. Skipped jobs count as success; failed/cancelled ones don't.
  ci-ok:
    name: CI OK
    if: always()
    needs: [changes, quality, test, build, storybook, commitlint]
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Verify every job passed or was skipped
        run: |
          echo '${{ toJSON(needs) }}'
          if echo '${{ toJSON(needs) }}' | grep -E '"result": "(failure|cancelled)"'; then
            echo "❌ At least one job failed"; exit 1
          fi
          echo "✅ All required jobs passed (or were skipped)"
```
> 🔎 Everything runs **in parallel** (only `ci-ok` waits). Caches: the pnpm store (via `setup-node`), Playwright browsers, and Next's build cache.

### 3. Point branch protection at the single check

GitHub → **Settings → Rules** (or Branches) → the ruleset for `main` → **Required status checks**: remove the old five (*Quality…*, *Tests…*, *Build*, *Commit messages*, *E2E*) and add **`CI OK`** only.

> ⚠️ Do this **after** this PR has run once (GitHub only offers a check name it has seen). Until then keep the old names; the job names changed, so the PR itself may show the old required checks as "waiting" — that's expected, use *admin merge* once if needed and switch the rule immediately.

### ✅ Verify
1. Open the PR and watch the **Actions** tab: `Quality`, `Tests + coverage`, `Build`, `Storybook`, `Commit messages` start **together**. `CI OK` turns green last.
2. **Time it:** compare against the baseline you noted at the start (goal: whole pipeline < 10 min, typically 5–7 once caches are warm; push an empty commit to see the warm-cache time).
3. **Docs-only PR:** create a branch that only edits a `.md` file → `Changes` reports `code=false`, the heavy jobs are *skipped*, `CI OK` is green in seconds.
4. **Break something** (lint error) in a throw-away PR → `Quality` fails → `CI OK` **fails** (so the merge button stays blocked). Close the PR.
5. Codecov: after merging to `main` (or on the PR), the Codecov comment shows the coverage diff; the badge in the README resolves.

**🚢 Ship** — branch `ci/s5-t08-parallel-ci` · message: `ci: run quality, tests, build and storybook in parallel behind a single required check`

---

## 🎫 S5-T09 — E2E and visual jobs, build artifact, bundle budget, drift watch

**Branch:** `ci/s5-t09-e2e-visual-jobs` · **Story:** US-053 · **2 SP**

```bash
git switch main && git pull && git switch -c ci/s5-t09-e2e-visual-jobs
```

### 1. A bundle-size budget

Next 16's build log no longer lists per-route *First Load JS* 🔍, so we measure the **gzipped JS + CSS** that browsers download (`.next/static`) and compare it with a committed budget.

📄 **Create `scripts/check-bundle-size.mjs`:**
```js
// Usage:  pnpm build && pnpm bundle:size            → compare with bundle-budget.json (fails if > +10 %)
//         pnpm build && pnpm bundle:size --write    → record the current size as the new budget
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const STATIC_DIR = '.next/static';
const BUDGET_FILE = 'bundle-budget.json';
const TOLERANCE = 0.1;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

function measure() {
  if (!existsSync(STATIC_DIR)) {
    console.error('❌ .next/static not found — run `pnpm build` first.');
    process.exit(1);
  }
  const totals = { js: 0, css: 0 };
  for (const file of walk(STATIC_DIR)) {
    if (!/\.(js|css)$/.test(file)) continue;
    totals[file.endsWith('.js') ? 'js' : 'css'] += gzipSync(readFileSync(file)).length;
  }
  return totals;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const current = measure();
console.log(`Current (gzip): JS ${kb(current.js)} · CSS ${kb(current.css)}`);

if (process.argv.includes('--write')) {
  writeFileSync(BUDGET_FILE, `${JSON.stringify({ ...current, measuredAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`✅ Budget written to ${BUDGET_FILE}`);
  process.exit(0);
}

if (!existsSync(BUDGET_FILE)) {
  console.error(`❌ No ${BUDGET_FILE}. Create it with: pnpm bundle:size --write`);
  process.exit(1);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));
let failed = false;
for (const key of ['js', 'css']) {
  const limit = budget[key] * (1 + TOLERANCE);
  const delta = ((current[key] / budget[key] - 1) * 100).toFixed(1);
  const ok = current[key] <= limit;
  console.log(`${ok ? '✅' : '❌'} ${key.toUpperCase()}: ${kb(current[key])} vs budget ${kb(budget[key])} (${delta >= 0 ? '+' : ''}${delta} %)`);
  if (!ok) failed = true;
}
if (failed) {
  console.error('\nThe bundle grew by more than 10 %. Find out why (pnpm analyze) — or, if intended, run `pnpm bundle:size --write` and explain it in the PR.');
  process.exit(1);
}
```
📄 **Edit `package.json`:** `"bundle:size": "node scripts/check-bundle-size.mjs"`
```bash
pnpm build && pnpm bundle:size --write      # creates bundle-budget.json — commit it
pnpm bundle:size                            # now ✅ (+0.0 %)
```
> Numbers made on Windows differ slightly from Linux; the 10 % tolerance absorbs that. Re-record the budget from a CI run if you want it exact.

### 2. Build once, reuse everywhere

📄 **Edit the `build` job in `.github/workflows/ci.yml`** — after `pnpm build` add:
```yaml
      - run: pnpm bundle:size
      - uses: actions/upload-artifact@v4
        with:
          name: next-build
          path: |
            .next
            !.next/cache
          include-hidden-files: true # .next starts with a dot
          retention-days: 1
```

### 3. E2E (2 shards) and Visual jobs

📄 **Append to `jobs:` in `ci.yml`:**
```yaml
  e2e:
    name: E2E (shard ${{ matrix.shard }}/2)
    needs: [changes, build]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 25
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    env:
      E2E_PREBUILT: '1' # use the build artifact instead of building again
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - uses: actions/download-artifact@v4
        with:
          name: next-build
          path: .next
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm exec playwright test --shard=${{ matrix.shard }}/2
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report-shard-${{ matrix.shard }}
          path: |
            playwright-report
            test-results
          retention-days: 7

  visual:
    name: Visual regression
    needs: [changes, build]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 25
    env:
      E2E_PREBUILT: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - uses: actions/download-artifact@v4
        with:
          name: next-build
          path: .next
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e:visual
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diffs
          path: |
            playwright-report
            test-results
          retention-days: 7
```
and extend the aggregate: `needs: [changes, quality, test, build, storybook, e2e, visual, commitlint]`.

> 🔎 Each shard runs on its **own machine** with its **own** database, app and global setup (its own world of users) — shards can't interfere. If one of your specs depends on another's data, sharding will expose it: fix the spec.

### 4. Weekly schema-drift watch (advisory)

When a Better Auth upgrade changes its tables, our hand-adapted `auth.ts`/`org.ts` can silently fall behind.

📄 **Create `scripts/check-auth-schema.mjs`:**
```js
// Compares the tables/columns Better Auth GENERATES for our config with the ones we defined.
// Names are normalised (case and underscores ignored). Advisory: it reports, a human decides.
import { execSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';

const OUT = 'src/db/schema/auth.generated.ts';
const normalise = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

function parse(source) {
  const tables = new Map();
  for (const match of source.matchAll(/pgTable\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{([\s\S]*?)\n\s*\}\s*[,)]/g)) {
    const columns = [...match[2].matchAll(/(?:text|boolean|timestamp|integer|bigint|jsonb)\(\s*["'`]([^"'`]+)["'`]/g)].map((c) => normalise(c[1]));
    tables.set(normalise(match[1]), new Set(columns));
  }
  return tables;
}

// 🔍 flags (-y to skip the overwrite prompt) follow the current CLI
execSync(`pnpm dlx @better-auth/cli@latest generate --config src/libs/Auth.ts --output ${OUT} -y`, { stdio: 'inherit' });
const generated = parse(readFileSync(OUT, 'utf8'));
rmSync(OUT);

const ours = new Map([
  ...parse(readFileSync('src/db/schema/auth.ts', 'utf8')),
  ...parse(readFileSync('src/db/schema/org.ts', 'utf8')),
]);

const problems = [];
for (const [table, columns] of generated) {
  const mine = ours.get(table);
  if (!mine) {
    problems.push(`Missing table: ${table}`);
    continue;
  }
  for (const column of columns) if (!mine.has(column)) problems.push(`Missing column: ${table}.${column}`);
}

if (problems.length > 0) {
  console.error(`❌ Our schema is behind Better Auth's:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('✅ Our schema covers everything Better Auth generates.');
```
📄 **Edit `package.json`:** `"auth:schema:check": "node scripts/check-auth-schema.mjs"`
📄 **Create `.github/workflows/schema-drift.yml`:**
```yaml
name: Auth schema drift

on:
  schedule:
    - cron: '0 6 * * 1' # Mondays 06:00 UTC
  workflow_dispatch:

permissions:
  contents: read

env:
  NEXT_PUBLIC_APP_URL: http://localhost:3100
  NEXT_PUBLIC_APP_NAME: SaaS Boilerplate
  BETTER_AUTH_SECRET: ci-only-secret-ci-only-secret-0123456789

jobs:
  drift:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup
      - run: pnpm auth:schema:check
```
> If the CLI can't load our config (path aliases, `server-only`), the job fails *loudly* — which is the point: fix the fallback described in S2-T02 rather than disabling the watch.

### ✅ Verify
1. Push the branch, open the PR: jobs `Build` → then `E2E (shard 1/2)`, `E2E (shard 2/2)` and `Visual regression` start in parallel. The shards **download** the build instead of rebuilding.
2. **Total time** < 10 minutes (look at the *Summary* page's timeline).
3. Fail one on purpose, each in a throw-away commit, and look at the artifact:
   - break a visible style → `Visual regression` fails and `visual-diffs` contains the diff images;
   - break an E2E expectation → the shard fails and `playwright-report-shard-N` has traces.
4. Increase the bundle (import a big library into the home page) → `Build` fails with "The bundle grew by more than 10 %". Revert.
5. Run the drift workflow once: *Actions → Auth schema drift → Run workflow* (or `pnpm auth:schema:check` locally) → ✅ (or a readable list of missing columns).
6. `CI OK` is the only required check and goes green.

**🚢 Ship** — branch `ci/s5-t09-e2e-visual-jobs` · message: `ci: shard e2e, add visual job, reuse build artifact, enforce bundle budget and watch auth schema drift`

---

## 🎫 S5-T10 — i18n-check as a gate

**Branch:** `ci/s5-t10-i18n-check` · **Story:** US-055 · **3 SP**

> 🎯 Translations rot silently: a key added to `en.json` and forgotten in `fr.json` shows raw keys to French users. Our Sprint-1 parity test catches *that*; `i18n-check` also catches **invalid ICU syntax** and gives a readable report. Knip has been a blocking CI gate since Sprint 0 — nothing to add there.

```bash
git switch main && git pull && git switch -c ci/s5-t10-i18n-check
pnpm add -D @lingual/i18n-check
```

### 1. Scripts

📄 **Edit `package.json`:**
```json
"i18n:check": "i18n-check --locales src/locales --source en --format next-intl",
"i18n:unused": "i18n-check --locales src/locales --source en --format next-intl --unused src"
```
> 🔍 Flag names (`--locales`, `--source`, `--format`, `--unused`) follow the tool's README at the time of writing — check `pnpm exec i18n-check --help`.

Add the check to the aggregate script (after `check:agents`):
```json
"check": "pnpm typecheck && pnpm lint && pnpm format:check && pnpm knip && pnpm check:env && pnpm check:agents && pnpm i18n:check && pnpm db:check && pnpm test && pnpm test:browser"
```

### 2. Fix what it finds

```bash
pnpm i18n:check
```
Typical findings and the right fix:

| Finding | Fix |
|---|---|
| **Missing key** in `fr.json` | Translate it (never copy the English text "to make the check pass") |
| **Invalid ICU message** (unbalanced `{}`) | Fix the braces. Apostrophes are special in ICU: `l'{org}` swallows the placeholder — write `l’{org}` (typographic apostrophe) or `l''{org}` |
| Placeholder names differ between languages (`{name}` vs `{nom}`) | Placeholders are code: keep identical names |

### 3. Where it runs

- **Pre-push** — 📄 **edit `lefthook.yml`**, under `pre-push.commands`:
```yaml
    i18n:
      run: pnpm i18n:check
```
- **CI** — 📄 **edit the `quality` job in `.github/workflows/ci.yml`**: add `- run: pnpm i18n:check` after `check:agents`.

### 4. Unused keys: report, don't block

```bash
pnpm i18n:unused
```
You will see **many** "unused" keys — and most are **false positives**, because we build keys dynamically:
- `t(\`strength.${label}\`)`, `tRoles(role)`, `t(item.key)` (computed at runtime)
- Zod messages like `'validation.email'` and error maps like `'auth.errors.invalidCredentials'` (strings in code, not `t()` calls)

📄 **Append to `docs/guides/i18n.md`:**
````markdown
## Checks
- `pnpm i18n:check` (blocking, in CI and pre-push): every key exists in **both** languages, ICU syntax is valid.
- `pnpm i18n:unused` (report only): lists keys no `t('…')` call references. **Read it, don't trust it blindly** —
  these prefixes are built dynamically and always show up: `validation.*`, `errors.*`, `auth.errors.*`, `org.roles.*`,
  `org.errors.*`, `security.score.*`, `auth.signUp.strength.*`, `emails.*`.
  Anything else in the list is a candidate for deletion.

## Adding a string (the whole workflow)
1. Add the key to `src/locales/en.json` **and** `fr.json` (same structure, same placeholders).
2. Use it via `useTranslations` / `getTranslations` (typed: a typo is a TypeScript error).
3. `pnpm i18n:check`.
````
📄 **Update `AGENTS.md`** (Conventions → i18n): *"Run `pnpm i18n:check` after touching locale files; both languages in the same commit."*

### ✅ Verify
```bash
pnpm i18n:check                # ✅
```
**Mutation checks (revert after each):**
1. Delete one key from `fr.json` → `pnpm i18n:check` **fails** naming the key; the Sprint-1 parity test fails too.
2. Break a message: `"Hello {name"` → fails with an ICU syntax error.
3. Push with the key missing → the **pre-push hook** blocks it. Push the same commit to a PR with the hook bypassed (`LEFTHOOK=0`) → CI's `Quality` job fails.
```bash
pnpm check
```

**🚢 Ship** — branch `ci/s5-t10-i18n-check` · message: `ci(i18n): gate missing keys and invalid ICU messages, report unused keys`

---

## 🎫 S5-T11 — The authorization matrix (real actions, real roles)

**Branch:** `test/s5-t11-authz-matrix` · **Story:** US-056 · **3 SP** · 🔒 risk **R-04/R-05**

> 🎯 *"Can this person do that?"* answered for **every Server Action × every kind of user**, by running the **real** code: real Better Auth, real actions, real permissions — on an in-memory database. And a meta-test makes it **impossible to add an action without deciding how it's protected**.

```bash
git switch main && git pull && git switch -c test/s5-t11-authz-matrix
mkdir -p tests/security
```

### 1. Shared mocks (only what must be faked: Next.js plumbing and the database module)

📄 **Create `tests/security/mocks.ts`:**
```ts
import { createTestDb } from '../utils/test-db';

/** The "current request" — tests set `headers` to the cookies of whoever is calling. */
export const actor = { headers: new Headers() };

export const testDb: { destroy: () => Promise<void> } = { destroy: async () => undefined };

export const nextHeadersModule = () => ({
  headers: async () => actor.headers,
  // Better Auth's nextCookies plugin may touch cookies(); nothing to persist in tests
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
    delete: () => undefined,
    has: () => false,
  }),
});

export const nextNavigationModule = () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (target: unknown) => {
    throw new Error(`REDIRECT:${JSON.stringify(target)}`);
  },
});

export const nextIntlServerModule = () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
});

export const intlNavigationModule = () => ({
  redirect: (target: unknown) => {
    throw new Error(`REDIRECT:${JSON.stringify(target)}`);
  },
  getPathname: ({ href }: { href: string }) => href,
});

/** Replaces `@/db/client` with a fresh in-memory database that has every migration applied. */
export async function testDbModule() {
  const created = await createTestDb();
  testDb.destroy = created.destroy;
  return { db: created.db };
}
```

### 2. The registry: every action must be accounted for

📄 **Create `tests/security/action-registry.ts`** (pure data — no imports from the app):
```ts
export type Coverage =
  | { kind: 'public' } // intentionally open to everyone
  | { kind: 'matrix'; requirement: string } // exercised for every actor by authz-matrix.test.ts
  | { kind: 'exempt'; reason: string }; // covered elsewhere — and you must say where

/**
 * One row per exported Server Action in src/actions/*.ts.
 * action-coverage.test.ts FAILS when an action is missing here (or a row refers to a deleted action).
 */
export const ACTION_REGISTRY: Record<string, Coverage> = {
  submitContact: { kind: 'public' },

  changePassword: { kind: 'matrix', requirement: 'signed in' },
  revokeSession: { kind: 'matrix', requirement: 'signed in; only own sessions' },
  revokeOtherSessions: { kind: 'matrix', requirement: 'signed in' },
  deletePasskey: {
    kind: 'exempt',
    reason: 'needs a real passkey. Guard: requireFreshSession (session.test.ts); lifecycle: e2e/auth-advanced.spec.ts',
  },

  createProject: { kind: 'matrix', requirement: 'org member with project:create' },
  updateProject: { kind: 'matrix', requirement: 'org member with project:update' },
  deleteProject: { kind: 'matrix', requirement: 'org member with project:delete' },

  deleteOrganization: { kind: 'matrix', requirement: 'owner + fresh session + typed name' },
  updateMemberRole: { kind: 'matrix', requirement: 'member:update + manage-target rules' },
  removeMember: { kind: 'matrix', requirement: 'member:delete + manage-target rules' },
  transferOwnership: { kind: 'matrix', requirement: 'owner + fresh session' },
  leaveOrganization: {
    kind: 'exempt',
    reason: 'destructive for the caller. Last-owner rule: org-members.test.ts; flow: e2e/tenancy.spec.ts',
  },

  banUser: { kind: 'matrix', requirement: 'platform admin' },
  unbanUser: { kind: 'matrix', requirement: 'platform admin' },
  revokeUserSessions: { kind: 'matrix', requirement: 'platform admin' },
  setUserRole: { kind: 'matrix', requirement: 'platform admin' },
  startImpersonation: { kind: 'matrix', requirement: 'platform admin (admin success path: e2e/admin.spec.ts)' },
  stopImpersonation: { kind: 'matrix', requirement: 'signed in AND impersonating' },
};
```
📄 **Create `tests/security/action-coverage.test.ts`** — the meta-test (no database needed):
```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { ACTION_REGISTRY } from './action-registry';

const ACTIONS_DIR = path.join('src', 'actions');

function exportedActions(): string[] {
  return readdirSync(ACTIONS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .flatMap((file) =>
      [...readFileSync(path.join(ACTIONS_DIR, file), 'utf8').matchAll(/export async function (\w+)\(/g)].map((match) => match[1]!),
    );
}

it('every Server Action is classified in the registry (add a row → decide how it is protected)', () => {
  const missing = exportedActions().filter((name) => !(name in ACTION_REGISTRY));
  expect(missing, `New action(s) without a security classification: ${missing.join(', ')}\nAdd them to tests/security/action-registry.ts`).toEqual([]);
});

it('the registry has no rows for actions that no longer exist', () => {
  const stale = Object.keys(ACTION_REGISTRY).filter((name) => !exportedActions().includes(name));
  expect(stale, `Stale registry rows: ${stale.join(', ')}`).toEqual([]);
});

it('exempt rows must explain where the action is covered', () => {
  for (const [name, coverage] of Object.entries(ACTION_REGISTRY)) {
    if (coverage.kind === 'exempt') expect(coverage.reason.length, name).toBeGreaterThan(20);
  }
});
```

### 3. The matrix

📄 **Create `tests/security/authz-matrix.test.ts`:**
```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// ── Fake ONLY the Next.js plumbing and the database module; everything else is the real thing ──
vi.mock('next/headers', async () => (await import('./mocks')).nextHeadersModule());
vi.mock('next/navigation', async () => (await import('./mocks')).nextNavigationModule());
vi.mock('next-intl/server', async () => (await import('./mocks')).nextIntlServerModule());
vi.mock('@/i18n/navigation', async () => (await import('./mocks')).intlNavigationModule());
vi.mock('@/db/client', async () => (await import('./mocks')).testDbModule());

import { changePassword, revokeOtherSessions, revokeSession } from '@/actions/account';
import { banUser, revokeUserSessions, setUserRole, startImpersonation, stopImpersonation, unbanUser } from '@/actions/admin';
import { deleteOrganization, removeMember, transferOwnership, updateMemberRole } from '@/actions/organization';
import { createProject, deleteProject, updateProject } from '@/actions/projects';
import { createTenantDb } from '@/data/tenant-db';
import { db as mockedDb } from '@/db/client';
import { user } from '@/db/schema';
import { auth } from '@/libs/Auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';
import type { ActionResult } from '@/utils/action';

import { userFactory } from '../factories/user.factory';
import { signIn } from '../utils/auth';
import type { TestDb } from '../utils/test-db';
import { buildWorld, type World } from '../utils/world';

import { ACTION_REGISTRY } from './action-registry';
import { actor, testDb } from './mocks';

type Outcome = 'ok' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION_ERROR';
const ACTORS = ['anon', 'outsider', 'ownerB', 'memberA', 'adminA', 'ownerA', 'platformAdmin'] as const;
type Actor = (typeof ACTORS)[number];

const db = mockedDb as unknown as TestDb;
const transport = new MemoryTransport();
let world: World;

beforeAll(async () => {
  setEmailTransport(transport);
  world = await buildWorld({ db, auth, transport });
}, 180_000);

afterAll(async () => {
  setEmailTransport(undefined);
  await testDb.destroy();
});

const headersFor = (who: Actor) => (who === 'anon' ? new Headers() : world.people[who].headers);
const classify = (result: ActionResult<unknown>): Outcome => (result.ok ? 'ok' : (result.error.code as Outcome));

async function freshProject() {
  return (await createTenantDb(db, world.orgA.id).projects.create({ name: 'tmp' }, world.people.ownerA.id)).id;
}
async function freshUser() {
  const row = userFactory.build();
  await db.insert(user).values(row);
  return row.id;
}

// ── Expectation helpers (spelled out per actor — readable, reviewable) ──
const orgScoped = (member: Outcome, admin: Outcome, owner: Outcome): Record<Actor, Outcome> => ({
  anon: 'UNAUTHENTICATED',
  outsider: 'NOT_FOUND', // signed in, not a member of org-a → "doesn't exist"
  ownerB: 'NOT_FOUND', // owner of ANOTHER tenant
  platformAdmin: 'NOT_FOUND', // platform power ≠ tenant membership
  memberA: member,
  adminA: admin,
  ownerA: owner,
});
const platformOnly = (platformAdmin: Outcome): Record<Actor, Outcome> => ({
  anon: 'UNAUTHENTICATED',
  outsider: 'FORBIDDEN',
  ownerB: 'FORBIDDEN',
  memberA: 'FORBIDDEN',
  adminA: 'FORBIDDEN',
  ownerA: 'FORBIDDEN', // an organization OWNER is not a platform admin
  platformAdmin,
});
const signedIn = (outcome: Outcome): Record<Actor, Outcome> => ({
  anon: 'UNAUTHENTICATED',
  outsider: outcome,
  ownerB: outcome,
  memberA: outcome,
  adminA: outcome,
  ownerA: outcome,
  platformAdmin: outcome,
});

type Case = {
  actors?: readonly Actor[];
  input: () => Promise<unknown> | unknown;
  call: (input: unknown) => Promise<ActionResult<unknown>>;
  expected: Record<Actor, Outcome>;
};

const ORG = 'org-a';

const CASES: Record<string, Case> = {
  createProject: {
    input: () => ({ orgSlug: ORG, name: 'Matrix', description: '', status: 'active' }),
    call: createProject,
    expected: orgScoped('ok', 'ok', 'ok'),
  },
  updateProject: {
    input: async () => ({ orgSlug: ORG, id: await freshProject(), name: 'Renamed', description: '', status: 'active' }),
    call: updateProject,
    expected: orgScoped('ok', 'ok', 'ok'),
  },
  deleteProject: {
    input: async () => ({ orgSlug: ORG, id: await freshProject() }),
    call: deleteProject,
    expected: orgScoped('FORBIDDEN', 'ok', 'ok'), // members may not delete
  },
  deleteOrganization: {
    // A wrong confirmation word: whoever PASSES the gate gets a validation error, nobody deletes anything
    input: () => ({ orgSlug: ORG, confirm: 'not the name' }),
    call: deleteOrganization,
    expected: orgScoped('FORBIDDEN', 'FORBIDDEN', 'VALIDATION_ERROR'),
  },
  updateMemberRole: {
    // A non-existent target: passing the gate shows up as NOT_FOUND, failing it as FORBIDDEN
    input: () => ({ orgSlug: ORG, memberId: 'no-such-member', role: 'member' }),
    call: updateMemberRole,
    expected: orgScoped('FORBIDDEN', 'NOT_FOUND', 'NOT_FOUND'),
  },
  removeMember: {
    input: () => ({ orgSlug: ORG, memberId: 'no-such-member' }),
    call: removeMember,
    expected: orgScoped('FORBIDDEN', 'NOT_FOUND', 'NOT_FOUND'),
  },
  transferOwnership: {
    input: () => ({ orgSlug: ORG, memberId: 'no-such-member' }),
    call: transferOwnership,
    expected: orgScoped('FORBIDDEN', 'FORBIDDEN', 'NOT_FOUND'), // owners only
  },

  banUser: { input: async () => ({ userId: await freshUser() }), call: banUser, expected: platformOnly('ok') },
  unbanUser: { input: async () => ({ userId: await freshUser() }), call: unbanUser, expected: platformOnly('ok') },
  revokeUserSessions: {
    input: async () => ({ userId: await freshUser() }),
    call: revokeUserSessions,
    expected: platformOnly('ok'),
  },
  setUserRole: {
    input: async () => ({ userId: await freshUser(), role: 'user' }),
    call: setUserRole,
    expected: platformOnly('ok'),
  },
  startImpersonation: {
    // The admin SUCCESS path sets cookies (e2e/admin.spec.ts); here we prove everybody else is refused
    actors: ACTORS.filter((who) => who !== 'platformAdmin'),
    input: async () => ({ userId: await freshUser() }),
    call: startImpersonation,
    expected: platformOnly('FORBIDDEN'),
  },
  stopImpersonation: {
    input: () => ({}),
    call: () => stopImpersonation(),
    expected: signedIn('FORBIDDEN'), // nobody here is impersonating
  },

  changePassword: {
    // Wrong current password: passing the gate surfaces as a field validation error
    input: () => ({
      currentPassword: 'not-my-password',
      newPassword: 'Str0ng-Passw0rd-New1',
      confirmPassword: 'Str0ng-Passw0rd-New1',
      revokeOtherSessions: false,
    }),
    call: changePassword,
    expected: signedIn('VALIDATION_ERROR'),
  },
  revokeSession: {
    input: () => ({ sessionId: 'someone-elses-session' }),
    call: revokeSession,
    expected: signedIn('NOT_FOUND'),
  },
  revokeOtherSessions: { input: () => ({}), call: () => revokeOtherSessions(), expected: signedIn('ok') },
};

describe('the matrix covers exactly what the registry says it covers', () => {
  it('has a case for every "matrix" action — and for nothing else', () => {
    const declared = Object.entries(ACTION_REGISTRY)
      .filter(([, coverage]) => coverage.kind === 'matrix')
      .map(([name]) => name)
      .sort();
    expect(Object.keys(CASES).sort()).toEqual(declared);
  });
});

for (const [name, testCase] of Object.entries(CASES)) {
  describe(`${name}  (${ACTION_REGISTRY[name]?.kind === 'matrix' ? ACTION_REGISTRY[name].requirement : '?'})`, () => {
    const actors = testCase.actors ?? ACTORS;

    it.each(actors)('%s', async (who) => {
      actor.headers = headersFor(who);
      const result = await testCase.call(await testCase.input());
      expect(classify(result), `${name} as ${who}: ${JSON.stringify(result)}`).toBe(testCase.expected[who]);
    });
  });
}
```
> 🔍 If a case fails with a **different code** than expected, decide which side is wrong: the expectation table is the *policy*. Change the policy only deliberately (and in the same PR as `docs/guides/rbac.md`).
> 🔎 Why the clever "non-existent target" inputs? They let us observe the permission gate **without** mutating anything: a member is stopped *before* the target is looked up (`FORBIDDEN`), an admin gets *past* the gate and fails on the missing target (`NOT_FOUND`).

### ✅ Verify
```bash
pnpm test tests/security                 # the whole suite (≈ 15–40 s, six real sign-ins)
```
Expect ~**110** assertions, all green. Now prove the suite has teeth — **each of these must make it fail** (revert after each):
1. In `deleteProject` (`src/actions/projects.ts`) change `{ project: ['delete'] }` to `{ project: ['read'] }` → `deleteProject as memberA` fails.
2. In `getAdminOrThrow` remove the `isPlatformAdmin` check → every `platformOnly` case fails for owners/members.
3. In `src/actions/projects.ts` add a new exported action `export async function archiveProject() {…}` → `action-coverage.test.ts` fails with *"New action(s) without a security classification: archiveProject"*.
4. In `getOrgMembershipOrThrow` return the membership without checking the user → `outsider`/`ownerB` cases fail.

Record the four "it failed as expected" results in the PR description.

**🚢 Ship** — branch `test/s5-t11-authz-matrix` · message: `test(security): run every server action against every role and fail on unclassified actions`

---

## 🎫 S5-T12 — IDOR, injection and mass-assignment regression tests

**Branch:** `test/s5-t12-idor-injection` · **Story:** US-056 · **2 SP** · 🔒

> 🎯 The matrix proves *roles*. These tests prove **identifiers and input**: swapping an id for someone else's, sending hostile strings, or adding fields the form never offered.

```bash
git switch main && git pull && git switch -c test/s5-t12-idor-injection
pnpm add -D cross-env              # skip if it's already there (S0-T09 fallback)
```

### 1. A real bug the tests will find

A **null byte** (`\u0000`) in text is rejected by PostgreSQL → our action would answer `INTERNAL` (a 500). Reject it at the boundary:

📄 **Create `src/validations/common.ts`:**
```ts
/** PostgreSQL text columns cannot contain NUL; reject early instead of failing deep in the driver. */
export const noNullBytes = (value: string) => !value.includes('\u0000');
export const NO_NULL_BYTES_MESSAGE = { message: 'validation.invalid' } as const;
```
📄 **Edit `src/validations/project.ts`:**
```ts
import { NO_NULL_BYTES_MESSAGE, noNullBytes } from './common';

export const projectSchema = z.object({
  name: z.string().trim().min(1, { message: 'validation.projectName' }).max(80, { message: 'validation.projectName' }).refine(noNullBytes, NO_NULL_BYTES_MESSAGE),
  description: z.string().trim().max(500, { message: 'validation.projectDescription' }).refine(noNullBytes, NO_NULL_BYTES_MESSAGE),
  status: z.enum(['active', 'archived']),
});
```
Apply the same `.refine(noNullBytes, NO_NULL_BYTES_MESSAGE)` to the free-text fields in `src/validations/org.ts` (`name`), `src/validations/auth.ts` (`name`) and `src/validations/contact.ts` (`name`, `message`).

### 2. The suite

📄 **Create `tests/security/idor.test.ts`:**
```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', async () => (await import('./mocks')).nextHeadersModule());
vi.mock('next/navigation', async () => (await import('./mocks')).nextNavigationModule());
vi.mock('next-intl/server', async () => (await import('./mocks')).nextIntlServerModule());
vi.mock('@/i18n/navigation', async () => (await import('./mocks')).intlNavigationModule());
vi.mock('@/db/client', async () => (await import('./mocks')).testDbModule());

import { revokeSession } from '@/actions/account';
import { removeMember } from '@/actions/organization';
import { createProject, deleteProject, updateProject } from '@/actions/projects';
import { db as mockedDb } from '@/db/client';
import { invitation, member, project } from '@/db/schema';
import { auth } from '@/libs/Auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import type { TestDb } from '../utils/test-db';
import { buildWorld, type World } from '../utils/world';

import { actor, testDb } from './mocks';

const db = mockedDb as unknown as TestDb;
const transport = new MemoryTransport();
let world: World;

beforeAll(async () => {
  setEmailTransport(transport);
  world = await buildWorld({ db, auth, transport });
}, 180_000);
afterAll(async () => {
  setEmailTransport(undefined);
  await testDb.destroy();
});

const as = (who: keyof World['people']) => {
  actor.headers = world.people[who].headers;
};
const code = (result: { ok: boolean; error?: { code: string } }) => (result.ok ? 'ok' : result.error?.code);

describe('swapping an id for another tenant’s id', () => {
  it('cannot update or delete another organization’s project (and nothing changes)', async () => {
    as('ownerA'); // a legitimate owner — of org-a
    const foreign = world.projects.b[0]!.id;

    expect(code(await updateProject({ orgSlug: 'org-a', id: foreign, name: 'hacked', description: '', status: 'active' }))).toBe('NOT_FOUND');
    expect(code(await deleteProject({ orgSlug: 'org-a', id: foreign }))).toBe('NOT_FOUND');

    const [row] = await db.select().from(project).where(eq(project.id, foreign));
    expect(row?.name).toBe('B secret');
  });

  it('cannot remove a member of another organization by guessing the member id', async () => {
    as('ownerA');
    const [foreignOwner] = await db.select().from(member).where(eq(member.userId, world.people.ownerB.id));

    expect(code(await removeMember({ orgSlug: 'org-a', memberId: foreignOwner!.id }))).toBe('NOT_FOUND');
    expect(await db.select().from(member).where(eq(member.id, foreignOwner!.id))).toHaveLength(1);
  });

  it('cannot revoke somebody else’s session', async () => {
    const fresh = { query: { disableCookieCache: true } } as const;
    const victimSession = await auth.api.getSession({ headers: world.people.ownerA.headers, ...fresh });

    as('memberA');
    expect(code(await revokeSession({ sessionId: victimSession!.session.id }))).toBe('NOT_FOUND');

    // the victim is still signed in
    expect(await auth.api.getSession({ headers: world.people.ownerA.headers, ...fresh })).not.toBeNull();
  });

  it('cannot cancel another organization’s invitation', async () => {
    // 🔍 method name: createInvitation / cancelInvitation
    await auth.api.createInvitation({
      body: { email: 'target@example.com', role: 'member', organizationId: world.orgB.id },
      headers: world.people.ownerB.headers,
    });
    const [pending] = await db.select().from(invitation).where(eq(invitation.organizationId, world.orgB.id));

    await expect(
      auth.api.cancelInvitation({ body: { invitationId: pending!.id }, headers: world.people.ownerA.headers }),
    ).rejects.toThrow();

    const [still] = await db.select().from(invitation).where(eq(invitation.id, pending!.id));
    expect(still?.status).toBe('pending');
  });
});

describe('mass assignment: fields the form never offered are ignored', () => {
  it('cannot choose the organization, id or author of a new project', async () => {
    as('ownerA');
    const result = await createProject({
      orgSlug: 'org-a',
      name: 'forged',
      description: '',
      status: 'active',
      // none of these exist in the schema:
      organizationId: world.orgB.id,
      id: 'forged-id',
      createdBy: world.people.ownerB.id,
    });

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(project).where(eq(project.name, 'forged'));
    expect(row?.organizationId).toBe(world.orgA.id);
    expect(row?.id).not.toBe('forged-id');
    expect(row?.createdBy).toBe(world.people.ownerA.id);
  });

  it('does not allow prototype pollution through a hostile JSON body', async () => {
    as('ownerA');
    const hostile = JSON.parse(
      '{"orgSlug":"org-a","name":"proto","description":"","status":"active","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
    );
    await createProject(hostile);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

const HOSTILE = [
  "'; DROP TABLE project; --",
  "x' OR '1'='1",
  '<script>alert(1)</script>',
  '../../etc/passwd',
  '${process.env.BETTER_AUTH_SECRET}',
  '\u0000',
  'a\u0000b',
  '\u202Eevil', // right-to-left override
  '🙂'.repeat(50),
  'x'.repeat(100_000),
  ' ',
  '',
];

describe('hostile input never produces a server error', () => {
  it.each(HOSTILE.map((value) => [JSON.stringify(value).slice(0, 40), value]))('project name %s', async (_label, value) => {
    as('ownerA');
    const result = await createProject({ orgSlug: 'org-a', name: value, description: '', status: 'active' });

    // Either accepted (and stored literally) or rejected by validation — never INTERNAL
    expect(['ok', 'VALIDATION_ERROR']).toContain(code(result));
  });

  it('SQL-looking names are stored literally and the table survives', async () => {
    as('ownerA');
    const evil = "'; DROP TABLE project; --";
    const result = await createProject({ orgSlug: 'org-a', name: evil, description: '', status: 'active' });
    expect(result.ok).toBe(true);

    const [row] = await db.select().from(project).where(eq(project.name, evil));
    expect(row?.name).toBe(evil); // parameterised queries: it is just text
    expect((await db.select().from(project)).length).toBeGreaterThan(3); // the table is intact
  });
});

describe('authentication does not reveal which emails exist', () => {
  it('unknown email and wrong password produce the SAME error', async () => {
    const wrongPassword = await auth.api
      .signInEmail({ body: { email: world.people.ownerA.email, password: 'definitely-wrong-123' } })
      .catch((error: { body?: { code?: string } }) => error.body?.code);
    const unknownEmail = await auth.api
      .signInEmail({ body: { email: 'nobody-at-all@example.com', password: 'definitely-wrong-123' } })
      .catch((error: { body?: { code?: string } }) => error.body?.code);

    expect(wrongPassword).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect(unknownEmail).toBe(wrongPassword);
  });

  it('password reset answers identically for known and unknown emails', async () => {
    // 🔍 method name: requestPasswordReset (older: forgetPassword)
    const known = await auth.api.requestPasswordReset({ body: { email: world.people.ownerA.email, redirectTo: '/reset-password' } });
    const unknown = await auth.api.requestPasswordReset({ body: { email: 'nobody-at-all@example.com', redirectTo: '/reset-password' } });
    expect(unknown).toEqual(known);
  });
});
```

### 3. Timing sanity (opt-in — timing tests are noisy)

📄 **Create `tests/security/timing.test.ts`:**
```ts
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

vi.mock('next/headers', async () => (await import('./mocks')).nextHeadersModule());
vi.mock('next/navigation', async () => (await import('./mocks')).nextNavigationModule());
vi.mock('next-intl/server', async () => (await import('./mocks')).nextIntlServerModule());
vi.mock('@/i18n/navigation', async () => (await import('./mocks')).intlNavigationModule());
vi.mock('@/db/client', async () => (await import('./mocks')).testDbModule());

import { db as mockedDb } from '@/db/client';
import { auth } from '@/libs/Auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import type { TestDb } from '../utils/test-db';
import { createUserWithSession } from '../utils/auth';

import { testDb } from './mocks';

const db = mockedDb as unknown as TestDb;
const transport = new MemoryTransport();
let knownEmail = '';

beforeAll(async () => {
  setEmailTransport(transport);
  knownEmail = (await createUserWithSession({ db, auth, transport })).email;
}, 60_000);
afterAll(async () => {
  setEmailTransport(undefined);
  await testDb.destroy();
});

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

async function timeSignIn(email: string) {
  const samples: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    const started = performance.now();
    await auth.api.signInEmail({ body: { email, password: 'definitely-wrong-123' } }).catch(() => undefined);
    samples.push(performance.now() - started);
  }
  return median(samples);
}

// Run with: pnpm test:timing   (noisy on shared machines, so it is not part of the normal suite)
it.skipIf(!process.env.RUN_TIMING_TESTS)('sign-in takes about as long for unknown emails as for known ones', async () => {
  const known = await timeSignIn(knownEmail);
  const unknown = await timeSignIn('nobody-at-all@example.com');
  const ratio = known / unknown;

  console.info(`median known=${known.toFixed(0)}ms unknown=${unknown.toFixed(0)}ms ratio=${ratio.toFixed(2)}`);
  expect(ratio).toBeGreaterThan(0.4);
  expect(ratio).toBeLessThan(2.5);
}, 120_000);
```
📄 **Edit `package.json`:** `"test:timing": "cross-env RUN_TIMING_TESTS=1 vitest run --project unit tests/security/timing.test.ts"`

### ✅ Verify
```bash
pnpm test tests/security          # matrix + idor + coverage meta-test (timing is skipped)
pnpm test:timing                  # run once, on a quiet machine; record the ratio
pnpm check
```
Mutation proofs (revert after each):
1. In `tenant-db.ts` remove `inOrg` from `update`'s `where` → *"cannot update … another organization’s project"* fails.
2. Remove `.refine(noNullBytes, …)` from `projectSchema` → the `\u0000` rows fail with `INTERNAL`.
3. In `createProject`'s schema use `.passthrough()` and spread `input` into `create` → the mass-assignment test fails.
4. In `src/actions/account.ts` (`revokeSession`) drop the "only the caller's own sessions" lookup and revoke by id directly → the session-IDOR test fails.

**🚢 Ship** — branch `test/s5-t12-idor-injection` · message: `test(security): add idor, mass-assignment, hostile-input and enumeration regression tests`

---

## 🎫 S5-T13 — Component-test gap closure

**Branch:** `test/s5-t13-component-tests` · **Story:** US-057 · **5 SP**

> 🎯 Raise real coverage on the UI that carries logic: **forms, auth, org, account**. Target **≥ 70 %** on those folders, then raise the global thresholds to **80 / 80 / 70**.

```bash
git switch main && git pull && git switch -c test/s5-t13-component-tests
```

### 1. Find the gaps

```bash
pnpm test:coverage && pnpm coverage:summary
```
Open `coverage/index.html` → sort by *uncovered lines* → work through the biggest files in `src/components/{forms,auth,org,account}` first.

### 2. Shared browser-test plumbing

📄 **Create `tests/utils/browser-mocks.tsx`** — a stand-in for next-intl's navigation so components can be rendered without a Next.js app:
```tsx
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { vi } from 'vitest';

export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() };

export const navigationModule = {
  useRouter: () => router,
  usePathname: () => '/',
  redirect: vi.fn(),
  getPathname: ({ href, locale }: { href: string; locale?: string }) => (locale && locale !== 'en' ? `/${locale}${href}` : href),
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
};

export const resetRouter = () => {
  for (const fn of Object.values(router)) fn.mockReset();
};
```
📄 **Extend `tests/utils/render.tsx`** — optional locale:
```tsx
import fr from '@/locales/fr.json';

export function renderWithIntl(ui: ReactNode, { locale = 'en' }: { locale?: 'en' | 'fr' } = {}) {
  const messages = locale === 'fr' ? fr : en; // import en as before
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}
```
Pattern used in every test below (one line per module you need to fake):
```ts
vi.mock('@/i18n/navigation', async () => (await import('../../../tests/utils/browser-mocks')).navigationModule);
```

### 3. Tests that pay for themselves

📄 **Create `src/components/auth/sign-in-form.test.tsx`:**
```tsx
import { beforeEach, expect, test, vi } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';

import { SignInForm } from './sign-in-form';

const signInEmail = vi.hoisted(() => vi.fn());
const sendVerificationEmail = vi.hoisted(() => vi.fn());
const nextRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('@/libs/AuthClient', () => ({ authClient: { signIn: { email: signInEmail }, sendVerificationEmail } }));
vi.mock('@/hooks/use-passkey-autofill', () => ({ usePasskeyAutofill: () => undefined }));
vi.mock('next/navigation', () => ({ useRouter: () => nextRouter }));
vi.mock('@/i18n/navigation', async () => (await import('../../../tests/utils/browser-mocks')).navigationModule);

beforeEach(() => {
  signInEmail.mockReset();
  sendVerificationEmail.mockReset();
  nextRouter.push.mockReset();
});

async function submit(screen: Awaited<ReturnType<typeof renderWithIntl>>) {
  await screen.getByLabelText('Email', { exact: true }).fill('ada@example.com');
  await screen.getByLabelText('Password', { exact: true }).fill('Whatever-123456');
  await screen.getByRole('button', { name: 'Sign in' }).click();
}

test('empty submit shows translated errors and calls nothing', async () => {
  const screen = await renderWithIntl(<SignInForm callbackUrl="/dashboard" />);
  await screen.getByRole('button', { name: 'Sign in' }).click();

  await expect.element(screen.getByText('Enter a valid email address')).toBeVisible();
  expect(signInEmail).not.toHaveBeenCalled();
});

test('bad credentials show ONE generic message', async () => {
  signInEmail.mockResolvedValue({ data: null, error: { code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 } });
  const screen = await renderWithIntl(<SignInForm callbackUrl="/dashboard" />);
  await submit(screen);

  await expect.element(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.');
  expect(nextRouter.push).not.toHaveBeenCalled();
});

test('success navigates to the (already sanitised) callback URL', async () => {
  signInEmail.mockResolvedValue({ data: { user: {} }, error: null });
  const screen = await renderWithIntl(<SignInForm callbackUrl="/fr/dashboard/acme" />);
  await submit(screen);

  await vi.waitFor(() => expect(nextRouter.push).toHaveBeenCalledWith('/fr/dashboard/acme'));
});

test('a second factor sends the user to the challenge page, carrying the callback', async () => {
  signInEmail.mockResolvedValue({ data: { twoFactorRedirect: true }, error: null });
  const screen = await renderWithIntl(<SignInForm callbackUrl="/dashboard" />);
  await submit(screen);

  await vi.waitFor(() =>
    expect(nextRouter.push).toHaveBeenCalledWith('/two-factor?callbackUrl=%2Fdashboard'),
  );
});

test('an unverified email triggers a fresh verification link and explains why', async () => {
  signInEmail.mockResolvedValue({ data: null, error: { code: 'EMAIL_NOT_VERIFIED', status: 403 } });
  const screen = await renderWithIntl(<SignInForm callbackUrl="/dashboard" />);
  await submit(screen);

  await expect.element(screen.getByRole('alert')).toHaveTextContent('verify your email');
  expect(sendVerificationEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'ada@example.com' }));
});
```
📄 **Create `src/components/org/invite-member-form.test.tsx`:**
```tsx
import { beforeEach, expect, test, vi } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';

import { InviteMemberForm } from './invite-member-form';

const inviteMember = vi.hoisted(() => vi.fn());
vi.mock('@/libs/AuthClient', () => ({ authClient: { organization: { inviteMember } } }));
vi.mock('@/i18n/navigation', async () => (await import('../../../tests/utils/browser-mocks')).navigationModule);

beforeEach(() => inviteMember.mockReset());

test('rejects an invalid email without calling the server', async () => {
  const screen = await renderWithIntl(<InviteMemberForm organizationId="org-1" roles={['admin', 'member']} />);
  await screen.getByLabelText('Email address').fill('not-an-email');
  await screen.getByRole('button', { name: 'Send invitation' }).click();

  await expect.element(screen.getByText('Enter a valid email address')).toBeVisible();
  expect(inviteMember).not.toHaveBeenCalled();
});

test('invites with the organization id and the default role "member"', async () => {
  inviteMember.mockResolvedValue({ data: {}, error: null });
  const screen = await renderWithIntl(<InviteMemberForm organizationId="org-1" roles={['admin', 'member']} />);
  await screen.getByLabelText('Email address').fill('new@example.com');
  await screen.getByRole('button', { name: 'Send invitation' }).click();

  await vi.waitFor(() =>
    expect(inviteMember).toHaveBeenCalledWith({ email: 'new@example.com', role: 'member', organizationId: 'org-1' }),
  );
});

test('shows a translated message when the person is already a member', async () => {
  inviteMember.mockResolvedValue({ data: null, error: { code: 'USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION', status: 400 } });
  const screen = await renderWithIntl(<InviteMemberForm organizationId="org-1" roles={['member']} />);
  await screen.getByLabelText('Email address').fill('mia@example.com');
  await screen.getByRole('button', { name: 'Send invitation' }).click();

  await expect.element(screen.getByText('This person is already a member.')).toBeVisible();
});

test('speaks French', async () => {
  const screen = await renderWithIntl(<InviteMemberForm organizationId="org-1" roles={['member']} />, { locale: 'fr' });
  await expect.element(screen.getByRole('button', { name: "Envoyer l'invitation" })).toBeVisible();
});
```
📄 **Create `src/components/org/members-table.test.tsx`:**
```tsx
import { beforeEach, expect, test, vi } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';

import { MembersTable } from './members-table';

const actions = vi.hoisted(() => ({
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  leaveOrganization: vi.fn(),
}));
vi.mock('@/actions/organization', () => actions);
vi.mock('@/i18n/navigation', async () => (await import('../../../tests/utils/browser-mocks')).navigationModule);

const members = [
  { memberId: 'm1', name: 'Olivia Owner', email: 'o@example.com', role: 'owner', joinedAt: '2026-01-01T00:00:00Z' },
  { memberId: 'm2', name: 'Adam Admin', email: 'a@example.com', role: 'admin', joinedAt: '2026-01-02T00:00:00Z' },
  { memberId: 'm3', name: 'Mia Member', email: 'm@example.com', role: 'member', joinedAt: '2026-01-03T00:00:00Z' },
];

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset().mockResolvedValue({ ok: true, data: {} });
});

test('an owner can change roles of admins/members and remove them — but not touch other owners', async () => {
  const screen = await renderWithIntl(<MembersTable orgSlug="acme" members={members} currentMemberId="m1" actorRole="owner" />);

  await expect.element(screen.getByRole('combobox', { name: /Adam Admin/ })).toBeVisible();
  await expect.element(screen.getByRole('combobox', { name: /Mia Member/ })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove' }).elements()).toHaveLength(2);
  await expect.element(screen.getByRole('button', { name: 'Leave organization' })).toBeVisible(); // own row
});

test('an admin may manage only plain members', async () => {
  const screen = await renderWithIntl(<MembersTable orgSlug="acme" members={members} currentMemberId="m2" actorRole="admin" />);

  await expect.element(screen.getByRole('combobox', { name: /Mia Member/ })).toBeVisible();
  expect(screen.getByRole('combobox', { name: /Olivia Owner/ }).elements()).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Remove' }).elements()).toHaveLength(1);
});

test('a member sees the list but no controls except "Leave"', async () => {
  const screen = await renderWithIntl(<MembersTable orgSlug="acme" members={members} currentMemberId="m3" actorRole="member" />);

  expect(screen.getByRole('combobox').elements()).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Remove' }).elements()).toHaveLength(0);
  await expect.element(screen.getByRole('button', { name: 'Leave organization' })).toBeVisible();
});

test('Remove calls the server action with the right ids', async () => {
  const screen = await renderWithIntl(<MembersTable orgSlug="acme" members={members} currentMemberId="m1" actorRole="owner" />);
  await screen.getByRole('button', { name: 'Remove' }).first().click();

  await vi.waitFor(() => expect(actions.removeMember).toHaveBeenCalledWith({ orgSlug: 'acme', memberId: 'm2' }));
});
```
📄 **Create `src/components/account/backup-codes.test.tsx`:**
```tsx
import { expect, test, vi } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';

import { BackupCodes } from './backup-codes';

const codes = ['aaaaa-bbbbb', 'ccccc-ddddd', 'eeeee-fffff'];

test('shows every code and keeps "Done" disabled until the user confirms they saved them', async () => {
  const onDone = vi.fn();
  const screen = await renderWithIntl(<BackupCodes codes={codes} onDone={onDone} />);

  for (const code of codes) await expect.element(screen.getByText(code)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Done' })).toBeDisabled();

  await screen.getByLabelText('I have saved my backup codes').click();
  await expect.element(screen.getByRole('button', { name: 'Done' })).toBeEnabled();

  await screen.getByRole('button', { name: 'Done' }).click();
  expect(onDone).toHaveBeenCalledOnce();
});
```
📄 **Create `src/components/account/totp-setup.test.tsx`:**
```tsx
import { beforeEach, expect, test, vi } from 'vitest';

import { renderWithIntl } from '../../../tests/utils/render';

import { TotpSetup } from './totp-setup';

const enable = vi.hoisted(() => vi.fn());
const verifyTotp = vi.hoisted(() => vi.fn());
vi.mock('@/libs/AuthClient', () => ({ authClient: { twoFactor: { enable, verifyTotp } } }));
vi.mock('@/i18n/navigation', async () => (await import('../../../tests/utils/browser-mocks')).navigationModule);

const enrolment = {
  data: { totpURI: 'otpauth://totp/App:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=App', backupCodes: ['aaaaa-bbbbb'] },
  error: null,
};

beforeEach(() => {
  enable.mockReset().mockResolvedValue(enrolment);
  verifyTotp.mockReset();
});

async function reachScanStep(screen: Awaited<ReturnType<typeof renderWithIntl>>) {
  await screen.getByLabelText('Confirm your password').fill('Str0ng-Passw0rd!');
  await screen.getByRole('button', { name: 'Enable two-factor' }).click();
}

test('needs the password first, then shows the QR code and the manual key', async () => {
  const screen = await renderWithIntl(<TotpSetup />);
  await expect.element(screen.getByRole('button', { name: 'Enable two-factor' })).toBeDisabled();

  await reachScanStep(screen);
  await expect.element(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeVisible();
  expect(enable).toHaveBeenCalledWith({ password: 'Str0ng-Passw0rd!' });
});

test('a malformed code never reaches the server', async () => {
  const screen = await renderWithIntl(<TotpSetup />);
  await reachScanStep(screen);

  await screen.getByLabelText('6-digit code').fill('12');
  await screen.getByRole('button', { name: 'Verify and enable' }).click();

  await expect.element(screen.getByText('Enter the 6-digit code')).toBeVisible();
  expect(verifyTotp).not.toHaveBeenCalled();
});

test('a wrong code is explained and 2FA is not considered enabled', async () => {
  verifyTotp.mockResolvedValue({ data: null, error: { code: 'INVALID_CODE', status: 400 } });
  const screen = await renderWithIntl(<TotpSetup />);
  await reachScanStep(screen);

  await screen.getByLabelText('6-digit code').fill('123456');
  await screen.getByRole('button', { name: 'Verify and enable' }).click();

  await expect.element(screen.getByText(/not valid/)).toBeVisible();
  expect(screen.getByText('Save your backup codes').elements()).toHaveLength(0);
});

test('a valid code moves on to the backup codes', async () => {
  verifyTotp.mockResolvedValue({ data: {}, error: null });
  const screen = await renderWithIntl(<TotpSetup />);
  await reachScanStep(screen);

  await screen.getByLabelText('6-digit code').fill('123456');
  await screen.getByRole('button', { name: 'Verify and enable' }).click();

  await expect.element(screen.getByText('aaaaa-bbbbb')).toBeVisible();
});
```

### 4. The rest of the checklist (same patterns — pick by uncovered lines)

| Component | What to assert |
|---|---|
| `forgot-password-form` | invalid email blocked; **same** confirmation screen on success and on error |
| `reset-password-form` | mismatch/complexity errors; success toast + redirect to sign-in; API error shown |
| `check-email` | resend disabled during the cooldown; success message after resend |
| `create-organization-form` | slug auto-fills from the name until edited; "taken" hint disables submit |
| `pending-invitations` | expired label; resend/revoke call the client with the right ids; hidden controls when `canManage` is false |
| `project-form` | create vs edit mode, server field errors land under the field, `router.push` to the new project |
| `user-menu` | initials from the name, sign-out calls the client then redirects |
| `passkeys-card` | "unsupported" message; `REAUTH_REQUIRED` shows the re-auth notice |
| `connected-accounts`, `security-score` | already covered in S3-T11 |

### 5. Raise the bar

```bash
pnpm test:coverage && pnpm coverage:summary
```
Target **≥ 70 %** lines on `src/components/forms`, `auth`, `org`, `account`. Then raise the thresholds:

📄 **Edit `vitest.config.ts`:**
```ts
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
        'src/data/**': { lines: 85 },
        'src/libs/**': { lines: 85 },
      },
```
If a number is out of reach, **write the missing tests** or lower it by the smallest possible step and record why in `06-project-state.md` — don't exclude files to hit the number.

### ✅ Verify
```bash
pnpm test:browser && pnpm test:coverage && pnpm check
```
- No test uses `setTimeout`/sleeps (grep: `git grep -n "setTimeout" -- 'src/**/*.test.tsx'` → nothing). Use `vi.waitFor` or `expect.element`.
- Run the browser project **5 times** to check for flakes: `for i in 1 2 3 4 5; do pnpm test:browser || break; done` (🪟 Git Bash).
- **Mutation spot-checks** (revert after each): in `BackupCodes` remove `disabled={!saved}` → the "Done stays disabled" test fails; in `SignInForm` drop the `twoFactorRedirect` branch → the 2FA test fails; in `InviteMemberForm` hard-code `role: 'admin'` → the default-role test fails. Record the three results in the PR.

**🚢 Ship** — branch `test/s5-t13-component-tests` · message: `test(ui): add component tests for auth, org and account flows and raise coverage thresholds`

---

## 🧾 Sprint 5 wrap-up

**Branch:** `docs/s5-wrap-up`
```bash
git switch main && git pull && git switch -c docs/s5-wrap-up
```

### 1. Update `docs/guides/testing.md`
Append:
````markdown
## The security suites (`tests/security/`)
| File | Proves |
|---|---|
| `authz-matrix.test.ts` | every Server Action × every kind of user, with the REAL actions and Better Auth |
| `action-coverage.test.ts` | every exported action is classified in `action-registry.ts` (add an action → decide its protection) |
| `idor.test.ts` | swapped ids, mass assignment, hostile input, no account enumeration |
| `timing.test.ts` | (opt-in: `pnpm test:timing`) known vs unknown email take similar time |

**Adding a Server Action:** (1) write it with `withOrgPermission` / `getAdminOrThrow` / `withAuth`, (2) add a row to
`tests/security/action-registry.ts`, (3) add a `CASES` entry (or an `exempt` row saying where it's covered),
(4) add its name to `.storybook/stubs/actions.ts`.

## Coverage
Thresholds live in `vitest.config.ts` (80 / 80 / 70; `src/data` and `src/libs` 85). Excluded on purpose (TD-08): shadcn
primitives and Next route files. `pnpm coverage:summary` prints the per-folder picture.

## CI map
`CI OK` (the only required check) ← Quality · Tests+coverage · Build · Storybook · E2E ×2 shards · Visual · Commit messages.
````

### 2. Update `AGENTS.md`
**Commands:** `pnpm storybook`, `pnpm e2e:visual`, `pnpm e2e:reset`, `pnpm coverage:summary`, `pnpm bundle:size`, `pnpm i18n:check`, `pnpm test:timing`, `pnpm auth:schema:check`.
**Conventions / testing:**
```markdown
- New Server Action → row in `tests/security/action-registry.ts` AND a matrix case (or an `exempt` reason) AND a stub in `.storybook/stubs/actions.ts`.
- New UI component → a story (default + error/empty + French/dark if relevant) and, if it has logic, a browser test.
- E2E specs use persona fixtures (`ownerPage`, `adminPage`, `memberPage`, `platformAdminPage`); UI sign-in only in `auth*.spec.ts`.
- NEVER commit visual baselines from your machine: add the `update-snapshots` label to the PR.
- Locale changes: both languages together, then `pnpm i18n:check`.
- Free text accepted from users must reject NUL bytes (`noNullBytes` in src/validations/common.ts).
```
```bash
pnpm check:agents
```

### 3. Update `docs/roadmap/06-project-state.md`
- **Last completed sprint:** Sprint 5 · **Current sprint:** Sprint 6
- **Tooling added:** Storybook, visual regression (64 baselines, CI-generated), coverage thresholds + Codecov, `CI OK` aggregate check, E2E stack on 3100/5434 with personas, bundle budget, i18n-check, authz matrix + IDOR suites, weekly schema-drift workflow
- **Measured (fill in):** PR CI time before → after · `pnpm e2e` before → after · coverage before → after (total and `src/components/*`) · browser tests 5× flake result · timing-test ratio
- **Deviations:** see the decisions table at the top of the Sprint 5 tutorial + any tool flags/names you had to change
- **Risk register:** R-07 (flaky passkey/TOTP) — outcome of the repeat runs; R-09 (visual flake) — baselines CI-only; R-04/R-05 — matrix + mutation proofs recorded
- **Debt:** TD-03 (visual on one browser only), TD-08 (coverage exclusions), unused-key report is advisory

Tick the checkboxes in `docs/roadmap/sprint-05-quality-testing.md`, then:
```bash
pnpm check
git add -A
git commit -m "docs: document test suites and update project state for sprint 5"
git push -u origin docs/s5-wrap-up
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
git tag -a v0.5.1 -m "chore: sprint 5 complete — quality and testing maturity"
git push origin v0.5.1
```

---

## 🏁 Sprint 5 — Definition of Done

- [ ] `pnpm storybook` and `pnpm build-storybook` work; **≥ 15 stories** (we have 33); the a11y panel shows **no critical violations**
- [ ] E2E runs on its **own database and app** (5434 / 3100); specs start from **persona sessions**; the suite is **≥ 40 % faster** than before (or the gain is documented)
- [ ] Visual regression: 64 baselines **generated by CI**; a deliberate style change fails the `Visual` job with diff images; the local guard blocks committing screenshots
- [ ] Coverage thresholds enforced (80 / 80 / 70, `src/data` + `src/libs` 85) and uploaded to Codecov; badge in the README
- [ ] PR pipeline **< 10 minutes**; docs-only PRs skip the heavy jobs; **`CI OK`** is the single required check
- [ ] E2E sharded in two, using the build artifact; bundle budget enforced (+10 %)
- [ ] `i18n:check` blocks missing keys and invalid ICU in pre-push **and** CI
- [ ] Authz matrix green **and** fails when a new Server Action isn't classified (mutation proofs recorded)
- [ ] IDOR / injection / mass-assignment suites green; NUL-byte bug fixed; enumeration tests green
- [ ] Forms/auth/org/account folders ≥ 70 % covered; browser tests stable over 5 repeats
- [ ] `docs/guides/testing.md` + `visual-testing.md` written; `06-project-state.md` updated; tag `v0.5.1`

### 🎬 Sprint review — measurable acceptance

| Check | Expected |
|---|---|
| Break a style on purpose | `Visual` job fails and uploads diffs |
| Remove a permission check | the authz matrix fails naming actor and action |
| Add a Server Action without a registry row | `action-coverage.test.ts` fails |
| Delete a French translation | `pnpm i18n:check` fails (pre-push and CI) |
| Lower coverage below the threshold | `Tests + coverage` fails |
| Push a docs-only change | CI finishes in seconds |
| Grow the bundle by 15 % | `Build` fails on the budget |
| PR pipeline | < 10 min |

---

## 🧯 Troubleshooting (Sprint 5)

| Symptom | Likely cause → fix |
|---|---|
| `pnpm build-storybook` fails with "Cannot resolve '@/actions/…'" or a missing export | Add the action's name to `.storybook/stubs/actions.ts` |
| Storybook: component can't find `next/navigation` pieces | `@storybook/nextjs-vite` mocks them; give `parameters.nextjs.navigation` values when a story needs params/pathname |
| E2E: `EADDRINUSE 3100` / `5434` | A previous run is still alive → `netstat -ano \| findstr :3100` → `taskkill /PID <pid> /F` |
| E2E: "world.json not found" | Global setup didn't run (a spec was started with `-c` of another config?) or `pnpm e2e:reset` deleted it mid-run → rerun `pnpm e2e` |
| E2E global setup: 404 on `/api/auth/organization/...` | Endpoint names differ in your Better Auth version → check the plugin routes; mirror the `auth.api` calls from S4-T15 |
| Visual: every test fails right after `pnpm e2e:visual` on Windows | Baselines are from Linux CI (by design). Look at the CI result instead, or add the `update-snapshots` label for intended changes |
| Visual: random 1–2 % diffs in CI | A new dynamic element → add `data-visual-mask`, or wait for it in `settle()`; fonts: check `document.fonts.ready` |
| The bot's snapshot commit left the PR "waiting for checks" | Pushes by `GITHUB_TOKEN` don't trigger CI → `git pull && git commit --allow-empty -m "ci: re-run checks" && git push` |
| `CI OK` shows failure though every job is green | A job is `cancelled` (concurrency cancelled an older run) — rerun; or the aggregate lists a renamed job in `needs` |
| Codecov upload fails on forks | Expected (no token); the step has `fail_ci_if_error: false` |
| Coverage fails after adding a page | Pages are excluded; the new **logic** you added in a component/lib needs tests |
| `i18n-check` reports "invalid" for French text | An apostrophe before `{`: use `’` or `''` |
| Authz matrix: everything is `UNAUTHENTICATED` | The mock `headers()` isn't returning the actor's cookies — `mocks.ts` must be the **same module instance** the factories import (don't import it via two different paths) |
| Authz matrix: platform admin gets `FORBIDDEN` | The session was created before the role change (cookie cache) → `buildWorld` must re-sign-in after promoting |
| `vi.mock('@/db/client', async …)` hangs | PGlite takes a few seconds to compile WASM; raise the `beforeAll` timeout (180 s) |
| `action-coverage.test.ts` fails on a helper in `src/actions` | Only `export async function` names count — keep helpers un-exported (`'use server'` files may only export async functions anyway) |
| Browser tests: `Cannot read properties of undefined (reading 'push')` | You forgot `vi.mock('@/i18n/navigation', …)` / `next/navigation` for a component that navigates |
| 🪟 Docker visual recipe overwrote `node_modules` | Don't mount your working copy into a Linux container — clone to a temp folder first, or just use the CI label workflow |

---

## ➡️ Next

Sprint 5 complete → **Sprint 6 — Observability, security & analytics** (`docs/roadmap/sprint-06-observability-security.md`): Sentry (+ Spotlight), Better Stack log shipping with request IDs, Arcjet bot/rate protection, security headers and a CSP, cookie consent, PostHog, health checks with Checkly and secret scanning. Same format: one branch per ticket, verify, PR, merge.
