<div align="center">

<img src="public/onside-wordmark.svg" alt="Onside" width="180" />

### Pickup football, organized.

Find a match nearby. Pick a nickname. Real-time chat. Auto-balanced teams. No accounts, no logins.
Built for the neighborhood pitches of **Gdańsk**.

<br />

[![Next.js](https://img.shields.io/badge/Next.js-15.5-000?logo=nextdotjs&logoColor=white&style=flat-square)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_Realtime-3ECF8E?logo=supabase&logoColor=white&style=flat-square)](https://supabase.com)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white&style=flat-square)](https://tailwindcss.com)

<br />

<img src="design/onside-landing.png" alt="Pitch Notation — design philosophy poster" width="420" />

</div>

<br />

## What it does

- **Find a match** — map of nearby open pickup events
- **Just type a name** — no signup, no email, no password. Pick a nickname inline whenever you act
- **Join a roster** — instant confirm, position pick (GK / DEF / MID / FWD)
- **Auto-balance** — position-balanced snake-draft + hill-climb, with drag-drop manual override
- **Chat live** — event-scoped real-time room, system messages on every state change
- **Submit a score** — anyone in the match can record the final result
- **Speak your language** — TR · EN · PL

> **Identity model:** there is no account system. The browser keeps your nickname in
> localStorage, so the same name follows you across the chat / RSVP / team builder /
> score form on this device. Switch nicknames via the inline link any time. Elo, MVP
> voting, and notifications were deliberately deferred — they will return as fresh
> features rather than retro-fitted on top of nicknames.

## Quick start

```bash
pnpm install
cp .env.example .env.local        # fill in Supabase keys
for f in supabase/migrations/*.sql; do
  node --env-file=.env.local scripts/apply-migration.mjs "$f"
done
node --env-file=.env.local scripts/seed-venues.mjs
pnpm dev                          # → http://localhost:3000
```

The app boots straight into the events feed — there is no onboarding gate.

## The stack

**Frontend** Next.js 15 · TypeScript strict · Tailwind v4 · shadcn/ui · MapLibre GL · @dnd-kit
**Backend** Supabase (Postgres + PostGIS + Realtime) · Drizzle ORM · SECURITY DEFINER RPCs
**Quality** Vitest unit tests · Playwright smoke · ESLint · Prettier · Husky pre-commit
**i18n** next-intl with PL (default) · EN · TR
**Tooling** pnpm · Turbopack · date-fns-tz (Europe/Warsaw)

## Documentation

| Read                                                               | When                                        |
| ------------------------------------------------------------------ | ------------------------------------------- |
| [CHANGELOG.md](CHANGELOG.md)                                       | Phase-by-phase narrative                    |
| [docs/runbooks/deployment.md](docs/runbooks/deployment.md)         | Production deploy flow + secrets            |
| [docs/decisions/](docs/decisions/)                                 | ADRs (Next 15 lock-in, RLS for Realtime, …) |
| [design/onside-pitch-notation.md](design/onside-pitch-notation.md) | Brand visual philosophy                     |

<details>
<summary><strong>Architecture overview</strong></summary>

```
┌─────────────────────────┐
│  Browser (Next.js 15)   │  Server Components + client islands
│  - MapLibre GL          │  Tailwind v4 · shadcn/ui · next-intl
│  - @dnd-kit drag-drop   │  Sonner toasts
│  - localStorage         │  NicknameProvider (per-device identity)
└────────────┬────────────┘
             │  Server Actions + Supabase JS (RPC + Realtime)
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Supabase Cloud (eu-central-1)                  │
│  PostgreSQL + PostGIS  ·  Realtime postgres_changes                  │
│                                                                      │
│  Read paths:    public RLS (USING (true))                            │
│  Write paths:   SECURITY DEFINER RPCs with advisory locks            │
│                 join_event(uuid, text, position) · cancel_rsvp       │
│                 send_message · save_teams · unlock_teams             │
│                 submit_score · edit_score · post_system_message      │
│                                                                      │
│  Identity:      inline `nickname` text on every action — no auth     │
└─────────────────────────────────────────────────────────────────────┘
```

</details>

<details>
<summary><strong>Migration runbook</strong></summary>

Migrations are numbered SQL files (`supabase/migrations/000N_*.sql`). Each one
should be applied exactly once, in order. The big nickname-only reshape
(`0019_drop_auth_profile.sql`) is idempotent — safe to re-run on a
half-applied DB.

```bash
# Single file
node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/0019_drop_auth_profile.sql

# All in order
for f in supabase/migrations/*.sql; do
  node --env-file=.env.local scripts/apply-migration.mjs "$f"
done

# Drizzle: schema → migration scaffold (rare; most changes are hand-written SQL)
pnpm db:generate
```

> RLS, SECURITY DEFINER RPCs, and triggers live in the hand-written SQL files —
> not the Drizzle schema. Drizzle covers tables, enums, and indexes only.

</details>

<details>
<summary><strong>Deployment (Vercel)</strong></summary>

```bash
pnpm i -g vercel
vercel link
vercel --prod
```

Production env (verified live):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `DATABASE_URL` (Drizzle / direct pg client)
- `NEXT_PUBLIC_SITE_URL`
- `NOMINATIM_USER_AGENT` (geocoding)

CI auto-deploys on every push to `main`. The `production` GitHub environment
no longer requires a reviewer; smoke test + alias promote is enough. See
[docs/runbooks/deployment.md](docs/runbooks/deployment.md) for the recovery
playbook.

</details>

<details>
<summary><strong>Scripts</strong></summary>

| Command            | Purpose                     |
| ------------------ | --------------------------- |
| `pnpm dev`         | Turbopack dev server        |
| `pnpm build`       | Production build            |
| `pnpm typecheck`   | `tsc --noEmit`              |
| `pnpm lint`        | ESLint                      |
| `pnpm format`      | Prettier write              |
| `pnpm test`        | Vitest run (unit)           |
| `pnpm test:watch`  | Vitest watch                |
| `pnpm test:e2e`    | Playwright smoke            |
| `pnpm db:generate` | Drizzle: schema → migration |
| `pnpm db:push`     | Drizzle: apply to dev DB    |
| `pnpm db:studio`   | Drizzle Studio              |

</details>

<details>
<summary><strong>Folder layout</strong></summary>

```
src/
  app/[locale]/             Localised routes (pl/en/tr)
    layout.tsx              Inter font, providers, NicknameProvider, footer, cookie banner
    page.tsx                Landing
    events/(page,new,[id])/ Event feed, create form, detail with all panels
    venues/(page,[id])/     Venue list and detail
    legal/(privacy,terms)/  GDPR/RODO placeholders
  components/
    ui/                     shadcn primitives (Button, Input, Dialog, EmptyState…)
    event/                  EventForm, JoinButton, ChatRoom, TeamPanel, ResultPanel, …
    nickname-provider.tsx   localStorage-backed identity context
    nickname-dialog.tsx     Reusable name-prompt dialog
    map/                    MapLibre views and pins
  lib/
    supabase/{server,client}.ts
    event/{state,rsvp,team,result,chat}-actions.ts
    balance/algorithm.ts    Snake-draft + hill-climb (skill-rating-free)
    validation/{event,nickname}.ts
  db/schema.ts              All tables in one file
  i18n/{routing,request,navigation}.ts
  middleware.ts             next-intl locale routing only
supabase/migrations/        Numbered SQL files (latest: 0021)
scripts/                    apply-migration · seed-venues · check-publication
tests/
  unit/balance.test.ts      Team-balance algorithm
  e2e/smoke.spec.ts         Playwright public-page smoke
messages/                   pl.json (default) · en.json · tr.json
docs/                       runbooks/ + decisions/
design/                     Brand poster artifact (PDF + PNG + philosophy)
```

</details>

<details>
<summary><strong>Engineering principles</strong></summary>

- TypeScript strict, no `any` — `unknown` + zod parse for unknown data
- Server Components by default; `"use client"` only when interaction or a browser API requires it
- Mutations via Server Actions; no REST or GraphQL
- Single Drizzle schema file at `src/db/schema.ts`
- Path alias `@/*` → `./src/*`; never `../../..`
- Every public route is locale-prefixed (`/pl`, `/en`, `/tr`); default PL
- Postgres stores `timestamptz`; UI converts on render via date-fns-tz (Europe/Warsaw)
- Server Action contract: `{ ok: true, data } | { ok: false, error, code }`
- Read paths via public RLS; write paths only through atomic SECURITY DEFINER RPCs
- Realtime tables: `REPLICA IDENTITY FULL` + `supabase_realtime` publication; RLS `TO anon, authenticated USING (true)`
- No PII anywhere in the schema (no auth.users coupling, no email, no IP logging)
- ESLint enforces `no-console`
- Identity is intentionally minimal: a nickname string, validated against `^[A-Za-z0-9_ -]{3,24}$` at both client (zod) and DB (CHECK) layers

</details>

## Status

Live at <https://onside-boisko.vercel.app>. Auth and the profile system were
removed in favour of inline nicknames; Elo, MVP voting, notifications, and
moderation are deferred and will return as fresh features. See
[CHANGELOG.md](CHANGELOG.md) for the phase-by-phase history.

## License

Not yet decided — placeholder.
