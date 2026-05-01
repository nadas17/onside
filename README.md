# Onside

> Find a nearby pickup football match, join in, play with auto-balanced teams, track your stats.

A web app for Gdańsk and Warsaw that lists nearby open pickup matches based on the user's location, runs **position-weighted automatic team balancing** when the roster fills, hosts an event-scoped **real-time chat** room, lets players submit scores and vote MVP after the match, maintains an Elo-style skill rating, and is GDPR/RODO compliant.

The user-facing brand is **Halısaha** (Turkish for "carpet pitch") — the small synthetic-turf pitches that define neighborhood football culture in Turkey. The codebase is published as `onside`.

Spec document: [HALISAHA_SPEC.md](HALISAHA_SPEC.md) (the source of truth — never modified, referenced for any open question).

## Status

All phases (0–9) complete. See [CHANGELOG.md](CHANGELOG.md) for the per-phase narrative.

## Architecture overview

```
┌─────────────────────────┐
│  Browser (Next.js 15)   │  Server Components by default + client islands ("use client")
│  - MapLibre GL          │  Tailwind v4 · shadcn/ui · next-intl (tr/en/pl)
│  - @dnd-kit drag-drop   │  TanStack Query + Sonner · MapLibre lazy
└────────────┬────────────┘
             │
             │ Server Actions (revalidatePath) + Supabase JS (RPC + Realtime)
             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Supabase Cloud (eu-central-1)                  │
│  ┌────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │ PostgreSQL │  │ Auth        │  │ Realtime    │  │ Storage      │ │
│  │ + PostGIS  │  │ Anonymous   │  │ postgres_   │  │ (avatar —    │ │
│  │            │  │             │  │  changes    │  │  backlog)    │ │
│  └─────┬──────┘  └─────────────┘  └─────────────┘  └──────────────┘ │
│        │                                                              │
│        ▼                                                              │
│  RLS + SECURITY DEFINER RPC (advisory locks):                        │
│   join_event · approve/reject_participant · cancel_rsvp · save_teams │
│   submit_score · edit_score · submit_mvp_vote · finalize_mvp         │
│   mark_notification_read · derive_skill_level                        │
│                                                                       │
│  Triggers: organizer auto-join · notification fan-out                │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech stack (locked, spec §2)

| Layer                | Choice                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Framework            | Next.js 15.5.x (App Router, Server Components, Server Actions, Turbopack) — see [ADR-0001](docs/decisions/0001-next-js-15-lock-in.md) |
| Runtime              | Node ≥ 22, TypeScript strict, `noUncheckedIndexedAccess`                                                                              |
| Auth + DB + Realtime | Supabase Cloud (Postgres + PostGIS + Auth + Realtime)                                                                                 |
| Auth mode            | Anonymous Auth + nickname (ADR-0002)                                                                                                  |
| ORM                  | Drizzle ORM + drizzle-kit (tables/enums/indexes only — RLS lives in hand-written SQL)                                                 |
| Styling              | Tailwind v4 (CSS-first config) + shadcn/ui convention + lucide-react                                                                  |
| Forms                | react-hook-form + zod v4                                                                                                              |
| Server state         | TanStack Query v5                                                                                                                     |
| Drag-drop            | @dnd-kit/core + @dnd-kit/sortable (Phase 6)                                                                                           |
| Charts               | Pure SVG (Phase 8 — recharts alternative, ~0 KB bundle)                                                                               |
| i18n                 | next-intl (tr default / en / pl)                                                                                                      |
| Map                  | MapLibre GL JS + OpenStreetMap raster                                                                                                 |
| Geocoding            | Nominatim (used by venue seed runbook only)                                                                                           |
| Time                 | date-fns + date-fns-tz (Europe/Warsaw default)                                                                                        |
| Test                 | Vitest (40 unit tests: 15 balance + 25 elo)                                                                                           |
| Package manager      | pnpm 10+                                                                                                                              |

## Prerequisites

- Node 22+ (`node --version`)
- pnpm 10+ (`npm i -g pnpm@latest`)
- Git
- A Supabase Cloud account (https://supabase.com)
- Optional: psql CLI, or use `node --env-file=.env.local scripts/apply-migration.mjs ...` to apply migrations

## Quick start

```bash
pnpm install

# 1) Create a Supabase Cloud project
#    Dashboard → New project (region: eu-central-1, recommended for GDPR/RODO)
#    Authentication → Providers → Anonymous Sign-Ins → Enable

# 2) .env.local
cp .env.example .env.local
# Edit:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (browser-safe)
#   SUPABASE_SECRET_KEY                   (server-only — never ship to the client)
#   DATABASE_URL                          (Transaction pooler 6543, region prefix must match)
#   NOMINATIM_USER_AGENT                  (optional, for venue seed)

# 3) Apply migrations in order (Supabase SQL Editor, or:)
for f in supabase/migrations/*.sql; do
  node --env-file=.env.local scripts/apply-migration.mjs "$f"
done

# 4) Seed venues (Warsaw + Gdańsk · 20 real pitches)
node --env-file=.env.local scripts/seed-venues.mjs

# 5) Dev server
pnpm dev
# → http://localhost:3000 → redirects to /tr
# → On first visit: JoinModal asks for a nickname → anonymous auth + profile created
```

## Migration runbook

Migrations are numbered SQL files (`supabase/migrations/000N_*.sql`). They are not idempotent — apply each exactly once.

```bash
# Single file
node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/0016_notifications.sql

# All in order
for f in supabase/migrations/*.sql; do
  node --env-file=.env.local scripts/apply-migration.mjs "$f"
done

# Drizzle: generate a migration from schema changes
pnpm db:generate

# Drizzle: push schema directly to a dev DB (local/staging only)
pnpm db:push
```

> **Important:** RLS policies, SECURITY DEFINER RPCs, and triggers do **not** live in the Drizzle schema — they live in the hand-written SQL files. Drizzle is used only for tables, enums, and indexes. To change RLS or RPC, add a new numbered SQL file and apply it via `apply-migration.mjs`.

## Scripts

| Command             | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `pnpm dev`          | Turbopack dev server (port 3000, falls back if busy) |
| `pnpm build`        | Production build (Turbopack)                         |
| `pnpm start`        | Production server                                    |
| `pnpm typecheck`    | `tsc --noEmit`                                       |
| `pnpm lint`         | ESLint                                               |
| `pnpm format`       | Prettier write                                       |
| `pnpm format:check` | Prettier check (CI)                                  |
| `pnpm test`         | Vitest run (40 unit tests)                           |
| `pnpm test:watch`   | Vitest watch                                         |
| `pnpm db:generate`  | Drizzle: schema → migration                          |
| `pnpm db:push`      | Drizzle: apply schema directly to DB                 |
| `pnpm db:studio`    | Drizzle Studio                                       |

## Deployment (Vercel)

```bash
# Vercel CLI
pnpm i -g vercel
vercel link

# Production env vars (Settings → Environment Variables → Production):
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
#   SUPABASE_SECRET_KEY, DATABASE_URL, NEXT_PUBLIC_SITE_URL (final domain)
#   Optional: SENTRY_DSN, NOMINATIM_USER_AGENT

vercel --prod
```

Production checklist:

- [ ] Supabase Auth → Anonymous sign-ins **enabled**
- [ ] Supabase Realtime publication includes every relevant table (event, event_participant, chat_message, team, team_assignment, match_result, mvp_vote, notification) — verify with `node --env-file=.env.local scripts/check-publication.mjs`
- [ ] All migrations applied to the production DB (0001..0016)
- [ ] Venue seed has been run
- [ ] Privacy + Terms placeholders replaced with the real text + `contact@halisaha.example` swapped for a real address
- [ ] Custom domain bound on Vercel
- [ ] SSL active (Vercel handles this automatically)

## Folder layout

```
src/
  app/[locale]/
    layout.tsx                  Inter font, NextIntlClientProvider, skip-link, footer, cookie banner
    page.tsx                    Landing + JoinModal
    events/(page,new,[id])/     Event feed + create + detail (RSVP/teams/score/MVP/chat all on one page)
    venues/(page,[id])/         Venue list + detail (with upcoming events)
    profile/(page,edit)/        Self profile + edit
    u/[username]/               Public profile (read-only)
    legal/(privacy,terms)/      GDPR/RODO placeholder
  components/
    ui/                         shadcn primitives (Button, Input, Label, Dialog, EmptyState)
    auth/                       JoinModal, geolocation prompt
    event/                      EventForm, EventCard, JoinButton, RosterList, PendingRequests,
                                MyPendingCard, ChatRoom, TeamPanel, TeamBuilder, ResultPanel,
                                ScoreSubmitForm
    map/                        MapView (lazy MapLibre), VenueMapPage
    profile/                    RatingChart (pure SVG), RecentMatches
    notification/               NotificationBell (header dropdown + realtime)
    header-actions.tsx          Bell + Locale + Theme bundle (server component)
    cookie-banner.tsx           Essential-only consent
    providers.tsx               TanStack Query + ThemeProvider + Toaster
  lib/
    supabase/{server,client,middleware}.ts
    event/{state,rsvp-actions,team-actions,result-actions,chat-actions}.ts
    profile/stats-queries.ts
    notification/actions.ts
    balance/algorithm.ts        Pure-function snake-draft + hill-climb
    elo.ts                      Pure-function K=32 Elo + skill_level
    rate-limit.ts               In-memory (Upstash optional, backlog)
    types.ts                    ActionResult contract
  db/
    index.ts                    Drizzle client (server-only)
    schema.ts                   Single file — all tables (mirrors spec §5)
  i18n/
    routing.ts                  Locales, default, prefix
    request.ts                  getRequestConfig
    navigation.ts               Typed Link/router
  middleware.ts                 Supabase session refresh + i18n routing
supabase/migrations/            0001_profile..0016_notifications (16 SQL files)
scripts/
  apply-migration.mjs           Single-file migration runner
  seed-venues.mjs               Warsaw + Gdańsk 20-venue seed
  check-publication.mjs         Verify Realtime publication membership
  check-replication.mjs         Replication slot diagnostic
tests/unit/                     balance.test.ts (15) + elo.test.ts (25)
messages/                       tr.json (default) en.json pl.json
docs/decisions/                 ADR-0001..0004
public/                         halisaha-logo.svg, halisaha-wordmark.svg
design/                         Pitch-notation poster artifact (PDF + PNG + philosophy)
HALISAHA_SPEC.md                Source of truth (929 lines, 23 sections)
CHANGELOG.md
.env.example
vitest.config.ts
drizzle.config.ts
```

## Engineering principles (spec §3)

- TypeScript strict, **no `any`**. Use `unknown` + zod parse for unknown data.
- Server Components by default. `"use client"` only when interaction or a browser API is required.
- Form submission and mutation: Server Actions (no REST/GraphQL).
- Drizzle schema lives in a single file: `src/db/schema.ts`.
- Path alias: `@/*` → `./src/*`. No `../../..`.
- Every public route is locale-prefixed (`/tr`, `/en`, `/pl`); default TR.
- Database stores `timestamptz`. UI converts to the user's TZ on render (date-fns-tz, Europe/Warsaw default).
- Server Action contract: `{ ok: true, data } | { ok: false, error, code }`.
- Read vs write split: public RLS for SELECT, mutations only via atomic SECURITY DEFINER RPCs.
- Realtime: tables broadcasting via postgres_changes use `REPLICA IDENTITY FULL` + `supabase_realtime` publication. RLS must be `TO anon, authenticated USING (...)` — `TO authenticated` only is silently dropped by the broadcaster (ADR-0004).
- Privacy: PII (lat/lng) is **not** in the public profile select list. Email is not in the schema (anonymous auth).
- `console.log` does not get committed. ESLint enforces `no-console` (warn/error allowed).

## Roadmap

1. Phase 0 — Bootstrap (Next + Supabase + Drizzle + i18n scaffolding) **[done]**
2. Phase 1 — Auth & Profile (Anonymous Auth + nickname, RLS, profile view/edit) **[done]**
3. Phase 2 — Venue & Map (20 real venues, MapLibre + OSM, geolocation, /venues + detail) **[done]**
4. Phase 3 — Event Core (event CRUD, /events feed + filters, /events/new form, detail + cancel) **[done]**
5. Phase 4 — RSVP (organizer-approval, JoinButton, pending requests, organizer auto-join, "My Events") **[done]**
6. Phase 5 — Real-time Chat (Supabase Realtime + ChatRoom + system messages + roster realtime sync) **[done]**
7. Phase 6 — Team Balancing (pure algorithm + 15 unit tests + drag-drop override + realtime sync) **[done]**
8. Phase 7 — Match Result + MVP + Elo (score, K=32 Elo, 7-day MVP voting, +10 bonus, skill_snapshot, 25 unit tests) **[done]**
9. Phase 8 — Stats & Profile (inline-SVG rating chart, W/L/D recent matches, /u/[username] public profile) **[done]**
10. Phase 9 — Polish (notifications, /legal/\*, cookie banner, skip-link, footer, deploy guide) **[done]**

Post-MVP backlog:

- Playwright E2E smoke (sign-up → join → balance → score → MVP)
- Lighthouse CI: ≥ 90 perf, ≥ 95 a11y
- Profanity filter (TR/EN/PL lists) + chat edit + emoji picker
- Auto-finalize MVP (cron job; spec §10 V3 — 7-day automation)
- "Save my account" — anonymous → email/Google linkIdentity (ADR-0002 upgrade path)
- Avatar upload (Supabase Storage)
- Sentry + Upstash rate-limit (replacing in-memory)

For detail see the roadmap file and `HALISAHA_SPEC.md` Section 20.

## License

Not yet decided — placeholder until post-MVP (spec §15.2).
