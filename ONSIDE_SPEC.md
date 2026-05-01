# ONSIDE — Build Specification (AI Editor Prompt)

> **Bu dokümanı bir bütün olarak AI editöre (Cursor / Claude Code / v0 / Lovable / Bolt) ver.**
> Tüm bölümleri uçtan uca oku. Spec'in sustuğu yerlerde **varsay, bana sor — uydurma**. Edge case'ler ile acceptance criteria çatışırsa, edge case kazanır. Section 0–4 zorunlu kontekstinden önce kod yazma.

---

## 0. Mission & North Star

**Onside**, kullanıcının konumuna göre yakındaki açık pickup futbol etkinliklerini bulup 2 dokunuşta katıldığı, kadro dolduğunda **pozisyon-ağırlıklı otomatik takım dengeleme** yapan, maç boyunca o etkinliğe özel **real-time chat** odası bulunan, maç bittikten sonra skor ve MVP oylanan bir web uygulaması.

**Tek cümle:** _Yakındaki pickup futbol maçını bul, katıl, dengeli takımlarda oyna, istatistiğini biriktir._

**Birinci sınıf kullanıcı deneyimi (north-star journey):**

1. Kullanıcı app'i açar → ana sayfa harita + liste view, kullanıcı konumunda yakın etkinlikler.
2. Bir etkinliğe tıklar → tarih/saat, saha, skill seviyesi, kadro doluluğu (8/10), oyuncu listesi, kalan pozisyon ihtiyaçları görünür.
3. "Katıl" → pozisyon seç (eğer profilinde yoksa) → onay. Anında kadroda görünür.
4. Etkinlik chat odasına otomatik dahil olur. Real-time mesajlar.
5. Kadro dolduğunda organizatör "Takımları oluştur" butonuna basar → algoritma çalışır → kullanıcı hangi takımda olduğunu görür.
6. Maç sonrası organizatör skoru girer, oyuncular MVP oylar, skill puanları otomatik güncellenir.

### Brand & Identity

- **İsim:** Onside (final — placeholder değil)
- **Logo:** Basit, top-down futbol sahası ikonu. Asset `/public/onside-logo.svg` (icon-only, 64×64 viewBox) ve `/public/onside-wordmark.svg` (icon + "Onside" yazı, header için).
- **Brand color (primary):** `emerald-600` → `#059669` (turf yeşili). Tailwind config'de `theme.colors.brand` olarak alias: `brand-DEFAULT: #059669`, `brand-foreground: #ffffff`.
- **Accent (CTA):** `amber-500` → `#f59e0b` (skor/MVP highlight için)
- **Typography:** **Inter** (variable font, `next/font/google`). Display weight: 700, body: 400/500.
- **Logo kullanım kuralı:** Header'da wordmark; favicon, mobile bottom-bar, share-card meta image'da icon-only.
- **Dark mode:** zorunlu (Tailwind `dark:` class strategy). Primary dark mode'da `emerald-500` (#10b981) kullan.

### Pazar (Hedef şehirler — MVP)

Gdańsk + Warsaw. **İstanbul YOK** (sonraki faz). `country_code` schema'da var ama seed sadece `'PL'`. UI'da şehir seçici sadece bu iki şehir için görünür.

---

## 1. Out of Scope (MVP'de YOK — yapma)

Aşağıdakileri **kodlama**. Schema bunlara genişlemeye **müsait olsun** ama UI/route/business logic yok:

- ❌ Real-money payments (Stripe yok, fee splitting yok, IOU yok)
- ❌ Recurring / weekly events (her etkinlik tek seferlik)
- ❌ Waitlist / yedek listesi (kapasite dolunca "Katıl" butonu disable olur, kuyrukta tutmuyoruz)
- ❌ No-show penalty / reputation scoring (attendance tracking var ama ceza yok)
- ❌ Push notifications, email, SMS, WhatsApp (sadece in-app realtime)
- ❌ Saha rezervasyonu / saha sahibi paneli (sahalar **read-only katalog**)
- ❌ Group / friend list / invite link / private events (her etkinlik public)
- ❌ Photo upload / post-game galeri
- ❌ Multi-sport (sadece futbol — `sport` kolonu **var** ama enum'da sadece `'football'`)
- ❌ Web push, native mobile app, PWA install prompt
- ❌ Admin paneli (CMS yok — moderation için sadece basit `is_hidden` flag yeter)

**Schema-only future-proofing:** `event.kind`, `event.is_recurring`, `event.parent_event_id`, `payment_status`, `participant.no_show_count` kolonlarını **nullable / default** olarak ekle ama UI'da gösterme.

---

## 2. Tech Stack (Kilitli — değiştirme)

| Katman                         | Seçim                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Framework                      | **Next.js 15** (App Router, Server Components, Server Actions)                              |
| Runtime                        | Node 22, TypeScript **strict**                                                              |
| Auth + DB + Realtime + Storage | **Supabase** (Postgres + Auth + Realtime + Storage)                                         |
| ORM                            | **Drizzle ORM** (migrations: `drizzle-kit`, runtime: `drizzle-orm/postgres-js`)             |
| Styling                        | Tailwind CSS v4 + **shadcn/ui**                                                             |
| Forms                          | react-hook-form + **zod**                                                                   |
| Server state                   | TanStack Query v5                                                                           |
| Client state                   | Zustand (sadece gerekliyse — UI ephemeral state için)                                       |
| Map                            | **MapLibre GL JS** + OpenStreetMap raster/vector tiles. **Mapbox/Google Maps yok.**         |
| Geocoding                      | **Nominatim** (OSM, ücretsiz). Cache 30 gün. Rate limit 1 req/sec.                          |
| Time/Date                      | `date-fns` + `date-fns-tz`. Default TZ: `Europe/Warsaw`, kullanıcı browser'dan auto-detect. |
| i18n                           | **next-intl** — diller: `tr` (default), `en`, `pl`                                          |
| Validation                     | zod (her yerde — Server Action, route handler, form)                                        |
| Error monitoring               | Sentry (env var placeholder; build-time gerekli değil)                                      |
| Package manager                | **pnpm** (`packageManager` in package.json)                                                 |
| Deployment                     | Vercel + Supabase Cloud                                                                     |

**Yasaklı:** moment.js, axios (native fetch + TanStack), redux, lodash (kullanma — micro-utils yaz), CSS-in-JS (Tailwind only).

---

## 3. Coding Standards & Architecture Rules

1. **TypeScript strict, no `any`.** Bilinmeyen yerlerde `unknown` + zod parse.
2. **Server Components default.** "use client" sadece interaction, browser API veya 3rd-party lib gerektirdiğinde.
3. **Server Actions** form submission ve mutation için. REST/GraphQL yok. Karmaşık veri gerektiren client component'ler TanStack Query → Route Handler.
4. **Drizzle schema** `db/schema.ts` tek dosya. Migrations otomatik generate.
5. **Folder layout:**
   ```
   /app
     /[locale]
       /(public)/page.tsx           # ana sayfa (harita+liste)
       /(public)/events/[id]/page.tsx
       /(public)/venues/page.tsx
       /(public)/venues/[id]/page.tsx
       /(auth)/sign-in/page.tsx
       /(auth)/sign-up/page.tsx
       /(app)/dashboard/page.tsx    # auth-gated
       /(app)/profile/page.tsx
       /(app)/events/new/page.tsx
       /(app)/events/[id]/manage/page.tsx
     /api/
       /events/route.ts             # nadir; çoğunlukla server action
       /webhooks/...                # boş (MVP)
   /components
     /ui/                           # shadcn primitives
     /event/                        # EventCard, EventMap, JoinButton, ...
     /chat/                         # ChatRoom, MessageList, MessageInput
     /map/                          # MapView, EventPin, VenuePin
     /team-balancer/
   /db
     schema.ts
     index.ts                       # drizzle client
     queries/                       # reusable typed queries
   /lib
     /auth.ts
     /supabase/{server,client,middleware}.ts
     /balance/algorithm.ts          # team balancing (pure, testable)
     /elo.ts                        # post-match rating update
     /geo.ts                        # haversine, bbox
     /validation/                   # zod schemas
   /messages/{tr,en,pl}.json        # i18n
   /tests
     /unit/balance.test.ts
     /unit/elo.test.ts
     /e2e/...                       # Playwright (smoke only)
   ```
6. **Imports**: Path alias `@/`. No relative `../../..`.
7. **Naming**: Tables `snake_case`, TS `camelCase`. Drizzle handles mapping.
8. **Dates**: Database'de **timestamptz**. UI'a render edilirken kullanıcı TZ'ine convert.
9. **IDs**: Postgres'te `uuid` (`gen_random_uuid()`). URL'lerde de UUID.
10. **Error handling**: Server Action'lar `{ ok: true, data } | { ok: false, error: string, code: string }` döner. UI bunu type-narrow eder.
11. **No console.log in committed code.** Sentry veya yapılandırılmış logger.
12. **Tüm public route'lar** locale prefix'li: `/tr/...`, `/en/...`, `/pl/...`. Default redirect TR.

---

## 4. Personas & Roles

Open-events modeli, dolayısıyla **tek rol seti** (kapalı grup yok):

| Rol                  | Tanım                          | Permissions                                                                                                                       |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Guest** (anonim)   | Login yok                      | Etkinlik listesi/detayı **okuma**, harita görme. Katılma/chat yok.                                                                |
| **Player** (auth'lu) | Standart kullanıcı             | Etkinliklere katıl, kendi etkinliğini oluşturursa o etkinliğin organizer'ı olur, chat'e katıl, MVP oyla, kendi profilini düzenle. |
| **Organizer**        | Bir etkinliği oluşturan Player | Sadece **kendi etkinliği** üzerinde: edit, cancel, takım oluştur, skoru gir, oyuncu kick et, chat'i kilitle.                      |

**Önemli:** Sistem-wide admin rolü **MVP'de yok**. Sadece `app_metadata.role = 'admin'` Supabase'de manual set edilebilir; bu kullanıcı RLS bypass eder. UI yok.

---

## 5. Domain Model

### Entities (yüksek seviyede)

- **profile** — auth.users'a 1:1, oyuncu metadata
- **venue** — saha (read-only katalog, MVP'de seed)
- **event** — bir maç/etkinlik
- **event_participant** — kullanıcı ↔ etkinlik (RSVP)
- **team** — bir etkinlikteki takım (genellikle 2 tane: A ve B)
- **team_assignment** — participant ↔ team
- **chat_message** — etkinlik chat mesajı
- **match_result** — final skor
- **mvp_vote** — bir kullanıcının başka bir kullanıcıya verdiği MVP oyu
- **skill_snapshot** — Elo-style rating geçmişi (audit + analytics)
- **report** — chat moderation reports (basit)

### Database Schema (Postgres / Drizzle)

```typescript
// db/schema.ts (özet — AI editör tam yazsın)

// PostGIS enable: CREATE EXTENSION IF NOT EXISTS postgis;

export const positionEnum = pgEnum("position", ["GK", "DEF", "MID", "FWD"]);
export const skillLevelEnum = pgEnum("skill_level", [
  "beginner",
  "intermediate",
  "advanced",
  "pro",
]);
export const eventStatusEnum = pgEnum("event_status", [
  "draft", // organizer henüz publish etmedi (MVP'de skip — direkt 'open' aç)
  "open", // kayıt açık, kapasite dolmadı
  "full", // kapasite dolu
  "locked", // organizer takımları oluşturdu, artık katılım yok
  "in_progress", // start_at geçti
  "completed", // skor girildi
  "cancelled", // organizer iptal etti
]);
export const formatEnum = pgEnum("format", [
  "5v5",
  "6v6",
  "7v7",
  "8v8",
  "11v11",
]);
export const sportEnum = pgEnum("sport", ["football"]); // future-proof

export const profile = pgTable("profile", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(), // 3-20 chars, ^[a-z0-9_]+$
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  preferredPosition: positionEnum("preferred_position").notNull(),
  secondaryPosition: positionEnum("secondary_position"),
  skillLevel: skillLevelEnum("skill_level").notNull().default("intermediate"),
  skillRating: integer("skill_rating").notNull().default(1000), // Elo, range ~500-2000
  matchesPlayed: integer("matches_played").notNull().default(0),
  matchesWon: integer("matches_won").notNull().default(0),
  goalsScored: integer("goals_scored").notNull().default(0),
  mvpCount: integer("mvp_count").notNull().default(0),
  homeCity: text("home_city"),
  homeLat: doublePrecision("home_lat"), // optional (privacy)
  homeLng: doublePrecision("home_lng"),
  locale: text("locale").notNull().default("tr"),
  noShowCount: integer("no_show_count").notNull().default(0), // tracked, not enforced (MVP)
  isBanned: boolean("is_banned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const venue = pgTable("venue", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  countryCode: text("country_code").notNull(), // ISO 3166-1 alpha-2 ('PL', 'TR')
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  // PostGIS geography column for fast nearby queries:
  // location: geography('location', 'point', 4326) — Drizzle custom type
  surface: text("surface").notNull().default("artificial"), // artificial | grass | indoor
  hasFloodlights: boolean("has_floodlights").notNull().default(true),
  isCovered: boolean("is_covered").notNull().default(false),
  approxPricePerHour: integer("approx_price_per_hour"), // PLN, kullanıcı bilgilendirme amaçlı (currency yok — tek currency)
  externalUrl: text("external_url"), // saha kendi rezervasyon sitesi
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const event = pgTable("event", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizerId: uuid("organizer_id")
    .notNull()
    .references(() => profile.id, { onDelete: "restrict" }),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => venue.id, { onDelete: "restrict" }),
  title: text("title").notNull(), // "Çarşamba akşam halı sahası"
  description: text("description"),
  sport: sportEnum("sport").notNull().default("football"),
  format: formatEnum("format").notNull(),
  minSkillLevel: skillLevelEnum("min_skill_level")
    .notNull()
    .default("beginner"),
  maxSkillLevel: skillLevelEnum("max_skill_level").notNull().default("pro"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(), // formattan türetilir ama override edilebilir (örn 5v5 + 2 yedek = 12)
  minPlayersToConfirm: integer("min_players_to_confirm").notNull(), // genelde 2 * teamSize - 2
  status: eventStatusEnum("status").notNull().default("open"),
  isRecurring: boolean("is_recurring").notNull().default(false), // MVP: always false
  parentEventId: uuid("parent_event_id"), // future-proof
  isHidden: boolean("is_hidden").notNull().default(false), // moderation
  cancelledReason: text("cancelled_reason"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  notes: text("notes"), // "Top sahada var, forma getirin"
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const eventParticipant = pgTable(
  "event_participant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    position: positionEnum("position").notNull(), // bu maç için seçtiği pozisyon
    status: text("status").notNull().default("confirmed"), // confirmed | cancelled | no_show | attended
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("event_participant_event_profile_uq").on(
      t.eventId,
      t.profileId,
    ),
  }),
);

export const team = pgTable(
  "team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // 'A' | 'B'
    color: text("color").notNull(), // '#dc2626' | '#2563eb'
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("team_event_label_uq").on(t.eventId, t.label),
  }),
);

export const teamAssignment = pgTable(
  "team_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => eventParticipant.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex("team_assignment_participant_uq").on(t.participantId),
  }),
);

export const chatMessage = pgTable(
  "chat_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    kind: text("kind").notNull().default("text"), // text | system (e.g., "X joined")
    isDeleted: boolean("is_deleted").notNull().default(false), // soft delete (moderation)
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byEventTime: index("chat_message_event_time_idx").on(
      t.eventId,
      t.createdAt,
    ),
  }),
);

export const matchResult = pgTable("match_result", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .unique()
    .references(() => event.id, { onDelete: "cascade" }),
  scoreA: integer("score_a").notNull(),
  scoreB: integer("score_b").notNull(),
  recordedById: uuid("recorded_by_id")
    .notNull()
    .references(() => profile.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playerMatchStat = pgTable(
  "player_match_stat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    goals: integer("goals").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    attended: boolean("attended").notNull().default(true),
  },
  (t) => ({
    uniq: uniqueIndex("player_match_stat_event_profile_uq").on(
      t.eventId,
      t.profileId,
    ),
  }),
);

export const mvpVote = pgTable(
  "mvp_vote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    voterId: uuid("voter_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    voteeId: uuid("votee_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqVoter: uniqueIndex("mvp_vote_event_voter_uq").on(t.eventId, t.voterId),
    noSelfVote: check("no_self_vote", sql`voter_id <> votee_id`),
  }),
);

export const skillSnapshot = pgTable("skill_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profile.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").references(() => event.id, {
    onDelete: "set null",
  }),
  ratingBefore: integer("rating_before").notNull(),
  ratingAfter: integer("rating_after").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(), // 'match_won' | 'match_lost' | 'mvp_bonus'
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const report = pgTable("report", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => profile.id),
  targetMessageId: uuid("target_message_id").references(() => chatMessage.id),
  targetProfileId: uuid("target_profile_id").references(() => profile.id),
  reason: text("reason").notNull(), // 'spam' | 'harassment' | 'inappropriate' | 'other'
  notes: text("notes"),
  status: text("status").notNull().default("pending"), // pending | resolved | dismissed
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

### Constraints & Indexes

- `event.start_at < event.end_at` — CHECK constraint
- `event.capacity >= 4 AND capacity <= 30` — CHECK
- `event.min_players_to_confirm <= event.capacity` — CHECK
- Spatial index on `venue.location` (PostGIS GIST)
- BTREE index on `event.start_at` (range queries için)
- Composite index `event(status, start_at)` (homepage feed)
- `chat_message(event_id, created_at)` zaten yukarıda

---

## 6. RLS (Row-Level Security) Policies — Supabase

**RLS HER TABLE'DA AÇIK olsun.** Sonra policy'leri yaz:

| Table                     | SELECT                                                                          | INSERT                                                                           | UPDATE                                                      | DELETE                                                     |
| ------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `profile`                 | `true` (public) — ama hassas alanlar (home_lat/lng, no_show_count) sadece kendi | sign-up trigger ile                                                              | sadece `auth.uid() = id`                                    | yok                                                        |
| `venue`                   | `true`                                                                          | sadece admin                                                                     | sadece admin                                                | sadece admin                                               |
| `event`                   | `is_hidden = false OR organizer_id = auth.uid()`                                | auth'lu kullanıcı `organizer_id = auth.uid()` ile                                | sadece organizer                                            | sadece organizer (status='cancelled' yap, hard delete yok) |
| `event_participant`       | event görünüyorsa görünür                                                       | `profile_id = auth.uid()` ve event 'open' ise                                    | kendi RSVP'ini cancel edebilir VEYA organizer kick edebilir | hard delete yok, status='cancelled'                        |
| `team`, `team_assignment` | event görünüyorsa görünür                                                       | sadece organizer                                                                 | sadece organizer                                            | sadece organizer                                           |
| `chat_message`            | event'e katılımcıysa VEYA organizer ise                                         | event'e katılımcıysa, `sender_id = auth.uid()`, event status `cancelled` değilse | kendi mesajını 5dk içinde edit edebilir                     | sender_id = auth.uid() VEYA organizer (soft delete)        |
| `match_result`            | event görünüyorsa görünür                                                       | sadece organizer, event status='in_progress' veya 'completed'                    | sadece organizer, 24 saat içinde                            | yok                                                        |
| `mvp_vote`                | sadece event'e katılımcı görür kendi oyunu, organizer count görür               | `voter_id = auth.uid()`, voter event'e attended, event 'completed'               | yok                                                         | yok                                                        |
| `skill_snapshot`          | sadece kendi snapshot'ları                                                      | trigger-only                                                                     | yok                                                         | yok                                                        |
| `report`                  | sadece kendi report'ları VEYA admin                                             | `reporter_id = auth.uid()`                                                       | sadece admin                                                | yok                                                        |

**Policy yazımı**: Helper SQL functions kullan — örn `is_event_participant(event_id uuid)` SECURITY DEFINER. RLS recursion'a dikkat.

**Edge case:** Bir kullanıcı banned ise (`profile.is_banned = true`), tüm INSERT/UPDATE policy'leri reddetmeli. Bunu her policy'ye ekleme — bir master function: `auth_user_active() RETURNS boolean`.

---

## 7. Auth

- **Supabase Auth** ile email + password **VE** Google OAuth.
- Apple OAuth: env varsa enable, yoksa skip.
- Email confirmation **zorunlu** (Supabase default).
- **Sign-up flow**: kayıt → email confirm → onboarding sayfası (username, display_name, preferred_position, skill_level kendi-değerlendirme) → dashboard.
- Username unique, lower-case, 3-20 char `[a-z0-9_]+`.
- **Profile auto-create trigger**: `auth.users` insert → `public.profile` insert (defaults).
- Middleware: protected route'lar `(app)` route group'ta. Sign-in yoksa `/sign-in?redirectTo=...`.
- Session: Supabase SSR cookies (`@supabase/ssr` paketi).

**Edge case:**

- Email değişirse: yeni email confirm gerekli, eski session geçerli kalır.
- Password reset: standart Supabase flow, custom email template (TR + EN + PL).
- Hesap silme: sadece self-serve, soft delete (profile.is_banned + email scrub) — hard delete RODO için 30 gün sonra background job (MVP: manual).

---

## 8. Geo & Map (MapLibre + OSM + Nominatim)

### Kullanıcı konumu

- İlk ziyarette browser geolocation **iste** (modal). Reddedilirse fallback: kullanıcı `home_city` veya manuel arama.
- Konum **client'ta** tutulur, server'a sadece "search bbox" olarak gider.

### Etkinlik feed sorgusu

- Endpoint: server action `getEvents({ bbox?, center?, radiusKm = 25, dateFrom, dateTo, format?, skill?, sort })`
- Postgres: `ST_DWithin(venue.location, ST_MakePoint(lng, lat)::geography, radiusKm * 1000)` veya bbox `ST_MakeEnvelope`.
- Limit 100 default, paginate.

### Map view

- MapLibre GL JS, OSM raster tiles default (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`). Attribution **görünür** olsun.
- Pin clustering (50+ event görüldüğünde).
- Pin tıklanınca alt yarıda card peek (mobile bottom sheet).
- Marker color: skill level'a göre (renk kodu fixed).

### Geocoding

- Nominatim (`https://nominatim.openstreetmap.org/search`).
- Rate limit: 1 req/sec per IP. Server-side proxy + 30-day cache (Postgres `geocode_cache` table).
- User-Agent header **zorunlu** ("Onside/1.0 contact@...").

### Edge case'ler

- Kullanıcı geolocation reddetti → varsayılan harita: **Warsaw merkez** (52.2297° N, 21.0122° E, zoom 11). Kullanıcı manuel olarak Gdańsk'a switch edebilir (header'da şehir dropdown — sadece bu iki şehir).
- Saha koordinatı yanlış (denizin ortasında) → admin manual fix; UI'da "Konum hatalı?" report butonu.
- Mobile cihazda GPS imprecise → 500m radius'lu uyarı circle göster.

---

## 9. Auto Team Balancing Algorithm

### Tetikleme

- Sadece organizer butona basınca (`POST /events/:id/balance`).
- Önkoşul: `event.status` = 'open' veya 'full', confirmed participant count ≥ `min_players_to_confirm`.
- Çıktı: takımlar oluşturulur, status = 'locked'.

### Algoritma — `lib/balance/algorithm.ts` (PURE FUNCTION, TESTABLE)

**Input:**

```typescript
type Player = {
  id: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  skillRating: number; // 500-2000
};
type Config = {
  teamSize: number; // 5, 6, 7, 8, 11
  maxIterations?: number; // default 5000
  positionWeight?: number; // default 0.4 (0..1)
};
```

**Output:**

```typescript
type Result = {
  teamA: Player[];
  teamB: Player[];
  metrics: {
    skillDiff: number; // |sumA - sumB|
    positionDiff: Record<Position, number>; // {GK: 0, DEF: 1, MID: 0, FWD: 1}
    overallScore: number; // composite, lower better
    iterations: number;
  };
};
```

**Pseudo-code:**

```
function balance(players, config):
  assert players.length == config.teamSize * 2  // exact even count
  assert exactly_one_GK_per_team_possible(players) or warn

  // Snake-draft seed (deterministic baseline)
  sortedBySkill = players.sortBy(skillRating, desc)
  teamA = []; teamB = []
  for i, player in enumerate(sortedBySkill):
    if (i // 1) % 2 == 0: teamA.push(player) else teamB.push(player)

  bestResult = evaluate(teamA, teamB, config)

  // Hill-climb with random swaps
  for iter in 1..maxIterations:
    candidateA = clone(bestResult.teamA)
    candidateB = clone(bestResult.teamB)
    swap_random_pair(candidateA, candidateB)
    candidate = evaluate(candidateA, candidateB, config)
    if candidate.overallScore < bestResult.overallScore:
      bestResult = candidate
    if bestResult.overallScore < EPSILON:  // good enough
      break

  return bestResult

function evaluate(teamA, teamB, config):
  skillDiff = abs(sum(teamA.skill) - sum(teamB.skill))
  positionDiff = {}
  for pos in [GK, DEF, MID, FWD]:
    positionDiff[pos] = abs(count(teamA, pos) - count(teamB, pos))
  positionPenalty = sum(positionDiff.values())
  // Composite: skill normalized (max ~teamSize*1500), pos normalized (max ~teamSize)
  overallScore =
    (1 - config.positionWeight) * (skillDiff / (config.teamSize * 500))
    + config.positionWeight * (positionPenalty / config.teamSize)
  return { teamA, teamB, metrics: { ... }, overallScore }
```

### Kuralları & garantiler

1. **Eşit sayı garantisi:** confirmed participant count `2 * teamSize` değilse algoritma çalışmaz; UI uyarır.
2. **Kaleci kuralı:** Eğer GK position'ı seçen oyuncu 0 ise UI uyarır ("Kaleci yok — birinin GK seçmesi lazım"). Eğer 1 ise iki takımdan biri kalecisiz olur — uyarı göster, organizer onaylar.
3. **Determinism for testing:** maxIterations = 5000, seed parameter (default `Math.random()`, test'lerde fixed seed).
4. **Performance:** 22 player için < 100ms.
5. **Manual override:** Auto sonrası organizer drag-drop ile manuel düzenler. UI'da `team-builder` component (HTML5 drag-drop, mobile için touch).

### Edge case'ler

| Durum                                              | Davranış                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tek sayıda oyuncu                                  | "Eşit dağıtılamıyor — 1 oyuncu eksik veya fazla" toast                                                                                               |
| Tüm oyuncular aynı pozisyon                        | Fonksiyon yine eşitler ama uyarı: "Pozisyon dengesi sağlanamadı"                                                                                     |
| Tüm skill aynı                                     | Random shuffle (farklı seed'lerde farklı) — bilinçli randomness                                                                                      |
| Maç başladıktan sonra                              | "Locked" status'te re-balance disabled                                                                                                               |
| Birinin RSVP'i locked olduktan sonra cancel olursa | Status 'open'a geri dönmez ama bu bir oyuncu eksik — UI organizer'a "Replacement gerekiyor" diyor; organizer ya manual yer doldurur ya 1 eksik oynar |

---

## 10. Skill Rating System (Elo-style)

- **Initial rating:** 1000 (Elo standart). Self-reported skill_level → initial rating mapping:
  - beginner: 800
  - intermediate: 1000
  - advanced: 1200
  - pro: 1400
- **K factor:** 32 (klasik Elo).
- **Match outcome:**
  - Kazanan: +K \* (1 - expected_score)
  - Kaybeden: -K \* expected_score
  - Beraberlik: K \* (0.5 - expected_score)
  - Expected score: `1 / (1 + 10^((opponentAvg - teamAvg) / 400))`
- **MVP bonus:** +10 (flat) — Elo'dan ayrı, additional.
- **Skill level recalculation:** Her 10 maçta bir `skillRating` → `skillLevel` mapping yenilenir:
  - <800 → beginner; 800–1099 → intermediate; 1100–1299 → advanced; ≥1300 → pro.
- Trigger: `match_result` insert → server action `applyEloUpdate(eventId)` çalışır → `skill_snapshot` insert + `profile.skill_rating` update.
- **Edge case:** Bir takım çok daha güçlüyse (rating diff > 200) ve kazanırsa, beklenen sonuç olduğu için kazananlar +2-5 alır, kaybedenler az kaybeder. Tersi durumda upset → +30, -30 gibi.

---

## 11. Match Lifecycle State Machine

```
                                                  ┌──→ cancelled (organizer iptal)
                                                  │
draft (skip) → open ──[capacity full]──→ full ────┼──→ locked ──[start_at geçti]──→ in_progress ──[organizer skor girer]──→ completed
                  ↑      ↓                         │
                  │ [participant cancel,            │
                  │  count < capacity]              │
                  └──────┘                          │
                                                    │
                                          [organizer "balance teams" basar]
```

### Geçiş kuralları (ZORUNLU acceptance criteria)

- `open → full`: confirmed_count == capacity olduğunda otomatik (DB trigger veya server action).
- `full → open`: Birisi cancel ederse confirmed_count < capacity olduğunda. **Eğer status = 'locked' veya sonrası ise geri dönüş YOK.**
- `open|full → locked`: organizer "Takımları oluştur" → balance algoritması → team kayıtları oluşur → status = 'locked'.
- `locked → in_progress`: scheduled job veya lazy check (page load'da `if now() > start_at`).
- `in_progress → completed`: organizer skor girer → match_result insert + Elo update.
- `* → cancelled`: organizer iptal edebilir (her status'ten). cancelled_reason zorunlu. Tüm participantlara chat'te system message: "Bu maç iptal edildi: <reason>".
- `cancelled → *` YOK.

### Edge case'ler

| Durum                                 | Davranış                                                                                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organizer hesabını silerse            | Event auto-cancel, system message                                                                                                                     |
| start_at geçti ama status hâlâ 'open' | Cron / lazy: status='cancelled', reason='Yeterli oyuncu toplanmadı' (eğer min_players_to_confirm karşılanmadıysa). Karşılandıysa status='in_progress' |
| Birisi 1 saat kala cancel ederse      | Allowed; status 'full' → 'open' geri döner; chat'te otomatik mesaj                                                                                    |
| 30 dakika kala cancel                 | Allowed (MVP'de penalty yok), ama UI uyarı: "Maça az kaldı, organizatör replacement bulmakta zorlanabilir"                                            |
| Maç bitti ama skor 24 saat girilmedi  | Status 'completed' olmadan kalır; UI'da organizer'a sürekli prompt                                                                                    |

---

## 12. Real-time Chat

### Mimarisi

- **Supabase Realtime** — `chat_message` tablosuna postgres_changes subscription, event_id filter.
- Channel: `event:{eventId}:chat`.
- Online presence: presence channel `event:{eventId}:presence` — kim chat ekranında.

### UI Component (`components/chat/ChatRoom.tsx`)

- Auth'lu ve event participant olan kullanıcı görür.
- Mesaj history son 100 mesajı server'da prefetch (Server Component) → realtime subscription client-side.
- Optimistic UI: gönderildi → instant render → ack gelince checkmark.
- Markdown DESTEKLEME (XSS riski). Sadece plain text + auto-link URL'ler (clickable, target=\_blank, rel=noopener).
- Emoji picker: shadcn-extension veya `emoji-mart`.

### Edge case'ler

| Durum                                  | Davranış                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Network kesildi                        | "Reconnecting..." banner; mesaj queue'lanır, online olunca gönderilir                                                                          |
| Profanity / hakaret                    | MVP: client-side basit kelime listesi (TR + EN + PL küfür filtresi) → mesaj gönderilirken UYARI "Bu mesajı göndermek istediğinden emin misin?" |
| Spam (5sn'de 5 mesaj)                  | Rate limit: per-user 1 mesaj/saniye, 10 mesaj/dakika                                                                                           |
| Birisi attığı mesajı silmek isterse    | 5 dakika window, soft delete, "[mesaj silindi]" gösterilir                                                                                     |
| Organizer chat'i kilitledi             | `event.chat_locked = true` (yeni alan ekle) → input disabled, "Chat organizer tarafından kilitlendi"                                           |
| Banned kullanıcı                       | RLS engeller, ayrıca client'ta `profile.is_banned` check                                                                                       |
| Event cancelled olduktan sonra         | Chat read-only                                                                                                                                 |
| Event completed olduktan 24 saat sonra | Chat read-only (sadece okuma)                                                                                                                  |
| Çok uzun mesaj                         | Max 1000 char, zod validation                                                                                                                  |
| @mention                               | MVP: yok. (User profile linkleri olabilir ama notification yok zaten.)                                                                         |

### Moderation

- Her mesajın yanında "..." menü → "Report message" → `report` insert.
- Organizer kendi event chat'inde "delete message" yetkisi.
- 3+ pending report alan kullanıcı için `is_banned = true` (auto, MVP'de manual SQL ile başlat).

---

## 13. Notifications (MVP — sadece in-app)

- **Push/email/SMS YOK.** Sadece in-app banner + counter.
- DB: `notification` tablosu (basit) — `recipient_id, kind, payload jsonb, read_at, created_at`.
- Kinds: `event_full`, `team_assignment`, `event_cancelled`, `match_completed`, `mvp_received`.
- Realtime subscription channel `notifications:{userId}`.
- UI: Header'da bell icon + badge count.

---

## 14. Internationalization (next-intl)

- Default locale: `tr`. Detected from browser; fallback `tr`.
- Routing: `/tr/...`, `/en/...`, `/pl/...`. Middleware redirect.
- Tüm user-facing string `messages/{locale}.json` içinde.
- **Date/time:** `date-fns-tz` ile kullanıcı timezone'una göre format. "23 Tem Çar 20:00" gibi.
- **Number:** Intl.NumberFormat (cüzdan tutarı vb yok ama saat formatı var).
- **Pluralization:** ICU plural — örn `{count, plural, one {# oyuncu} other {# oyuncu}}`.

### Edge case

- Polish locale: zorlu plural rules (one/few/many/other). next-intl ICU bunu destekler.
- TR'de pluralization çoğunlukla aynı (5 oyuncu / 1 oyuncu) ama yine ICU kullan.
- Saat formatı: TR/PL 24h default. EN 12h.

---

## 15. RODO / GDPR Compliance

Kullanıcı **AB'de** (Polonya). Aşağıdaki gerekli:

1. **Cookie banner** — sadece essential cookies kullanılıyor (Supabase auth session). Analytics yok (MVP). Banner: "Bu site sadece oturum cookie'si kullanır" + Tamam butonu.
2. **Privacy Policy & Terms** — `/legal/privacy` ve `/legal/terms` sayfaları (placeholder boilerplate, kullanıcı sonradan doldurur).
3. **Data export**: kullanıcı `/profile/data` sayfasında "Verilerimi indir" → JSON dump (profile + events + chat messages). Server action.
4. **Right to be forgotten**: "Hesabımı sil" → soft delete (instant) + 30 gün sonra hard delete (cron, MVP'de manual SQL).
5. **Geolocation onayı**: explicit consent. "Konumumu kullanma" reddedilebilir.
6. **Children**: 16+ yaş gerekli (PL, RODO). Sign-up'ta tarih doğum **isteme** (privacy concern) ama checkbox: "16 yaşından büyüğüm".
7. **Data minimization**: home_lat/home_lng nullable, kullanıcı isterse vermez.

---

## 16. Accessibility (WCAG 2.1 AA)

- Tüm interactive element keyboard accessible.
- Focus ring görünür (Tailwind `focus-visible:`).
- ARIA labels for icon-only buttons.
- Color contrast min 4.5:1.
- Form errors aria-live="polite".
- Semantic HTML: `<main>`, `<nav>`, `<article>`, heading hierarchy.
- Map view'a alternatif liste view her zaman erişilebilir.
- Skip-to-content link.

---

## 17. Performance Budget

- LCP < 2.5s on 4G mobile (Vercel deploy default config).
- Lighthouse mobile ≥ 90 (Performance, Accessibility, Best Practices).
- Bundle size: initial JS < 200KB gzipped (homepage). MapLibre lazy-load (sadece map sekmesinde).
- DB queries: critical path < 200ms p95. Index'ler doğru.
- Realtime channels: idle olunca disconnect (5 dakika).
- Image optimization: Next/Image, WebP.

---

## 18. Security

- RLS her tabloda (yukarıda).
- Server Action'larda **HER ZAMAN** zod validation.
- CSRF: Next.js Server Actions otomatik korur ama origin check ekle.
- XSS: React auto-escape; chat'te dangerouslySetInnerHTML **YASAK**.
- SQL injection: Drizzle parameterized queries; raw SQL sadece RLS helper functions'ta.
- Rate limiting: middleware'de per-IP `60 req/min`. Auth endpoints `10 req/min`. Upstash Redis (env varsa) yoksa in-memory map (single-instance OK MVP'de).
- Secrets: `.env.local` git-ignored. `.env.example` commit'lensin.
- Supabase service role key sadece server-side.

---

## 19. EDGE CASES MATRIX

> Bu bölüm acceptance criteria'lardan sayılır. Her satır için ya implement ya graceful fallback.

### Kayıt & Auth

| #   | Senaryo                                | Beklenen davranış                                    |
| --- | -------------------------------------- | ---------------------------------------------------- |
| A1  | Email zaten kayıtlı                    | "Bu email kayıtlı, giriş yap" link'i                 |
| A2  | Username çakışması                     | Real-time validation, alternative öner (`dogukan_2`) |
| A3  | Email confirm linkine tıklamadan giriş | "Email'ini onayla" banner; tüm action'lar disabled   |
| A4  | OAuth callback fail                    | "/sign-in?error=oauth_failed" — mesaj göster         |
| A5  | Session expired                        | Otomatik refresh; başarısızsa redirect /sign-in      |
| A6  | İki sekmede farklı hesap               | Son login kazanır; önceki sekme reload'da düzelir    |

### Etkinlik oluşturma & yönetimi

| #   | Senaryo                                  | Beklenen davranış                                                                            |
| --- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| E1  | Geçmiş tarih girilmiş                    | Form validation engeller; "Başlangıç gelecekte olmalı"                                       |
| E2  | end_at < start_at                        | Validation engeller                                                                          |
| E3  | start_at > 30 gün sonra                  | Validation engeller; "Maks 30 gün ileriye etkinlik aç"                                       |
| E4  | Aynı saha + aynı saatte 2 etkinlik       | UYARI ama izin ver (sahanın birden fazla pisti olabilir); organizer onayla                   |
| E5  | Capacity 4'ten az                        | Validation engeller (min 4 = 2v2)                                                            |
| E6  | Format 11v11 ama capacity 12             | Tutarlılık check; auto-suggest capacity = 22                                                 |
| E7  | Organizer sonradan venue/saat değiştirir | Tüm participantlara chat system message; eğer +24h değişiklikse "Yeniden onay gerekli" badge |
| E8  | Organizer kendi etkinliğine katılmamış   | UYARI: "Sen de katılmak istemez misin?" — opsiyonel                                          |
| E9  | Organizer 30dk kala cancel               | İzin ver; tüm participantlara system message; analytics flag                                 |

### Katılım

| #   | Senaryo                                              | Beklenen davranış                                                                |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| P1  | Kapasite dolu                                        | Join button disabled; "Kadro dolu"                                               |
| P2  | Skill seviyesi event range dışında                   | UYARI "Bu etkinlik <min>-<max> seviyesi için" + onayla butonu (override allowed) |
| P3  | start_at < now                                       | Join engellenir                                                                  |
| P4  | Locked event'e join                                  | Engellenir; "Takımlar oluşturulmuş"                                              |
| P5  | Banned user                                          | Tüm join'ler reddedilir, generic error                                           |
| P6  | Aynı event'e 2 kez join                              | DB unique constraint engeller; idempotent — "Zaten kayıtlısın"                   |
| P7  | Cancel + tekrar join (1 saat içinde)                 | İzin var; ama 3'ten fazla cancel-rejoin pattern'ı = abuse, log                   |
| P8  | Locked'tan sonra cancel                              | İzin ver ama UYARI: "Takım dengen bozulacak"; organizer'a notification           |
| P9  | Etkinlik cancel olduktan sonra cancel butonuna basma | No-op                                                                            |

### Takım dengeleme

| #   | Senaryo                             | Beklenen davranış                                                                       |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| T1  | Tek sayıda oyuncu                   | "1 oyuncu eksik/fazla" — organizer ya bekler ya manual karar                            |
| T2  | 0 GK                                | UYARI; algoritma yine çalışır (her takımda forvet/orta saha) ama "Kaleci atayın" prompt |
| T3  | 1 GK                                | UYARI; bir takım kalecisiz olur                                                         |
| T4  | Tüm aynı pozisyon                   | Algoritma çalışır, sadece skill'e göre denger                                           |
| T5  | Tüm aynı skill                      | Random shuffle                                                                          |
| T6  | Locked'ta birisi cancel ederse      | Status 'locked' kalır; UI'da "Replacement gerekli — manual ekle"                        |
| T7  | Re-balance (organizer tekrar basar) | İzin ver; eski team_assignment'lar silinir, yenisi                                      |
| T8  | Algoritma > 5sn sürerse             | Timeout, fallback snake-draft döner; UI bildirir                                        |

### Maç & sonuç

| #   | Senaryo                                          | Beklenen davranış                                                                |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| M1  | Skor negatif veya >50                            | Validation engeller (0..30)                                                      |
| M2  | Organizer skoru 24 saat sonra giriyor            | İzin ver; ama timestamp delta görünür                                            |
| M3  | Organizer skor girdikten sonra düzeltmek isterse | 24 saat içinde edit izinli; sonra lock; sonrası için report mekanizması          |
| M4  | Bir kullanıcı no-show ama maç oynandı            | Organizer `attended=false` flag'ler; Elo update'te o kullanıcı dahil edilmez     |
| M5  | Maç hava nedeniyle yarıda kesildi                | Organizer "Maçı iptal et" → status='cancelled', reason='abandoned'; Elo etki yok |
| M6  | Beraberlik                                       | Standart Elo: her iki takım expected'tan sapmaya göre +/-                        |

### MVP oylama

| #   | Senaryo                               | Beklenen davranış                                     |
| --- | ------------------------------------- | ----------------------------------------------------- |
| V1  | Kullanıcı kendine oy verirse          | DB CHECK engeller                                     |
| V2  | Aynı kullanıcı 2 oy                   | DB unique constraint; UPDATE allowed (oy değişikliği) |
| V3  | Maç completed olduktan 7 gün sonra oy | Engelle; window 7 gün                                 |
| V4  | Sadece 1 oy gelirse                   | O kullanıcı MVP, +10                                  |
| V5  | Tie (2 kişi eşit oy)                  | Organizer kararı; UI'da prompt; default: random       |
| V6  | Hiç oy yoksa                          | MVP yok; o etkinlik için MVP NULL                     |

### Real-time chat

| #   | Senaryo                        | Beklenen davranış                                  |
| --- | ------------------------------ | -------------------------------------------------- |
| C1  | Network kesik mesaj            | Local queue + retry, "sending" indicator           |
| C2  | Aşırı uzun mesaj (1000+ char)  | Validation kes                                     |
| C3  | Spam (saniyede 5 mesaj)        | Rate limit, "yavaşla" toast                        |
| C4  | Profanity                      | Client uyarı + send onayı                          |
| C5  | Banned user mesaj attı         | RLS reddeder, generic error                        |
| C6  | Mesajı silindi                 | "[mesaj silindi]" placeholder                      |
| C7  | URL injection                  | Auto-link, target=\_blank, rel=noopener noreferrer |
| C8  | Resim/file paste               | MVP: yoksay (file upload yok)                      |
| C9  | Çok eski mesaj infinite scroll | 50'şer page-load                                   |

### Harita & geo

| #   | Senaryo                    | Beklenen davranış                            |
| --- | -------------------------- | -------------------------------------------- |
| G1  | Geolocation reddedildi     | Şehir merkezi default; manuel arama          |
| G2  | Tile sunucu down           | "Harita yüklenemedi" + liste view'a fallback |
| G3  | Saha koordinatı yanlış     | "Konum hatalı?" report butonu                |
| G4  | Kullanıcı offline          | Liste view cache'den; map disabled           |
| G5  | Çok geniş bbox (tüm dünya) | Sınırla: max 100km radius                    |

### Genel sistem

| #   | Senaryo                                                   | Beklenen davranış                                                                   |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| S1  | Database connection lost                                  | UI: "Bağlantı sorunu, tekrar deneniyor" + auto retry                                |
| S2  | Realtime channel max connection (Supabase limit)          | Graceful fallback: polling 10sn                                                     |
| S3  | Time zone değişikliği (yaz/kış saati)                     | date-fns-tz auto-handle; etkinlik saat **lokal** olarak gösterilir                  |
| S4  | Kullanıcı locale'i değiştirdi                             | URL prefix değişir; i18n cookie set; full reload                                    |
| S5  | Etkinlik full ama 1 oyuncu cancel etti, hemen birisi join | Race condition: SELECT FOR UPDATE veya optimistic concurrency (ETag/version column) |
| S6  | Çift sekmede aynı join                                    | Idempotent — unique constraint sayesinde 2.si reddedilir, UI bildirir               |
| S7  | Drizzle migration prod'da fail                            | Rollback runbook; pre-deploy migration smoke test                                   |

---

## 20. Phased Delivery Plan (AI editör için sırayla yap)

**Phase 0 — Bootstrap (1 PR)**

- Next.js 15 init, TypeScript strict, Tailwind v4, shadcn/ui, ESLint, Prettier, pnpm.
- Supabase client setup (server, client, middleware).
- Drizzle config + ilk migration (boş).
- next-intl boilerplate (TR + EN + PL klasörleri, sample message).
- `.env.example`, README.

**Phase 1 — Auth & Profile**

- Email + Google sign-up/in.
- Profile auto-create trigger.
- Onboarding form (username, position, skill).
- `/profile` view & edit.
- RLS policies for `profile`.

**Phase 2 — Venue & Map**

- `venue` table + seed (Gdańsk ve Warsaw için ~10'ar gerçek halısaha = 20 venue total). Seed'de mock değil **gerçek** sahalar (Google'da arat — Orlik'ler, ticari halısahalar). Saha bilgisi yanlış ya da değişmişse README'de "seed güncelleme runbook"u olsun.
- `/venues` liste (şehir filtreli).
- MapLibre integration, OSM tiles, Warsaw default center.
- Geolocation prompt + fallback.
- Nominatim proxy + cache.

**Phase 3 — Event Core**

- Event CRUD (organizer create / edit / cancel).
- Event detail page.
- RLS policies.
- Anasayfa: harita + liste view, filtre (tarih, format, skill, distance).

**Phase 4 — RSVP**

- Join / cancel join.
- Capacity check, status auto-transition.
- Position selection.
- Participant list UI.

**Phase 5 — Real-time Chat**

- ChatRoom component.
- Realtime subscription.
- Mesaj history + pagination.
- Rate limiting + profanity filter.
- Soft delete, report.

**Phase 6 — Team Balancing**

- Algorithm in `lib/balance/algorithm.ts`.
- Unit tests (10+ test case, edge case'ler dahil).
- "Takımları oluştur" UI (organizer).
- Manual override drag-drop.
- Team display in event detail.

**Phase 7 — Match Result & MVP**

- Score entry (organizer).
- MVP voting UI.
- Elo update on match complete.
- Skill snapshot history.

**Phase 8 — Stats & Profile**

- Profile sayfasında matches played/won, goals, MVPs.
- Public profile (basic).
- Skill rating chart (recharts).

**Phase 9 — Polish**

- Accessibility audit.
- Performance budget check.
- E2E smoke (Playwright): sign-up → create event → join → chat → balance → result.
- README finalize, deploy guide.

---

## 21. Definition of Done (her phase için)

- [ ] TypeScript compiles, no `any`.
- [ ] ESLint passes.
- [ ] Phase'in spec'teki acceptance criteria'sı + edge case'leri implemente.
- [ ] Phase'in core logic'i için unit test (özellikle balance, elo).
- [ ] Phase'in happy path'i Playwright smoke'ta test edilmiş.
- [ ] i18n: TR + EN + PL key'leri eksiksiz.
- [ ] Mobile (375px) ve desktop (1440px) responsive.
- [ ] Lighthouse Performance ≥ 85, Accessibility ≥ 95.
- [ ] RLS policy'leri active ve test edilmiş.
- [ ] README'de phase ile ilgili yeni env var ve setup adımı.

---

## 22. AI Editor için Çalışma Modu

1. **Önce bu dokümanı baştan sona oku.** Sonra `README.md` çıkart — proje overview, run instructions, env vars.
2. **Phase 0'ı çalıştırılabilir bir state'e getir.** İlk commit.
3. **Her phase için:**
   - Önce DB schema değişikliği + migration.
   - Sonra RLS policy'leri.
   - Sonra server action / API.
   - Sonra UI component'ler (Server Component first).
   - Sonra unit/integration test.
   - Sonra acceptance criteria + edge case checklist.
4. **Belirsizlik durumunda:** SORU SOR. Uydurma. Aşağıdaki konularda mutlaka sor:
   - Saha/şehir seed data (kaç şehir, hangileri)
   - Logo/branding
   - Default uygulama dili önceliği (locale)
   - Maç fiyatı UI'da gösterilsin mi (out-of-scope ama saha'da `approxPricePerHour` var)
5. **Mock yok, fake data yok.** Boş state'leri designle.
6. **Her phase sonunda KISA changelog yaz** — `/CHANGELOG.md`.
7. Commit messaging: Conventional Commits (`feat:`, `fix:`, `chore:`).
8. **Önemli karar verirken `/docs/decisions/NNN-title.md` ADR yaz.**

---

## 23. Confirmed Decisions (Implement öncesi cevaplar)

| Soru                  | Karar                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Şehir scope (MVP)** | Gdańsk + Warsaw (sadece). İstanbul ve diğerleri sonraki faz.                                                              |
| **Branding & isim**   | "Onside" (final). Logo: basit top-down futbol sahası SVG (`/public/onside-logo.svg`). Brand color: emerald-600 (#059669). |
| **Currency**          | Tek currency — **PLN**. Schema'da `currency` kolonu YOK (UI'da hardcoded "zł").                                           |
| **Captain**           | YOK. `team_assignment.is_captain` kolonu **silindi**. Sadece team A / team B + oyuncular.                                 |
| **Min yaş**           | 16+ (RODO için yeterli). Sign-up'ta tek checkbox: "16 yaşından büyüğüm." Doğum tarihi **istenmez** (data minimization).   |

Bu beş karar SPEC'in geri kalanına işlendi (schema, seed, UI). Yeni soru çıkarsa Section 22'deki çalışma modu uyarınca implement etmeden sor.

---

**SON.** Bu spec'in herhangi bir kısmı muğlak gelirse implement etmeden önce sor. Kod çıktığında her server action ve component'in başında 2-3 satırlık doc-comment olsun. README ile başla.
