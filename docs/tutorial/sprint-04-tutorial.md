# 🎓 SaaS Boilerplate (Next.js 16) — Step-by-Step Tutorial

## Sprint 4 — Multi-tenancy, RBAC, Admin & Impersonation

> Companion to `docs/roadmap/sprint-04-tenancy-rbac-admin.md`. Every `S4-Txx` section is one ticket. Tickets follow the sprint file's order. **Release gate: 0.5 MVP** — at the end of this sprint the product is a real multi-tenant app.

🪟 **Windows + Cmder:** use the **Git Bash tab**. Bash syntax and Node scripts only. Paths with `[brackets]` or `(parentheses)` **must be quoted**. Windows-specific notes are marked 🪟.

> ⚠️ **About versions.** The Better Auth **organization** and **admin** plugins are large and change between releases (option names, hooks, method names). Spots likely to differ are marked **🔍 Verify against docs**. The tests describe behaviour that must hold — _tenant isolation, role enforcement, last owner, no cross-tenant leaks_ — if a method name differs, fix the **name**, never the **assertion**.

---

## 📋 What you will have at the end

- **Organizations (tenants):** every user gets a personal workspace; create more; switch between them; URLs are `/dashboard/<org-slug>/…`
- **Invitations** by email (new or existing users), with revoke / resend / expiry
- **RBAC:** `owner`, `admin`, `member` with a permission matrix enforced **on the server**, mirrored in the UI
- **Tenant-scoped data:** a `Project` resource reachable **only** through `tenantDb(orgId)` — plus tests that prove two organizations can't see each other
- **Organization settings and members UI** (rename, change roles, remove, leave, transfer ownership, delete)
- **Platform admin console** (`/admin`): search users, ban/unban, revoke sessions, set role, **impersonate** with a banner and an **append-only audit log**
- E2E tests that exercise two browsers, two organizations and the admin console

## 🧭 Decisions & deviations (made once, here)

| Topic | Decision | Why |
| --- | --- | --- |
| Permission names | We use Better Auth's **default statement names** (`organization`, `member`, `invitation`) + our own `project` | The plugin enforces them on _its_ endpoints; renaming would desync UI and API. Mapping: invite → `invitation:create`, remove → `member:delete`, change role → `member:update` |
| Where checks live | Org management → Better Auth AC **and** our Server Actions; `project` → our `requirePermission` | Defence in depth; one source of truth (`src/libs/permissions.ts`) |
| Role source | Read from the **database on every request**, never from the cookie cache | A demoted admin loses access on the next request |
| 404 vs 403 | Foreign tenant → **404** (never confirm existence); same tenant, missing permission → redirect/403 | Prevents enumeration of other tenants' resources |
| Postgres RLS | **Spike (≤ 3 h), then deferred** → `TD-02` | PGlite/Neon superuser bypass and per-request transaction plumbing cost more than they add today |
| Admin bootstrap | **Script** `pnpm admin:grant` using `ADMIN_EMAILS` on _verified_ users — **not** a sign-up hook | A hook would hand admin to whoever registers an admin address first |
| Audit log | Plain text ids (no FKs) + DB trigger forbidding `UPDATE`/`DELETE` | Records must survive user/org deletion and can't be edited |
| Member actions | Server Actions wrapping the Better Auth API | We must enforce "last owner" and "admins can't touch owners" ourselves |
| Slug changes | Old slug simply 404s | Keeping redirects is a post-launch nicety |

---

## 🔀 Git workflow (PR-based)

```bash
git switch main && git pull
git switch -c <type>/s4-tXX-<slug>
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

Each ticket ends with a **🚢 Ship** line. Run `pnpm pin` after adding dependencies. Schema migrations are **sequential** (T01 org tables, T09 project, T13 admin columns, T14 audit): merge one before starting the next.

---

## ✅ Before you start

```bash
git switch main && git pull
pnpm install
pnpm check              # Sprint 3 must be green
```

Set **Current sprint: Sprint 4** in `docs/roadmap/06-project-state.md`.

---

## 🎫 S4-T01 — Organization plugin, schema and personal workspaces

**Branch:** `feat/s4-t01-organizations` · **Story:** US-040 · **2 SP**

```bash
git switch -c feat/s4-t01-organizations
```

### 1. Every string of the sprint — in one patch

Later tickets only _use_ these keys. Edit **both** locale files (placement in prose, then JSON).

📄 **`src/locales/en.json`**

**(a)** In `validation` add:

```json
    "orgName": "Enter a name (2–60 characters)",
    "slugFormat": "Use lowercase letters, numbers and hyphens (3–40 characters)",
    "slugReserved": "This URL name is reserved",
    "projectName": "Enter a project name (1–80 characters)",
    "projectDescription": "The description is too long (500 characters max)"
```

**(b)** In `emails` add:

```json
    "invitation": {
      "subject": "{inviter} invited you to {org}",
      "heading": "You're invited",
      "greeting": "Hi,",
      "body": "{inviter} invited you to join {org} as {role}.",
      "button": "View invitation",
      "ignore": "If you weren't expecting this, you can ignore this email."
    }
```

**(c)** In `admin` (existing object with `consoleTitle`, `title`) add:

```json
    "users": {
      "title": "Users",
      "description": "Search and manage every account on the platform.",
      "searchPlaceholder": "Search by email or name",
      "name": "Name",
      "email": "Email",
      "role": "Role",
      "status": "Status",
      "created": "Created",
      "active": "Active",
      "banned": "Banned",
      "view": "View",
      "noResults": "No users found.",
      "page": "Page {page} of {pages}",
      "previous": "Previous",
      "next": "Next"
    },
    "user": {
      "back": "Back to users",
      "ban": "Ban user",
      "banReason": "Reason (optional)",
      "banned": "User banned and signed out everywhere.",
      "unban": "Unban user",
      "unbanned": "User unbanned.",
      "revoke": "Revoke all sessions",
      "revoked": "All sessions revoked.",
      "impersonate": "Impersonate",
      "cannotImpersonate": "Administrators and your own account can't be impersonated.",
      "platformRole": "Platform role",
      "saveRole": "Save role",
      "roleSaved": "Role updated.",
      "mfaRequired": "Enable two-factor authentication to use the admin console."
    },
    "banner": {
      "text": "You are impersonating {name} ({email}).",
      "stop": "Stop impersonating"
    }
```

**(d)** New **top-level** object `org`:

```json
  "org": {
    "nav": { "overview": "Overview", "projects": "Projects", "members": "Members", "settings": "Settings" },
    "roles": { "owner": "Owner", "admin": "Admin", "member": "Member" },
    "switcher": { "label": "Switch organization", "create": "Create organization" },
    "create": {
      "title": "Create your organization",
      "description": "An organization is a shared workspace for your team.",
      "name": "Organization name",
      "slug": "URL name",
      "slugHint": "Used in the address: /dashboard/{slug}",
      "slugAvailable": "Available",
      "slugTaken": "This URL name is already taken.",
      "submit": "Create organization"
    },
    "onboarding": {
      "invitationsTitle": "You have pending invitations",
      "invitationLine": "{inviter} invited you to {org} as {role}",
      "view": "View"
    },
    "overview": { "welcome": "Welcome to {org}", "role": "Your role: {role}" },
    "invitations": {
      "title": "Invitations",
      "description": "Invite teammates by email.",
      "email": "Email address",
      "role": "Role",
      "send": "Send invitation",
      "sent": "Invitation sent to {email}.",
      "pending": "Pending invitations",
      "none": "No pending invitations.",
      "expires": "Expires {date}",
      "expired": "Expired",
      "resend": "Resend",
      "resent": "Invitation sent again.",
      "revoke": "Revoke",
      "revoked": "Invitation revoked."
    },
    "accept": {
      "title": "Join {org}",
      "description": "{inviter} invited you to join as {role}.",
      "signedOutTitle": "You've been invited",
      "signedOutDescription": "Sign in or create an account with the email address that received the invitation.",
      "signIn": "Sign in",
      "signUp": "Create account",
      "accept": "Accept invitation",
      "decline": "Decline",
      "wrongAccount": "This invitation was sent to a different email address. Sign out and use the invited address.",
      "expired": "This invitation has expired. Ask for a new one.",
      "invalid": "This invitation is no longer valid.",
      "joined": "Welcome to {org}!",
      "declined": "Invitation declined."
    },
    "members": {
      "title": "Members",
      "description": "People with access to this organization.",
      "name": "Name",
      "role": "Role",
      "joined": "Joined",
      "you": "You",
      "remove": "Remove",
      "removed": "Member removed.",
      "leave": "Leave organization",
      "left": "You left the organization.",
      "roleUpdated": "Role updated.",
      "transfer": "Transfer ownership",
      "transferTitle": "Transfer ownership",
      "transferDescription": "The selected member becomes the owner and you become an admin. This needs a recent sign-in.",
      "transferSelect": "New owner",
      "transferred": "Ownership transferred."
    },
    "settings": {
      "title": "Organization settings",
      "general": "General",
      "name": "Name",
      "slug": "URL name",
      "slugWarning": "Changing the URL name breaks existing links to this organization.",
      "save": "Save changes",
      "saved": "Organization updated.",
      "danger": {
        "title": "Delete organization",
        "description": "Permanently deletes the organization, its members and all its data.",
        "button": "Delete organization",
        "confirmTitle": "Delete this organization?",
        "confirmDescription": "Type {name} to confirm. This cannot be undone.",
        "confirmLabel": "Organization name",
        "submit": "Delete permanently",
        "deleted": "Organization deleted."
      }
    },
    "projects": {
      "title": "Projects",
      "description": "Work in this organization.",
      "new": "New project",
      "name": "Name",
      "description_field": "Description",
      "status": "Status",
      "statusActive": "Active",
      "statusArchived": "Archived",
      "create": "Create project",
      "created": "Project created.",
      "edit": "Edit project",
      "save": "Save changes",
      "saved": "Project updated.",
      "delete": "Delete",
      "deleted": "Project deleted.",
      "deleteConfirm": "Delete this project? This cannot be undone.",
      "empty": "No projects yet.",
      "searchPlaceholder": "Search projects",
      "page": "Page {page} of {pages}",
      "previous": "Previous",
      "next": "Next",
      "updatedAt": "Updated"
    },
    "errors": {
      "soleOwner": "You are the only owner of an organization that has other members. Transfer ownership first.",
      "lastOwner": "An organization must keep at least one owner.",
      "alreadyMember": "This person is already a member.",
      "alreadyInvited": "This person already has a pending invitation.",
      "limit": "You have reached the maximum number of organizations.",
      "notAllowed": "You are not allowed to manage this member."
    }
  }
```

📄 **`src/locales/fr.json`** — same placements:

**(a)** `validation`:

```json
    "orgName": "Saisissez un nom (2 à 60 caractères)",
    "slugFormat": "Utilisez des minuscules, des chiffres et des tirets (3 à 40 caractères)",
    "slugReserved": "Ce nom d'URL est réservé",
    "projectName": "Saisissez un nom de projet (1 à 80 caractères)",
    "projectDescription": "La description est trop longue (500 caractères max)"
```

**(b)** `emails.invitation`:

```json
    "invitation": {
      "subject": "{inviter} vous invite à rejoindre {org}",
      "heading": "Vous êtes invité",
      "greeting": "Bonjour,",
      "body": "{inviter} vous invite à rejoindre {org} en tant que {role}.",
      "button": "Voir l'invitation",
      "ignore": "Si vous n'attendiez pas ce message, ignorez-le."
    }
```

**(c)** `admin`:

```json
    "users": {
      "title": "Utilisateurs",
      "description": "Recherchez et gérez tous les comptes de la plateforme.",
      "searchPlaceholder": "Rechercher par e-mail ou nom",
      "name": "Nom",
      "email": "E-mail",
      "role": "Rôle",
      "status": "Statut",
      "created": "Créé le",
      "active": "Actif",
      "banned": "Banni",
      "view": "Voir",
      "noResults": "Aucun utilisateur trouvé.",
      "page": "Page {page} sur {pages}",
      "previous": "Précédent",
      "next": "Suivant"
    },
    "user": {
      "back": "Retour aux utilisateurs",
      "ban": "Bannir l'utilisateur",
      "banReason": "Motif (facultatif)",
      "banned": "Utilisateur banni et déconnecté partout.",
      "unban": "Débannir l'utilisateur",
      "unbanned": "Utilisateur débanni.",
      "revoke": "Révoquer toutes les sessions",
      "revoked": "Toutes les sessions ont été révoquées.",
      "impersonate": "Se faire passer pour",
      "cannotImpersonate": "Les administrateurs et votre propre compte ne peuvent pas être usurpés.",
      "platformRole": "Rôle plateforme",
      "saveRole": "Enregistrer le rôle",
      "roleSaved": "Rôle mis à jour.",
      "mfaRequired": "Activez l'authentification à deux facteurs pour utiliser la console d'administration."
    },
    "banner": {
      "text": "Vous usurpez l'identité de {name} ({email}).",
      "stop": "Arrêter l'usurpation"
    }
```

**(d)** top-level `org`:

```json
  "org": {
    "nav": { "overview": "Aperçu", "projects": "Projets", "members": "Membres", "settings": "Paramètres" },
    "roles": { "owner": "Propriétaire", "admin": "Administrateur", "member": "Membre" },
    "switcher": { "label": "Changer d'organisation", "create": "Créer une organisation" },
    "create": {
      "title": "Créez votre organisation",
      "description": "Une organisation est un espace de travail partagé pour votre équipe.",
      "name": "Nom de l'organisation",
      "slug": "Nom d'URL",
      "slugHint": "Utilisé dans l'adresse : /dashboard/{slug}",
      "slugAvailable": "Disponible",
      "slugTaken": "Ce nom d'URL est déjà pris.",
      "submit": "Créer l'organisation"
    },
    "onboarding": {
      "invitationsTitle": "Vous avez des invitations en attente",
      "invitationLine": "{inviter} vous invite à rejoindre {org} en tant que {role}",
      "view": "Voir"
    },
    "overview": { "welcome": "Bienvenue dans {org}", "role": "Votre rôle : {role}" },
    "invitations": {
      "title": "Invitations",
      "description": "Invitez vos collègues par e-mail.",
      "email": "Adresse e-mail",
      "role": "Rôle",
      "send": "Envoyer l'invitation",
      "sent": "Invitation envoyée à {email}.",
      "pending": "Invitations en attente",
      "none": "Aucune invitation en attente.",
      "expires": "Expire le {date}",
      "expired": "Expirée",
      "resend": "Renvoyer",
      "resent": "Invitation renvoyée.",
      "revoke": "Révoquer",
      "revoked": "Invitation révoquée."
    },
    "accept": {
      "title": "Rejoindre {org}",
      "description": "{inviter} vous invite à rejoindre l'organisation en tant que {role}.",
      "signedOutTitle": "Vous avez été invité",
      "signedOutDescription": "Connectez-vous ou créez un compte avec l'adresse e-mail qui a reçu l'invitation.",
      "signIn": "Se connecter",
      "signUp": "Créer un compte",
      "accept": "Accepter l'invitation",
      "decline": "Refuser",
      "wrongAccount": "Cette invitation a été envoyée à une autre adresse e-mail. Déconnectez-vous et utilisez l'adresse invitée.",
      "expired": "Cette invitation a expiré. Demandez-en une nouvelle.",
      "invalid": "Cette invitation n'est plus valide.",
      "joined": "Bienvenue dans {org} !",
      "declined": "Invitation refusée."
    },
    "members": {
      "title": "Membres",
      "description": "Les personnes ayant accès à cette organisation.",
      "name": "Nom",
      "role": "Rôle",
      "joined": "Arrivée",
      "you": "Vous",
      "remove": "Retirer",
      "removed": "Membre retiré.",
      "leave": "Quitter l'organisation",
      "left": "Vous avez quitté l'organisation.",
      "roleUpdated": "Rôle mis à jour.",
      "transfer": "Transférer la propriété",
      "transferTitle": "Transférer la propriété",
      "transferDescription": "Le membre choisi devient propriétaire et vous devenez administrateur. Une connexion récente est requise.",
      "transferSelect": "Nouveau propriétaire",
      "transferred": "Propriété transférée."
    },
    "settings": {
      "title": "Paramètres de l'organisation",
      "general": "Général",
      "name": "Nom",
      "slug": "Nom d'URL",
      "slugWarning": "Modifier le nom d'URL invalide les liens existants vers cette organisation.",
      "save": "Enregistrer",
      "saved": "Organisation mise à jour.",
      "danger": {
        "title": "Supprimer l'organisation",
        "description": "Supprime définitivement l'organisation, ses membres et toutes ses données.",
        "button": "Supprimer l'organisation",
        "confirmTitle": "Supprimer cette organisation ?",
        "confirmDescription": "Saisissez {name} pour confirmer. Cette action est irréversible.",
        "confirmLabel": "Nom de l'organisation",
        "submit": "Supprimer définitivement",
        "deleted": "Organisation supprimée."
      }
    },
    "projects": {
      "title": "Projets",
      "description": "Le travail de cette organisation.",
      "new": "Nouveau projet",
      "name": "Nom",
      "description_field": "Description",
      "status": "Statut",
      "statusActive": "Actif",
      "statusArchived": "Archivé",
      "create": "Créer le projet",
      "created": "Projet créé.",
      "edit": "Modifier le projet",
      "save": "Enregistrer",
      "saved": "Projet mis à jour.",
      "delete": "Supprimer",
      "deleted": "Projet supprimé.",
      "deleteConfirm": "Supprimer ce projet ? Cette action est irréversible.",
      "empty": "Aucun projet pour l'instant.",
      "searchPlaceholder": "Rechercher un projet",
      "page": "Page {page} sur {pages}",
      "previous": "Précédent",
      "next": "Suivant",
      "updatedAt": "Mis à jour"
    },
    "errors": {
      "soleOwner": "Vous êtes l'unique propriétaire d'une organisation qui compte d'autres membres. Transférez d'abord la propriété.",
      "lastOwner": "Une organisation doit conserver au moins un propriétaire.",
      "alreadyMember": "Cette personne est déjà membre.",
      "alreadyInvited": "Cette personne a déjà une invitation en attente.",
      "limit": "Vous avez atteint le nombre maximal d'organisations.",
      "notAllowed": "Vous n'avez pas le droit de gérer ce membre."
    }
  }
```

```bash
pnpm test        # parity test: both files must have identical keys
```

### 2. Environment

📄 **Edit `src/libs/Env.ts`** (+ `runtimeEnv`):

```ts
    AUTO_CREATE_PERSONAL_ORG: flag('true'),
    ORG_CREATION_LIMIT_PER_USER: z.coerce.number().int().positive().default(5),
    INVITATION_EXPIRES_DAYS: z.coerce.number().int().positive().default(7),
    // Comma-separated emails promoted to platform admin by `pnpm admin:grant` (S4-T13)
    ADMIN_EMAILS: z.string().optional(),
    // When true, platform admins must have two-factor enabled to use /admin
    ADMIN_REQUIRE_MFA: flag('false'),
```

📄 **Append to `.env.example`:**

```dotenv
# ─── Organizations & admin ──────────────────────────
AUTO_CREATE_PERSONAL_ORG=true
ORG_CREATION_LIMIT_PER_USER=5
INVITATION_EXPIRES_DAYS=7
# Comma-separated; applied to VERIFIED users by `pnpm admin:grant`
ADMIN_EMAILS=
ADMIN_REQUIRE_MFA=false
```

### 3. Schema

Run the generator and compare (**the CLI wins** when columns differ):

```bash
pnpm auth:schema
```

📄 **Create `src/db/schema/org.ts`:**

```ts
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { user } from './auth';

const tz = (name: string) => timestamp(name, { withTimezone: true });

export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: tz('created_at').notNull().defaultNow(),
});

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: tz('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('member_user_id_idx').on(table.userId),
    index('member_organization_id_idx').on(table.organizationId),
    uniqueIndex('member_org_user_idx').on(table.organizationId, table.userId),
  ],
);

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').notNull().default('pending'),
    expiresAt: tz('expires_at').notNull(),
    createdAt: tz('created_at').notNull().defaultNow(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('invitation_email_idx').on(table.email)],
);
```

📄 **Edit `src/db/schema/index.ts`:**

```ts
export * from './auth';
export * from './org';
```

📄 **Edit `src/db/schema/auth.ts`** — in `session` add the plugin's column:

```ts
    activeOrganizationId: text('active_organization_id'),
```

```bash
rm src/db/schema/auth.generated.ts 2>/dev/null; pnpm db:generate    # 0004_….sql
pnpm db:check
```

### 4. Pure helpers (slugs and roles)

📄 **Create `src/libs/slug.ts`:**

```ts
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Words that would collide with routes or confuse users. Locale codes included.
const RESERVED = new Set([
  'admin',
  'api',
  'account',
  'dashboard',
  'new',
  'new-organization',
  'settings',
  'sign-in',
  'sign-up',
  'verify-email',
  'forgot-password',
  'reset-password',
  'two-factor',
  'accept-invitation',
  'en',
  'fr',
  'www',
  'app',
  'support',
  'help',
]);

export const isReservedSlug = (slug: string) => RESERVED.has(slug);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export type SlugCheck = 'ok' | 'format' | 'reserved';

export function checkSlug(slug: string): SlugCheck {
  if (slug.length < 3 || slug.length > 40 || !SLUG_REGEX.test(slug)) return 'format';
  return isReservedSlug(slug) ? 'reserved' : 'ok';
}
```

📄 **Create `src/libs/slug.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { checkSlug, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Acme Inc.', 'acme-inc'],
    ['Équipe Été 2026', 'equipe-ete-2026'],
    ['  --weird__name--  ', 'weird-name'],
    ['x'.repeat(60), 'x'.repeat(40)],
  ])('%s → %s', (input, expected) => expect(slugify(input)).toBe(expected));
});

describe('checkSlug', () => {
  it('accepts valid slugs and rejects bad ones', () => {
    expect(checkSlug('acme-inc')).toBe('ok');
    expect(checkSlug('ab')).toBe('format');
    expect(checkSlug('Acme')).toBe('format');
    expect(checkSlug('a--b')).toBe('format');
    expect(checkSlug('-acme')).toBe('format');
  });
  it('rejects reserved words, including routes and locales', () => {
    for (const word of ['admin', 'api', 'account', 'new-organization', 'fr']) {
      expect(checkSlug(word.padEnd(3, 'x'))).not.toBe('format'); // sanity: right shape
    }
    expect(checkSlug('admin')).toBe('reserved');
    expect(checkSlug('account')).toBe('reserved');
    expect(checkSlug('new-organization')).toBe('reserved');
  });
});
```

📄 **Create `src/libs/org-members.ts`** (grows in T05 and T12):

```ts
/** Better Auth stores roles as a string; several roles may be comma-separated. */
export const rolesOf = (role: string | null | undefined): string[] =>
  (role ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

export const hasRole = (role: string | null | undefined, wanted: string): boolean =>
  rolesOf(role).includes(wanted);
```

### 5. Queries (database-agnostic → testable on PGlite)

📄 **Create `src/data/org-queries.ts`:**

```ts
import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { member, organization } from '@/db/schema';
import type { DbLike } from '@/db/types';
import { hasRole } from '@/libs/org-members';
import { isReservedSlug, slugify } from '@/libs/slug';

const suffix = () => randomUUID().slice(0, 4);

export async function createOrganizationWithOwner(
  database: DbLike,
  input: { name: string; slug: string; ownerId: string },
) {
  const id = randomUUID();
  await database.insert(organization).values({ id, name: input.name, slug: input.slug });
  await database
    .insert(member)
    .values({ id: randomUUID(), organizationId: id, userId: input.ownerId, role: 'owner' });
  return { id, name: input.name, slug: input.slug };
}

async function slugTaken(database: DbLike, slug: string) {
  const rows = await database
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug));
  return rows.length > 0;
}

/** A slug that is valid, not reserved and not taken — adds a short random suffix when needed. */
export async function uniqueSlug(database: DbLike, base: string): Promise<string> {
  const root = slugify(base) || 'workspace';
  let candidate = root;
  while (
    candidate.length < 3 ||
    isReservedSlug(candidate) ||
    (await slugTaken(database, candidate))
  ) {
    candidate = `${root.slice(0, 34)}-${suffix()}`;
  }
  return candidate;
}

/** Every new user gets a workspace of their own (when AUTO_CREATE_PERSONAL_ORG is on). */
export async function createPersonalOrganization(
  database: DbLike,
  user: { id: string; name: string; email: string },
) {
  const label = user.name.trim() || user.email.split('@')[0] || 'workspace';
  return createOrganizationWithOwner(database, {
    name: `${label}'s workspace`,
    slug: await uniqueSlug(database, label),
    ownerId: user.id,
  });
}

/**
 * Organizations the user could NOT leave without orphaning other members:
 * they are the only owner AND other people belong to it.
 */
export async function findBlockingOrganizations(
  database: DbLike,
  userId: string,
): Promise<string[]> {
  const owned = await database
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, userId));

  const blocking: string[] = [];
  for (const row of owned.filter((item) => hasRole(item.role, 'owner'))) {
    const members = await database
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(eq(member.organizationId, row.organizationId));
    const otherOwners = members.filter(
      (item) => item.userId !== userId && hasRole(item.role, 'owner'),
    );
    if (members.length > 1 && otherOwners.length === 0) blocking.push(row.organizationId);
  }
  return blocking;
}

/** Organizations where the user is the ONLY member → they'd be empty after deletion, so delete them. */
export async function deleteSoleMemberOrganizations(
  database: DbLike,
  userId: string,
): Promise<void> {
  const mine = await database
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));

  for (const { organizationId } of mine) {
    const members = await database
      .select({ id: member.id })
      .from(member)
      .where(eq(member.organizationId, organizationId));
    if (members.length === 1) {
      await database.delete(organization).where(and(eq(organization.id, organizationId))); // cascades
    }
  }
}
```

📄 **Create `src/data/org-queries.test.ts`:**

```ts
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { member, organization, user } from '@/db/schema';

import { userFactory } from '../../tests/factories/user.factory';
import { createTestDb, type TestDb } from '../../tests/utils/test-db';
import {
  createOrganizationWithOwner,
  createPersonalOrganization,
  deleteSoleMemberOrganizations,
  findBlockingOrganizations,
  uniqueSlug,
} from './org-queries';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
}, 30_000);
afterAll(() => destroy());

async function newUser() {
  const row = userFactory.build();
  await db.insert(user).values(row);
  return row;
}

describe('personal organizations', () => {
  it('creates a workspace owned by the user, with a unique valid slug', async () => {
    const ada = await newUser();
    const first = await createPersonalOrganization(db, {
      id: ada.id,
      name: 'Ada',
      email: ada.email,
    });
    const other = await newUser();
    const second = await createPersonalOrganization(db, {
      id: other.id,
      name: 'Ada',
      email: other.email,
    });

    expect(first.slug).toBe('ada');
    expect(second.slug).not.toBe('ada'); // collision → suffix
    const [row] = await db.select().from(member).where(eq(member.organizationId, first.id));
    expect(row).toMatchObject({ userId: ada.id, role: 'owner' });
  });

  it('never hands out reserved slugs', async () => {
    expect(await uniqueSlug(db, 'admin')).not.toBe('admin');
  });
});

describe('deleting an account', () => {
  it('blocks when the user is the only owner of an organization with other members', async () => {
    const owner = await newUser();
    const teammate = await newUser();
    const org = await createOrganizationWithOwner(db, {
      name: 'Team',
      slug: `team-${randomUUID().slice(0, 6)}`,
      ownerId: owner.id,
    });
    await db
      .insert(member)
      .values({ id: randomUUID(), organizationId: org.id, userId: teammate.id, role: 'member' });

    expect(await findBlockingOrganizations(db, owner.id)).toEqual([org.id]);
    expect(await findBlockingOrganizations(db, teammate.id)).toEqual([]);
  });

  it('does not block when another owner exists, and removes empty organizations', async () => {
    const a = await newUser();
    const b = await newUser();
    const shared = await createOrganizationWithOwner(db, {
      name: 'Shared',
      slug: `shared-${randomUUID().slice(0, 6)}`,
      ownerId: a.id,
    });
    await db
      .insert(member)
      .values({ id: randomUUID(), organizationId: shared.id, userId: b.id, role: 'owner' });
    const solo = await createPersonalOrganization(db, { id: a.id, name: 'Solo A', email: a.email });

    expect(await findBlockingOrganizations(db, a.id)).toEqual([]);

    await deleteSoleMemberOrganizations(db, a.id);
    expect(await db.select().from(organization).where(eq(organization.id, solo.id))).toHaveLength(
      0,
    );
    expect(await db.select().from(organization).where(eq(organization.id, shared.id))).toHaveLength(
      1,
    );
  });
});
```

### 6. The plugin, the hooks, the client

📄 **Edit `src/libs/Auth.ts`:**

```ts
import { APIError } from 'better-auth/api';
import { organization } from 'better-auth/plugins';

import {
  createPersonalOrganization,
  deleteSoleMemberOrganizations,
  findBlockingOrganizations,
} from '@/data/org-queries';
```

Replace the `user: { … deleteUser … }` block's `deleteUser` (keep `changeEmail`):

```ts
      deleteUser: {
        enabled: true,
        // Never orphan an organization that still has other members
        beforeDelete: async (target) => {
          if ((await findBlockingOrganizations(database, target.id)).length > 0) {
            throw new APIError('BAD_REQUEST', {
              code: 'SOLE_OWNER',
              message: 'Transfer ownership of your organizations before deleting your account.',
            });
          }
          await deleteSoleMemberOrganizations(database, target.id);
        },
      },
```

Add a sibling option at the top level of the config:

```ts
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            if (!Env.AUTO_CREATE_PERSONAL_ORG) return;
            try {
              await createPersonalOrganization(database, {
                id: created.id,
                name: created.name,
                email: created.email,
              });
            } catch (error) {
              // A missing workspace must never break sign-up: the onboarding page lets them create one
              getLogger('auth').error('Could not create the personal organization', { error });
            }
          },
        },
      },
    },
```

and in `plugins` (before `nextCookies()`; roles/permissions are added in S4-T06):

```ts
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: Env.ORG_CREATION_LIMIT_PER_USER,
        creatorRole: 'owner',
        invitationExpiresIn: 60 * 60 * 24 * Env.INVITATION_EXPIRES_DAYS,
        // Filled in by S4-T04: sendInvitationEmail
      }),
```

📄 **Edit `src/libs/AuthClient.ts`:** `import { organizationClient } from 'better-auth/client/plugins';` and add `organizationClient()` to `plugins`.

📄 **Edit `src/libs/auth-error-keys.ts`** — add to `KEYS`:

```ts
  SOLE_OWNER: 'org.errors.soleOwner',
```

📄 **Update the demo seed** — `src/db/seed.ts`: after inserting the demo user and account, give them a workspace:

```ts
import { createOrganizationWithOwner } from './../data/org-queries';
// …at the end of seed():
await createOrganizationWithOwner(db, { name: 'Demo workspace', slug: 'demo', ownerId: userId });
```

(S4-T09 extends the seed with more users and projects.)

### ✅ Verify

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm knip
pnpm db:reset && pnpm dev
```

1. Sign up a brand-new user and verify the email. In Studio: one `organization` ("<name>'s workspace") and one `member` row with `role = 'owner'`.
2. `AUTO_CREATE_PERSONAL_ORG=false` (restart) → a new user has **no** organization.
3. Make a user the sole owner of an organization with a second member (insert a `member` row in Studio) → **Delete account** now fails with "You are the only owner…" (the message is in the form error). Remove the extra member → deletion works and the empty workspace is removed too.
4. `pnpm db:reset` → demo user owns the `demo` organization.

**🚢 Ship** — branch `feat/s4-t01-organizations` · message: `feat(org): add organization plugin, schema and personal workspaces`

---

## 🎫 S4-T02 — Create an organization

**Branch:** `feat/s4-t02-create-org` · **Story:** US-040 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s4-t02-create-org
mkdir -p "src/app/[locale]/(app)/dashboard/new-organization" src/components/org
```

### 1. Validation

📄 **Create `src/validations/org.ts`:**

```ts
import { z } from 'zod';

import { checkSlug } from '@/libs/slug';

const orgName = z
  .string()
  .trim()
  .min(2, { message: 'validation.orgName' })
  .max(60, { message: 'validation.orgName' });

export const orgSlug = z.string().superRefine((value, ctx) => {
  const result = checkSlug(value);
  if (result === 'format') ctx.addIssue({ code: 'custom', message: 'validation.slugFormat' });
  if (result === 'reserved') ctx.addIssue({ code: 'custom', message: 'validation.slugReserved' });
});

export const createOrgSchema = z.object({ name: orgName, slug: orgSlug });
export const updateOrgSchema = createOrgSchema;

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
```

📄 **Create `src/validations/org.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { createOrgSchema } from './org';

const messages = (input: unknown) => {
  const result = createOrgSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

it('accepts a valid organization', () => {
  expect(createOrgSchema.safeParse({ name: 'Acme Inc', slug: 'acme-inc' }).success).toBe(true);
});

it('returns translation keys for every failure', () => {
  expect(messages({ name: 'A', slug: 'acme' })).toEqual(['validation.orgName']);
  expect(messages({ name: 'Acme', slug: 'Acme Inc' })).toEqual(['validation.slugFormat']);
  expect(messages({ name: 'Acme', slug: 'admin' })).toEqual(['validation.slugReserved']);
});
```

### 2. Error keys and a debounce hook

📄 **Edit `src/libs/auth-error-keys.ts`** — add codes (🔍 confirm names against the plugin's error codes):

```ts
  SLUG_IS_TAKEN: 'org.create.slugTaken',
  ORGANIZATION_SLUG_ALREADY_TAKEN: 'org.create.slugTaken',
  YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS: 'org.errors.limit',
```

and make **403** responses read "forbidden" when the code isn't otherwise mapped:

```ts
export function authErrorKey(error, fallback = 'errors.internal'): string {
  if (error?.status === 429) return 'errors.rateLimited';
  const key = error?.code ? KEYS[error.code] : undefined;
  if (key) return key;
  if (error?.status === 403) return 'errors.forbidden';
  return fallback;
}
```

📄 **Add to `auth-error-keys.test.ts`:**

```ts
it('maps a bare 403 to "forbidden" but keeps specific codes', () => {
  expect(authErrorKey({ status: 403 })).toBe('errors.forbidden');
  expect(authErrorKey({ status: 403, code: 'EMAIL_NOT_VERIFIED' })).toBe(
    'auth.errors.emailNotVerified',
  );
});
```

📄 **Create `src/hooks/use-debounced-value.ts`:**

```ts
'use client';

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
```

### 3. The form

📄 **Create `src/components/org/create-organization-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Form } from '@/components/ui/form';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { checkSlug, slugify } from '@/libs/slug';
import { type CreateOrgInput, createOrgSchema } from '@/validations/org';

type Availability = 'unknown' | 'available' | 'taken';

export function CreateOrganizationForm() {
  const t = useTranslations('org.create');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [availability, setAvailability] = useState<Availability>('unknown');

  const form = useForm<CreateOrgInput>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: '', slug: '' },
  });

  const name = useWatch({ control: form.control, name: 'name' });
  const slug = useWatch({ control: form.control, name: 'slug' });
  const debouncedSlug = useDebouncedValue(slug);

  // Suggest a slug from the name until the user edits it themselves
  useEffect(() => {
    if (!slugTouched) form.setValue('slug', slugify(name), { shouldValidate: name.length > 0 });
  }, [name, slugTouched, form]);

  // Live availability check (debounced). The server re-checks on submit — this is only a hint.
  useEffect(() => {
    if (checkSlug(debouncedSlug) !== 'ok') {
      setAvailability('unknown');
      return;
    }
    let active = true;
    void authClient.organization.checkSlug({ slug: debouncedSlug }).then(({ error }) => {
      if (active) setAvailability(error ? 'taken' : 'available');
    });
    return () => {
      active = false;
    };
  }, [debouncedSlug]);

  async function onSubmit(values: CreateOrgInput) {
    setFormError(null);
    const { data, error } = await authClient.organization.create(values);
    if (error || !data) {
      setFormError(authErrorKey(error));
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    toast.success(values.name);
    router.push(`/dashboard/${data.slug}`);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="name" label={t('name')} autoComplete="organization" />
        <div className="space-y-1">
          <TextField
            name="slug"
            label={t('slug')}
            autoComplete="off"
            onInput={() => setSlugTouched(true)}
          />
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {availability === 'available' ? (
              <span className="text-green-600">{t('slugAvailable')}</span>
            ) : null}
            {availability === 'taken' ? (
              <span className="text-destructive">{t('slugTaken')}</span>
            ) : null}
            {availability === 'unknown' ? t('slugHint', { slug: slug || '…' }) : null}
          </p>
        </div>
        <SubmitButton disabled={availability === 'taken'}>{t('submit')}</SubmitButton>
      </form>
    </Form>
  );
}
```

> 🔍 `checkSlug` returns an error (not data) when the slug is taken in current versions. If yours returns `{ status: false }` instead, adapt the one line that sets `availability`.

### 4. Data for the onboarding page

📄 **Create `src/data/organizations.ts`** (session-aware wrappers over the queries; grows later):

```ts
import 'server-only';
import { db } from '@/db/client';

import { listUserOrganizations } from './org-queries';
import { requireSession } from './session';

export async function listMyOrganizations() {
  const { user } = await requireSession();
  return listUserOrganizations(db, user.id);
}

/** Where `/dashboard` should send the user: last active org if still a member, else the first one. */
export async function getDefaultOrganizationSlug(): Promise<string | null> {
  const { session } = await requireSession();
  const organizations = await listMyOrganizations();
  const active = organizations.find((org) => org.id === session.activeOrganizationId);
  return (active ?? organizations[0])?.slug ?? null;
}
```

📄 **Add `listUserOrganizations` to `src/data/org-queries.ts`:**

```ts
export async function listUserOrganizations(database: DbLike, userId: string) {
  return database
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(organization.name);
}
```

Test (append to `org-queries.test.ts`):

```ts
import { listUserOrganizations } from './org-queries';

it('lists only the organizations a user belongs to, with their role', async () => {
  const ada = await newUser();
  const stranger = await newUser();
  const org = await createPersonalOrganization(db, {
    id: ada.id,
    name: 'Lister',
    email: ada.email,
  });
  await createPersonalOrganization(db, { id: stranger.id, name: 'Other', email: stranger.email });

  const mine = await listUserOrganizations(db, ada.id);
  expect(mine.map((item) => item.id)).toEqual([org.id]);
  expect(mine[0]?.role).toBe('owner');
});
```

### 5. Pages

📄 **Rewrite `src/app/[locale]/(app)/dashboard/page.tsx`** — now only a router:

```tsx
import { setRequestLocale } from 'next-intl/server';
import { getLocale } from 'next-intl/server';

import { getDefaultOrganizationSlug } from '@/data/organizations';
import { requireSession } from '@/data/session';
import { redirect } from '@/i18n/navigation';

export default async function DashboardRouter({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();

  const slug = await getDefaultOrganizationSlug();
  return redirect({
    href: slug ? `/dashboard/${slug}` : '/dashboard/new-organization',
    locale: locale ?? (await getLocale()),
  });
}
```

📄 **Create `src/app/[locale]/(app)/dashboard/new-organization/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CreateOrganizationForm } from '@/components/org/create-organization-form';
import { requireSession } from '@/data/session';

export default async function NewOrganizationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSession();
  const t = await getTranslations('org.create');

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm">{t('description')}</p>
      </header>
      <CreateOrganizationForm />
    </div>
  );
}
```

(Pending invitations are added to this page in S4-T04.)

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

1. `/dashboard` redirects to your workspace slug (it 404s until S4-T03 adds `[orgSlug]` — that's expected right now). For a user with **no** organization it lands on `/dashboard/new-organization`.
2. Type a name → the slug fills itself; edit the slug manually → it stops following the name.
3. Slug `admin` / `ab` / `Mixed Case` → translated errors. A slug that exists (e.g. `demo`) → "already taken" appears while typing.
4. Valid input → organization created; Studio shows the new `organization` + `member(owner)`; the user's `session.active_organization_id` is set.
5. Create organizations until you hit `ORG_CREATION_LIMIT_PER_USER` → "maximum number of organizations".

**🚢 Ship** — branch `feat/s4-t02-create-org` · message: `feat(org): add organization creation with slug suggestion and availability check`

---

## 🎫 S4-T03 — `[orgSlug]` routes, guard and organization switcher

**Branch:** `feat/s4-t03-org-routes` · **Story:** US-040 · **1 SP**

> 🎯 The **URL** is the source of truth for "which tenant am I in". Every page re-checks membership on the server and answers **404** (never 403) to non-members.

```bash
git switch main && git pull && git switch -c feat/s4-t03-org-routes
mkdir -p "src/app/[locale]/(app)/dashboard/[orgSlug]"
```

### 1. Membership lookup

📄 **Add to `src/data/org-queries.ts`:**

```ts
export type Membership = {
  org: { id: string; name: string; slug: string };
  member: { id: string; role: string };
};

/** The caller's membership in the organization with this slug — `undefined` for non-members. */
export async function findMembership(
  database: DbLike,
  userId: string,
  slug: string,
): Promise<Membership | undefined> {
  const [row] = await database
    .select({
      orgId: organization.id,
      orgName: organization.name,
      orgSlug: organization.slug,
      memberId: member.id,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(organization.slug, slug)));

  if (!row) return undefined;
  return {
    org: { id: row.orgId, name: row.orgName, slug: row.orgSlug },
    member: { id: row.memberId, role: row.role },
  };
}
```

Test (append to `org-queries.test.ts`):

```ts
import { findMembership } from './org-queries';

it('findMembership answers only for members', async () => {
  const ada = await newUser();
  const eve = await newUser();
  const org = await createPersonalOrganization(db, {
    id: ada.id,
    name: 'Private Co',
    email: ada.email,
  });

  expect((await findMembership(db, ada.id, org.slug))?.member.role).toBe('owner');
  expect(await findMembership(db, eve.id, org.slug)).toBeUndefined(); // not a member → nothing
  expect(await findMembership(db, ada.id, 'does-not-exist')).toBeUndefined();
});
```

### 2. The guard (full permission helpers arrive in S4-T07)

📄 **Create `src/data/authz.ts`:**

```ts
import 'server-only';
import { notFound } from 'next/navigation';

import { db } from '@/db/client';

import { findMembership } from './org-queries';
import { requireSession } from './session';

/**
 * Session + membership for the organization in the URL. Non-members get a 404 (never a 403:
 * the existence of other tenants must not be observable).
 * The role is read from the DATABASE on every call, never from a cookie.
 */
export async function requireOrgMember(orgSlug: string) {
  const session = await requireSession();
  const membership = await findMembership(db, session.user.id, orgSlug);
  if (!membership) notFound();
  return { session, ...membership };
}

export type OrgContext = Awaited<ReturnType<typeof requireOrgMember>>;
```

Update the guard-coverage test regex (`src/data/guard-coverage.test.ts`) — pages may now use any of our guards:

```ts
const GUARD = /require(Session|Admin|OrgMember|PagePermission)\(/;
// …
const unguarded = pages.filter((file) => !GUARD.test(readFileSync(file, 'utf8')));
```

### 3. Org layout, overview and navigation

📄 **Create `src/app/[locale]/(app)/dashboard/[orgSlug]/layout.tsx`** (no UI of its own yet — the provider arrives in S4-T08):

```tsx
import type { ReactNode } from 'react';

import { requireOrgMember } from '@/data/authz';

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOrgMember(orgSlug); // early 404 — pages still guard themselves
  return children;
}
```

📄 **Create `src/app/[locale]/(app)/dashboard/[orgSlug]/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageHeader } from '@/components/layout/page-header';
import { requireOrgMember } from '@/data/authz';

export default async function OrgOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const { org, member } = await requireOrgMember(orgSlug);
  const t = await getTranslations('org');

  return (
    <PageHeader
      title={t('overview.welcome', { org: org.name })}
      description={t('overview.role', {
        role: t(`roles.${member.role as 'owner' | 'admin' | 'member'}`),
      })}
    />
  );
}
```

> The cast is safe for our three roles; custom multi-role strings are out of scope.

📄 **Create `src/components/org/org-switcher.tsx`:**

```tsx
'use client';

import { ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
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

type Props = { organizations: { id: string; name: string; slug: string }[] };

export function OrgSwitcher({ organizations }: Props) {
  const t = useTranslations('org.switcher');
  const router = useRouter();
  const { orgSlug } = useParams<{ orgSlug?: string }>();
  const current = organizations.find((org) => org.slug === orgSlug);

  async function select(org: Props['organizations'][number]) {
    await authClient.organization.setActive({ organizationId: org.id }); // remembered for /dashboard
    router.push(`/dashboard/${org.slug}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={t('label')}
          className="max-w-52 justify-between gap-2"
        >
          <span className="truncate">{current?.name ?? t('label')}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => select(org)}
            aria-current={org.slug === orgSlug ? 'true' : undefined}
          >
            {org.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/new-organization">{t('create')}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

📄 **Create `src/components/org/app-nav.tsx`** — one list used by the sidebar **and** the mobile sheet:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/utils/cn';

export function useAppLinks() {
  const t = useTranslations();
  const { orgSlug } = useParams<{ orgSlug?: string }>();

  const orgLinks = orgSlug
    ? [
        { href: `/dashboard/${orgSlug}`, label: t('org.nav.overview') },
        { href: `/dashboard/${orgSlug}/projects`, label: t('org.nav.projects') },
        { href: `/dashboard/${orgSlug}/members`, label: t('org.nav.members') },
        { href: `/dashboard/${orgSlug}/settings`, label: t('org.nav.settings') },
      ]
    : [];

  return [...orgLinks, { href: '/dashboard/account/profile', label: t('nav.account') }] as const;
}

export function AppNav() {
  const links = useAppLinks();
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 text-sm">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? 'page' : undefined}
          className={cn(
            'rounded px-2 py-1.5',
            pathname === link.href
              ? 'bg-muted font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
```

Make `MobileNav` fetch the same links (so the hamburger matches the sidebar) — **edit `src/components/layout/mobile-nav.tsx`**: make `links` optional and default to `useAppLinks()` when omitted:

```tsx
import { useAppLinks } from '@/components/org/app-nav';
// props: { links?: readonly NavLink[] }
const appLinks = useAppLinks();
const items = links ?? appLinks; // render `items` instead of `links`
```

(the marketing header keeps passing its own `links`).

📄 **Rewrite `src/app/[locale]/(app)/layout.tsx`:**

```tsx
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { MobileNav } from '@/components/layout/mobile-nav';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';
import { AppNav } from '@/components/org/app-nav';
import { OrgSwitcher } from '@/components/org/org-switcher';
import { listMyOrganizations } from '@/data/organizations';
import { requireSession } from '@/data/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession(); // cached per request; pages guard themselves too
  const [organizations, t] = await Promise.all([listMyOrganizations(), getTranslations()]);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 space-y-6 border-e p-4 md:block">
        <p className="font-semibold">{t('common.appName')}</p>
        <AppNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <MobileNav />
          <OrgSwitcher
            organizations={organizations.map(({ id, name, slug }) => ({ id, name, slug }))}
          />
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

Delete the S2 account sidebar link constants if any remain; the dashboard greeting page from S2 (`dashboard/page.tsx`) was replaced by the router in S4-T02, so the guard-coverage test must still pass (`requireSession(` is present).

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

1. `/dashboard` → `/dashboard/<your-slug>` showing "Welcome to <org>" and your role.
2. The header switcher lists your organizations; choosing one navigates and (Studio) updates `session.active_organization_id`. `/dashboard` later returns to the last active one.
3. **Tamper:** open `/dashboard/some-other-users-slug` (use a slug from Studio that isn't yours) → a **404**, identical to `/dashboard/does-not-exist`.
4. `/dashboard/account/profile` still works and keeps the sidebar.
5. Hamburger menu at 360 px shows the same links as the sidebar.
6. Signed out → every `/dashboard/...` URL redirects to sign-in with the callback.

**🚢 Ship** — branch `feat/s4-t03-org-routes` · message: `feat(org): add org-scoped routes, membership guard and organization switcher`

---

## 🎫 S4-T04 — Invitations: send and accept

**Branch:** `feat/s4-t04-invitations` · **Story:** US-041 · **3 SP**

```bash
git switch main && git pull && git switch -c feat/s4-t04-invitations
mkdir -p "src/app/[locale]/(auth)/accept-invitation/[invitationId]" "src/app/[locale]/(app)/dashboard/[orgSlug]/members"
```

### 1. The email

📄 **Append to `src/templates/emails/templates.tsx`:**

```tsx
export function InvitationEmail({
  locale,
  inviter,
  org,
  role,
  url,
}: {
  locale: Locale;
  inviter: string;
  org: string;
  role: string;
  url: string;
}) {
  const t = getEmailTranslator(locale);
  return (
    <ActionEmail
      lang={locale}
      heading={t('invitation.heading')}
      greeting={t('invitation.greeting')}
      body={t('invitation.body', { inviter, org, role })}
      action={{ label: t('invitation.button'), url }}
      ignore={t('invitation.ignore')}
      footer={t('footer', { appName: Env.NEXT_PUBLIC_APP_NAME })}
    />
  );
}
```

📄 **Append to `src/libs/auth-emails.tsx`:**

```tsx
export async function sendInvitationEmail({
  to,
  inviter,
  org,
  role,
  url,
  request,
}: {
  to: string;
  inviter: string;
  org: string;
  role: string;
  url: string;
  request?: Request;
}) {
  const locale = localeFromRequest(request);
  const t = getEmailTranslator(locale);
  const { html, text } = await renderEmail(
    <InvitationEmail locale={locale} inviter={inviter} org={org} role={role} url={url} />,
  );
  await sendEmail({
    to,
    subject: t('invitation.subject', { inviter, org }),
    html,
    text,
    tags: { type: 'invitation' },
  });
}
```

### 2. Wire it in Better Auth

📄 **Edit the `organization({ … })` call in `src/libs/Auth.ts`:**

```ts
        // 🔍 callback payload: { id, role, email, organization, inviter }
        sendInvitationEmail: async (data, request) => {
          const url = `${Env.NEXT_PUBLIC_APP_URL}/accept-invitation/${data.id}`;
          runInBackground(() =>
            sendInvitationEmail({
              to: data.email,
              inviter: data.inviter.user.name || data.inviter.user.email,
              org: data.organization.name,
              role: data.role,
              url,
              request,
            }),
          );
        },
        cancelPendingInvitationsOnReInvite: true,
```

(import `sendInvitationEmail` from `@/libs/auth-emails`)

📄 **Add error keys** to `src/libs/auth-error-keys.ts`:

```ts
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'org.errors.alreadyMember',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: 'org.errors.alreadyInvited',
```

### 3. Queries for invitations

📄 **Add to `src/data/org-queries.ts`** (imports: `invitation`, `user`, `gt`, `desc`):

```ts
export async function listPendingInvitations(database: DbLike, organizationId: string) {
  return database
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, 'pending')))
    .orderBy(desc(invitation.createdAt));
}

/** Pending, unexpired invitations addressed to this email (shown on the onboarding page). */
export async function listInvitationsForEmail(database: DbLike, email: string) {
  return database
    .select({
      id: invitation.id,
      role: invitation.role,
      orgName: organization.name,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .innerJoin(user, eq(invitation.inviterId, user.id))
    .where(
      and(
        eq(invitation.email, email.toLowerCase()),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    );
}

export async function findInvitationDetails(database: DbLike, id: string) {
  const [row] = await database
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      orgName: organization.name,
      orgSlug: organization.slug,
      inviterName: user.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .innerJoin(user, eq(invitation.inviterId, user.id))
    .where(eq(invitation.id, id));
  return row;
}
```

(update the drizzle import: `import { and, desc, eq, gt } from 'drizzle-orm';` and the schema import `invitation, user`.)

### 4. The accept page

📄 **Create `src/components/org/accept-invitation-buttons.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';

type Props = { invitationId: string; orgName: string; orgSlug: string };

export function AcceptInvitationButtons({ invitationId, orgName, orgSlug }: Props) {
  const t = useTranslations('org.accept');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setError(null);
    const { data, error: failure } = await authClient.organization.acceptInvitation({
      invitationId,
    });
    if (failure) {
      setBusy(false);
      return setError(authErrorKey(failure));
    }
    if (data?.member?.organizationId) {
      await authClient.organization.setActive({ organizationId: data.member.organizationId });
    }
    toast.success(t('joined', { org: orgName }));
    router.push(`/dashboard/${orgSlug}`);
    router.refresh();
  }

  async function decline() {
    setBusy(true);
    await authClient.organization.rejectInvitation({ invitationId });
    toast(t('declined'));
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <FormError messageKey={error} />
      <Button className="w-full" disabled={busy} onClick={accept}>
        {t('accept')}
      </Button>
      <Button className="w-full" variant="ghost" disabled={busy} onClick={decline}>
        {t('decline')}
      </Button>
    </div>
  );
}
```

📄 **Create `src/app/[locale]/(auth)/accept-invitation/[invitationId]/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AcceptInvitationButtons } from '@/components/org/accept-invitation-buttons';
import { Button } from '@/components/ui/button';
import { findInvitationDetails } from '@/data/org-queries';
import { getSession } from '@/data/session';
import { db } from '@/db/client';
import { Link } from '@/i18n/navigation';

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ locale: string; invitationId: string }>;
}) {
  const { locale, invitationId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('org.accept');
  const tRoles = await getTranslations('org.roles');

  const session = await getSession(); // NOT requireSession: signed-out visitors are welcome here
  const callbackUrl = encodeURIComponent(`/accept-invitation/${invitationId}`);

  // Signed out: reveal NOTHING about the invitation (id guessing must teach attackers nothing)
  if (!session) {
    return (
      <Notice title={t('signedOutTitle')}>
        <p className="text-muted-foreground text-sm">{t('signedOutDescription')}</p>
        <Button asChild className="w-full">
          <Link href={`/sign-in?callbackUrl=${callbackUrl}`}>{t('signIn')}</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/sign-up">{t('signUp')}</Link>
        </Button>
      </Notice>
    );
  }

  const details = await findInvitationDetails(db, invitationId);
  const forThisUser = details && details.email === session.user.email.toLowerCase();

  // Same message for "doesn't exist" and "belongs to someone else"
  if (!details || !forThisUser) {
    return <Notice title={t(details ? 'wrongAccount' : 'invalid')} />;
  }
  if (details.status !== 'pending') return <Notice title={t('invalid')} />;
  if (details.expiresAt < new Date()) return <Notice title={t('expired')} />;

  const role = (details.role ?? 'member') as 'owner' | 'admin' | 'member';
  return (
    <>
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('title', { org: details.orgName })}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t('description', { inviter: details.inviterName, role: tRoles(role) })}
        </p>
      </header>
      <AcceptInvitationButtons
        invitationId={details.id}
        orgName={details.orgName}
        orgSlug={details.orgSlug}
      />
    </>
  );
}
```

> 🔒 For a signed-in user whose email doesn't match, we show the **same** "wrong account" notice for "doesn't exist" **and** "someone else's" — nothing distinguishes a valid id from a guess. (We use `wrongAccount` only when the invitation exists; swap to `invalid` for both if you want zero leakage even to signed-in users.)

> The guard-coverage test only scans `(app)` — this page lives in `(auth)` on purpose.

### 5. Pending invitations on the onboarding page

📄 **Add to `src/data/organizations.ts`:**

```ts
import { listInvitationsForEmail } from './org-queries';

export async function listMyInvitations() {
  const { user } = await requireSession();
  return listInvitationsForEmail(db, user.email);
}
```

📄 **Edit `new-organization/page.tsx`** — show them above the form:

```tsx
import { Button } from '@/components/ui/button';
import { listMyInvitations } from '@/data/organizations';
import { Link } from '@/i18n/navigation';
// …
const invitations = await listMyInvitations();
const tOnboarding = await getTranslations('org.onboarding');
const tRoles = await getTranslations('org.roles');
// …before <header>:
{
  invitations.length > 0 ? (
    <section className="space-y-2 rounded-md border p-4">
      <h2 className="font-medium">{tOnboarding('invitationsTitle')}</h2>
      <ul className="space-y-2">
        {invitations.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <span>
              {tOnboarding('invitationLine', {
                inviter: item.inviterName,
                org: item.orgName,
                role: tRoles((item.role ?? 'member') as 'owner' | 'admin' | 'member'),
              })}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href={`/accept-invitation/${item.id}`}>{tOnboarding('view')}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}
```

### 6. The invite form (members page, first version)

📄 **Create `src/validations/invitation.ts`:**

```ts
import { z } from 'zod';

export const inviteSchema = z.object({
  email: z.email({ message: 'validation.email' }),
  role: z.enum(['admin', 'member']), // owners are made by transferring ownership, never by invitation
});
export type InviteInput = z.infer<typeof inviteSchema>;
```

📄 **Create `src/components/org/invite-member-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { type InviteInput, inviteSchema } from '@/validations/invitation';

export function InviteMemberForm({
  organizationId,
  roles,
}: {
  organizationId: string;
  roles: ('admin' | 'member')[];
}) {
  const t = useTranslations('org.invitations');
  const tRoles = useTranslations('org.roles');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'member' },
  });

  async function onSubmit(values: InviteInput) {
    setFormError(null);
    // The server re-checks the permission (invitation:create) — hiding this form is only UX
    const { error } = await authClient.organization.inviteMember({ ...values, organizationId });
    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    toast.success(t('sent', { email: values.email }));
    form.reset();
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <TextField name="email" label={t('email')} type="email" autoComplete="off" />
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('role')}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {tRoles(role)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        </div>
        <SubmitButton>{t('send')}</SubmitButton>
      </form>
    </Form>
  );
}
```

📄 **Create `src/app/[locale]/(app)/dashboard/[orgSlug]/members/page.tsx`** (first version; S4-T12 adds the members table):

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageHeader } from '@/components/layout/page-header';
import { InviteMemberForm } from '@/components/org/invite-member-form';
import { requireOrgMember } from '@/data/authz';

export default async function MembersPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const { org } = await requireOrgMember(orgSlug);
  const t = await getTranslations('org');

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title={t('members.title')} description={t('members.description')} />
      <section className="space-y-4">
        <h2 className="text-lg font-medium">{t('invitations.title')}</h2>
        <InviteMemberForm organizationId={org.id} roles={['admin', 'member']} />
      </section>
    </div>
  );
}
```

Add the rate limit for inviting (per IP) in `src/libs/auth-rate-limit.ts`:

```ts
  // 🔍 confirm the route name in your version
  '/organization/invite-member': { window: 60, max: 5 },
```

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

Use two browsers (or one + a private window):

1. As the demo user: **Members** → invite `new@example.com` as _member_ → the terminal prints the invitation email (link `/accept-invitation/<id>`).
2. Open the link **signed out** → "You've been invited" with sign-in / create-account buttons — and **no** organization name.
3. Create a _new_ account with that email (verify it) → `/dashboard` redirects to onboarding (no org if `AUTO_CREATE_PERSONAL_ORG=false`; otherwise they have a workspace) → the **pending invitation appears** → open it → **Accept invitation** → you land in the demo organization. Studio: a new `member` row; invitation `status = 'accepted'`.
4. Open the invitation link as a **different** signed-in user → "different email address" notice, no way to accept.
5. Invite the same person twice → the first invitation is cancelled (setting `cancelPendingInvitationsOnReInvite`).
6. Invite an existing member → "This person is already a member."
7. Use the link after `expiresAt` (edit the row in Studio to the past) → "expired". `/fr/accept-invitation/<id>` is fully translated, and the email subject is French when your locale cookie is `fr`.

**🚢 Ship** — branch `feat/s4-t04-invitations` · message: `feat(org): add email invitations with accept page and onboarding list`

---

## 🎫 S4-T05 — Invitation lifecycle and the last-owner rule

**Branch:** `feat/s4-t05-invitation-lifecycle` · **Story:** US-041 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s4-t05-invitation-lifecycle
```

### 1. The last-owner and "who may manage whom" rules (pure)

📄 **Append to `src/libs/org-members.ts`:**

```ts
export type MemberLike = { id: string; role: string };

/**
 * Would this change leave the organization without an owner?
 * `nextRole` omitted → the member is being REMOVED; provided → their role is being CHANGED.
 */
export function wouldLeaveNoOwner(
  members: MemberLike[],
  targetId: string,
  nextRole?: string,
): boolean {
  const owners = members.filter((item) => hasRole(item.role, 'owner'));
  const targetIsOwner = owners.some((item) => item.id === targetId);
  if (!targetIsOwner) return false;

  const stillOwner = nextRole !== undefined && hasRole(nextRole, 'owner');
  if (stillOwner) return false;
  return owners.length <= 1;
}

const ORDER = { owner: 3, admin: 2, member: 1 } as const;
const rank = (role: string) =>
  Math.max(0, ...rolesOf(role).map((value) => ORDER[value as keyof typeof ORDER] ?? 0));

/** Owners manage everyone; admins manage only members; nobody manages someone of equal/higher rank (except owners). */
export function canManageTarget(actorRole: string, targetRole: string): boolean {
  if (hasRole(actorRole, 'owner')) return true;
  return rank(actorRole) > rank(targetRole);
}

/** Roles the actor may hand out through the UI. `owner` only ever changes via transfer. */
export function assignableRoles(actorRole: string): ('admin' | 'member')[] {
  if (hasRole(actorRole, 'owner')) return ['admin', 'member'];
  if (hasRole(actorRole, 'admin')) return ['member'];
  return [];
}
```

📄 **Create `src/libs/org-members.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import {
  assignableRoles,
  canManageTarget,
  hasRole,
  rolesOf,
  wouldLeaveNoOwner,
} from './org-members';

const members = [
  { id: 'a', role: 'owner' },
  { id: 'b', role: 'admin' },
  { id: 'c', role: 'member' },
];

describe('wouldLeaveNoOwner', () => {
  it('blocks removing or demoting the only owner', () => {
    expect(wouldLeaveNoOwner(members, 'a')).toBe(true);
    expect(wouldLeaveNoOwner(members, 'a', 'admin')).toBe(true);
  });
  it('allows changes that keep an owner', () => {
    expect(wouldLeaveNoOwner(members, 'a', 'owner')).toBe(false);
    expect(wouldLeaveNoOwner(members, 'b')).toBe(false);
    expect(wouldLeaveNoOwner(members, 'c', 'admin')).toBe(false);
    expect(wouldLeaveNoOwner([...members, { id: 'd', role: 'owner' }], 'a')).toBe(false); // a second owner exists
  });
});

describe('canManageTarget / assignableRoles', () => {
  it('owners manage everyone', () => {
    expect(canManageTarget('owner', 'owner')).toBe(true);
    expect(canManageTarget('owner', 'admin')).toBe(true);
  });
  it('admins manage only plain members', () => {
    expect(canManageTarget('admin', 'member')).toBe(true);
    expect(canManageTarget('admin', 'admin')).toBe(false);
    expect(canManageTarget('admin', 'owner')).toBe(false);
  });
  it('members manage nobody', () => {
    expect(canManageTarget('member', 'member')).toBe(false);
    expect(assignableRoles('member')).toEqual([]);
  });
  it('hands out only roles below the actor', () => {
    expect(assignableRoles('owner')).toEqual(['admin', 'member']);
    expect(assignableRoles('admin')).toEqual(['member']);
  });
});

it('parses comma-separated roles', () => {
  expect(rolesOf('admin, member')).toEqual(['admin', 'member']);
  expect(hasRole('admin,owner', 'owner')).toBe(true);
  expect(hasRole(null, 'owner')).toBe(false);
});
```

> Role assignment through the **invite** form for an admin: the form received `roles` from the page; in S4-T12 the page passes `assignableRoles(member.role)`.

### 2. Pending invitations: expiry, resend, revoke

📄 **Create `src/components/org/pending-invitations.tsx`:**

```tsx
'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';

type Item = { id: string; email: string; role: string | null; expiresAt: string };
type Props = { invitations: Item[]; organizationId: string; canManage: boolean };

export function PendingInvitations({ invitations, organizationId, canManage }: Props) {
  const t = useTranslations('org.invitations');
  const tRoles = useTranslations('org.roles');
  const tAll = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    task: () => Promise<{ error: { code?: string; status?: number } | null }>,
    success: string,
  ) {
    startTransition(async () => {
      const { error } = await task();
      if (error) {
        const key = authErrorKey(error);
        toast.error(tAll.has(key as never) ? tAll(key as never) : tAll('errors.internal'));
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  if (invitations.length === 0) return <p className="text-muted-foreground text-sm">{t('none')}</p>;

  return (
    <ul className="divide-y rounded-md border">
      {invitations.map((item) => {
        const expired = new Date(item.expiresAt) < new Date();
        const role = (item.role ?? 'member') as 'owner' | 'admin' | 'member';
        return (
          <li key={item.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {item.email}
                <Badge variant="secondary">{tRoles(role)}</Badge>
              </p>
              <p className="text-muted-foreground text-xs">
                {expired
                  ? t('expired')
                  : t('expires', {
                      date: format.dateTime(new Date(item.expiresAt), { dateStyle: 'medium' }),
                    })}
              </p>
            </div>
            {canManage ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      // 🔍 `resend: true` re-sends instead of failing with "already invited"
                      () =>
                        authClient.organization.inviteMember({
                          email: item.email,
                          role: role === 'owner' ? 'admin' : role,
                          organizationId,
                          resend: true,
                        }),
                      t('resent'),
                    )
                  }
                >
                  {t('resend')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => authClient.organization.cancelInvitation({ invitationId: item.id }),
                      t('revoked'),
                    )
                  }
                >
                  {t('revoke')}
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
```

📄 **Edit the members page** — load and show the list (the proper permission check replaces `true` in S4-T08/T12):

```tsx
import { PendingInvitations } from '@/components/org/pending-invitations';
import { listPendingInvitations } from '@/data/org-queries';
import { db } from '@/db/client';
// …
const invitations = await listPendingInvitations(db, org.id);
// …under the invite form:
<section className="space-y-3">
  <h3 className="font-medium">{t('invitations.pending')}</h3>
  <PendingInvitations
    organizationId={org.id}
    canManage
    invitations={invitations.map((item) => ({ ...item, expiresAt: item.expiresAt.toISOString() }))}
  />
</section>;
```

### 3. Tests for the account-deletion rule against the real plugin

📄 **Append to `tests/integration/account.test.ts`:**

```ts
import { randomUUID } from 'node:crypto';

import { createOrganizationWithOwner } from '@/data/org-queries';
import { member } from '@/db/schema';

describe('account deletion and organizations', () => {
  it('refuses to delete the only owner of an organization that has other members', async () => {
    const owner = nextEmail();
    const mate = nextEmail();
    await signUpAndVerify(auth, transport, owner);
    await signUpAndVerify(auth, transport, mate);
    const [ownerRow] = await db.select().from(user).where(eq(user.email, owner));
    const [mateRow] = await db.select().from(user).where(eq(user.email, mate));

    const org = await createOrganizationWithOwner(db, {
      name: 'Team',
      slug: `t-${randomUUID().slice(0, 6)}`,
      ownerId: ownerRow!.id,
    });
    await db
      .insert(member)
      .values({ id: randomUUID(), organizationId: org.id, userId: mateRow!.id, role: 'member' });

    const device = await signIn(auth, owner);
    await expect(
      auth.api.deleteUser({ body: { password: TEST_PASSWORD }, headers: device.headers }),
    ).rejects.toMatchObject({ body: { code: 'SOLE_OWNER' } });
    expect(await db.select().from(user).where(eq(user.id, ownerRow!.id))).toHaveLength(1);
  });
});
```

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

1. **Members** shows pending invitations with role badge and an expiry date; an expired one shows "Expired".
2. **Resend** prints a fresh email; **Revoke** removes the row (Studio: `status = 'canceled'`); the old link then says "This invitation is no longer valid."
3. Click **Resend** quickly 6 times with `AUTH_RATE_LIMIT=on` → "Too many requests…" (per-IP limit).
4. `pnpm test` — `org-members.test.ts` documents the owner rules; they're **used** by the member actions in S4-T12.

**🚢 Ship** — branch `feat/s4-t05-invitation-lifecycle` · message: `feat(org): add invitation resend/revoke and last-owner rules`

---

## 🎫 S4-T06 — Access-control statements and roles

**Branch:** `feat/s4-t06-permissions` · **Story:** US-042 · **3 SP** · 🔍 Read the Better Auth **organization → access control** docs

```bash
git switch main && git pull && git switch -c feat/s4-t06-permissions
```

> 🎯 **One file defines who may do what** — used by the plugin (server **and** client), by our Server Actions, and by the UI. A permission = `resource:action`.

### 1. The single source of truth

📄 **Create `src/libs/permissions.ts`:**

```ts
import { createAccessControl } from 'better-auth/plugins/access'; // 🔍 import path varies by version

import { rolesOf } from '@/libs/org-members';

/**
 * Names follow Better Auth's defaults (organization / member / invitation) so the plugin enforces
 * them on ITS endpoints; `project` is ours.
 *   invite  → invitation:create      remove member → member:delete
 *   revoke  → invitation:cancel      change role   → member:update
 */
export const statements = {
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  project: ['create', 'read', 'update', 'delete'],
} as const;

export const ac = createAccessControl(statements);

export const roles = {
  owner: ac.newRole({
    organization: ['update', 'delete'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    project: ['create', 'read', 'update', 'delete'],
  }),
  admin: ac.newRole({
    organization: ['update'], // admins can't delete the organization or transfer ownership
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    project: ['create', 'read', 'update', 'delete'],
  }),
  // Decision (ADR): members create/read/update projects but can't delete them
  member: ac.newRole({
    project: ['create', 'read', 'update'],
  }),
};

export type RoleName = keyof typeof roles;
export type PermissionRequest = {
  [Resource in keyof typeof statements]?: (typeof statements)[Resource][number][];
};

/** True if ANY of the user's roles grants EVERY requested permission. Unknown roles grant nothing. */
export function hasPermission(
  role: string | null | undefined,
  request: PermissionRequest,
): boolean {
  return rolesOf(role).some((name) => {
    const definition = roles[name as RoleName];
    // `authorize` is typed against the statement map; our request type is a safe subset
    return definition ? definition.authorize(request as never).success : false;
  });
}
```

### 2. Register it on the server and the client

📄 **Edit `src/libs/Auth.ts`** — `import { ac, roles } from '@/libs/permissions';` and in `organization({ … })`:

```ts
        ac,
        roles,
```

📄 **Edit `src/libs/AuthClient.ts`:**

```ts
import { ac, roles } from '@/libs/permissions';
// plugins: [..., organizationClient({ ac, roles }), ...]
```

> The client needs the same `ac`/`roles` so `authClient.organization.checkRolePermission(...)` and type inference agree with the server.

### 3. A first sanity test (the exhaustive matrix comes in S4-T08)

📄 **Create `src/libs/permissions.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it('basic expectations', () => {
    expect(hasPermission('owner', { organization: ['delete'] })).toBe(true);
    expect(hasPermission('admin', { organization: ['delete'] })).toBe(false);
    expect(hasPermission('member', { project: ['delete'] })).toBe(false);
  });

  it('unknown or missing roles grant nothing', () => {
    expect(hasPermission('superuser', { project: ['read'] })).toBe(false);
    expect(hasPermission(null, { project: ['read'] })).toBe(false);
  });

  it('requires EVERY requested permission', () => {
    expect(hasPermission('member', { project: ['read', 'delete'] })).toBe(false);
    expect(hasPermission('member', { project: ['read', 'update'] })).toBe(true);
  });

  it('combines comma-separated roles', () => {
    expect(hasPermission('member,admin', { member: ['delete'] })).toBe(true);
  });
});
```

### 4. The matrix, documented

📄 **Create `docs/guides/rbac.md`:**

```markdown
# Roles & permissions (RBAC)

Defined **once** in `src/libs/permissions.ts`. Enforced on the **server**; the UI only mirrors it.

| Permission                                | owner | admin | member |
| ----------------------------------------- | :---: | :---: | :----: |
| `organization:update`                     |  ✅   |  ✅   |   —    |
| `organization:delete`                     |  ✅   |   —   |   —    |
| `member:create` (invite/add)              |  ✅   |  ✅   |   —    |
| `member:update` (change role)             |  ✅   |  ✅   |   —    |
| `member:delete` (remove)                  |  ✅   |  ✅   |   —    |
| `invitation:create` / `invitation:cancel` |  ✅   |  ✅   |   —    |
| `project:create` / `read` / `update`      |  ✅   |  ✅   |   ✅   |
| `project:delete`                          |  ✅   |  ✅   |   —    |

## Extra rules (beyond the matrix) — `src/libs/org-members.ts`

- An organization always keeps **at least one owner**.
- **Admins manage only plain members**; only owners manage owners/admins.
- `owner` is never handed out by invitation or role change — only by **transfer ownership**.

## Platform role (separate!)

`user.role` = `user` | `admin` is a **platform** role (admin console). It is unrelated to organization roles.

## How to add a permission

1. Add the action to `statements`, then to each role that should have it.
2. Add a row to the matrix test (`permissions.test.ts`) — it fails until you do.
3. Enforce it: Server Action → `withOrgPermission({ resource: ['action'] }, …)`; page → `requirePagePermission`.
4. Mirror it in the UI with `<Can>` (hiding is **not** security).
```

### ✅ Verify

```bash
pnpm test && pnpm typecheck && pnpm lint && pnpm knip
pnpm dev
```

Sign in as the demo user and invite someone as _member_ → works (owner has `invitation:create`). Sign in as a plain member (S4-T04 flow) and call the invite endpoint from DevTools:

```js
fetch('/api/auth/organization/invite-member', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'x@example.com', role: 'member', organizationId: '<org id>' }),
}).then((r) => r.status);
```

→ **403**. The plugin enforces the roles you registered, even without our UI.

**🚢 Ship** — branch `feat/s4-t06-permissions` · message: `feat(rbac): define access-control statements and roles, register on server and client`

---

## 🎫 S4-T07 — Server authorization helpers

**Branch:** `feat/s4-t07-authz-helpers` · **Story:** US-042 · **3 SP** · 🔒 security-critical

```bash
git switch main && git pull && git switch -c feat/s4-t07-authz-helpers
```

> 🎯 Two families of helpers, because pages and actions fail differently:
>
> - **Pages** → _redirect / 404_ (`requireOrgMember`, `requirePagePermission`)
> - **Server Actions** → _throw typed errors_ (`getOrgMembershipOrThrow`, `requirePermission`, `withOrgPermission`)

### 1. Rewrite `src/data/authz.ts`

📄 **Replace the file:**

```ts
import 'server-only';
import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { db } from '@/db/client';
import { redirect } from '@/i18n/navigation';
import { AuthorizationError, NotFoundError } from '@/libs/errors';
import { hasPermission, type PermissionRequest } from '@/libs/permissions';

import { findMembership } from './org-queries';
import { getSessionOrThrow, requireSession } from './session';

/* ───────────── Pages ───────────── */

/**
 * Session + membership for the organization in the URL.
 * Non-members get a 404 — never a 403: other tenants' existence must not be observable.
 * The role is read from the DATABASE on every call, never from a cookie.
 */
export async function requireOrgMember(orgSlug: string) {
  const session = await requireSession();
  const membership = await findMembership(db, session.user.id, orgSlug);
  if (!membership) notFound();
  return { session, ...membership };
}

/** Same, plus a permission. Members who lack it are sent back to the organization overview. */
export async function requirePagePermission(orgSlug: string, request: PermissionRequest) {
  const context = await requireOrgMember(orgSlug);
  if (!hasPermission(context.member.role, request)) {
    return redirect({ href: `/dashboard/${orgSlug}`, locale: await getLocale() });
  }
  return context;
}

/* ───────────── Server Actions / data functions ───────────── */

/** Throwing variant: NotFoundError for non-members (not "forbidden"). */
export async function getOrgMembershipOrThrow(orgSlug: string) {
  const session = await getSessionOrThrow();
  const membership = await findMembership(db, session.user.id, orgSlug);
  if (!membership) throw new NotFoundError();
  return { session, ...membership };
}

export type OrgContext = Awaited<ReturnType<typeof getOrgMembershipOrThrow>>;

export async function requirePermission(
  orgSlug: string,
  request: PermissionRequest,
): Promise<OrgContext> {
  const context = await getOrgMembershipOrThrow(orgSlug);
  if (!hasPermission(context.member.role, request)) throw new AuthorizationError();
  return context;
}

/**
 * `createAction(schema, withOrgPermission({ project: ['delete'] }, async (input, { org }) => …))`
 * The schema MUST contain `orgSlug`. The handler never runs without the permission.
 */
export function withOrgPermission<Input extends { orgSlug: string }, Result>(
  request: PermissionRequest,
  handler: (input: Input, context: OrgContext) => Promise<Result>,
) {
  return async (input: Input): Promise<Result> =>
    handler(input, await requirePermission(input.orgSlug, request));
}
```

(The `OrgContext` type moved from `requireOrgMember` to the throwing variant — nothing else imported it yet.)

### 2. Tests with mocks (no proxy, no real DB)

📄 **Create `src/data/authz.test.ts`:**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthorizationError, NotFoundError } from '@/libs/errors';

const sessionMock = vi.hoisted(() => vi.fn());
const membershipMock = vi.hoisted(() => vi.fn());

vi.mock('@/data/session', () => ({ getSessionOrThrow: sessionMock, requireSession: sessionMock }));
vi.mock('@/data/org-queries', () => ({ findMembership: membershipMock }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/i18n/navigation', () => ({
  redirect: (target: unknown) => {
    throw new Error(`REDIRECT:${JSON.stringify(target)}`);
  },
}));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }));

import {
  getOrgMembershipOrThrow,
  requireOrgMember,
  requirePagePermission,
  requirePermission,
  withOrgPermission,
} from './authz';

const session = { user: { id: 'u1' }, session: { id: 's1' } };
const as = (role: string) => ({
  org: { id: 'o1', name: 'Acme', slug: 'acme' },
  member: { id: 'm1', role },
});

beforeEach(() => {
  sessionMock.mockReset().mockResolvedValue(session);
  membershipMock.mockReset();
});

describe('actions (throwing helpers)', () => {
  it('treats a non-member as "not found", never "forbidden"', async () => {
    membershipMock.mockResolvedValue(undefined);
    await expect(getOrgMembershipOrThrow('acme')).rejects.toBeInstanceOf(NotFoundError);
    await expect(requirePermission('acme', { project: ['read'] })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('forbids members without the permission, allows owners', async () => {
    membershipMock.mockResolvedValue(as('member'));
    await expect(requirePermission('acme', { project: ['delete'] })).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    membershipMock.mockResolvedValue(as('owner'));
    await expect(requirePermission('acme', { project: ['delete'] })).resolves.toMatchObject({
      org: { id: 'o1' },
    });
  });

  it('reads the role fresh on EVERY call (a demotion applies immediately)', async () => {
    membershipMock.mockResolvedValueOnce(as('admin')).mockResolvedValueOnce(as('member'));
    await expect(requirePermission('acme', { organization: ['update'] })).resolves.toBeDefined();
    await expect(requirePermission('acme', { organization: ['update'] })).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it('withOrgPermission never runs the handler without the permission', async () => {
    membershipMock.mockResolvedValue(as('member'));
    const handler = vi.fn();
    await expect(
      withOrgPermission({ project: ['delete'] }, handler)({ orgSlug: 'acme' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('pages', () => {
  it('404 for non-members', async () => {
    membershipMock.mockResolvedValue(undefined);
    await expect(requireOrgMember('acme')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('sends members without the permission back to the overview', async () => {
    membershipMock.mockResolvedValue(as('member'));
    await expect(requirePagePermission('acme', { organization: ['update'] })).rejects.toThrow(
      'REDIRECT:{"href":"/dashboard/acme","locale":"en"}',
    );
  });
});
```

### ✅ Verify

```bash
pnpm test && pnpm check
```

Mutation check: in `requirePermission` change `!hasPermission(` to `hasPermission(` → the tests fail loudly. Revert.

**🚢 Ship** — branch `feat/s4-t07-authz-helpers` · message: `feat(rbac): add page and action authorization helpers with tests`

---

## 🎫 S4-T08 — Client permission hooks and the exhaustive matrix test

**Branch:** `feat/s4-t08-client-permissions` · **Story:** US-042 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s4-t08-client-permissions
```

> 🔒 **"UI hides, server enforces."** These helpers only decide what to _render_. Every sensitive operation is re-checked on the server (S4-T07).

### 1. Provider, hook and `<Can>`

📄 **Create `src/components/org/org-provider.tsx`:**

```tsx
'use client';

import { createContext, type ReactNode, useContext } from 'react';

import { hasPermission, type PermissionRequest } from '@/libs/permissions';

type OrgValue = { org: { id: string; name: string; slug: string }; role: string };

const OrgContextValue = createContext<OrgValue | null>(null);

export function OrgProvider({ value, children }: { value: OrgValue; children: ReactNode }) {
  return <OrgContextValue.Provider value={value}>{children}</OrgContextValue.Provider>;
}

export function useOrg(): OrgValue {
  const value = useContext(OrgContextValue);
  if (!value) throw new Error('useOrg must be used inside <OrgProvider>');
  return value;
}

/** Same pure function the server uses → UI and API can't disagree about the matrix. */
export function usePermission(request: PermissionRequest): boolean {
  return hasPermission(useOrg().role, request);
}

export function Can({
  request,
  children,
  fallback = null,
}: {
  request: PermissionRequest;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return usePermission(request) ? children : fallback;
}
```

📄 **Edit `src/app/[locale]/(app)/dashboard/[orgSlug]/layout.tsx`** — provide the org to client components:

```tsx
import type { ReactNode } from 'react';

import { OrgProvider } from '@/components/org/org-provider';
import { requireOrgMember } from '@/data/authz';

export default async function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { org, member } = await requireOrgMember(orgSlug); // early 404 — pages still guard themselves

  return <OrgProvider value={{ org, role: member.role }}>{children}</OrgProvider>;
}
```

### 2. The exhaustive matrix test

The expected truth table is written **by hand** (not derived from the implementation), so a silent change of a role fails the test.

📄 **Replace `src/libs/permissions.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { hasPermission, roles, type RoleName, statements } from './permissions';

const T = true;
const F = false;

// resource:action → allowed?   (mirror of docs/guides/rbac.md)
const MATRIX: Record<RoleName, Record<string, boolean>> = {
  owner: {
    'organization:update': T,
    'organization:delete': T,
    'member:create': T,
    'member:update': T,
    'member:delete': T,
    'invitation:create': T,
    'invitation:cancel': T,
    'project:create': T,
    'project:read': T,
    'project:update': T,
    'project:delete': T,
  },
  admin: {
    'organization:update': T,
    'organization:delete': F,
    'member:create': T,
    'member:update': T,
    'member:delete': T,
    'invitation:create': T,
    'invitation:cancel': T,
    'project:create': T,
    'project:read': T,
    'project:update': T,
    'project:delete': T,
  },
  member: {
    'organization:update': F,
    'organization:delete': F,
    'member:create': F,
    'member:update': F,
    'member:delete': F,
    'invitation:create': F,
    'invitation:cancel': F,
    'project:create': T,
    'project:read': T,
    'project:update': T,
    'project:delete': F,
  },
};

const allPermissions = Object.entries(statements).flatMap(([resource, actions]) =>
  actions.map((action) => `${resource}:${action}`),
);

describe('permission matrix', () => {
  it('has a row for EVERY permission and EVERY role (add a permission → this fails until you do)', () => {
    for (const role of Object.keys(roles) as RoleName[]) {
      expect(Object.keys(MATRIX[role]).sort()).toEqual([...allPermissions].sort());
    }
  });

  for (const role of Object.keys(MATRIX) as RoleName[]) {
    describe(role, () => {
      it.each(allPermissions)('%s', (permission) => {
        const [resource, action] = permission.split(':') as [keyof typeof statements, string];
        const allowed = hasPermission(role, { [resource]: [action] } as never);
        expect(allowed, `${role} ${permission}`).toBe(MATRIX[role][permission]);
      });
    });
  }
});

describe('edge cases', () => {
  it('unknown, empty and null roles grant nothing', () => {
    for (const role of ['superuser', '', null, undefined]) {
      expect(hasPermission(role, { project: ['read'] })).toBe(false);
    }
  });

  it('requires every requested permission and unions comma-separated roles', () => {
    expect(hasPermission('member', { project: ['read', 'delete'] })).toBe(false);
    expect(hasPermission('member,admin', { member: ['delete'] })).toBe(true);
  });
});
```

### 3. Browser test for `<Can>`

📄 **Create `src/components/org/org-provider.test.tsx`:**

```tsx
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { Can, OrgProvider } from './org-provider';

const org = { id: 'o1', name: 'Acme', slug: 'acme' };

function renderAs(role: string) {
  return render(
    <OrgProvider value={{ org, role }}>
      <Can request={{ project: ['delete'] }} fallback={<p>read only</p>}>
        <button type="button">Delete project</button>
      </Can>
    </OrgProvider>,
  );
}

test('renders the action for roles that have the permission', async () => {
  const screen = await renderAs('admin');
  await expect.element(screen.getByRole('button', { name: 'Delete project' })).toBeVisible();
});

test('renders the fallback for roles that do not', async () => {
  const screen = await renderAs('member');
  await expect.element(screen.getByText('read only')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Delete project' }).elements()).toHaveLength(0);
});
```

### ✅ Verify

```bash
pnpm test && pnpm test:browser && pnpm check
```

Mutation check: change `'project:delete': F` to `T` for `member` in the matrix → fails; add a new action to `statements` → the "row for EVERY permission" test fails. Revert.

**🚢 Ship** — branch `feat/s4-t08-client-permissions` · message: `feat(rbac): add org provider, Can component and exhaustive permission matrix test`

---

## 🎫 S4-T09 — Tenant-scoped `Project`, `tenantDb` and the RLS spike

**Branch:** `feat/s4-t09-projects-tenantdb` · **Story:** US-043 · **3 SP** · 🔒 security-critical · risk **R-04**

> 🎯 **Isolation by construction.** Feature code never writes `where organization_id = …` by hand — it receives a repository that _can't_ leave its tenant. A test forbids importing the raw database from feature code.

```bash
git switch main && git pull && git switch -c feat/s4-t09-projects-tenantdb
```

### 1. Schema + migration

📄 **Create `src/db/schema/project.ts`:**

```ts
import { index, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { organization } from './org';

export const projectStatus = pgEnum('project_status', ['active', 'archived']);

export const project = pgTable(
  'project',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    status: projectStatus('status').notNull().default('active'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('project_org_created_idx').on(table.organizationId, table.createdAt)],
);
```

📄 **Edit `src/db/schema/index.ts`:** add `export * from './project';`

```bash
pnpm db:generate && pnpm db:check      # 0005_….sql
```

### 2. The tenant-scoped repository

📄 **Create `src/data/tenant-db.ts`:**

```ts
import 'server-only';
import { randomUUID } from 'node:crypto';

import { and, count, desc, eq, ilike } from 'drizzle-orm';

import { db } from '@/db/client';
import { project } from '@/db/schema';
import type { DbLike } from '@/db/types';

export type ProjectInput = {
  name: string;
  description?: string | null;
  status?: 'active' | 'archived';
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

function projectRepo(database: DbLike, organizationId: string) {
  // EVERY query below starts from this predicate. There is no way to omit it.
  const inOrg = eq(project.organizationId, organizationId);

  return {
    async list({
      search,
      page = 1,
      pageSize = 10,
    }: { search?: string; page?: number; pageSize?: number } = {}) {
      const where = search ? and(inOrg, ilike(project.name, `%${escapeLike(search)}%`)) : inOrg;
      const [items, totals] = await Promise.all([
        database
          .select()
          .from(project)
          .where(where)
          .orderBy(desc(project.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        database.select({ total: count() }).from(project).where(where),
      ]);
      return { items, total: Number(totals[0]?.total ?? 0) };
    },

    async get(id: string) {
      const [row] = await database
        .select()
        .from(project)
        .where(and(inOrg, eq(project.id, id)));
      return row;
    },

    async create(input: ProjectInput, createdBy: string) {
      const [row] = await database
        .insert(project)
        .values({
          id: randomUUID(),
          organizationId, // always the tenant of THIS repository, whatever the input says
          name: input.name,
          description: input.description ?? null,
          status: input.status ?? 'active',
          createdBy,
        })
        .returning();
      return row!;
    },

    async update(id: string, patch: Partial<ProjectInput>) {
      const [row] = await database
        .update(project)
        .set({
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.description !== undefined && { description: patch.description }),
          ...(patch.status !== undefined && { status: patch.status }),
        })
        .where(and(inOrg, eq(project.id, id)))
        .returning();
      return row; // undefined when the id belongs to another tenant (or doesn't exist)
    },

    async delete(id: string) {
      const rows = await database
        .delete(project)
        .where(and(inOrg, eq(project.id, id)))
        .returning({ id: project.id });
      return rows.length > 0;
    },
  };
}

export function createTenantDb(database: DbLike, organizationId: string) {
  return { organizationId, projects: projectRepo(database, organizationId) };
}

/** The ONLY way feature code reaches tenant data. */
export const tenantDb = (organizationId: string) => createTenantDb(db, organizationId);
```

> `server-only` makes this file unimportable from client components. Tests import `createTenantDb` through the Vitest stub.

### 3. A rule that keeps it that way

📄 **Create `src/data/tenant-boundary.test.ts`:**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

/**
 * Feature code (routes, components, actions) must not reach the raw database.
 * It goes through src/data/* — where tenant scoping lives and is tested.
 */
const FEATURE_DIRS = ['src/app', 'src/components', 'src/actions'];
const FORBIDDEN = /^import (?!type\b).*from ['"]@\/db\/(client|schema)/m;

function files(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => path.join(dir, file));
}

it('no feature code imports the database client or tables directly', () => {
  const offenders = FEATURE_DIRS.flatMap(files).filter((file) =>
    FORBIDDEN.test(readFileSync(file, 'utf8')),
  );

  expect(offenders, `Import via src/data instead:\n${offenders.join('\n')}`).toEqual([]);
});
```

This **will fail** on two files we wrote earlier (they used `db` directly). Fix them now by going through `src/data/organizations.ts`:

📄 **Add to `src/data/organizations.ts`:**

```ts
import { findInvitationDetails, listPendingInvitations } from './org-queries';

export async function getPendingInvitations(organizationId: string) {
  return listPendingInvitations(db, organizationId);
}

export async function getInvitationDetails(invitationId: string) {
  return findInvitationDetails(db, invitationId);
}
```

📄 **Members page** (`…/members/page.tsx`): remove `import { db } …` and `listPendingInvitations`; use `import { getPendingInvitations } from '@/data/organizations';` and `const invitations = await getPendingInvitations(org.id);`. 📄 **Accept-invitation page**: remove `import { db } …`/`findInvitationDetails`; use `import { getInvitationDetails } from '@/data/organizations';` and `const details = await getInvitationDetails(invitationId);`.

```bash
pnpm test        # tenant-boundary now passes
```

### 4. Seed: two tenants, three users, a platform of examples

📄 **Replace `src/db/seed.ts`:**

```ts
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { createOrganizationWithOwner } from '../data/org-queries';
import { account, member, organization, project, user } from './schema';
import type { DbLike } from './types';

export const DEMO_PASSWORD = 'Demo-Password-123'; // local development ONLY — seed refuses to run in production
export const DEMO_USER = {
  email: 'demo@example.com',
  name: 'Demo User',
  password: DEMO_PASSWORD,
} as const;

const PEOPLE = {
  demo: { email: DEMO_USER.email, name: DEMO_USER.name },
  teammate: { email: 'teammate@example.com', name: 'Taylor Teammate' },
  other: { email: 'other@example.com', name: 'Olivia Other' },
} as const;

type SeedOptions = { hashPassword: (password: string) => Promise<string> };

async function ensureUser(db: DbLike, hash: string, person: { email: string; name: string }) {
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, person.email));
  if (existing) return existing.id;

  const id = randomUUID();
  await db.insert(user).values({ id, name: person.name, email: person.email, emailVerified: true });
  await db.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: 'credential',
    userId: id,
    password: hash,
  });
  return id;
}

async function ensureOrg(db: DbLike, slug: string, name: string, ownerId: string) {
  const [existing] = await db.select().from(organization).where(eq(organization.slug, slug));
  return existing ?? createOrganizationWithOwner(db, { name, slug, ownerId });
}

/** Idempotent: safe to run any number of times. */
export async function seed(db: DbLike, { hashPassword }: SeedOptions) {
  const hash = await hashPassword(DEMO_PASSWORD);
  const demoId = await ensureUser(db, hash, PEOPLE.demo);
  const teammateId = await ensureUser(db, hash, PEOPLE.teammate);
  const otherId = await ensureUser(db, hash, PEOPLE.other);

  const demoOrg = await ensureOrg(db, 'demo', 'Demo workspace', demoId);
  const otherOrg = await ensureOrg(db, 'other-co', 'Other Co', otherId);

  // teammate belongs to the demo organization as a plain member
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, teammateId));
  if (!membership) {
    await db
      .insert(member)
      .values({ id: randomUUID(), organizationId: demoOrg.id, userId: teammateId, role: 'member' });
  }

  for (const [org, names] of [
    [demoOrg, ['Website redesign', 'Mobile app', 'Quarterly report']],
    [otherOrg, ['Secret project', 'Acquisition plan']],
  ] as const) {
    const existing = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.organizationId, org.id));
    if (existing.length === 0) {
      for (const name of names) {
        await db
          .insert(project)
          .values({ id: randomUUID(), organizationId: org.id, name, createdBy: demoId });
      }
    }
  }
}
```

📄 **Replace `src/db/seed.test.ts`:**

```ts
import { afterAll, beforeAll, expect, it } from 'vitest';

import { account, member, organization, project, user } from '@/db/schema';

import { createTestDb, type TestDb } from '../../tests/utils/test-db';
import { seed } from './seed';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
}, 30_000);
afterAll(() => destroy());

it('is idempotent, never stores plain passwords, and creates two separate tenants', async () => {
  const hashPassword = async (password: string) => `hashed:${password.length}`;
  await seed(db, { hashPassword });
  await seed(db, { hashPassword });

  expect(await db.select().from(user)).toHaveLength(3);
  expect(await db.select().from(organization)).toHaveLength(2);
  expect(await db.select().from(member)).toHaveLength(3); // 2 owners + 1 teammate
  expect(await db.select().from(project)).toHaveLength(5);
  for (const row of await db.select().from(account)) expect(row.password).toMatch(/^hashed:/);
});
```

Update `scripts/seed.ts`'s log line to print the three accounts (`demo@`, `teammate@`, `other@` — all `Demo-Password-123`).

### 5. The RLS spike (time-box: 3 hours) — and the decision

Postgres **Row-Level Security** could be a second wall. Evaluate it, then decide.

📄 **Create `scripts/rls-spike.ts`** (an experiment — not shipped to users):

```ts
import { PGlite } from '@electric-sql/pglite';

/** Does RLS work with `SET LOCAL app.org_id` inside a transaction, as a NON-superuser role? */
async function main() {
  const db = await PGlite.create();
  await db.exec(`
    CREATE TABLE project (id text primary key, organization_id text not null, name text not null);
    INSERT INTO project VALUES ('1','org-a','A1'), ('2','org-b','B1');
    CREATE ROLE app_user NOLOGIN;
    GRANT SELECT, INSERT, UPDATE, DELETE ON project TO app_user;
    ALTER TABLE project ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON project
      USING (organization_id = current_setting('app.org_id', true))
      WITH CHECK (organization_id = current_setting('app.org_id', true));
  `);

  const asTenant = async (orgId: string) => {
    await db.exec('BEGIN');
    await db.exec(`SET LOCAL ROLE app_user; SELECT set_config('app.org_id', '${orgId}', true);`);
    const { rows } = await db.query('SELECT name FROM project');
    await db.exec('COMMIT');
    return rows;
  };

  console.log('as superuser (no SET ROLE):', (await db.query('SELECT name FROM project')).rows); // sees BOTH → RLS bypassed
  console.log('tenant A:', await asTenant('org-a')); // only A1
  console.log('tenant B:', await asTenant('org-b')); // only B1
}

void main();
```

```bash
pnpm tsx scripts/rls-spike.ts
```

What you should observe — and why we **defer**:

- ✅ RLS works when the runtime uses a **non-owner, non-superuser** role inside a transaction with `SET LOCAL`.
- ⚠️ The default role on PGlite **and** Neon's owner role **bypass** RLS. Using it for real means: a dedicated runtime role, `FORCE ROW LEVEL SECURITY`, **every** query wrapped in a transaction that sets `app.org_id`, and care with the connection pooler (transaction mode only).
- 📉 Today `tenantDb` + the boundary test + the isolation tests (S4-T15) give the same guarantee for far less moving parts.

📄 **Record the decision** in `docs/adr/005-tenant-scoping-via-tenantdb-helper-rls-evaluated.md` — append:

```markdown
## Outcome (Sprint 4 spike)

- Decision: application-level scoping via `tenantDb` + boundary and isolation tests. **RLS deferred (TD-02).**
- RLS works with a non-superuser runtime role + `SET LOCAL app.org_id` in a transaction (see scripts/rls-spike.ts), but owner/superuser roles bypass it and every query would need transaction plumbing.
- Revisit when: multiple services share the database, or a compliance requirement asks for DB-enforced isolation.
```

(`scripts/rls-spike.ts` can stay as documentation; Knip treats `scripts/**` as entries.)

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm db:reset && pnpm db:studio
```

Studio: `project` has 3 rows in `demo`'s org and 2 in `other-co`'s; `pnpm db:seed` twice creates no duplicates. Log in as `other@example.com` / `Demo-Password-123` → `/dashboard` redirects to `/dashboard/other-co`.

**🚢 Ship** — branch `feat/s4-t09-projects-tenantdb` · message: `feat(tenancy): add project resource, tenantDb repository, boundary test and RLS decision`

---

## 🎫 S4-T10 — Projects CRUD

**Branch:** `feat/s4-t10-projects-crud` · **Story:** US-043 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s4-t10-projects-crud
mkdir -p "src/app/[locale]/(app)/dashboard/[orgSlug]/projects/[projectId]"
```

### 1. Validation

📄 **Create `src/validations/project.ts`:**

```ts
import { z } from 'zod';

export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'validation.projectName' })
    .max(80, { message: 'validation.projectName' }),
  description: z.string().trim().max(500, { message: 'validation.projectDescription' }),
  status: z.enum(['active', 'archived']),
});
export type ProjectFormInput = z.infer<typeof projectSchema>;

// Server actions also need to know WHICH tenant
export const createProjectSchema = projectSchema.extend({ orgSlug: z.string().min(1) });
export const updateProjectSchema = createProjectSchema.extend({ id: z.string().min(1) });
export const deleteProjectSchema = z.object({ orgSlug: z.string().min(1), id: z.string().min(1) });

export type CreateProjectInput = z.output<typeof createProjectSchema>;
export type UpdateProjectInput = z.output<typeof updateProjectSchema>;
export type DeleteProjectInput = z.output<typeof deleteProjectSchema>;
```

### 2. Server Actions — the permission is part of the declaration

📄 **Create `src/actions/projects.ts`:**

```ts
'use server';

import { withOrgPermission } from '@/data/authz';
import { tenantDb } from '@/data/tenant-db';
import { NotFoundError } from '@/libs/errors';
import { createAction } from '@/utils/action';
import {
  type CreateProjectInput,
  createProjectSchema,
  type DeleteProjectInput,
  deleteProjectSchema,
  type UpdateProjectInput,
  updateProjectSchema,
} from '@/validations/project';

const handleCreate = createAction(
  createProjectSchema,
  withOrgPermission(
    { project: ['create'] },
    async (input: CreateProjectInput, { org, session }) => {
      const row = await tenantDb(org.id).projects.create(
        { name: input.name, description: input.description || null, status: input.status },
        session.user.id,
      );
      return { id: row.id };
    },
  ),
);

const handleUpdate = createAction(
  updateProjectSchema,
  withOrgPermission({ project: ['update'] }, async (input: UpdateProjectInput, { org }) => {
    const row = await tenantDb(org.id).projects.update(input.id, {
      name: input.name,
      description: input.description || null,
      status: input.status,
    });
    if (!row) throw new NotFoundError(); // another tenant's id looks exactly like a missing one
    return { id: row.id };
  }),
);

const handleDelete = createAction(
  deleteProjectSchema,
  withOrgPermission({ project: ['delete'] }, async (input: DeleteProjectInput, { org }) => {
    if (!(await tenantDb(org.id).projects.delete(input.id))) throw new NotFoundError();
    return { deleted: true as const };
  }),
);

// A 'use server' file may only export async functions
export async function createProject(input: unknown) {
  return handleCreate(input);
}
export async function updateProject(input: unknown) {
  return handleUpdate(input);
}
export async function deleteProject(input: unknown) {
  return handleDelete(input);
}
```

### 3. Components

📄 **Create `src/components/org/project-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { createProject, updateProject } from '@/actions/projects';
import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { TextareaField } from '@/components/forms/textarea-field';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRouter } from '@/i18n/navigation';
import { applyActionError } from '@/utils/form-errors';
import { type ProjectFormInput, projectSchema } from '@/validations/project';

type Props = {
  orgSlug: string;
  /** Present → edit mode */
  project?: { id: string } & ProjectFormInput;
  onDone?: () => void;
};

export function ProjectForm({ orgSlug, project, onDone }: Props) {
  const t = useTranslations('org.projects');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ProjectFormInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'active',
    },
  });

  async function onSubmit(values: ProjectFormInput) {
    setFormError(null);
    const result = project
      ? await updateProject({ ...values, orgSlug, id: project.id })
      : await createProject({ ...values, orgSlug });

    if (!result.ok) {
      setFormError(applyActionError(form, result.error));
      return;
    }

    toast.success(project ? t('saved') : t('created'));
    onDone?.();
    if (project) router.refresh();
    else router.push(`/dashboard/${orgSlug}/projects/${(result.data as { id: string }).id}`);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="name" label={t('name')} autoComplete="off" />
        <TextareaField name="description" label={t('description_field')} rows={4} />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('status')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">{t('statusActive')}</SelectItem>
                  <SelectItem value="archived">{t('statusArchived')}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <SubmitButton>{project ? t('save') : t('create')}</SubmitButton>
      </form>
    </Form>
  );
}
```

📄 **Create `src/components/org/create-project-dialog.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ProjectForm } from '@/components/org/project-form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function CreateProjectDialog({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations('org.projects');
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t('new')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('new')}</DialogTitle>
        </DialogHeader>
        <ProjectForm orgSlug={orgSlug} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

📄 **Create `src/components/org/delete-project-button.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { deleteProject } from '@/actions/projects';
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

export function DeleteProjectButton({ orgSlug, id }: { orgSlug: string; id: string }) {
  const t = useTranslations('org.projects');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteProject({ orgSlug, id });
      if (!result.ok) return toast.error(t('delete'));
      toast.success(t('deleted'));
      router.push(`/dashboard/${orgSlug}/projects`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t('delete')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('delete')}</DialogTitle>
          <DialogDescription>{t('deleteConfirm')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            {t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. Pages

📄 **Create `…/projects/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageHeader } from '@/components/layout/page-header';
import { CreateProjectDialog } from '@/components/org/create-project-dialog';
import { Can } from '@/components/org/org-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requirePagePermission } from '@/data/authz';
import { tenantDb } from '@/data/tenant-db';
import { Link } from '@/i18n/navigation';

const PAGE_SIZE = 10;

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const { org } = await requirePagePermission(orgSlug, { project: ['read'] });

  const { q, page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);
  const { items, total } = await tenantDb(org.id).projects.list({
    search: q,
    page,
    pageSize: PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const t = await getTranslations('org.projects');

  const pageHref = (target: number) =>
    `/dashboard/${orgSlug}/projects?${new URLSearchParams({ ...(q ? { q } : {}), page: String(target) })}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Can request={{ project: ['create'] }}>
            <CreateProjectDialog orgSlug={orgSlug} />
          </Can>
        }
      />

      <form className="flex gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
        <Button type="submit" variant="outline">
          {t('searchPlaceholder')}
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 p-3">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/${orgSlug}/projects/${item.id}`}
                  className="font-medium hover:underline"
                >
                  {item.name}
                </Link>
                {item.description ? (
                  <p className="text-muted-foreground truncate text-sm">{item.description}</p>
                ) : null}
              </div>
              <span className="text-muted-foreground text-xs uppercase">
                {item.status === 'active' ? t('statusActive') : t('statusArchived')}
              </span>
            </li>
          ))}
        </ul>
      )}

      <nav className="flex items-center justify-between text-sm" aria-label={t('title')}>
        <span>{t('page', { page, pages })}</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)}>{t('previous')}</Link>
            </Button>
          ) : null}
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)}>{t('next')}</Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
```

📄 **Create `…/projects/[projectId]/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { PageHeader } from '@/components/layout/page-header';
import { DeleteProjectButton } from '@/components/org/delete-project-button';
import { Can } from '@/components/org/org-provider';
import { ProjectForm } from '@/components/org/project-form';
import { requirePagePermission } from '@/data/authz';
import { tenantDb } from '@/data/tenant-db';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string; projectId: string }>;
}) {
  const { locale, orgSlug, projectId } = await params;
  setRequestLocale(locale);
  const { org } = await requirePagePermission(orgSlug, { project: ['read'] });

  // Scoped to THIS organization → another tenant's id is indistinguishable from a missing one
  const row = await tenantDb(org.id).projects.get(projectId);
  if (!row) notFound();

  const t = await getTranslations('org.projects');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={row.name}
        description={t('edit')}
        actions={
          <Can request={{ project: ['delete'] }}>
            <DeleteProjectButton orgSlug={orgSlug} id={row.id} />
          </Can>
        }
      />
      <Can
        request={{ project: ['update'] }}
        fallback={<p className="text-muted-foreground text-sm">{row.description}</p>}
      >
        <ProjectForm
          orgSlug={orgSlug}
          project={{
            id: row.id,
            name: row.name,
            description: row.description ?? '',
            status: row.status,
          }}
        />
      </Can>
    </div>
  );
}
```

> The two pages call `requirePagePermission` themselves (the guard-coverage test checks it); `<Can>` only decides what to **render**.

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

As `demo@example.com`:

1. **Projects** lists 3 seeded projects; search "mobile" filters; with > 10 projects the pager works (`?page=2`).
2. **New project** → dialog → empty name shows the translated error → valid → you land on the project page.
3. Edit and save → toast; **Delete** → confirm → back to the list. As `teammate@example.com` (a _member_ of `demo`):
4. Can create/edit, but the project page shows **no Delete button**.
5. Tamper: copy a project id from `other-co` (Studio) and open `/dashboard/demo/projects/<that id>` → **404**; the same id under `/dashboard/other-co/...` → **404** (not a member).
6. From DevTools, replay a delete request for a member (the server action returns `FORBIDDEN`) — the UI hiding was only cosmetic.

**🚢 Ship** — branch `feat/s4-t10-projects-crud` · message: `feat(projects): add tenant-scoped project CRUD with permission-gated actions`

---

## 🎫 S4-T11 — Organization settings

**Branch:** `feat/s4-t11-org-settings` · **Story:** US-044 · **2 SP**

```bash
git switch main && git pull && git switch -c feat/s4-t11-org-settings
mkdir -p "src/app/[locale]/(app)/dashboard/[orgSlug]/settings"
```

### 1. Rename / change the URL name

📄 **Create `src/components/org/org-settings-form.tsx`:**

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { FormError } from '@/components/forms/form-error';
import { SubmitButton } from '@/components/forms/submit-button';
import { TextField } from '@/components/forms/text-field';
import { Form } from '@/components/ui/form';
import { useRouter } from '@/i18n/navigation';
import { authErrorKey } from '@/libs/auth-error-keys';
import { authClient } from '@/libs/AuthClient';
import { type CreateOrgInput, updateOrgSchema } from '@/validations/org';

type Props = { org: { id: string; name: string; slug: string } };

export function OrgSettingsForm({ org }: Props) {
  const t = useTranslations('org.settings');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CreateOrgInput>({
    resolver: zodResolver(updateOrgSchema),
    defaultValues: { name: org.name, slug: org.slug },
  });

  async function onSubmit(values: CreateOrgInput) {
    setFormError(null);
    // The server re-checks organization:update — a member calling this endpoint gets 403
    const { error } = await authClient.organization.update({
      data: values,
      organizationId: org.id,
    });
    if (error) {
      setFormError(authErrorKey(error));
      return;
    }
    toast.success(t('saved'));
    // The old URL stops working: move to the new one
    router.replace(`/dashboard/${values.slug}/settings`);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError messageKey={formError} />
        <TextField name="name" label={t('name')} autoComplete="organization" />
        <div className="space-y-1">
          <TextField name="slug" label={t('slug')} autoComplete="off" />
          <p className="text-muted-foreground text-xs">{t('slugWarning')}</p>
        </div>
        <SubmitButton>{t('save')}</SubmitButton>
      </form>
    </Form>
  );
}
```

### 2. Delete the organization — owner only, recent sign-in, typed name

📄 **Create `src/actions/organization.ts`** (grows in S4-T12):

```ts
'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { requirePermission } from '@/data/authz';
import { requireFreshSession } from '@/data/session';
import { auth } from '@/libs/Auth';
import { mapAuthApiError } from '@/libs/auth-api-errors';
import { ValidationError } from '@/libs/errors';
import { createAction } from '@/utils/action';

const deleteOrganizationSchema = z.object({ orgSlug: z.string().min(1), confirm: z.string() });

const handleDeleteOrganization = createAction(deleteOrganizationSchema, async (input) => {
  await requireFreshSession(); // a stolen, old session can't wipe a company
  const { org } = await requirePermission(input.orgSlug, { organization: ['delete'] }); // owners only

  // The typed confirmation is verified on the SERVER, not just in the dialog
  if (input.confirm.trim() !== org.name) {
    throw new ValidationError({ fieldErrors: { confirm: ['validation.confirmPhrase'] } });
  }

  try {
    // 🔍 method name: deleteOrganization. Members, invitations and projects cascade via foreign keys.
    await auth.api.deleteOrganization({
      body: { organizationId: org.id },
      headers: await headers(),
    });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  return { deleted: true as const };
});

export async function deleteOrganization(input: unknown) {
  return handleDeleteOrganization(input);
}
```

📄 **Create `src/components/org/delete-organization-form.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { deleteOrganization } from '@/actions/organization';
import { ReauthNotice } from '@/components/account/reauth-notice';
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

export function DeleteOrganizationForm({ orgSlug, orgName }: { orgSlug: string; orgName: string }) {
  const t = useTranslations('org.settings.danger');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await deleteOrganization({ orgSlug, confirm });
    setBusy(false);

    if (result.ok) {
      toast.success(t('deleted'));
      router.replace('/dashboard');
      router.refresh();
    } else if (result.error.code === 'REAUTH_REQUIRED') {
      setNeedsReauth(true);
    } else {
      setError(result.error.messageKey);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{t('button')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
          <DialogDescription>{t('confirmDescription', { name: orgName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {needsReauth ? <ReauthNotice /> : null}
          <FormError messageKey={error} />
          <div className="space-y-2">
            <Label htmlFor="confirm-org-name">{t('confirmLabel')}</Label>
            <Input
              id="confirm-org-name"
              autoComplete="off"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || confirm.trim() !== orgName}
            >
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### 3. The page

📄 **Create `…/settings/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageHeader } from '@/components/layout/page-header';
import { DeleteOrganizationForm } from '@/components/org/delete-organization-form';
import { OrgSettingsForm } from '@/components/org/org-settings-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePagePermission } from '@/data/authz';
import { hasPermission } from '@/libs/permissions';

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  // Members are redirected away; admins and owners get in
  const { org, member } = await requirePagePermission(orgSlug, { organization: ['update'] });
  const t = await getTranslations('org.settings');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('title')} />

      <Card>
        <CardHeader>
          <CardTitle>{t('general')}</CardTitle>
        </CardHeader>
        <CardContent>
          <OrgSettingsForm org={org} />
        </CardContent>
      </Card>

      {hasPermission(member.role, { organization: ['delete'] }) ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">{t('danger.title')}</CardTitle>
            <CardDescription>{t('danger.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteOrganizationForm orgSlug={org.slug} orgName={org.name} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
```

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

As `demo@example.com` (owner):

1. **Settings** → rename the organization → toast; the switcher shows the new name.
2. Change the URL name to an existing slug → "already taken"; to a valid new one → you are redirected to `/dashboard/<new>/settings`; the **old** URL is a 404.
3. As `teammate@example.com` (member) open `/dashboard/demo/settings` → bounced to the overview.
4. Create a throw-away organization, open **Delete organization** → the button stays disabled until the exact name is typed. Right after sign-in it succeeds; after 11 minutes (or set `SESSION_FRESH_SECONDS` to `5` temporarily) the dialog shows **"Please sign in again"**. Studio: the organization, its members and projects are gone (cascade).
5. An **admin** (not owner) never sees the danger card; calling `deleteOrganization` from DevTools returns `FORBIDDEN`.

**🚢 Ship** — branch `feat/s4-t11-org-settings` · message: `feat(org): add organization settings with guarded deletion`

---

## 🎫 S4-T12 — Members management

**Branch:** `feat/s4-t12-members` · **Story:** US-044 · **3 SP** · 🔒 security-critical

> 🎯 The rules that **aren't in the permission matrix** live here: _last owner_, _admins manage only members_, _owner is never handed out by role change_. All enforced in Server Actions; the UI only mirrors them.

```bash
git switch main && git pull && git switch -c feat/s4-t12-members
```

### 1. Errors may carry their own message key

📄 **Edit `src/libs/errors.ts`:** `type Init = { message?: string; cause?: unknown; messageKey?: string };` — every subclass already spreads `...init` after its default `messageKey`, so `new ConflictError({ messageKey: 'org.errors.lastOwner' })` now works. Add a test row to `errors.test.ts`:

```ts
it('lets a call site pick a more specific message key', () => {
  expect(new ConflictError({ messageKey: 'org.errors.lastOwner' }).messageKey).toBe(
    'org.errors.lastOwner',
  );
});
```

### 2. Queries

📄 **Add to `src/data/org-queries.ts`:**

```ts
export async function listMembers(database: DbLike, organizationId: string) {
  return database
    .select({
      memberId: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
    .orderBy(member.createdAt);
}
```

📄 **Add to `src/data/organizations.ts`:**

```ts
import { listMembers } from './org-queries';

export async function getMembers(organizationId: string) {
  return listMembers(db, organizationId);
}
```

### 3. Server Actions

📄 **Append to `src/actions/organization.ts`:**

```ts
import { getOrgMembershipOrThrow, withOrgPermission } from '@/data/authz';
import { getMembers } from '@/data/organizations';
import { AuthorizationError, ConflictError, NotFoundError } from '@/libs/errors';
import { assignableRoles, canManageTarget, hasRole, wouldLeaveNoOwner } from '@/libs/org-members';

async function loadMembers(organizationId: string, memberId: string) {
  const members = await getMembers(organizationId);
  const target = members.find((item) => item.memberId === memberId);
  if (!target) throw new NotFoundError(); // not in THIS organization → doesn't exist
  return { members: members.map((item) => ({ id: item.memberId, role: item.role })), target };
}

const roleSchema = z.object({
  orgSlug: z.string().min(1),
  memberId: z.string().min(1),
  role: z.enum(['admin', 'member']),
});
type RoleInput = z.output<typeof roleSchema>;

const handleUpdateRole = createAction(
  roleSchema,
  withOrgPermission({ member: ['update'] }, async (input: RoleInput, { org, member: actor }) => {
    const { members, target } = await loadMembers(org.id, input.memberId);

    if (
      !canManageTarget(actor.role, target.role) ||
      !assignableRoles(actor.role).includes(input.role)
    ) {
      throw new AuthorizationError({ messageKey: 'org.errors.notAllowed' });
    }
    if (wouldLeaveNoOwner(members, target.memberId, input.role)) {
      throw new ConflictError({ messageKey: 'org.errors.lastOwner' });
    }

    try {
      await auth.api.updateMemberRole({
        body: { memberId: target.memberId, role: input.role, organizationId: org.id },
        headers: await headers(),
      });
    } catch (error) {
      throw mapAuthApiError(error);
    }
    return { updated: true as const };
  }),
);

const removeSchema = z.object({ orgSlug: z.string().min(1), memberId: z.string().min(1) });
type RemoveInput = z.output<typeof removeSchema>;

const handleRemoveMember = createAction(
  removeSchema,
  withOrgPermission({ member: ['delete'] }, async (input: RemoveInput, { org, member: actor }) => {
    const { members, target } = await loadMembers(org.id, input.memberId);

    // Removing yourself is "leave" — a separate, simpler action
    if (target.memberId === actor.id || !canManageTarget(actor.role, target.role)) {
      throw new AuthorizationError({ messageKey: 'org.errors.notAllowed' });
    }
    if (wouldLeaveNoOwner(members, target.memberId))
      throw new ConflictError({ messageKey: 'org.errors.lastOwner' });

    try {
      await auth.api.removeMember({
        body: { memberIdOrEmail: target.memberId, organizationId: org.id },
        headers: await headers(),
      });
    } catch (error) {
      throw mapAuthApiError(error);
    }
    return { removed: true as const };
  }),
);

const leaveSchema = z.object({ orgSlug: z.string().min(1) });

const handleLeave = createAction(leaveSchema, async (input) => {
  const { org, member: me } = await getOrgMembershipOrThrow(input.orgSlug); // any member may leave
  const members = (await getMembers(org.id)).map((item) => ({
    id: item.memberId,
    role: item.role,
  }));

  if (wouldLeaveNoOwner(members, me.id))
    throw new ConflictError({ messageKey: 'org.errors.lastOwner' });

  try {
    await auth.api.leaveOrganization({
      body: { organizationId: org.id },
      headers: await headers(),
    });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  return { left: true as const };
});

const transferSchema = z.object({ orgSlug: z.string().min(1), memberId: z.string().min(1) });

const handleTransfer = createAction(transferSchema, async (input) => {
  await requireFreshSession();
  const { org, member: me } = await getOrgMembershipOrThrow(input.orgSlug);
  if (!hasRole(me.role, 'owner'))
    throw new AuthorizationError({ messageKey: 'org.errors.notAllowed' });

  const { target } = await loadMembers(org.id, input.memberId);
  if (target.memberId === me.id)
    throw new AuthorizationError({ messageKey: 'org.errors.notAllowed' });

  const requestHeaders = await headers();
  try {
    // Promote FIRST, demote second: the organization is never without an owner
    await auth.api.updateMemberRole({
      body: { memberId: target.memberId, role: 'owner', organizationId: org.id },
      headers: requestHeaders,
    });
    await auth.api.updateMemberRole({
      body: { memberId: me.id, role: 'admin', organizationId: org.id },
      headers: requestHeaders,
    });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  return { transferred: true as const };
});

export async function updateMemberRole(input: unknown) {
  return handleUpdateRole(input);
}
export async function removeMember(input: unknown) {
  return handleRemoveMember(input);
}
export async function leaveOrganization(input: unknown) {
  return handleLeave(input);
}
export async function transferOwnership(input: unknown) {
  return handleTransfer(input);
}
```

(`handleDeleteOrganization` from S4-T11 stays in the same file; merge the imports.)

### 4. The UI

📄 **Create `src/components/org/members-table.tsx`:**

```tsx
'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { leaveOrganization, removeMember, updateMemberRole } from '@/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRouter } from '@/i18n/navigation';
import { assignableRoles, canManageTarget } from '@/libs/org-members';
import { hasPermission } from '@/libs/permissions';

type Row = { memberId: string; name: string; email: string; role: string; joinedAt: string };
type Props = { orgSlug: string; members: Row[]; currentMemberId: string; actorRole: string };

export function MembersTable({ orgSlug, members, currentMemberId, actorRole }: Props) {
  const t = useTranslations('org.members');
  const tRoles = useTranslations('org.roles');
  const tAll = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const canChangeRoles = hasPermission(actorRole, { member: ['update'] });
  const canRemove = hasPermission(actorRole, { member: ['delete'] });
  const options = assignableRoles(actorRole);

  function run(
    task: () => Promise<{ ok: boolean; error?: { messageKey: string } }>,
    success: string,
    afterOk?: () => void,
  ) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        const key = result.error?.messageKey ?? 'errors.internal';
        return toast.error(tAll.has(key as never) ? tAll(key as never) : tAll('errors.internal'));
      }
      toast.success(success);
      afterOk?.();
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-start">
          <tr>
            <th className="p-3 text-start font-medium">{t('name')}</th>
            <th className="p-3 text-start font-medium">{t('role')}</th>
            <th className="p-3 text-start font-medium">{t('joined')}</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {members.map((row) => {
            const isMe = row.memberId === currentMemberId;
            const manageable = !isMe && canManageTarget(actorRole, row.role);
            const role = row.role as 'owner' | 'admin' | 'member';

            return (
              <tr key={row.memberId}>
                <td className="p-3">
                  <p className="font-medium">
                    {row.name || row.email}{' '}
                    {isMe ? <Badge variant="secondary">{t('you')}</Badge> : null}
                  </p>
                  <p className="text-muted-foreground text-xs">{row.email}</p>
                </td>
                <td className="p-3">
                  {canChangeRoles && manageable && role !== 'owner' ? (
                    <Select
                      value={role}
                      disabled={pending}
                      onValueChange={(value) =>
                        run(
                          () => updateMemberRole({ orgSlug, memberId: row.memberId, role: value }),
                          t('roleUpdated'),
                        )
                      }
                    >
                      <SelectTrigger
                        className="w-32"
                        aria-label={`${t('role')}: ${row.name || row.email}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {tRoles(option)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{tRoles(role)}</Badge>
                  )}
                </td>
                <td className="text-muted-foreground p-3">
                  {format.dateTime(new Date(row.joinedAt), { dateStyle: 'medium' })}
                </td>
                <td className="p-3 text-end">
                  {isMe ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => leaveOrganization({ orgSlug }),
                          t('left'),
                          () => router.replace('/dashboard'),
                        )
                      }
                    >
                      {t('leave')}
                    </Button>
                  ) : canRemove && manageable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        run(() => removeMember({ orgSlug, memberId: row.memberId }), t('removed'))
                      }
                    >
                      {t('remove')}
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

📄 **Create `src/components/org/transfer-ownership-dialog.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { transferOwnership } from '@/actions/organization';
import { ReauthNotice } from '@/components/account/reauth-notice';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRouter } from '@/i18n/navigation';

type Props = { orgSlug: string; candidates: { memberId: string; label: string }[] };

export function TransferOwnershipDialog({ orgSlug, candidates }: Props) {
  const t = useTranslations('org.members');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [busy, setBusy] = useState(false);

  if (candidates.length === 0) return null;

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await transferOwnership({ orgSlug, memberId: target });
    setBusy(false);

    if (result.ok) {
      toast.success(t('transferred'));
      setOpen(false);
      router.refresh();
    } else if (result.error.code === 'REAUTH_REQUIRED') {
      setNeedsReauth(true);
    } else {
      setError(result.error.messageKey);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('transfer')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('transferTitle')}</DialogTitle>
          <DialogDescription>{t('transferDescription')}</DialogDescription>
        </DialogHeader>
        {needsReauth ? <ReauthNotice /> : null}
        <FormError messageKey={error} />
        <div className="space-y-2">
          <Label>{t('transferSelect')}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger aria-label={t('transferSelect')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((candidate) => (
                <SelectItem key={candidate.memberId} value={candidate.memberId}>
                  {candidate.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button disabled={busy || !target} onClick={submit}>
            {t('transfer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

📄 **Rewrite the members page** (`…/members/page.tsx`):

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageHeader } from '@/components/layout/page-header';
import { InviteMemberForm } from '@/components/org/invite-member-form';
import { MembersTable } from '@/components/org/members-table';
import { PendingInvitations } from '@/components/org/pending-invitations';
import { TransferOwnershipDialog } from '@/components/org/transfer-ownership-dialog';
import { requireOrgMember } from '@/data/authz';
import { getMembers, getPendingInvitations } from '@/data/organizations';
import { assignableRoles } from '@/libs/org-members';
import { hasPermission } from '@/libs/permissions';

export default async function MembersPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);
  const { org, member } = await requireOrgMember(orgSlug); // every member may VIEW the list

  const members = await getMembers(org.id);
  const canInvite = hasPermission(member.role, { invitation: ['create'] });
  const canCancel = hasPermission(member.role, { invitation: ['cancel'] });
  const invitations = canInvite || canCancel ? await getPendingInvitations(org.id) : [];
  const t = await getTranslations('org');

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title={t('members.title')}
        description={t('members.description')}
        actions={
          hasPermission(member.role, { organization: ['delete'] }) ? ( // owners only
            <TransferOwnershipDialog
              orgSlug={orgSlug}
              candidates={members
                .filter((item) => item.memberId !== member.id)
                .map((item) => ({
                  memberId: item.memberId,
                  label: `${item.name || item.email} (${item.email})`,
                }))}
            />
          ) : null
        }
      />

      <MembersTable
        orgSlug={orgSlug}
        currentMemberId={member.id}
        actorRole={member.role}
        members={members.map((item) => ({ ...item, joinedAt: item.joinedAt.toISOString() }))}
      />

      {canInvite ? (
        <section className="space-y-4">
          <h2 className="text-lg font-medium">{t('invitations.title')}</h2>
          <InviteMemberForm organizationId={org.id} roles={assignableRoles(member.role)} />
        </section>
      ) : null}

      {canInvite || canCancel ? (
        <section className="space-y-3">
          <h3 className="font-medium">{t('invitations.pending')}</h3>
          <PendingInvitations
            organizationId={org.id}
            canManage={canCancel}
            invitations={invitations.map((item) => ({
              ...item,
              expiresAt: item.expiresAt.toISOString(),
            }))}
          />
        </section>
      ) : null}
    </div>
  );
}
```

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm dev
```

1. As owner: change `teammate`'s role to **Admin** → toast; role badge updates. Back to **Member** → works.
2. Try to demote **yourself** while you're the only owner → there's no select on your own row; **Leave organization** → "An organization must keep at least one owner."
3. **Transfer ownership** → pick the teammate → (fresh session) succeeds: you become _Admin_, they become _Owner_. Run it with a stale session → "Please sign in again".
4. As that **admin**: the select offers only **Member**, owners/admins show a badge (no controls), **Remove** only on plain members. Invite form offers **Member** only.
5. As a **member**: no controls at all, no invitation sections — but the member list is visible.
6. DevTools replay of `removeMember`/`updateMemberRole` as a member or against an owner → `FORBIDDEN` / "You are not allowed to manage this member."

**🚢 Ship** — branch `feat/s4-t12-members` · message: `feat(org): add member management with owner safeguards and ownership transfer`

---

## 🎫 S4-T13 — Platform admin: plugin, bootstrap and console

**Branch:** `feat/s4-t13-admin-console` · **Story:** US-045 · **3 SP** · 🔍 Read the Better Auth **admin** plugin docs

```bash
git switch main && git pull && git switch -c feat/s4-t13-admin-console
mkdir -p "src/app/[locale]/(admin)/admin/users/[userId]" src/components/admin
```

### 1. Schema, plugin, client

```bash
pnpm auth:schema        # compare, then delete the generated file
```

📄 **Edit `src/db/schema/auth.ts`:** in `user` add

```ts
  role: text('role').default('user'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: tz('ban_expires'),
```

and in `session` add `impersonatedBy: text('impersonated_by'),`

```bash
rm src/db/schema/auth.generated.ts 2>/dev/null; pnpm db:generate     # 0006_….sql
pnpm db:check
```

📄 **Edit `src/libs/Auth.ts`:**

```ts
import { admin } from 'better-auth/plugins';
// plugins (before nextCookies):
      admin({
        defaultRole: 'user',
        adminRoles: ['admin'],
        impersonationSessionDuration: 60 * 60, // 1 hour, then the session simply expires
      }),
```

📄 **Edit `src/libs/AuthClient.ts`:** `import { adminClient } …` and add `adminClient()` to `plugins`.

📄 **Add two strings** — `auth.errors` in both locale files:

```json
      "banned": "This account has been suspended. Contact support if you think this is a mistake."
```

```json
      "banned": "Ce compte a été suspendu. Contactez le support si vous pensez à une erreur."
```

📄 **Edit `src/libs/auth-error-keys.ts`** — `KEYS`: `BANNED_USER: 'auth.errors.banned',`

### 2. Bootstrap: the first admin — by script, not by hook

📄 **Create `scripts/grant-admin.ts`:**

```ts
import './_env';
import { Pool } from 'pg';

import { buildPoolConfig } from '../src/db/pool-config';

/**
 * Promotes the emails in ADMIN_EMAILS to platform admin. Only VERIFIED users, only existing ones.
 * Idempotent. Run it yourself (or in a deploy step) — never from a sign-up hook: anyone could
 * otherwise register an admin address before its real owner does and be promoted.
 */
async function main() {
  const emails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    console.log('ℹ️  ADMIN_EMAILS is empty — nothing to do.');
    return;
  }

  const pool = new Pool(
    buildPoolConfig(
      process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
      Number(process.env.DB_SERVER_PORT ?? 5433),
    ),
  );
  for (const email of emails) {
    const { rowCount } = await pool.query(
      `UPDATE "user" SET role = 'admin', updated_at = now() WHERE lower(email) = $1 AND email_verified = true`,
      [email],
    );
    console.log(
      rowCount
        ? `✅ ${email} is a platform admin`
        : `⚠️  ${email}: no VERIFIED user with this email (yet)`,
    );
  }
  await pool.end();
}

main().catch((error) => {
  console.error('❌', (error as Error).message);
  process.exit(1);
});
```

📄 **Edit `package.json`:** `"admin:grant": "tsx scripts/grant-admin.ts"` · `.env.example` already lists `ADMIN_EMAILS`.

📄 **Seed an admin for development** — edit `src/db/seed.ts`:

```ts
// ensureUser: accept an optional role
async function ensureUser(db: DbLike, hash: string, person: { email: string; name: string; role?: string }) {
  // …
  await db.insert(user).values({ id, name: person.name, email: person.email, emailVerified: true, role: person.role ?? 'user' });
}
// PEOPLE: add
  admin: { email: 'admin@example.com', name: 'Ada Admin', role: 'admin' },
// in seed():
  await ensureUser(db, hash, PEOPLE.admin);
```

Update `seed.test.ts` expectations: **4** users (members/orgs/projects unchanged).

### 3. The data layer for admins

📄 **Create `src/data/admin-queries.ts`:**

```ts
import { count, desc, eq, ilike, or } from 'drizzle-orm';

import { session, user } from '@/db/schema';
import type { DbLike } from '@/db/types';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function searchUsers(
  database: DbLike,
  { search, page = 1, pageSize = 20 }: { search?: string; page?: number; pageSize?: number } = {},
) {
  const pattern = search ? `%${escapeLike(search)}%` : undefined;
  const where = pattern ? or(ilike(user.email, pattern), ilike(user.name, pattern)) : undefined;

  const [items, totals] = await Promise.all([
    database
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    database.select({ total: count() }).from(user).where(where),
  ]);
  return { items, total: Number(totals[0]?.total ?? 0) };
}

export async function findUserById(database: DbLike, id: string) {
  const [row] = await database
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      banned: user.banned,
      banReason: user.banReason,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, id));
  return row;
}

/** Sessions WITHOUT their secret tokens. */
export async function listSessionsForUser(database: DbLike, userId: string) {
  return database
    .select({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      impersonatedBy: session.impersonatedBy,
    })
    .from(session)
    .where(eq(session.userId, userId))
    .orderBy(desc(session.updatedAt));
}
```

📄 **Create `src/data/admin-queries.test.ts`:**

```ts
import { afterAll, beforeAll, expect, it } from 'vitest';

import { user } from '@/db/schema';

import { userFactory } from '../../tests/factories/user.factory';
import { createTestDb, type TestDb } from '../../tests/utils/test-db';
import { findUserById, searchUsers } from './admin-queries';

let db: TestDb;
let destroy: () => Promise<void>;

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
  await db
    .insert(user)
    .values([
      userFactory.build({ name: 'Alice Wonder', email: 'alice@example.com' }),
      userFactory.build({ name: 'Bob 100%', email: 'bob@example.com' }),
    ]);
}, 30_000);
afterAll(() => destroy());

it('searches by email or name and escapes LIKE wildcards', async () => {
  expect((await searchUsers(db, { search: 'alice' })).items.map((u) => u.email)).toEqual([
    'alice@example.com',
  ]);
  expect((await searchUsers(db, { search: 'wonder' })).total).toBe(1);
  expect((await searchUsers(db, { search: '%' })).total).toBe(0); // a literal "%" is not a wildcard…
  expect((await searchUsers(db, { search: '100%' })).total).toBe(1); // …but matches a real one
});

it('finds a user by id and returns undefined otherwise', async () => {
  const [{ id }] = (await searchUsers(db, { search: 'bob' })).items;
  expect((await findUserById(db, id!))?.email).toBe('bob@example.com');
  expect(await findUserById(db, 'nope')).toBeUndefined();
});
```

📄 **Create `src/data/admin.ts`:**

```ts
import 'server-only';
import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { redirect } from '@/i18n/navigation';
import { Env } from '@/libs/Env';
import { AuthorizationError } from '@/libs/errors';

import { getSessionOrThrow, requireSession, type Session } from './session';

export const isPlatformAdmin = (user: { role?: string | null }) => user.role === 'admin';

/** For admin PAGES: non-admins get a 404 — the console's existence isn't advertised. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!isPlatformAdmin(session.user)) notFound();

  // Optional policy: administrators must use two-factor authentication
  if (Env.ADMIN_REQUIRE_MFA && !session.user.twoFactorEnabled) {
    return redirect({ href: '/dashboard/account/security', locale: await getLocale() });
  }
  return session;
}

/** For admin ACTIONS: throws typed errors instead of redirecting. */
export async function getAdminOrThrow(): Promise<Session> {
  const session = await getSessionOrThrow();
  if (!isPlatformAdmin(session.user)) throw new AuthorizationError();
  if (Env.ADMIN_REQUIRE_MFA && !session.user.twoFactorEnabled) {
    throw new AuthorizationError({ messageKey: 'admin.user.mfaRequired' });
  }
  return session;
}
```

📄 **Banned users get no session, ever** — edit `src/data/session.ts`: in both `requireSession` and `getSessionOrThrow` change the condition to also reject banned accounts:

```ts
  if (!session?.user.emailVerified || session.user.banned) { … }
```

and extend `session.test.ts` with a case: a `banned: true` user is redirected / throws `AuthenticationError`.

Extend the **guard-coverage test** to the admin pages — in `src/data/guard-coverage.test.ts` add:

```ts
it('every page under (admin) calls requireAdmin() itself', () => {
  const root = path.join('src', 'app', '[locale]', '(admin)');
  const pages = (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => file.endsWith('page.tsx'))
    .map((file) => path.join(root, file));

  const unguarded = pages.filter((file) => !/requireAdmin\(/.test(readFileSync(file, 'utf8')));
  expect(unguarded, `Admin pages without requireAdmin():\n${unguarded.join('\n')}`).toEqual([]);
});
```

### 4. Server Actions (ban, unban, revoke, role)

📄 **Create `src/actions/admin.ts`** (S4-T14 extends it with audit + impersonation):

```ts
'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { getAdminOrThrow, isPlatformAdmin } from '@/data/admin';
import { findAdminTarget } from '@/data/admin-targets';
import { auth } from '@/libs/Auth';
import { mapAuthApiError } from '@/libs/auth-api-errors';
import { AuthorizationError } from '@/libs/errors';
import { createAction } from '@/utils/action';

/** Targets must exist, must not be yourself and must not be another administrator. */
async function loadTarget(adminId: string, userId: string) {
  const target = await findAdminTarget(userId); // NotFoundError when missing
  if (target.id === adminId || isPlatformAdmin(target)) throw new AuthorizationError();
  return target;
}

const banSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});
const userIdSchema = z.object({ userId: z.string().min(1) });
const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(['user', 'admin']) });

const handleBan = createAction(banSchema, async ({ userId, reason }) => {
  const admin = await getAdminOrThrow();
  await loadTarget(admin.user.id, userId);
  try {
    // Better Auth also revokes every session of the banned user
    await auth.api.banUser({
      body: { userId, banReason: reason || undefined },
      headers: await headers(),
    });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  return { banned: true as const };
});

const handleUnban = createAction(userIdSchema, async ({ userId }) => {
  const admin = await getAdminOrThrow();
  await loadTarget(admin.user.id, userId);
  try {
    await auth.api.unbanUser({ body: { userId }, headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  return { unbanned: true as const };
});

const handleRevoke = createAction(userIdSchema, async ({ userId }) => {
  const admin = await getAdminOrThrow();
  await loadTarget(admin.user.id, userId);
  try {
    await auth.api.revokeUserSessions({ body: { userId }, headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  return { revoked: true as const };
});

const handleSetRole = createAction(roleSchema, async ({ userId, role }) => {
  const admin = await getAdminOrThrow();
  if (userId === admin.user.id) throw new AuthorizationError(); // never change your own role (lock-out)
  try {
    await auth.api.setRole({ body: { userId, role }, headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  return { role };
});

export async function banUser(input: unknown) {
  return handleBan(input);
}
export async function unbanUser(input: unknown) {
  return handleUnban(input);
}
export async function revokeUserSessions(input: unknown) {
  return handleRevoke(input);
}
export async function setUserRole(input: unknown) {
  return handleSetRole(input);
}
```

> Note `loadTarget` blocks acting on **other admins** (ban/revoke) — promoting/demoting is the explicit `setUserRole`. Un-banning an admin is blocked too; fix that in Studio if a rare case happens.

📄 **Create `src/data/admin-targets.ts`** (actions can't touch the DB directly):

```ts
import 'server-only';
import { db } from '@/db/client';
import { NotFoundError } from '@/libs/errors';

import { findUserById } from './admin-queries';

export async function findAdminTarget(userId: string) {
  const row = await findUserById(db, userId);
  if (!row) throw new NotFoundError();
  return row;
}
```

📄 **Create thin wrappers for pages** — `src/data/admin-pages.ts`:

```ts
import 'server-only';
import { db } from '@/db/client';

import { findUserById, listSessionsForUser, searchUsers } from './admin-queries';

export const adminSearchUsers = (options: Parameters<typeof searchUsers>[1]) =>
  searchUsers(db, options);
export const adminFindUser = (id: string) => findUserById(db, id);
export const adminListSessions = (userId: string) => listSessionsForUser(db, userId);
```

### 5. The console

📄 **Rewrite `src/app/[locale]/(admin)/layout.tsx`:**

```tsx
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Link } from '@/i18n/navigation';

// Not a guard: every admin page calls requireAdmin() itself.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('admin');
  return (
    <div className="min-h-screen">
      <header className="bg-muted flex h-14 items-center justify-between border-b px-4">
        <Link href="/admin/users" className="font-semibold">
          {t('consoleTitle')}
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto max-w-5xl p-6">
        {children}
      </main>
    </div>
  );
}
```

📄 **Rewrite `…/(admin)/admin/page.tsx`:**

```tsx
import { getLocale } from 'next-intl/server';

import { requireAdmin } from '@/data/admin';
import { redirect } from '@/i18n/navigation';

export default async function AdminHome() {
  await requireAdmin();
  return redirect({ href: '/admin/users', locale: await getLocale() });
}
```

📄 **Create `…/admin/users/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requireAdmin } from '@/data/admin';
import { adminSearchUsers } from '@/data/admin-pages';
import { Link } from '@/i18n/navigation';

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();

  const { q, page: rawPage } = await searchParams;
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);
  const { items, total } = await adminSearchUsers({ search: q, page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const t = await getTranslations('admin.users');

  const href = (target: number) =>
    `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(target) })}`;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <form className="flex gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
        <Button type="submit" variant="outline">
          {t('searchPlaceholder')}
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noResults')}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-start font-medium">{t('name')}</th>
                <th className="p-3 text-start font-medium">{t('role')}</th>
                <th className="p-3 text-start font-medium">{t('status')}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((row) => (
                <tr key={row.id}>
                  <td className="p-3">
                    <p className="font-medium">{row.name || row.email}</p>
                    <p className="text-muted-foreground text-xs">{row.email}</p>
                  </td>
                  <td className="p-3">{row.role}</td>
                  <td className="p-3">
                    <Badge variant={row.banned ? 'destructive' : 'secondary'}>
                      {row.banned ? t('banned') : t('active')}
                    </Badge>
                  </td>
                  <td className="p-3 text-end">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/users/${row.id}`}>{t('view')}</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav className="flex items-center justify-between text-sm">
        <span>{t('page', { page, pages })}</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={href(page - 1)}>{t('previous')}</Link>
            </Button>
          ) : null}
          {page < pages ? (
            <Button asChild size="sm" variant="outline">
              <Link href={href(page + 1)}>{t('next')}</Link>
            </Button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
```

📄 **Create `src/components/admin/user-actions.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { banUser, revokeUserSessions, setUserRole, unbanUser } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRouter } from '@/i18n/navigation';

type Props = { userId: string; banned: boolean; role: string; isSelf: boolean; isAdmin: boolean };

export function UserActions({ userId, banned, role, isSelf, isAdmin }: Props) {
  const t = useTranslations('admin.user');
  const tAll = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [nextRole, setNextRole] = useState(role);

  function run(
    task: () => Promise<{ ok: boolean; error?: { messageKey: string } }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        const key = result.error?.messageKey ?? 'errors.internal';
        return toast.error(tAll.has(key as never) ? tAll(key as never) : tAll('errors.internal'));
      }
      toast.success(success);
      router.refresh();
    });
  }

  const protectedTarget = isSelf || isAdmin; // ban/revoke aren't offered for yourself or other admins

  return (
    <div className="space-y-6">
      {protectedTarget ? (
        <p className="text-muted-foreground text-sm">{t('cannotImpersonate')}</p>
      ) : null}

      {!protectedTarget ? (
        <div className="space-y-3">
          {banned ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => unbanUser({ userId }), t('unbanned'))}
            >
              {t('unban')}
            </Button>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="ban-reason">{t('banReason')}</Label>
              <Input
                id="ban-reason"
                value={reason}
                maxLength={200}
                onChange={(event) => setReason(event.target.value)}
              />
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => run(() => banUser({ userId, reason }), t('banned'))}
              >
                {t('ban')}
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => revokeUserSessions({ userId }), t('revoked'))}
          >
            {t('revoke')}
          </Button>
        </div>
      ) : null}

      {!isSelf ? (
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label>{t('platformRole')}</Label>
            <Select value={nextRole} onValueChange={setNextRole}>
              <SelectTrigger className="w-40" aria-label={t('platformRole')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="admin">admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={pending || nextRole === role}
            onClick={() => run(() => setUserRole({ userId, role: nextRole }), t('roleSaved'))}
          >
            {t('saveRole')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

📄 **Create `…/admin/users/[userId]/page.tsx`:**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { UserActions } from '@/components/admin/user-actions';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isPlatformAdmin, requireAdmin } from '@/data/admin';
import { adminFindUser, adminListSessions } from '@/data/admin-pages';
import { Link } from '@/i18n/navigation';
import { describeUserAgent } from '@/utils/user-agent';

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>;
}) {
  const { locale, userId } = await params;
  setRequestLocale(locale);
  const admin = await requireAdmin();

  const target = await adminFindUser(userId);
  if (!target) notFound();
  const sessions = await adminListSessions(userId);
  const t = await getTranslations('admin');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/users">← {t('user.back')}</Link>
      </Button>

      <PageHeader title={target.name || target.email} description={target.email} />

      <div className="flex gap-2">
        <Badge variant="secondary">{target.role}</Badge>
        {target.banned ? <Badge variant="destructive">{t('users.banned')}</Badge> : null}
        {target.twoFactorEnabled ? <Badge variant="outline">2FA</Badge> : null}
      </div>

      <UserActions
        userId={target.id}
        banned={Boolean(target.banned)}
        role={target.role ?? 'user'}
        isSelf={target.id === admin.user.id}
        isAdmin={isPlatformAdmin(target)}
      />

      <section className="space-y-2">
        <h2 className="font-medium">Sessions ({sessions.length})</h2>
        <ul className="divide-y rounded-md border text-sm">
          {sessions.map((item) => (
            <li key={item.id} className="p-3">
              {describeUserAgent(item.userAgent)} · {item.ipAddress ?? '—'}
              {item.impersonatedBy ? ' · impersonated' : ''}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

Add an **Admin** entry for admins in the user menu: in `UserMenu` take an `isAdmin` prop and render `<DropdownMenuItem asChild><Link href="/admin/users">Admin</Link></DropdownMenuItem>` when true; pass `isAdmin={user.role === 'admin'}` from `(app)/layout.tsx`.

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm db:reset && pnpm dev
```

1. Sign in as `admin@example.com` / `Demo-Password-123` → `/admin/users` lists users; search "alice"/an email works; **View** opens a user.
2. Sign in as `demo@example.com` and open `/admin/users` → a **404** (not 403). Anonymous → redirected to sign-in.
3. As admin: **Ban** `teammate` with a reason → the teammate's open browser loses its session at the next request, and signing in shows "This account has been suspended". **Unban** → works again.
4. **Set role** admin on a user, check the console is now visible to them; you can't change **your own** role (no controls).
5. Bootstrap: sign up a real user, verify the email, then `ADMIN_EMAILS=their@email pnpm admin:grant` (🪟 cmd.exe: `set ADMIN_EMAILS=their@email&& pnpm admin:grant`) → "✅ … is a platform admin". Running it for an **unverified** or unknown address only warns.
6. `ADMIN_REQUIRE_MFA=true` (restart): an admin without 2FA is sent to the security page.

**🚢 Ship** — branch `feat/s4-t13-admin-console` · message: `feat(admin): add platform admin plugin, bootstrap script and user console`

---

## 🎫 S4-T14 — Impersonation, banner and the append-only audit log

**Branch:** `feat/s4-t14-impersonation-audit` · **Story:** US-045 · **2 SP** · 🔒 security-critical

```bash
git switch main && git pull && git switch -c feat/s4-t14-impersonation-audit
```

### 1. The audit table — no foreign keys, no updates, no deletes

📄 **Create `src/db/schema/audit.ts`:**

```ts
import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Append-only. Ids are plain text on purpose: the history must outlive the users and
 * organizations it talks about (a foreign key would force cascades or block deletions).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id'),
    actorUserId: text('actor_user_id').notNull(),
    impersonatorId: text('impersonator_id'), // set when an admin acted AS the actor
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_org_created_idx').on(table.organizationId, table.createdAt),
    index('audit_log_target_idx').on(table.targetType, table.targetId),
  ],
);
```

📄 **Edit `src/db/schema/index.ts`:** `export * from './audit';`

```bash
pnpm db:generate && pnpm db:check            # 0007_….sql creates the table
pnpm drizzle-kit generate --custom --name=audit_log_append_only    # 0008_audit_log_append_only.sql (empty)
```

📄 **Fill the custom migration** (`drizzle/0008_audit_log_append_only.sql`):

```sql
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

(keep the `--> statement-breakpoint` line: Drizzle splits statements on it)

```bash
pnpm db:check
```

### 2. Writing audit events

📄 **Create `src/data/audit.ts`:**

```ts
import 'server-only';
import { randomUUID } from 'node:crypto';

import { headers } from 'next/headers';

import { db } from '@/db/client';
import { auditLog } from '@/db/schema';
import type { DbLike } from '@/db/types';

import type { Session } from './session';

export type AuditAction =
  | 'impersonation.start'
  | 'impersonation.stop'
  | 'user.ban'
  | 'user.unban'
  | 'user.role_change'
  | 'user.sessions_revoke'
  | 'org.delete'
  | 'org.ownership_transfer';

export type AuditEvent = {
  action: AuditAction;
  actorUserId: string;
  impersonatorId?: string | null;
  organizationId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/** Pure insert — the ONLY write path to the table. There is intentionally no update/delete helper. */
export async function writeAuditEvent(database: DbLike, event: AuditEvent): Promise<void> {
  await database.insert(auditLog).values({
    id: randomUUID(),
    action: event.action,
    actorUserId: event.actorUserId,
    impersonatorId: event.impersonatorId ?? null,
    organizationId: event.organizationId ?? null,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    metadata: event.metadata ?? null,
    ip: event.ip ?? null,
  });
}

/** Who is acting? If an admin is impersonating, BOTH people are recorded. */
export function actorOf(session: Session) {
  return {
    actorUserId: session.user.id,
    impersonatorId: session.session.impersonatedBy ?? null,
  };
}

/** Request-aware wrapper used by Server Actions. */
export async function audit(
  session: Session,
  event: Omit<AuditEvent, 'actorUserId' | 'impersonatorId' | 'ip'>,
) {
  const forwarded = (await headers()).get('x-forwarded-for');
  await writeAuditEvent(db, {
    ...actorOf(session),
    ...event,
    ip: forwarded?.split(',')[0]?.trim() ?? null,
  });
}
```

📄 **Create `tests/integration/audit.test.ts`:**

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { writeAuditEvent } from '@/data/audit';
import { auditLog } from '@/db/schema';

import { createTestDb, type TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;
beforeAll(async () => {
  ({ db, destroy } = await createTestDb());
}, 30_000);
afterAll(() => destroy());

it('records events, including who impersonated whom', async () => {
  await writeAuditEvent(db, {
    action: 'impersonation.start',
    actorUserId: 'target-1',
    impersonatorId: 'admin-1',
    targetType: 'user',
    targetId: 'target-1',
    metadata: { reason: 'support ticket 42' },
  });

  const [row] = await db.select().from(auditLog).where(eq(auditLog.targetId, 'target-1'));
  expect(row).toMatchObject({
    action: 'impersonation.start',
    impersonatorId: 'admin-1',
    metadata: { reason: 'support ticket 42' },
  });
});

it('is append-only at the DATABASE level: updates and deletes are rejected', async () => {
  await writeAuditEvent(db, {
    action: 'user.ban',
    actorUserId: 'admin-1',
    targetType: 'user',
    targetId: 'victim',
  });

  await expect(
    db.update(auditLog).set({ action: 'user.unban' }).where(eq(auditLog.targetId, 'victim')),
  ).rejects.toThrow(/append-only/);
  await expect(db.delete(auditLog).where(eq(auditLog.targetId, 'victim'))).rejects.toThrow(
    /append-only/,
  );
  expect(await db.select().from(auditLog).where(eq(auditLog.targetId, 'victim'))).toHaveLength(1);
});
```

### 3. Impersonation: actions with audit (replace `src/actions/admin.ts`)

📄 **Replace the whole file** (the ban/unban/revoke/role actions now write audit events; two new actions):

```ts
'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { getAdminOrThrow, isPlatformAdmin } from '@/data/admin';
import { findAdminTarget } from '@/data/admin-targets';
import { audit } from '@/data/audit';
import { getSessionOrThrow } from '@/data/session';
import { auth } from '@/libs/Auth';
import { mapAuthApiError } from '@/libs/auth-api-errors';
import { AuthorizationError } from '@/libs/errors';
import { createAction } from '@/utils/action';

async function loadTarget(adminId: string, userId: string) {
  const target = await findAdminTarget(userId);
  if (target.id === adminId || isPlatformAdmin(target)) throw new AuthorizationError();
  return target;
}

const banSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});
const userIdSchema = z.object({ userId: z.string().min(1) });
const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(['user', 'admin']) });

const handleBan = createAction(banSchema, async ({ userId, reason }) => {
  const admin = await getAdminOrThrow();
  await loadTarget(admin.user.id, userId);
  try {
    await auth.api.banUser({
      body: { userId, banReason: reason || undefined },
      headers: await headers(),
    });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  await audit(admin, {
    action: 'user.ban',
    targetType: 'user',
    targetId: userId,
    metadata: { reason: reason || null },
  });
  return { banned: true as const };
});

const handleUnban = createAction(userIdSchema, async ({ userId }) => {
  const admin = await getAdminOrThrow();
  await loadTarget(admin.user.id, userId);
  try {
    await auth.api.unbanUser({ body: { userId }, headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  await audit(admin, { action: 'user.unban', targetType: 'user', targetId: userId });
  return { unbanned: true as const };
});

const handleRevoke = createAction(userIdSchema, async ({ userId }) => {
  const admin = await getAdminOrThrow();
  await loadTarget(admin.user.id, userId);
  try {
    await auth.api.revokeUserSessions({ body: { userId }, headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  await audit(admin, { action: 'user.sessions_revoke', targetType: 'user', targetId: userId });
  return { revoked: true as const };
});

const handleSetRole = createAction(roleSchema, async ({ userId, role }) => {
  const admin = await getAdminOrThrow();
  if (userId === admin.user.id) throw new AuthorizationError();
  try {
    await auth.api.setRole({ body: { userId, role }, headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  await audit(admin, {
    action: 'user.role_change',
    targetType: 'user',
    targetId: userId,
    metadata: { role },
  });
  return { role };
});

/* ───────────── Impersonation ───────────── */

const handleStartImpersonation = createAction(userIdSchema, async ({ userId }) => {
  const admin = await getAdminOrThrow();
  if (admin.session.impersonatedBy) throw new AuthorizationError(); // no nesting
  await loadTarget(admin.user.id, userId); // not yourself, not another admin

  try {
    // Creates a NEW session for the target (marked impersonatedBy=<admin>) and sets its cookie
    await auth.api.impersonateUser({ body: { userId }, headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  await audit(admin, { action: 'impersonation.start', targetType: 'user', targetId: userId });
  return { started: true as const };
});

const handleStopImpersonation = createAction(z.object({}), async () => {
  const current = await getSessionOrThrow();
  const adminId = current.session.impersonatedBy;
  if (!adminId) throw new AuthorizationError(); // not impersonating

  try {
    await auth.api.stopImpersonating({ headers: await headers() });
  } catch (error) {
    throw mapAuthApiError(error);
  }
  // Recorded with the roles reversed: the impersonated user was the "actor" during the session
  await audit(current, {
    action: 'impersonation.stop',
    targetType: 'user',
    targetId: current.user.id,
  });
  return { adminId };
});

export async function banUser(input: unknown) {
  return handleBan(input);
}
export async function unbanUser(input: unknown) {
  return handleUnban(input);
}
export async function revokeUserSessions(input: unknown) {
  return handleRevoke(input);
}
export async function setUserRole(input: unknown) {
  return handleSetRole(input);
}
export async function startImpersonation(input: unknown) {
  return handleStartImpersonation(input);
}
export async function stopImpersonation() {
  return handleStopImpersonation({});
}
```

Also audit the organization events — in `src/actions/organization.ts`:

```ts
import { audit } from '@/data/audit';
// in handleDeleteOrganization, after the successful API call (we need the session from requireFreshSession):
//   const session = await requireFreshSession();  …  await audit(session, { action: 'org.delete', organizationId: org.id, targetType: 'organization', targetId: org.id, metadata: { name: org.name } });
// in handleTransfer, after both role updates (use the session returned by requireFreshSession()):
//   await audit(session, { action: 'org.ownership_transfer', organizationId: org.id, targetType: 'member', targetId: target.memberId });
```

(Change `await requireFreshSession();` to `const session = await requireFreshSession();` in both handlers.)

### 4. The banner and the buttons

📄 **Create `src/components/admin/stop-impersonation-button.tsx`:**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { stopImpersonation } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';

export function StopImpersonationButton() {
  const t = useTranslations('admin.banner');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      className="bg-white text-black hover:bg-white/80"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await stopImpersonation();
          router.replace('/admin/users');
          router.refresh();
        })
      }
    >
      {t('stop')}
    </Button>
  );
}
```

📄 **Create `src/components/admin/impersonation-banner.tsx`** (server component):

```tsx
import { getTranslations } from 'next-intl/server';

import { StopImpersonationButton } from '@/components/admin/stop-impersonation-button';
import { getSession } from '@/data/session';

/** Impossible to miss: sticky, high-contrast, on every authenticated page while impersonating. */
export async function ImpersonationBanner() {
  const session = await getSession();
  if (!session?.session.impersonatedBy) return null;

  const t = await getTranslations('admin.banner');
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-4 bg-amber-400 px-4 py-2 text-sm font-medium text-black"
    >
      <span>
        {t('text', { name: session.user.name || session.user.email, email: session.user.email })}
      </span>
      <StopImpersonationButton />
    </div>
  );
}
```

Render it as the **first child** in `(app)/layout.tsx` (above the flex container) — wrap the layout's returned tree in a fragment: `<><ImpersonationBanner /> …existing… </>`.

📄 **Create `src/components/admin/impersonate-button.tsx`** and use it in `UserActions` (shown only when the target is neither you nor an admin):

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { startImpersonation } from '@/actions/admin';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';

export function ImpersonateButton({ userId }: { userId: string }) {
  const t = useTranslations('admin.user');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await startImpersonation({ userId });
          if (!result.ok) return toast.error(t('cannotImpersonate'));
          router.push('/dashboard');
          router.refresh();
        })
      }
    >
      {t('impersonate')}
    </Button>
  );
}
```

In `UserActions`, inside the `!protectedTarget` block add `<ImpersonateButton userId={userId} />`.

### 5. Sensitive actions are blocked while impersonating

An admin acting _as_ a user must never be able to change that user's password, email, MFA, passkeys or delete the account.

📄 **Create `src/libs/impersonation-guard.ts`:**

```ts
/** Better Auth endpoints that must be refused for impersonation sessions. */
const BLOCKED = [
  '/change-password',
  '/change-email',
  '/delete-user',
  '/two-factor/enable',
  '/two-factor/disable',
  '/two-factor/generate-backup-codes',
  '/passkey/add-passkey',
  '/passkey/delete-passkey',
  '/link-social',
  '/unlink-account',
] as const;

export const isBlockedWhileImpersonating = (path: string) =>
  BLOCKED.some((blocked) => path === blocked || path.startsWith(`${blocked}/`));
```

📄 **Create `src/libs/impersonation-guard.test.ts`:**

```ts
import { expect, it } from 'vitest';

import { isBlockedWhileImpersonating } from './impersonation-guard';

it('blocks credential, MFA, passkey and account-removal endpoints', () => {
  for (const path of [
    '/change-password',
    '/delete-user',
    '/two-factor/disable',
    '/passkey/delete-passkey',
  ]) {
    expect(isBlockedWhileImpersonating(path)).toBe(true);
  }
});

it('leaves everyday endpoints alone', () => {
  for (const path of [
    '/get-session',
    '/sign-out',
    '/organization/list',
    '/change-password-not',
    '/update-user',
  ]) {
    expect(isBlockedWhileImpersonating(path)).toBe(path === '/change-password-not' ? false : false);
  }
});
```

📄 **Edit `src/libs/Auth.ts`** — a `before` hook (🔍 API: `createAuthMiddleware`, `getSessionFromCtx` from `better-auth/api`):

```ts
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { isBlockedWhileImpersonating } from '@/libs/impersonation-guard';

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!isBlockedWhileImpersonating(ctx.path)) return;
        const current = await getSessionFromCtx(ctx);
        if (current?.session.impersonatedBy) {
          throw new APIError('FORBIDDEN', {
            code: 'BLOCKED_WHILE_IMPERSONATING',
            message: 'This action is not available while impersonating a user.',
          });
        }
      }),
    },
```

Error key + string: `auth-error-keys.ts` → `BLOCKED_WHILE_IMPERSONATING: 'admin.user.blockedWhileImpersonating'`; add to `admin.user` in both locales: `"blockedWhileImpersonating": "Not available while impersonating."` / `"Indisponible pendant une usurpation."`.

Our own Server Action that changes a password must refuse too — in `src/actions/account.ts` (`changePassword`), at the top of the handler: `if (session.session.impersonatedBy) throw new AuthorizationError({ messageKey: 'admin.user.blockedWhileImpersonating' });`.

📄 **Integration test** — append to `tests/integration/audit.test.ts`? No — create `tests/integration/impersonation.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { user } from '@/db/schema';
import { createAuth } from '@/libs/Auth';
import { setEmailTransport } from '@/libs/email';
import { MemoryTransport } from '@/libs/email/memory-transport';

import { cookieHeaderFrom, signIn, signUpAndVerify, TEST_PASSWORD } from '../utils/auth';
import { createTestDb, type TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;
let auth: ReturnType<typeof createAuth>;
const transport = new MemoryTransport();
let counter = 0;
const nextEmail = () => `imp${Date.now()}-${++counter}@example.com`;
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

it('impersonation sessions are marked, and refuse credential changes', async () => {
  const adminEmail = nextEmail();
  const targetEmail = nextEmail();
  await signUpAndVerify(auth, transport, adminEmail);
  await signUpAndVerify(auth, transport, targetEmail);
  await db.update(user).set({ role: 'admin' }).where(eq(user.email, adminEmail));

  const [target] = await db.select().from(user).where(eq(user.email, targetEmail));
  const adminDevice = await signIn(auth, adminEmail);

  // 🔍 method name: impersonateUser
  const started = await auth.api.impersonateUser({
    body: { userId: target!.id },
    headers: adminDevice.headers,
    asResponse: true,
  });
  const impersonated = cookieHeaderFrom(started);

  const current = await auth.api.getSession({ headers: impersonated, ...fresh });
  expect(current?.user.id).toBe(target!.id);
  expect(current?.session.impersonatedBy).toBeTruthy();

  await expect(
    auth.api.changePassword({
      body: { currentPassword: TEST_PASSWORD, newPassword: 'Another-Passw0rd-123!' },
      headers: impersonated,
    }),
  ).rejects.toMatchObject({ body: { code: 'BLOCKED_WHILE_IMPERSONATING' } });
});

it('a regular user cannot impersonate anyone', async () => {
  const a = nextEmail();
  const b = nextEmail();
  await signUpAndVerify(auth, transport, a);
  await signUpAndVerify(auth, transport, b);
  const [other] = await db.select().from(user).where(eq(user.email, b));
  const device = await signIn(auth, a);

  await expect(
    auth.api.impersonateUser({ body: { userId: other!.id }, headers: device.headers }),
  ).rejects.toThrow();
});
```

(Remove the pointless ternary in `impersonation-guard.test.ts`'s second test — use `expect(isBlockedWhileImpersonating(path)).toBe(false)` for each path.)

### ✅ Verify

```bash
pnpm test && pnpm check
pnpm db:reset && pnpm dev
```

1. As `admin@example.com` → user page of `demo@example.com` → **Impersonate** → you land on the dashboard as Demo User with a **yellow banner** on every page.
2. While impersonating: Security → change password / delete account / enable 2FA → refused ("Not available while impersonating"). Normal browsing works.
3. **Stop impersonating** → back on the admin console as yourself.
4. Studio → `audit_log`: `impersonation.start` (actor = admin) and `impersonation.stop` (actor = impersonated user, `impersonator_id` = admin), plus the ban/unban/role events you triggered earlier.
5. In Studio try `UPDATE audit_log SET action='x'` or `DELETE FROM audit_log` → **error: audit_log is append-only**.
6. Try to impersonate another admin or yourself → refused. As a non-admin call `startImpersonation` from DevTools → `FORBIDDEN`.
7. The session expires on its own after 1 hour (`impersonationSessionDuration`).

**🚢 Ship** — branch `feat/s4-t14-impersonation-audit` · message: `feat(admin): add impersonation with banner, blocked actions and append-only audit log`

---

## 🎫 S4-T15 — Tenant isolation integration tests

**Branch:** `test/s4-t15-isolation` · **Story:** US-046 · **3 SP** · 🔒 risk **R-04** (tenant data leak)

> 🎯 The most important tests of the product. They must **fail** the day someone removes a scope.

```bash
git switch main && git pull && git switch -c test/s4-t15-isolation
```

📄 **Create `tests/integration/tenancy.test.ts`:**

```ts
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createOrganizationWithOwner, findMembership } from '@/data/org-queries';
import { createTenantDb } from '@/data/tenant-db';
import { member, project, user } from '@/db/schema';
import { hasPermission } from '@/libs/permissions';

import { userFactory } from '../factories/user.factory';
import { createTestDb, type TestDb } from '../utils/test-db';

let db: TestDb;
let destroy: () => Promise<void>;

type World = {
  a: {
    orgId: string;
    slug: string;
    owner: string;
    admin: string;
    member: string;
    projectIds: string[];
  };
  b: { orgId: string; slug: string; owner: string; projectIds: string[] };
  outsider: string;
};
let world: World;

async function newUser() {
  const row = userFactory.build();
  await db.insert(user).values(row);
  return row.id;
}

beforeAll(async () => {
  ({ db, destroy } = await createTestDb());

  const [ownerA, adminA, memberA, ownerB, outsider] = await Promise.all([
    newUser(),
    newUser(),
    newUser(),
    newUser(),
    newUser(),
  ]);
  const orgA = await createOrganizationWithOwner(db, {
    name: 'Org A',
    slug: 'org-a',
    ownerId: ownerA,
  });
  const orgB = await createOrganizationWithOwner(db, {
    name: 'Org B',
    slug: 'org-b',
    ownerId: ownerB,
  });
  await db.insert(member).values([
    { id: randomUUID(), organizationId: orgA.id, userId: adminA, role: 'admin' },
    { id: randomUUID(), organizationId: orgA.id, userId: memberA, role: 'member' },
  ]);

  const repoA = createTenantDb(db, orgA.id).projects;
  const repoB = createTenantDb(db, orgB.id).projects;
  const a1 = await repoA.create({ name: 'A one' }, ownerA);
  const a2 = await repoA.create({ name: 'A two' }, ownerA);
  const b1 = await repoB.create({ name: 'B secret' }, ownerB);

  world = {
    a: {
      orgId: orgA.id,
      slug: 'org-a',
      owner: ownerA,
      admin: adminA,
      member: memberA,
      projectIds: [a1.id, a2.id],
    },
    b: { orgId: orgB.id, slug: 'org-b', owner: ownerB, projectIds: [b1.id] },
    outsider,
  };
}, 60_000);
afterAll(() => destroy());

describe('tenantDb: a repository can never leave its tenant', () => {
  it('list() returns only the tenant’s rows', async () => {
    const { items, total } = await createTenantDb(db, world.a.orgId).projects.list();
    expect(items.map((p) => p.id).sort()).toEqual([...world.a.projectIds].sort());
    expect(total).toBe(2);
  });

  it('get() of another tenant’s id is indistinguishable from a missing id', async () => {
    const repoA = createTenantDb(db, world.a.orgId).projects;
    expect(await repoA.get(world.b.projectIds[0]!)).toBeUndefined();
    expect(await repoA.get('does-not-exist')).toBeUndefined();
  });

  it('update() and delete() of another tenant’s id change NOTHING', async () => {
    const repoA = createTenantDb(db, world.a.orgId).projects;
    const victim = world.b.projectIds[0]!;

    expect(await repoA.update(victim, { name: 'hacked' })).toBeUndefined();
    expect(await repoA.delete(victim)).toBe(false);

    const [still] = await db.select().from(project).where(eq(project.id, victim));
    expect(still?.name).toBe('B secret');
  });

  it('create() always stamps the repository’s tenant, whatever the input says', async () => {
    const repoA = createTenantDb(db, world.a.orgId).projects;
    // A forged payload trying to write into tenant B
    const row = await repoA.create(
      { name: 'forged', organizationId: world.b.orgId } as never,
      world.a.owner,
    );
    expect(row.organizationId).toBe(world.a.orgId);
  });

  it('search never crosses tenants either', async () => {
    const { items } = await createTenantDb(db, world.a.orgId).projects.list({ search: 'secret' });
    expect(items).toHaveLength(0);
  });
});

describe('membership', () => {
  it('only members resolve; outsiders and foreign tenants resolve to nothing', async () => {
    expect((await findMembership(db, world.a.owner, 'org-a'))?.member.role).toBe('owner');
    expect((await findMembership(db, world.a.member, 'org-a'))?.member.role).toBe('member');
    expect(await findMembership(db, world.a.owner, 'org-b')).toBeUndefined(); // member of A, not of B
    expect(await findMembership(db, world.outsider, 'org-a')).toBeUndefined();
  });

  it('roles resolve to the expected permissions', async () => {
    const roleOf = async (userId: string) =>
      (await findMembership(db, userId, 'org-a'))!.member.role;
    expect(hasPermission(await roleOf(world.a.owner), { organization: ['delete'] })).toBe(true);
    expect(hasPermission(await roleOf(world.a.admin), { organization: ['delete'] })).toBe(false);
    expect(hasPermission(await roleOf(world.a.member), { project: ['delete'] })).toBe(false);
  });
});

describe('these tests have teeth (mutation proof)', () => {
  it('an UNSCOPED repository WOULD leak — and the tests above would catch it', async () => {
    // What a careless future change looks like: the same query without the organization predicate
    const leakyGet = async (id: string) =>
      (await db.select().from(project).where(eq(project.id, id)))[0];

    expect((await leakyGet(world.b.projectIds[0]!))?.name).toBe('B secret'); // leak!
    // …whereas the real repository answers undefined for the same call (asserted in "get() of another tenant")
    expect(
      await createTenantDb(db, world.a.orgId).projects.get(world.b.projectIds[0]!),
    ).toBeUndefined();
  });
});
```

Also prove the real rule: remove `inOrg` from `get` in `tenant-db.ts` → **at least four tests fail**. Restore it. (Do this once, by hand, and note it in the PR.)

Invitations against the real plugin:

📄 **Append to `tests/integration/auth.test.ts`?** No — create `tests/integration/invitations.test.ts`:

```ts
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { createOrganizationWithOwner } from '@/data/org-queries';
import { invitation, member, user } from '@/db/schema';
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
const nextEmail = () => `inv${Date.now()}-${++counter}@example.com`;

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

async function inviteFlow() {
  const ownerEmail = nextEmail();
  const inviteeEmail = nextEmail();
  const strangerEmail = nextEmail();
  for (const email of [ownerEmail, inviteeEmail, strangerEmail])
    await signUpAndVerify(auth, transport, email);

  const [owner] = await db.select().from(user).where(eq(user.email, ownerEmail));
  const org = await createOrganizationWithOwner(db, {
    name: 'Inv Co',
    slug: `inv-${randomUUID().slice(0, 6)}`,
    ownerId: owner!.id,
  });
  const ownerDevice = await signIn(auth, ownerEmail);

  // 🔍 method name: createInvitation (inviteMember on the client)
  await auth.api.createInvitation({
    body: { email: inviteeEmail, role: 'member', organizationId: org.id },
    headers: ownerDevice.headers,
  });
  const [invite] = await db.select().from(invitation).where(eq(invitation.email, inviteeEmail));

  return {
    org,
    invite: invite!,
    invitee: await signIn(auth, inviteeEmail),
    stranger: await signIn(auth, strangerEmail),
  };
}

it('only the invited address can accept', async () => {
  const { invite, stranger } = await inviteFlow();
  await expect(
    auth.api.acceptInvitation({ body: { invitationId: invite.id }, headers: stranger.headers }),
  ).rejects.toThrow();
  expect(
    await db.select().from(member).where(eq(member.organizationId, invite.organizationId)),
  ).toHaveLength(1); // still just the owner
});

it('the invited user joins with the invited role', async () => {
  const { invite, invitee } = await inviteFlow();
  await auth.api.acceptInvitation({ body: { invitationId: invite.id }, headers: invitee.headers });

  const members = await db
    .select()
    .from(member)
    .where(eq(member.organizationId, invite.organizationId));
  expect(members.map((m) => m.role).sort()).toEqual(['member', 'owner']);
});

it('an expired invitation cannot be accepted', async () => {
  const { invite, invitee } = await inviteFlow();
  await db
    .update(invitation)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(invitation.id, invite.id));

  await expect(
    auth.api.acceptInvitation({ body: { invitationId: invite.id }, headers: invitee.headers }),
  ).rejects.toThrow();
});

it('a plain member cannot invite people', async () => {
  const { org, invite, invitee } = await inviteFlow();
  await auth.api.acceptInvitation({ body: { invitationId: invite.id }, headers: invitee.headers });

  await expect(
    auth.api.createInvitation({
      body: { email: nextEmail(), role: 'member', organizationId: org.id },
      headers: invitee.headers,
    }),
  ).rejects.toThrow(); // the plugin enforces invitation:create from OUR roles
});
```

> 🔍 If `acceptInvitation` for a wrong email doesn't throw in your version, check `requireEmailVerificationOnInvitation` and the plugin's changelog — the **assertion** (no membership created) is the contract.

### ✅ Verify

```bash
pnpm test
```

Run the mutation experiment from above and keep the proof (`pnpm test` output) in the PR description.

**🚢 Ship** — branch `test/s4-t15-isolation` · message: `test(tenancy): add tenant isolation, membership and invitation integration tests`

---

## 🎫 S4-T16 — E2E: tenancy, RBAC and the admin console

**Branch:** `test/s4-t16-tenancy-e2e` · **Story:** US-046 · **2 SP**

```bash
git switch main && git pull && git switch -c test/s4-t16-tenancy-e2e
```

### 1. Helpers

📄 **Create `e2e/helpers/db.ts`:**

```ts
import { Pool } from 'pg';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads the database the app uses (PGlite serves one connection at a time → short-lived pool + retries).
 * Read-only use only — tests must create data through the app, not behind its back.
 */
export async function queryDb<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  for (let attempt = 0; ; attempt += 1) {
    const pool = new Pool({
      connectionString: 'postgres://postgres:postgres@127.0.0.1:5433/postgres',
      max: 1,
    });
    try {
      const { rows } = await pool.query(sql, params);
      return rows as T[];
    } catch (error) {
      if (attempt >= 5) throw error;
      await sleep(300);
    } finally {
      await pool.end();
    }
  }
}
```

📄 **Create `e2e/helpers/admin.ts`:**

```ts
import { execSync } from 'node:child_process';

/** Promotes an existing, verified user through the same script operators use. */
export function makeAdmin(email: string) {
  execSync('pnpm admin:grant', { env: { ...process.env, ADMIN_EMAILS: email }, stdio: 'pipe' });
}
```

📄 **Create `e2e/helpers/contexts.ts`:**

```ts
import type { Browser, Page } from '@playwright/test';

import { randomIp } from './users';

/** A separate "person": own cookies, own client IP (so per-IP rate limits never interfere). */
export async function newPerson(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': randomIp() } });
  return context.newPage();
}
```

### 2. The specs

📄 **Create `e2e/tenancy.spec.ts`:**

```ts
import { expect, test } from './fixtures';
import { newPerson } from './helpers/contexts';
import { waitForEmail } from './helpers/inbox';
import { signInViaUi } from './helpers/ui';
import { createUser } from './helpers/users';

const slugFrom = (url: string) => /\/dashboard\/([^/?#]+)/.exec(url)?.[1] ?? '';

test('owner invites a teammate; roles restrict what each can do', async ({
  browser,
  request,
  baseURL,
}) => {
  const owner = await createUser(request, baseURL!);
  const mate = await createUser(request, baseURL!);

  const ownerPage = await newPerson(browser);
  await ownerPage.goto('/sign-in');
  await signInViaUi(ownerPage, owner.email, owner.password);
  await ownerPage.waitForURL(/\/dashboard\/[^/]+$/); // personal workspace created at sign-up
  const slug = slugFrom(ownerPage.url());

  // The owner creates a project
  await ownerPage.goto(`/dashboard/${slug}/projects`);
  await ownerPage.getByRole('button', { name: 'New project' }).click();
  await ownerPage.getByLabel('Name', { exact: true }).fill('Launch plan');
  await ownerPage.getByRole('button', { name: 'Create project' }).click();
  await expect(ownerPage).toHaveURL(/\/projects\/[^/]+$/);
  const projectUrl = ownerPage.url();

  // …and invites the teammate as a MEMBER
  const since = Date.now();
  await ownerPage.goto(`/dashboard/${slug}/members`);
  await ownerPage.getByLabel('Email address').fill(mate.email);
  await ownerPage.getByRole('button', { name: 'Send invitation' }).click();
  await expect(ownerPage.getByText(`Invitation sent to ${mate.email}.`)).toBeVisible();

  const mail = await waitForEmail(mate.email, { since });
  expect(mail.subject).toContain('invited you');

  // The teammate accepts
  const matePage = await newPerson(browser);
  await matePage.goto('/sign-in');
  await signInViaUi(matePage, mate.email, mate.password);
  await matePage.waitForURL(/\/dashboard\/[^/]+$/);
  await matePage.goto(mail.links[0]!);
  await matePage.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(matePage).toHaveURL(new RegExp(`/dashboard/${slug}$`));

  // A MEMBER can open and edit the project, but not delete it, and can't reach settings
  await matePage.goto(projectUrl);
  await expect(matePage.getByRole('heading', { name: 'Launch plan' })).toBeVisible();
  await expect(matePage.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await matePage.goto(`/dashboard/${slug}/settings`);
  await expect(matePage).toHaveURL(new RegExp(`/dashboard/${slug}$`)); // bounced to the overview

  // The owner promotes the teammate to ADMIN → the same pages now allow more (role read from DB, no re-login)
  await ownerPage.reload();
  await ownerPage.getByRole('combobox', { name: /^Role:/ }).click();
  await ownerPage.getByRole('option', { name: 'Admin' }).click();
  await expect(ownerPage.getByText('Role updated.')).toBeVisible();

  await matePage.goto(projectUrl);
  await expect(matePage.getByRole('button', { name: 'Delete' })).toBeVisible();
  await matePage.goto(`/dashboard/${slug}/settings`);
  await expect(matePage.getByRole('heading', { name: 'Organization settings' })).toBeVisible();
  // …but admins never see the danger zone
  await expect(matePage.getByRole('button', { name: 'Delete organization' })).toHaveCount(0);
});

test('another tenant’s project is a 404 — by URL tampering too', async ({
  browser,
  request,
  baseURL,
}) => {
  const [alice, bob] = [await createUser(request, baseURL!), await createUser(request, baseURL!)];

  const bobPage = await newPerson(browser);
  await bobPage.goto('/sign-in');
  await signInViaUi(bobPage, bob.email, bob.password);
  await bobPage.waitForURL(/\/dashboard\/[^/]+$/);
  const bobSlug = slugFrom(bobPage.url());
  await bobPage.goto(`/dashboard/${bobSlug}/projects`);
  await bobPage.getByRole('button', { name: 'New project' }).click();
  await bobPage.getByLabel('Name', { exact: true }).fill('Bob secret');
  await bobPage.getByRole('button', { name: 'Create project' }).click();
  await expect(bobPage).toHaveURL(/\/projects\/([^/]+)$/);
  const bobProjectId = /\/projects\/([^/]+)$/.exec(bobPage.url())![1]!;

  const alicePage = await newPerson(browser);
  await alicePage.goto('/sign-in');
  await signInViaUi(alicePage, alice.email, alice.password);
  await alicePage.waitForURL(/\/dashboard\/[^/]+$/);
  const aliceSlug = slugFrom(alicePage.url());

  for (const url of [
    `/dashboard/${bobSlug}/projects/${bobProjectId}`, // Bob's tenant, Bob's project
    `/dashboard/${bobSlug}/projects`, // Bob's tenant
    `/dashboard/${aliceSlug}/projects/${bobProjectId}`, // Alice's tenant, Bob's id
  ]) {
    const response = await alicePage.goto(url);
    expect(response?.status(), url).toBe(404);
    await expect(alicePage.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  }
});

test('creating and switching organizations', async ({ page, request, baseURL }) => {
  const user = await createUser(request, baseURL!);
  await page.goto('/sign-in');
  await signInViaUi(page, user.email, user.password);
  await page.waitForURL(/\/dashboard\/[^/]+$/);

  await page.getByRole('button', { name: 'Switch organization' }).click();
  await page.getByRole('menuitem', { name: 'Create organization' }).click();
  await page.getByLabel('Organization name').fill('Second Company');
  await expect(page.getByLabel('URL name')).toHaveValue('second-company');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/dashboard\/second-company$/);

  await page.getByRole('button', { name: 'Switch organization' }).click();
  await expect(page.getByRole('menuitem', { name: 'Second Company' })).toBeVisible();
});
```

📄 **Create `e2e/admin.spec.ts`:**

```ts
import { expect, test } from './fixtures';
import { makeAdmin } from './helpers/admin';
import { newPerson } from './helpers/contexts';
import { queryDb } from './helpers/db';
import { signInViaUi } from './helpers/ui';
import { createUser } from './helpers/users';

test('admin bans, unbans and impersonates — and everything is audited', async ({
  browser,
  request,
  baseURL,
}) => {
  const adminUser = await createUser(request, baseURL!);
  const target = await createUser(request, baseURL!);
  makeAdmin(adminUser.email);

  const adminPage = await newPerson(browser);
  await adminPage.goto('/sign-in');
  await signInViaUi(adminPage, adminUser.email, adminUser.password);
  await adminPage.waitForURL(/\/dashboard\/[^/]+$/);

  // A regular user is signed in elsewhere
  const targetPage = await newPerson(browser);
  await targetPage.goto('/sign-in');
  await signInViaUi(targetPage, target.email, target.password);
  await targetPage.waitForURL(/\/dashboard\/[^/]+$/);

  // The admin finds the user
  await adminPage.goto('/admin/users');
  await adminPage
    .getByRole('searchbox')
    .or(adminPage.getByLabel('Search by email or name'))
    .first()
    .fill(target.email);
  await adminPage.keyboard.press('Enter');
  await adminPage.getByRole('link', { name: 'View' }).first().click();
  await expect(adminPage.getByText(target.email)).toBeVisible();

  // Ban → the user's session dies immediately
  await adminPage.getByLabel('Reason (optional)').fill('E2E test');
  await adminPage.getByRole('button', { name: 'Ban user' }).click();
  await expect(adminPage.getByText('User banned and signed out everywhere.')).toBeVisible();
  await targetPage.reload();
  await expect(targetPage).toHaveURL(/\/sign-in/);

  // Unban
  await adminPage.getByRole('button', { name: 'Unban user' }).click();
  await expect(adminPage.getByText('User unbanned.')).toBeVisible();

  // Impersonate → banner → sign out of the impersonation
  await adminPage.getByRole('button', { name: 'Impersonate' }).click();
  await expect(adminPage).toHaveURL(/\/dashboard/);
  await expect(adminPage.getByText(`You are impersonating`)).toContainText(target.email);
  await adminPage.getByRole('button', { name: 'Stop impersonating' }).click();
  await expect(adminPage).toHaveURL(/\/admin\/users/);

  // Audit trail (read-only DB access)
  const [{ id }] = await queryDb<{ id: string }>('select id from "user" where email = $1', [
    target.email,
  ]);
  const events = await queryDb<{ action: string }>(
    'select action from audit_log where target_id = $1 order by created_at',
    [id],
  );
  expect(events.map((event) => event.action)).toEqual([
    'user.ban',
    'user.unban',
    'impersonation.start',
    'impersonation.stop',
  ]);
});

test('non-admins cannot even see that the console exists', async ({ page, request, baseURL }) => {
  const user = await createUser(request, baseURL!);
  await page.goto('/sign-in');
  await signInViaUi(page, user.email, user.password);
  await page.waitForURL(/\/dashboard\/[^/]+$/);

  const response = await page.goto('/admin/users');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
```

> 🔎 `pnpm admin:grant` talks to the same PGlite database as the running app (one connection at a time). The helpers retry; if you see `ECONNREFUSED`, make sure only **one** `pnpm dev` / Playwright server is running.

### ✅ Verify

```bash
pnpm e2e                        # local (reuses pnpm dev)
CI=1 pnpm e2e                   # 🪟 cmd.exe: set CI=1&& pnpm e2e — stop `pnpm dev` first (ports 3000 and 5433)
pnpm exec playwright test e2e/tenancy.spec.ts e2e/admin.spec.ts --repeat-each=5 --workers=2
```

All green, 0 flakes in 5 repetitions. In CI, check the `E2E` job is still under 10 minutes; if not, shard (`--shard`) in Sprint 5.

**🚢 Ship** — branch `test/s4-t16-tenancy-e2e` · message: `test(e2e): cover organizations, role restrictions, tenant tampering and the admin console`

---

## 🧾 Sprint 4 wrap-up

**Branch:** `docs/s4-wrap-up`

```bash
git switch main && git pull && git switch -c docs/s4-wrap-up
```

### 1. Docs

📄 **Create `docs/guides/multi-tenancy.md`:**

```markdown
# Multi-tenancy

**Tenant = organization.** Users can belong to many; the URL (`/dashboard/<orgSlug>/…`) says which one is active.

## The three walls

1. **Membership** — `requireOrgMember(slug)` (pages) / `getOrgMembershipOrThrow(slug)` (actions): non-members get **404**.
2. **Permission** — `requirePagePermission` / `withOrgPermission({ resource: ['action'] }, handler)`; role read from the DB on every request.
3. **Data scope** — tenant data is reached only through `tenantDb(orgId)`. Feature code (`src/app`, `src/components`, `src/actions`) may not import `@/db/client` or `@/db/schema` (enforced by `tenant-boundary.test.ts`).

## Adding a tenant-scoped resource (checklist)

1. Table with `organization_id` (NOT NULL, FK → organization, cascade) + index `(organization_id, created_at)`.
2. Repository in `src/data/tenant-db.ts` — **every** query starts from `eq(table.organizationId, orgId)`.
3. Permissions in `src/libs/permissions.ts` (+ matrix test row).
4. Server Actions: `createAction(schema + orgSlug, withOrgPermission(…))`; pages: `requirePagePermission`.
5. Isolation tests in `tests/integration/tenancy.test.ts` (cross-tenant get/update/delete must be no-ops).
6. Foreign ids → `NotFoundError` / `notFound()`, never 403.

## Roles

See `docs/guides/rbac.md`. Platform role (`user.role`) is separate from organization roles.

## Admin & audit

- First admin: `ADMIN_EMAILS=you@example.com pnpm admin:grant` (verified users only).
- `/admin` → 404 for non-admins; `ADMIN_REQUIRE_MFA=true` demands 2FA.
- Impersonation: banner everywhere, 1 h, credential/MFA/passkey endpoints blocked.
- `audit_log` is append-only (DB trigger). Ids are plain text so history outlives users and organizations.

## Postgres RLS

Evaluated in Sprint 4 and **deferred** (`TD-02`) — see ADR-005 and `scripts/rls-spike.ts`.
```

### 2. Update `AGENTS.md`

**Commands:** `pnpm admin:grant`. **Security / conventions:**

```markdown
- Tenant data: ONLY through `tenantDb(orgId)` (src/data/tenant-db.ts). Never import `@/db/client` / `@/db/schema` in src/app, src/components or src/actions (tenant-boundary.test.ts).
- Pages under `(app)` call `requireOrgMember` / `requirePagePermission` / `requireSession`; pages under `(admin)` call `requireAdmin()`. Server Actions use `withOrgPermission(...)` or `getAdminOrThrow()`. Layouts are never guards.
- Foreign-tenant ids and non-admin admin URLs answer 404, not 403.
- New permission → `src/libs/permissions.ts` + a row in the matrix test + docs/guides/rbac.md.
- Anything an admin does (ban, role change, impersonation, org deletion…) writes an `audit(...)` event.
- Never hand out `owner` by invitation/role change; ownership moves only via `transferOwnership`.
```

```bash
pnpm check:agents
```

### 3. Update `docs/roadmap/06-project-state.md`

- **Last completed sprint:** Sprint 4 · **Current sprint:** Sprint 5 · **Release:** 0.5 MVP
- **Tables added:** `organization`, `member`, `invitation`, `project`, `audit_log` (+ trigger); columns `session.active_organization_id`, `session.impersonated_by`, `user.role/banned/ban_reason/ban_expires`
- **Env vars:** `AUTO_CREATE_PERSONAL_ORG`, `ORG_CREATION_LIMIT_PER_USER`, `INVITATION_EXPIRES_DAYS`, `ADMIN_EMAILS`, `ADMIN_REQUIRE_MFA`
- **Routes:** `/dashboard/<orgSlug>/{,projects,projects/[id],members,settings}`, `/dashboard/new-organization`, `/accept-invitation/[id]`, `/admin/users`, `/admin/users/[id]`
- **Helpers:** `requireOrgMember`, `requirePagePermission`, `requirePermission`, `withOrgPermission`, `requireAdmin`, `getAdminOrThrow`, `tenantDb`, `audit`, `hasPermission`, `wouldLeaveNoOwner`, `canManageTarget`
- **Demo data:** `demo` (owner demo, member teammate), `other-co` (owner other), `admin@example.com` — all `Demo-Password-123`
- **Decisions:** ADR-005 finalised (RLS deferred, `TD-02`); `TD-12` "trust device" still enabled for admins
- **Deviations:** list the ones from the decisions table + any Better Auth method/option names you had to change
- **Measured:** E2E duration, `--repeat-each=5` flakiness, isolation test count

Tick the checkboxes in `docs/roadmap/sprint-04-tenancy-rbac-admin.md`, then:

```bash
pnpm check
git add -A
git commit -m "docs: add multi-tenancy guide and update project state for sprint 4"
git push -u origin docs/s4-wrap-up
gh pr create --fill --base main && gh pr checks --watch
gh pr merge --merge --delete-branch && git switch main && git pull
git tag -a v0.5.0 -m "chore: sprint 4 complete — MVP (multi-tenant, RBAC, admin)"
git push origin v0.5.0
```

---

## 🏁 Sprint 4 — Definition of Done

- [ ] Every user has a workspace; create, switch and delete organizations; URLs carry the slug
- [ ] Invitations: send, accept (new or existing user), revoke, resend, expire; wrong email can't accept
- [ ] RBAC: matrix enforced on the server for projects **and** on the plugin's endpoints; UI mirrors it
- [ ] Role changes apply on the **next request**; admins manage only members; owner only by transfer; ≥ 1 owner always
- [ ] `Project` CRUD only through `tenantDb`; cross-tenant ids → 404; `tenant-boundary.test.ts` green
- [ ] Settings, member management, ownership transfer, org deletion (fresh session + typed name)
- [ ] Admin console: search, ban/unban (sessions die), revoke, role; impersonation with banner, 1 h, blocked sensitive actions
- [ ] `audit_log` append-only (trigger test); events for impersonation, bans, role changes, org deletion, ownership transfer
- [ ] Isolation suite green **and** fails when a scope is removed (mutation proof recorded)
- [ ] `pnpm test`, `pnpm test:browser`, `pnpm e2e` and `CI=1 pnpm e2e` green
- [ ] `docs/guides/rbac.md` + `multi-tenancy.md` written; ADR-005 finalised; `06-project-state.md` updated; tag `v0.5.0`

### 🎬 Sprint review — measurable acceptance

| Check                             | Expected                                                   |
| --------------------------------- | ---------------------------------------------------------- |
| Create org, invite a teammate     | email → accept → member row                                |
| Member tries to delete a project  | no button; the action returns FORBIDDEN                    |
| Open another tenant's project URL | 404 (identical to a missing page)                          |
| Remove / demote the last owner    | blocked with a clear message                               |
| Admin impersonates a user         | banner on every page; audit rows; Stop returns to admin    |
| `UPDATE audit_log …`              | rejected by the database                                   |
| Isolation suite                   | 100 % green; fails if a `where organization_id` is removed |

---

## 🧯 Troubleshooting (Sprint 4)

| Symptom | Likely cause → fix |
| --- | --- |
| `/dashboard` → 404 right after creating an org | The slug in the URL doesn't match (case/typo) or you aren't a member; check Studio `member` |
| Everyone becomes `member` / invitations ignore the role | `ac`/`roles` not registered on **both** server and client plugin |
| 403 on `inviteMember` for an owner | Role strings differ (`Owner` vs `owner`) or the roles object isn't passed to `organization({ ac, roles })` |
| `acceptInvitation` fails for the right user | Email case/whitespace differs, invitation expired/canceled, or `requireEmailVerificationOnInvitation` and the email isn't verified |
| Personal org missing for a new user | `AUTO_CREATE_PERSONAL_ORG=false`, or the hook errored (look for the `auth` log line) |
| `tenant-boundary` test fails | A page/component/action imports `@/db/client` or `@/db/schema` → move the query into `src/data/*` |
| Guard-coverage test fails | A new page doesn't call `requireOrgMember` / `requirePagePermission` / `requireSession` / `requireAdmin` |
| `Could not find a declaration file` / type errors on `auth.api.<plugin method>` | The plugin isn't in `plugins`, or you changed order — keep `nextCookies()` last |
| `audit_log is append-only` during `db:reset` or tests | Something tries to delete rows; the reset script drops the whole **schema**, which is allowed — use that |
| `Cannot read properties of undefined (reading 'role')` in the admin pages | Admin columns missing → run the migration (`pnpm db:migrate`), `pnpm db:reset` in dev |
| Admin can't impersonate | Target is an admin or yourself (by design), or `ADMIN_REQUIRE_MFA=true` and you have no 2FA |
| Banner never shows | `ImpersonationBanner` not rendered in `(app)/layout.tsx`, or `session.impersonatedBy` column missing |
| `pnpm admin:grant` says no VERIFIED user | The user hasn't verified their email, or the address differs; verify first |
| E2E `admin.spec`: `ECONNREFUSED 5433` | PGlite not running / port busy; run through Playwright's server or `pnpm db:server` |
| Seed test count off | Users are 4 now (demo, teammate, other, admin) |
| 🪟 `mkdir`/`git mv` errors with `[orgSlug]` | Quote the path: `"src/app/[locale]/(app)/dashboard/[orgSlug]"` |

---

## ➡️ Next

Sprint 4 complete → **Sprint 5 — Quality & testing maturity** (`docs/roadmap/sprint-05-quality-testing.md`): Storybook, visual regression, coverage thresholds with Codecov, a faster parallel CI, reusable test factories and auth fixtures, i18n and Knip gates, and a security regression suite. Same format: one branch per ticket, verify, PR, merge.
