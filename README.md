# Halısaha

> Yakındaki pickup futbol maçını bul, katıl, dengeli takımlarda oyna, istatistiğini biriktir.

Gdańsk + Warsaw'da kullanıcının konumuna göre yakın açık etkinlikleri listeleyen, kadro dolduğunda **pozisyon-ağırlıklı otomatik takım dengeleme** yapan, etkinliğe özel **real-time chat** odası bulunan, maç sonrası skor + MVP oylanan, Elo-style skill rating tutan, GDPR/RODO uyumlu web uygulaması.

Spec dokümanı: [HALISAHA_SPEC.md](HALISAHA_SPEC.md) (source of truth — değiştirilmez, sorularda referans alınır).
Implementation roadmap: `~/.claude/plans/spec-dosyas-n-oku-gerekliyse-enumerated-mist.md`.

## Durum

**Phase 9 — Polish** tamamlanmak üzere (notifications + legal + a11y + cookie banner). Phase 0–9 detayı: [CHANGELOG.md](CHANGELOG.md).

## Mimari özet

```
┌─────────────────────────┐
│  Browser (Next.js 15)   │  Server Components default + client-only "use client"
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
│  │ + PostGIS  │  │ Anonymous   │  │ postgres_   │  │ (Phase 9 av) │ │
│  │            │  │             │  │  changes    │  │              │ │
│  └─────┬──────┘  └─────────────┘  └─────────────┘  └──────────────┘ │
│        │                                                              │
│        ▼                                                              │
│  RLS + SECURITY DEFINER RPC (advisory locks):                        │
│   join_event · approve/reject_participant · cancel_rsvp · save_teams │
│   submit_score · edit_score · submit_mvp_vote · finalize_mvp         │
│   mark_notification_read · derive_skill_level                        │
│                                                                       │
│  Trigger'lar: organizer auto-join · notification fan-out             │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack (kilitli, spec §2)

| Katman               | Seçim                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Framework            | Next.js 15.5.x (App Router, Server Components, Server Actions, Turbopack) — bkz. [ADR-0001](docs/decisions/0001-next-js-15-lock-in.md) |
| Runtime              | Node ≥ 22, TypeScript strict, `noUncheckedIndexedAccess`                                                                               |
| Auth + DB + Realtime | Supabase Cloud (Postgres + PostGIS + Auth + Realtime)                                                                                  |
| Auth modu            | Anonymous Auth + nickname (ADR-0002)                                                                                                   |
| ORM                  | Drizzle ORM + drizzle-kit (sadece tablo/enum/index — RLS manuel SQL)                                                                   |
| Styling              | Tailwind v4 (CSS-first config) + shadcn/ui konvansiyonu + lucide-react                                                                 |
| Forms                | react-hook-form + zod v4                                                                                                               |
| Server state         | TanStack Query v5                                                                                                                      |
| Drag-drop            | @dnd-kit/core + @dnd-kit/sortable (Phase 6)                                                                                            |
| Charts               | Pure SVG (Phase 8 — recharts'a alternatif)                                                                                             |
| i18n                 | next-intl (tr default / en / pl)                                                                                                       |
| Map                  | MapLibre GL JS + OpenStreetMap raster                                                                                                  |
| Geocoding            | Nominatim (Phase 9'a kadar yalnızca seed runbook)                                                                                      |
| Time                 | date-fns + date-fns-tz (Europe/Warsaw default)                                                                                         |
| Test                 | Vitest (40 unit test: 15 balance + 25 elo)                                                                                             |
| Package manager      | pnpm 10+                                                                                                                               |

## Önkoşullar

- Node 22+ (`node --version`)
- pnpm 10+ (`npm i -g pnpm@latest`)
- Git
- Supabase Cloud hesabı (https://supabase.com)
- Opsiyonel: psql CLI veya `node --env-file=.env.local scripts/apply-migration.mjs ...` ile migration apply

## Hızlı kurulum

```bash
pnpm install

# 1) Supabase Cloud projesi oluştur
#    Dashboard → New project (region: eu-central-1, RODO için)
#    Authentication → Providers → Anonymous Sign-Ins → Enable

# 2) .env.local
cp .env.example .env.local
# Düzenle:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  (browser-safe)
#   SUPABASE_SECRET_KEY                   (server-only, asla client'a verilmez)
#   DATABASE_URL                          (Transaction pooler 6543, region prefix doğru olmalı)
#   NOMINATIM_USER_AGENT                  (Phase 9 venue search için, opsiyonel)

# 3) Migration'ları sırayla uygula (Supabase SQL Editor veya:)
for f in supabase/migrations/*.sql; do
  node --env-file=.env.local scripts/apply-migration.mjs "$f"
done

# 4) Seed venue (Warsaw + Gdańsk · 20 gerçek saha)
node --env-file=.env.local scripts/seed-venues.mjs

# 5) Dev server
pnpm dev
# → http://localhost:3000 → /tr'ye yönlenir
# → İlk ziyarette JoinModal: nickname seç → anonymous auth + profile yarat
```

## Migration runbook

Migration'lar numaralı SQL dosyalarıdır (`supabase/migrations/000N_*.sql`). Her dosya idempotent değildir — bir kez uygulanır.

```bash
# Tek dosya
node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/0016_notifications.sql

# Hepsi (sıraylı)
for f in supabase/migrations/*.sql; do
  node --env-file=.env.local scripts/apply-migration.mjs "$f"
done

# Drizzle: schema değişikliklerinden migration üret
pnpm db:generate

# Drizzle: dev DB'ye direkt push (sadece local/staging)
pnpm db:push
```

> **Önemli:** RLS politikaları + SECURITY DEFINER RPC'ler + trigger'lar Drizzle schema'sında **değil**, manuel SQL dosyalarında. Drizzle sadece tablo/enum/index yönetir. RLS veya RPC değişikliği için yeni numaralı SQL dosyası ekle ve apply-migration.mjs ile uygula.

## Scripts

| Komut               | İş                                               |
| ------------------- | ------------------------------------------------ |
| `pnpm dev`          | Turbopack dev server (port 3000, çakışırsa 3002) |
| `pnpm build`        | Production build (Turbopack)                     |
| `pnpm start`        | Production server                                |
| `pnpm typecheck`    | `tsc --noEmit`                                   |
| `pnpm lint`         | ESLint                                           |
| `pnpm format`       | Prettier write                                   |
| `pnpm format:check` | Prettier check (CI)                              |
| `pnpm test`         | Vitest run (40 unit test)                        |
| `pnpm test:watch`   | Vitest watch                                     |
| `pnpm db:generate`  | Drizzle schema → migration                       |
| `pnpm db:push`      | Schema'yı doğrudan DB'ye uygula                  |
| `pnpm db:studio`    | Drizzle Studio                                   |

## Deployment (Vercel)

```bash
# Vercel CLI
pnpm i -g vercel
vercel link

# Production env vars (Settings → Environment Variables → Production):
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
#   SUPABASE_SECRET_KEY, DATABASE_URL, NEXT_PUBLIC_SITE_URL (final domain)
#   Opsiyonel: SENTRY_DSN, NOMINATIM_USER_AGENT

vercel --prod
```

Production checklist:

- [ ] Supabase Auth → Anonymous sign-ins **enabled**
- [ ] Supabase Realtime → publication tüm tablolar (event, event_participant, chat_message, team, team_assignment, match_result, mvp_vote, notification) ekli — `pnpm scripts/check-publication.mjs`
- [ ] Tüm migration'lar production DB'de uygulı (0001..0016)
- [ ] Seed venue çalışmış
- [ ] Privacy + Terms placeholder'ları gerçek metinle değiştirilmiş + `contact@halisaha.example` → gerçek e-posta
- [ ] Custom domain Vercel'de bağlı
- [ ] SSL aktif (Vercel otomatik)

## Klasör yapısı

```
src/
  app/[locale]/
    layout.tsx                  Inter font, NextIntlClientProvider, skip-link, footer, cookie banner
    page.tsx                    Landing + JoinModal
    events/(page,new,[id])/     Event feed + create + detail (RSVP/teams/score/MVP/chat hepsi tek sayfada)
    venues/(page,[id])/         Venue list + detail (yaklaşan event'lerle)
    profile/(page,edit)/        Self profile + edit
    u/[username]/               Public profile (read-only)
    legal/(privacy,terms)/      GDPR/RODO placeholder
  components/
    ui/                         shadcn primitives (Button, Input, Label, Dialog)
    auth/                       JoinModal, geolocation prompt
    event/                      EventForm, EventCard, JoinButton, RosterList, PendingRequests,
                                ChatRoom, TeamPanel, TeamBuilder, ResultPanel, ScoreSubmitForm
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
    rate-limit.ts               In-memory (Phase 9'da Upstash opsiyonel)
    types.ts                    ActionResult contract
  db/
    index.ts                    Drizzle client (server-only)
    schema.ts                   Tek dosya — tüm tablolar (spec §5 birebir)
  i18n/
    routing.ts                  Locales, default, prefix
    request.ts                  getRequestConfig
    navigation.ts               Typed Link/router
  middleware.ts                 Supabase session refresh + i18n routing
supabase/migrations/            0001_profile..0016_notifications (16 SQL)
scripts/
  apply-migration.mjs           Tek dosya migration runner
  seed-venues.mjs               Warsaw + Gdańsk 20 venue
  check-publication.mjs         Realtime publication doğrulama
  check-replication.mjs         Replication slot diagnostic
tests/unit/                     balance.test.ts (15) + elo.test.ts (25)
messages/                       tr.json (default) en.json pl.json
docs/decisions/                 ADR-0001..0004
public/                         halisaha-logo.svg, halisaha-wordmark.svg
HALISAHA_SPEC.md                Source of truth (929 satır, 23 section)
CHANGELOG.md
.env.example
vitest.config.ts
drizzle.config.ts
```

## Geliştirme prensipleri (spec §3)

- TypeScript strict, **`any` yok**. Bilinmeyen veride `unknown` + zod parse.
- Server Components default. `"use client"` sadece interaction / browser API gerektiğinde.
- Form submission ve mutation: Server Actions (REST/GraphQL yok).
- Drizzle schema tek dosya: `src/db/schema.ts`.
- Path alias: `@/*` → `./src/*`. Hiç `../../..` yok.
- Tüm public route'lar locale prefix'li (`/tr`, `/en`, `/pl`); default TR.
- Database'de `timestamptz`. UI'a render ederken kullanıcı TZ'ine convert (date-fns-tz, Europe/Warsaw default).
- Server Action contract: `{ ok: true, data } | { ok: false, error, code }`.
- RLS ve SECURITY DEFINER RPC ayrımı: read public RLS, write yalnızca atomic RPC üzerinden.
- Realtime: postgres_changes ile herkese yayılan tablolar `REPLICA IDENTITY FULL` + `supabase_realtime` publication. RLS `TO anon, authenticated USING (...)` — sadece authenticated yazmak broadcaster davranışı yüzünden çalışmaz (ADR-0004).
- Privacy: PII (lat/lng) public profile select listesinde **yok**. Email schema'da yok (anonymous auth).
- `console.log` commit'lenmez. ESLint kuralı `no-console` (warn/error allow).

## Roadmap

1. Phase 0 — Bootstrap (Next + Supabase + Drizzle + i18n iskeleti) **[tamam]**
2. Phase 1 — Auth & Profile (Anonymous Auth + nickname, RLS, profile view/edit) **[tamam]**
3. Phase 2 — Venue & Map (20 gerçek venue, MapLibre + OSM, geolocation, /venues + detay) **[tamam]**
4. Phase 3 — Event Core (event CRUD, /events feed + filtre, /events/new form, detay + iptal) **[tamam]**
5. Phase 4 — RSVP (organizer-approval, JoinButton, pending requests, organizer auto-join, "Etkinliklerim") **[tamam]**
6. Phase 5 — Real-time Chat (Supabase Realtime + ChatRoom + system messages + roster realtime sync) **[tamam]**
7. Phase 6 — Team Balancing (pure algoritma + 15 unit test + drag-drop override + realtime sync) **[tamam]**
8. Phase 7 — Match Result + MVP + Elo (skor, K=32 Elo, 7-gün MVP, +10 bonus, skill_snapshot, 25 unit test) **[tamam]**
9. Phase 8 — Stats & Profile (rating chart inline SVG, recent matches W/L/D, /u/[username] public profile) **[tamam]**
10. Phase 9 — Polish (notifications, /legal/\*, cookie banner, skip-link, footer, deploy guide) **[tamam]**

Phase 9 backlog (post-MVP polish):

- Playwright E2E smoke (sign-up → join → balance → score → MVP)
- Lighthouse CI ≥ 90 perf, ≥ 95 a11y
- Profanity filter (TR/EN/PL küfür listesi) + edit message + emoji picker
- Auto-finalize MVP (cron job; spec §10 V3 7-gün otomasyon)
- "Save my account" — anonymous → email/Google linkIdentity (ADR-0002 upgrade path)
- Avatar upload (Supabase Storage)
- Sentry + Upstash rate-limit (in-memory yerine)

Detay için bkz. roadmap dosyası ve `HALISAHA_SPEC.md` Section 20.

## Lisans

(MVP sonrası belirlenecek — `Legal.terms.placeholder`. Spec §15.2.)
