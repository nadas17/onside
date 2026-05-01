# Changelog

Bu proje [Keep a Changelog](https://keepachangelog.com/) formatına ve [Semantic Versioning](https://semver.org/) sürüm numaralandırmasına uyar.

## [Unreleased]

### Phase 9 — Polish (notifications, legal, a11y) (2026-04-30)

Spec §13 (notifications), §15.1 (legal/cookie), §16 (a11y), §17 (perf budget). E2E ve Lighthouse audit MVP sonrası backlog'a alındı (manual deploy gerektiriyor).

#### Eklendi

- **In-app notifications** (yeni özellik):
  - `notification` tablosu + 8 kind (rsvp_approved/rejected, event_full/cancelled, team_assignment, match_completed, mvp_received, chat_mention) + RLS (own-only) + realtime publication
  - **Trigger'lar** (spec §13 fan-out): event_participant status change, event status change (full/cancelled), team INSERT, match_result INSERT, match_result.mvp_profile_id UPDATE — hepsi SECURITY DEFINER, ekstra RPC kodu yok
  - 2 RPC: `mark_notification_read` + `mark_all_notifications_read`
  - Server actions: `getNotificationsAction`, `markNotificationReadAction`, `markAllNotificationsReadAction`
  - **NotificationBell** (`src/components/notification/notification-bell.tsx`): header dropdown, unread badge (9+ cap), realtime INSERT/UPDATE subscribe, outside-click close, ARIA roles + `aria-label` + dialog role
  - 8 kind için tr/en/pl başlık tercümeleri, event title navigasyon link'i
- **HeaderActions** (`src/components/header-actions.tsx`): bell + locale + theme bundle. Sayfaların hepsindeki duplicate header right-side `<LocaleSwitcher /> + <ThemeToggle />` pattern'ini tek yere çekti — 8 sayfa refactor (events list/new/detail, venues list/detail, profile, public profile, home).
- **Legal pages**:
  - `/[locale]/legal/privacy` (RODO/GDPR placeholder, 6 bölüm: collected, purpose, storage, retention, rights, contact)
  - `/[locale]/legal/terms` (5 bölüm: eligibility 16+, account anonymous, conduct, liability, changes)
  - Draft notice banner — production öncesi hukuk danışmanlığı zorunlu uyarısı
- **Cookie banner** (`src/components/cookie-banner.tsx`):
  - Essential-only (yalnızca Supabase auth session) — reject button yok, "Tamam" 1 yıl localStorage
  - Spec §15.1 uyumu, GDPR'a giren analytics/ads cookie yok
- **A11y polish** (root layout):
  - Skip-to-content link (focus ile görünür, focus-visible outline)
  - `<main id="main-content">` skip target
  - Footer: `<nav aria-label="Legal">` + privacy/terms link'leri
  - Tüm sayfa header'ları: skip link layout-level olduğu için her sayfada otomatik
  - Bell ARIA: `role="dialog"`, `aria-label`, `aria-label` count formatlı
- **i18n** (büyük paket): `A11y`, `Footer`, `Cookie`, `Notifications`, `Legal.privacy`, `Legal.terms`, `Legal.common` namespace'leri tr/en/pl (yaklaşık 80 anahtar)
- README finalize: mimari diyagramı (ASCII), full klasör yapısı, deployment guide (Vercel + production checklist), migration runbook, Phase 9 backlog listesi

#### Notlar

- **E2E ve Lighthouse**: Bu phase 9'a daha önce dahildi ama deploy gerektirdiği için MVP sonrasına ertelendi. Lokalde manuel test akışı tüm phase'ler boyunca kullanıldı.
- **Notification trigger choice**: RPC'leri (approve_participant, save_teams, vs.) değiştirmek yerine tablo-level trigger seçildi — RPC'ler immutable kalıyor, notification fan-out ayrı concern. Trade-off: trigger'lar `BEFORE/AFTER UPDATE OF status` filter'ı ile spam engeller.
- **Cookie banner**: Reject button yok çünkü essential-only — yarın analytics eklenirse opt-in toggle eklenecek. localStorage `onside:cookies-acked` key, 1 yıl TTL kavramı (gerçekte indef, ama timestamp ile audit edilebilir).
- **HeaderActions server-component**: NotificationBell client, ama wrapper server. Server tarafında auth.getUser + initial 30 notification fetch → client'a hydration data, sonra realtime subscribe. Anonymous user'da bell görünmez (auth.uid yoksa).
- **A11y skip-link CSS**: Tailwind `sr-only` + `focus:not-sr-only` pattern. Klavye ile Tab basıldığında görünür hale gelir, fare kullanıcısı için gizli.
- **Anonymous auth + GDPR**: PII minimum (UUID + nickname). Privacy policy bunu dürüstçe açıklıyor; email/IP toplamadığımızı öne çıkarıyor.

### Phase 8 — Stats & Profile (2026-04-30)

Spec §13 (profile aggregate stats), §15.3 (public profile privacy). Phase 7 yazdığı `profile.skill_rating/level/matches_played/matches_won/goals_scored/mvp_count` kolonları ve `skill_snapshot` history'sini görselleştirir; ayrı bir `/u/[username]` public profile sayfası.

#### Eklendi

- **Stats query helpers** (`src/lib/profile/stats-queries.ts`):
  - `getSkillHistoryAction(profileId, limit=50)` — `skill_snapshot` kronolojik (rating_before/after, delta, reason, event_id)
  - `getRecentMatchesAction(profileId, limit=10)` — `player_match_stat` + `match_result` batch'lenmiş, W/L/D/no_show outcome derive, MVP flag, Elo delta
- **RatingChart** (`src/components/profile/rating-chart.tsx`) — pure SVG line chart, dependency-free (~100 satır):
  - X ekseni: zaman, ilk/son tarih label
  - Y ekseni: rating, 4 grid çizgisi
  - Marker: match Elo brand renkli (2.5px), MVP bonus altın renkli (4px) — hover'da `<title>` tooltip
  - Empty state: tek rating ile placeholder
  - Bundle artışı yok (recharts'a alternatif olarak)
- **RecentMatches** (`src/components/profile/recent-matches.tsx`):
  - Outcome badge: W/L/D/N (lokalize) renkli
  - Skor "kullanıcı takımı önce" gösterilir (B'de oynayan için 3-2 → 3-2 değil, 2-3 görünür)
  - MVP'ler crown ikonuyla işaretli
  - Elo delta TrendingUp/Down ikonuyla
  - Goals "X gol" — sadece pozitifse render
  - Her satır event detay sayfasına link
- **`/profile`** — RatingChart + RecentMatches mevcut layout'a entegre, `Promise.all` ile paralel fetch
- **`/u/[username]`** public profile sayfası:
  - Read-only; `home_lat/lng` schema seviyesinde zaten select edilmiyor (privacy)
  - Username case-insensitive lookup (DB lowercase regex CHECK ile zaten enforce ediliyor)
  - Win rate yüzdesi banner
  - Aynı RatingChart + RecentMatches komponenti kullanılır
  - Düzenleme butonu yok (sadece kendisi kendi profili için `/profile`'da düzenler)
- i18n: `Stats.*` namespace tr/en/pl (10 anahtar): outcome.W/L/D/N farklı dillerde lokalize (tr: G/M/B/Y, en: W/L/D/N, pl: W/P/R/N)

#### Notlar

- **Aggregate kaynağı**: `profile.matches_played` vs `count(player_match_stat where attended)` arasında derive yerine denormalize seçildi — submit_score RPC her satırı tek tek update ediyor, double-count olmuyor (idempotent değil ama edit_score doğru kompanse ediyor). Phase 9'da reconciliation helper script eklenebilir.
- **Chart kütüphanesi seçimi**: Spec §13 recharts öneriyordu ama pure SVG yeterli (50 nokta için), bundle ~80KB tasarrufu. Polish'te ihtiyaç olursa swap edilebilir (component arayüzü `history: SkillPoint[]` üzerinden).
- **PII privacy**: Public profile select listesine `home_lat`, `home_lng` dahil değil; sadece `home_city` (kullanıcı kendisi yazdı). `email` zaten schema'da yok (anonymous auth). Spec §15.3 PII leak yasak gereği.
- **Public profile route prefix**: Spec'te `/[locale]/u/[username]`. `/p/[username]` daha kısa ama spec'i takip ettik.

### Phase 7 — Match Result + MVP + Elo (2026-04-30)

Spec §5 (match_result, player_match_stat, mvp_vote, skill_snapshot), §10 (Elo), §11 (state).

#### Eklendi

- **Pure-function Elo** (`src/lib/elo.ts`):
  - K=32, expected = 1/(1 + 10^((opp - own)/400))
  - Win/loss/draw aktör skor hesabı, MVP bonus flat +10
  - `deriveSkillLevel(rating)`: <800 beginner / 800–1099 intermediate / 1100–1299 advanced / ≥1300 pro
  - 25 unit test (klasik 400 fark = 10:1 odds, expA+expB=1, eşit takımlarda draw=0, dengesizde fav -delta, custom K, throw on invalid)
  - Toplam **40 test** geçer (Elo 25 + Balance 15)
- **DB**:
  - `match_result` — bir event tek satır (unique), score 0..30 CHECK, mvp_profile_id + mvp_finalized_at, edited_at
  - `player_match_stat` — (event, profile) unique, team_label, attended, goals, assists, elo_delta
  - `mvp_vote` — (event, voter) unique, no_self CHECK, upsertable
  - `skill_snapshot` — append-only Elo/MVP delta tarihçesi, reason ∈ {match, mvp_bonus, admin}
  - Migration 0015: tablolar + RLS (public read, RPC-only write) + 4 ana RPC + 1 helper + realtime publication
- **RPC'ler** (SECURITY DEFINER + advisory lock):
  - `submit_score(event_id, score_a, score_b, notes?)` — organizer-only, status `locked|in_progress`, idempotent değil (already_submitted reject), team_assignment olmalı, player_match_stat seed, profile.matches_played + matches_won + Elo apply, status='completed', sistem chat mesajı
  - `edit_score(...)` — 24 saat penceresi, eski Elo revert + yeni apply (skill_snapshot append), matches_won doğru hesap
  - `submit_mvp_vote(event_id, votee_id)` — 7 günlük pencere, voter+votee attended olmalı, no-self, voter başına tek oy (upsertable)
  - `finalize_mvp(event_id, votee_id?)` — organizer-only; otomatikte en yüksek vote, tie'da `code='tie'` döner ve organizer manuel `votee_id` ile tekrar çağırır; 0 vote'da MVP NULL kapatılır; +10 bonus, profile.mvp_count++, skill_snapshot
  - `apply_match_elo_internal(...)` — submit + edit içinde tekrar kullanılan helper; revert + reapply
  - `derive_skill_level(rating)` — IMMUTABLE, rating eşiklerinden enum üretir
- **Server actions** (`src/lib/event/result-actions.ts`): `submitScoreAction`, `editScoreAction`, `submitMvpVoteAction`, `finalizeMvpAction`, `getMatchResultAction`, `getMvpStateAction`
- **UI**:
  - `ScoreSubmitForm` (`src/components/event/score-submit-form.tsx`) — react-hook-form + zod, 0-30 arası iki sayı + opsiyonel not
  - `ResultPanel` (`src/components/event/result-panel.tsx`) — modlar:
    - **Skor öncesi (organizer + locked|in_progress + start_at geçti + teams var)**: "Skoru gir" CTA
    - **Skor öncesi + start_at geçmedi**: "Maç başladıktan sonra" placeholder
    - **Skor sonrası**: A vs B büyük skor display, kazanan takım brand renginde, "Skoru düzenle" (24h pencere)
    - **MVP voting (window açık)**: Aday listesi (attended), oy ver/değiştir, vote count
    - **MVP voting (window kapalı + finalize edilmemiş + organizer)**: "MVP'yi sonuçlandır" butonu; tie'da toast uyarı + adayların yanındaki taç ikonu ile manuel pick
    - **MVP finalize edildi**: Crown banner + winner display
  - Realtime: `event:{id}:result` channel, `match_result` + `mvp_vote` postgres_changes — herkes anlık skor + oy sayılarını görür
- Event detail sayfası: TeamPanel ile ChatRoom arasına `ResultPanel` yerleşti, parallel `Promise.all` getirme genişledi (5→7 fetch)
- i18n: `Result.*` (15 anahtar) + `Mvp.*` (15 anahtar) tr/en/pl
- `pnpm test`: 2 dosya, 40 test, hepsi yeşil; `pnpm build` + `pnpm lint` + `pnpm typecheck` temiz

#### Notlar

- **Edit penceresi (24h)**: Spec §10 M3 "ilk 24 saat içinde edit". RPC `submitted_at < now() - 24h` reddediyor. Edit'te eski Elo revert + reapply yaparak skill_snapshot history'sine yeni satır ekliyor (eski snapshot silinmez — append-only).
- **MVP otomatik kapatma**: Spec §10 V3 "7 gün". MVP `submitted_at + 7d` sonrası `votingOpen=false` olur ama **otomatik finalize edilmez**. Organizer manuel `finalize_mvp` çağırır. Cron-based auto-close Phase 9 backlog'unda.
- **Stat snapshot integrity**: profile.skill_rating + skill_level + matches_played + matches_won + mvp_count atomik update'ler RPC içinde. Re-edit Elo zincirinde matches_won eski/yeni kazanan delta'sı doğru kompanse ediliyor (was_draw / new_draw bayrak setleri).
- **No-show / partial attendance Phase 9'a ertelendi**: `player_match_stat.attended` default true. Organizer'ın no-show işaretlemesi için ayrı UI Phase 9 polish kapsamında. M4 edge case algoritmaca destekleniyor (attended=false Elo'dan düşer).
- **Status state machine `in_progress` lazy**: `lazyTimeBasedStatus` helper'ı `locked → in_progress` geçişini hesaplıyor ama otomatik DB update yok; `submit_score` RPC zaten `locked|in_progress` ikisini de kabul ettiği için pratikte sorun yok.

### Phase 6 — Team Balancing (2026-04-30)

Spec §5 (team + team_assignment), §9 (algorithm), §11 (state transition).

#### Eklendi

- **Pure-function balance algoritması** (`src/lib/balance/algorithm.ts`):
  - Snake-draft seed (pozisyon önceliği: GK→DEF→MID→FWD, sonra skill desc, deterministik tie-break)
  - Hill-climb pair-swap, 5000 iter (default), epsilon erken-çıkış
  - Composite score: `(1-w) · skillDiff/(teamSize·500) + w · positionPenalty/teamSize`, default `w=0.4`
  - Mulberry32 PRNG ile seed→deterministik
  - Warning detection: `no_goalkeeper`, `single_goalkeeper`, `odd_count`
  - Pure, I/O yok, throw if `< 4` oyuncu
- **15 unit test** (`tests/unit/balance.test.ts`, hepsi geçer):
  - Deterministic seed, GK warnings, odd count, < 4 throw
  - PositionWeight=0 → puro skill, positionWeight=1 → puro pozisyon dengelemesi
  - 22 oyuncu için < 100ms (spec §9.4 perf budget; lokalde ~5ms ölçüldü)
  - Player count + sum invariants
- **DB**: `team` + `team_assignment` tabloları
  - `team`: `(event_id, label)` unique, label A/B, seed + skill_total
  - `team_assignment`: `(event_id, profile_id)` unique → bir oyuncu bir takımda
  - Migration 0013: tablolar + RLS (public read, RPC-only write) + 2 RPC
  - Migration 0014: `supabase_realtime` publication'a ekle, `REPLICA IDENTITY FULL`
- **RPC'ler** (SECURITY DEFINER + advisory lock):
  - `save_teams(event_id, seed, jsonb_payload)` — organizer-only, status `open|full|locked`, kadro/duplicate validasyonu, eski team cascade-delete + yeni insert + `status='locked'` + system chat message
  - `unlock_teams(event_id)` — locked'tan geri al, confirmed count'a göre `open|full`'a çek
- **Server actions** (`src/lib/event/team-actions.ts`):
  - `computeAndSaveTeamsAction` — kadroyu çek + balance() + RPC
  - `saveTeamsAction` — manuel drag-drop sonucunu kaydet
  - `unlockTeamsAction` — kilidi aç (rebalance flow'unun ön adımı)
  - `getTeamsAction` — A/B + members read
- **UI**:
  - `TeamPanel` (`src/components/event/team-panel.tsx`) — modes: empty/CTA, view (read-only A/B kartları + skill delta indicator), edit (drag-drop)
  - `TeamBuilder` — `@dnd-kit/core` + `@dnd-kit/sortable`, A↔B sürükle-bırak, save/cancel
  - Realtime: `event:{id}:teams` channel, `team_assignment` postgres_changes → herkes anlık kadro değişimini görür
  - Organizer aksiyonları (locked'ta): "Düzenle", "Yeniden dağıt", "Kilidi aç" — tümü hill-climb seed'i yeniler
- Event detail sayfası: `getTeamsAction` parallel fetch, `TeamPanel` roster ve chat arasına yerleşti
- i18n: `Teams.*` namespace tr/en/pl (24 anahtar)
- `pnpm test` script'i (vitest run); `pnpm test:watch` (vitest dev)

#### Notlar

- **Pozisyon override yok**: Drag-drop sadece A↔B swap, pozisyon değiştirme Phase 9 backlog'una ertelendi (algoritma zaten preferred_position'a saygı gösteriyor).
- **Skill delta uyarı eşiği**: 300+ rating farkında amber alert kartı — manuel dengesizliği görsel olarak işaret eder.
- **Tek sayıda oyuncu** (spec §19 T1) reject edilmiyor; algoritma A'ya 1 fazla atar + warning. Spec'in "eşit dağıtılamıyor" dediği akış UI'da warning olarak görünür, organizer karar verir.
- **Deterministik test**: `seed: 1234` ile r1 === r2 doğrulaması yapıldı; aynı kadroda farklı seed'ler farklı atama üretebilir (skill+pozisyon eşitse skor=0 olduğu için pek çok eşdeğer çözüm var).
- Realtime fallback: Eğer publication add atlanırsa (örneğin self-hosted Supabase) UI page refresh ile güncellenir, system chat message her halükarda gönderilir.

### Phase 0 — Bootstrap (2026-04-30)

İlk çalışan iskelet. `pnpm dev` ana sayfayı render eder, lint/typecheck/build temiz.

#### Eklendi

- Next.js 15.5.15 + Turbopack + TypeScript strict + Tailwind v4
- shadcn/ui konvansiyonu: `components.json`, `lib/utils.ts`, ilk primitive `Button` (CVA tabanlı, brand & cta variants)
- Brand teması: emerald-600 light / emerald-500 dark, amber-500 CTA — Tailwind v4 CSS-first config
- Inter fontu (`next/font/google`, latin + latin-ext) — TR/PL diakritikleri için
- Dark mode (next-themes, class strategy, system default) + ThemeToggle bileşeni
- next-intl ile lokal yönlendirme: `/tr` (default), `/en`, `/pl`; mesaj dosyaları `messages/{tr,en,pl}.json`; `LocaleSwitcher` bileşeni
- Supabase client iskeleti (`@supabase/ssr`): `lib/supabase/{server,client,middleware}.ts`
- Drizzle ORM kurulumu: `drizzle.config.ts`, `db/index.ts` (server-only), `db/schema.ts` (Phase 1+'de doldurulacak)
- TanStack Query + sonner Toaster — `components/providers.tsx`
- MapLibre GL (Phase 2'de import edilecek), date-fns + date-fns-tz, lucide-react, react-hook-form + zod
- Root middleware: Supabase session refresh + i18n routing
- Tooling: ESLint 9 (no-restricted-imports: moment/lodash/axios), Prettier 3 + tailwindcss plugin, Husky pre-commit (lint-staged + tsc)
- `.env.example`, `.gitignore`, `.prettierignore`
- README, ADR-0001 (Next 15 lock-in)
- Logos: `public/onside-logo.svg`, `public/onside-wordmark.svg`

#### Notlar

- Spec §2 "Next.js 15 (Kilitli — değiştirme)" uyarınca Next 15.5.x sabit. create-next-app default'u Next 16'yı çekti, bilinçli olarak Next 15.5.x'e indirildi (ADR-0001).
- `lucide-react` 1.x kullanılıyor; v0 → v1 API değişikliklerine Phase 1+'da component eklerken dikkat.
- **Env naming**: Supabase Cloud yeni publishable/secret key isimlendirmesine geçildi. `.env.local` ve `.env.example`: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` (eski `ANON_KEY` / `SERVICE_ROLE_KEY` yerine).

### Phase 0 → Phase 1 köprüsü — kararlar (2026-04-30)

- **ADR-0002 — Auth simplified to anonymous + nickname-only.** Spec §7 (email + password + Google + Apple OAuth + email confirm) ve §15.6 (16+ checkbox) MVP için revize edildi. Kullanıcı gerekçesi: "Kayıt ilk safhada uğraştırıcı olur." Phase 1'de sadece `<JoinModal>` (tek nickname input) + `supabase.auth.signInAnonymously()`. Google/email upgrade Phase 9 backlog'unda. Production öncesi RODO legal review zorunlu.

### Phase 5 — Real-time Chat + Roster Realtime + ADR-0004 (2026-04-30)

Spec §5 chat_message + report, §6 RLS, §12 chat behavior.

#### Eklendi

- **DB** [supabase/migrations/0007_chat_message.sql](supabase/migrations/0007_chat_message.sql): `chat_message` (kind text/system, soft delete, sender_id NULL allowed for system) + `report` (reason enum, status, target message/profile) + 4 RPC (`send_message`, `delete_message`, `report_message`, `post_system_message`) + Realtime publication ekleme + RLS.
- **Realtime publication** [0008_realtime_participants.sql](supabase/migrations/0008_realtime_participants.sql): `event_participant` ve `event` tabloları publication'a, `REPLICA IDENTITY FULL` UPDATE event'lerinde OLD/NEW kolonların yayınlanması için.
- **Server actions** [src/lib/event/chat-actions.ts](src/lib/event/chat-actions.ts): `sendMessageAction` (rate-limit 1/sec + 10/dk), `deleteMessageAction`, `reportMessageAction`, `getMessagesAction`, `postSystemMessage` (server-side helper).
- **System messages**: `cancelEventAction` event iptalinde "📢 Etkinlik iptal edildi: {reason}" sistem mesajı broadcast eder.
- **ChatRoom** [src/components/event/chat-room.tsx](src/components/event/chat-room.tsx): server prefetch son 100 mesaj + Supabase Realtime channel (postgres_changes INSERT/UPDATE) + optimistic send + auto-link URL + 5dk delete window + report menüsü + composer disabled states (cancelled/locked/full/not-in-roster).
- **EventRosterPanel** [src/components/event/event-roster-panel.tsx](src/components/event/event-roster-panel.tsx): pending + confirmed listelerini state'te tutar, `event_participant` postgres_changes subscription ile realtime sync. payload.old'a güvenmeyen pattern: ID kendi state'inden bulunur, status'a göre listeler arası taşınır. profileCache map ile sender enrichment.
- **PendingRequests** + **RosterList**: `router.refresh()` çağrıları silindi — realtime UPDATE channel parent state'i günceller.
- **i18n**: `Chat` namespace tr/en/pl ~25 key.

#### ADR-0004 — chat_message SELECT policy spec §6'dan gevşetildi ([docs/decisions/0004-chat-rls-relaxed-for-realtime.md](docs/decisions/0004-chat-rls-relaxed-for-realtime.md))

Phase 5 deploy ettikten sonra Realtime postgres_changes broadcaster'ın chat_message INSERT event'lerini **sessizce düşürdüğü** keşfedildi. Sub başarılı (SUBSCRIBED), event hiç gelmiyor; ne hata, ne payload.

**Migration cycle (debugging)**:

- 0007 — chat_message publication'a + nested RLS subquery policy → çalışmadı
- 0008 — event_participant + REPLICA IDENTITY FULL → roster çalışmaya başladı, chat hâlâ değil
- 0009 — chat policy basitleştir `TO authenticated USING (true)` → çalışmadı
- 0010 — chat_message publication DROP+ADD cycle (cache reset) → çalışmadı
- 0011 — RLS DISABLE diagnostic → **çalıştı**, sorun policy
- 0012 — RLS re-enable + `TO anon, authenticated USING (true)` (event_participant pattern) → **çalıştı**

**Bulgular** (başka projelere referans):

1. Realtime broadcaster `TO authenticated` only policy'leri (anon hariç) düşürüyor — Anonymous Auth user'ın JWT'si role='authenticated' olsa bile. `TO anon, authenticated` dual role çalışıyor.
2. Nested EXISTS subquery RLS evaluator'ı Realtime context'te performans/doğruluk kaybına uğratabiliyor.
3. `payload.old` UPDATE event'lerinde REPLICA IDENTITY FULL ile bile bazen eksik gelir; client handler'lar `payload.old`'a güvenmeyip kendi state'inden eski konumu çıkarmalı.

**Spec §6 sapması**: chat_message SELECT artık herkese açık; event-scope UI'da `.eq('event_id', eventId)` ile, INSERT/UPDATE/DELETE RPC tarafında zaten korunuyor (organizer/confirmed kontrolleri). Pratik veri sızıntısı düşük (event'ler zaten public, mesajlar event-context'inde).

#### Detail page entegrasyon

- `Promise.all([roster, pending, myRsvp, messages])` paralel server prefetch.
- Roster placeholder yerine `<EventRosterPanel>`, Chat placeholder yerine `<ChatRoom>`.
- `canPostChat = isOrganizer || myParticipant?.status === "confirmed"` — UI'da composer disabled için.

#### Atlanan / sonraki phase

- **Profanity filter** TR/EN/PL küfür listesi — Phase 9
- **Edit message** 5dk window — Phase 9
- **Emoji picker** (`emoji-mart`) — Phase 9
- **Presence channel** (kim ekranda) — Phase 9
- **Auto-ban** 3+ pending report → `is_banned=true` — Phase 9 (manuel SQL ile başlat)
- **Report UI**: şu an `window.prompt` ile basit; Phase 9'da modal

---

### Phase 4 — RSVP + ADR-0003 + Organizer Auto-Join (2026-04-30)

Spec §5 event_participant, §6 RLS, §19 P1-P9 + ADR-0003 (approval workflow).

#### Eklendi

- **DB** [supabase/migrations/0004_event_participant.sql](supabase/migrations/0004_event_participant.sql): `participant_status` enum (`confirmed`/`cancelled`/`no_show`/`attended`), `event_participant` table partial unique index `(event_id, profile_id) WHERE status <> 'cancelled'`, RLS SELECT public + mutation'lar SECURITY DEFINER RPC üzerinden.
- **3 RPC** advisory-lock + FOR UPDATE ile race-safe (S5):
  - `confirmed_count(uuid)` — count helper
  - `join_event(uuid, position)` — capacity check + idempotent + cancelled rejoin restore + open→full
  - `cancel_rsvp(uuid)` — soft cancel + full→open
  - `kick_participant(uuid, uuid)` — organizer-only
- **Drizzle schema** [src/db/schema.ts](src/db/schema.ts): `eventParticipant` + `participantStatusEnum`.
- **Server actions** [src/lib/event/rsvp-actions.ts](src/lib/event/rsvp-actions.ts): `joinEventAction`, `cancelRsvpAction`, `kickParticipantAction`, `getEventRosterAction`, `getMyRsvpAction`.
- **UI components**: [JoinButton](src/components/event/join-button.tsx) tüm P1-P9 disabled state'leriyle, [PositionPickerDialog](src/components/event/position-picker.tsx) profil preferred_position initial'lı, [RosterList](src/components/event/roster-list.tsx) pozisyon gruplu + organizer kick.
- **/events/[id] entegrasyon**: `Promise.all([roster, myRsvp])` paralel fetch, capacity bar + JoinButton hero altında, RosterList placeholder yerine.
- **i18n**: `Roster` namespace tr/en/pl ~25 key.

#### ADR-0003 — Organizer Approval Workflow ([docs/decisions/0003-organizer-approval-workflow.md](docs/decisions/0003-organizer-approval-workflow.md))

Spec §0 "anında kadroda" ve §15.6 ile çelişen ama kullanıcı kararı: **etkinliğe katılım organizer onayına bağlı**.

- **Migration 0005a** [participant_pending_enum.sql](supabase/migrations/0005a_participant_pending_enum.sql): `participant_status`'a `pending` (PostgreSQL `ALTER TYPE ADD VALUE` aynı transaction'da kullanılamadığı için ayrı dosya).
- **Migration 0005b** [participant_approval.sql](supabase/migrations/0005b_participant_approval.sql): `event_participant TRUNCATE` + `rejected_reason text` kolon + default `pending` + RPC'ler:
  - `join_event` → status='pending' insert (organizer kendi etkinliğine talep edemez)
  - `approve_participant(uuid)` (organizer-only, capacity check, auto open→full)
  - `reject_participant(uuid, reason?)` (organizer-only, opsiyonel sebep)
  - `cancel_rsvp` artık pending VEYA confirmed'i cancellable
- **MyRsvp tipi** genişledi: `{ status: 'pending' | 'confirmed', rejectedReason }`.
- **JoinButton** state'leri yeniden: "Katılım talebi gönder" → amber chip "{pos} olarak onay bekliyor" + "Talebimi geri çek" → emerald chip "{pos} olarak onaylandın" + "Kaydımı iptal et".
- **PendingRequests** [src/components/event/pending-requests.tsx](src/components/event/pending-requests.tsx): organizer için amber kart, talep başına Onayla / Reddet (inline opsiyonel reason). Capacity dolarsa Approve disabled.
- **Karar parametreleri** (kullanıcıdan onaylı): tüm event'ler approval-modunda; pending capacity tutmaz; Phase 4 test verisi truncate; reject reason opsiyonel.

#### Migration 0006 — Organizer Auto-Join + Cancel Guards ([0006_event_organizer_auto_join.sql](supabase/migrations/0006_event_organizer_auto_join.sql))

Spec §19 E8 + kullanıcı isteği: **organizer event create'te otomatik confirmed kadroya eklenir.**

- `AFTER INSERT ON event` trigger: organizer'ı `event_participant`'a `confirmed` insert eder. Pozisyon: `profile.preferred_position` varsa o, yoksa `MID`. Capacity 1'se event direkt `full`.
- **Backfill**: mevcut event'lere organizer ekle, capacity dolduysa status `full`'a çek.
- `cancel_rsvp` defensive guard: organizer kendi etkinliğinden çıkamaz (cancel_event kullansın).
- `kick_participant` defensive guard: organizer kendini kick edemez.

#### Ana sayfa "Etkinliklerim" bölümü

- [`getMyEventsAction`](src/lib/event/actions.ts) — trigger backfill sayesinde tek `event_participant` join `event` query.
- [`MyEventsList`](src/components/event/my-events-list.tsx) Server Component: en fazla 4 kart, organizer ise amber **Crown rozet**, fazlası "Tümünü gör" linki, her kartta "**Etkinliğe git** →" CTA.
- i18n: `MyEvents` namespace tr/en/pl.

#### Notlar

- `ALTER TYPE ADD VALUE` Postgres'te aynı transaction'da kullanılamaz; bu pattern Phase 5+'da yeni enum değerleri eklerken iki migration dosyası halinde uygulanır.
- Reddedilen kullanıcıya "rejected_reason" görünür mesajı henüz yok — Phase 5 chat sistem mesajı veya Phase 9 in-app notification'da eklenir.

---

### Phase 3 — Event Core (2026-04-30)

Spec §5 event, §6 RLS, §11 lifecycle, §19 edge cases E1-E9.

#### Eklendi

- **DB** [supabase/migrations/0003_event_init.sql](supabase/migrations/0003_event_init.sql): `event_status`/`format`/`sport` enum'ları + `event` table (organizer/venue FK, capacity, min_players, skill range, future-proof `is_recurring`/`parent_event_id`, `chat_locked` Phase 5 için) + 8 check constraint (start<end, capacity 4-30, skill range, title 3-80, description ≤500, cancelled tutarlılık) + 4 btree index ((status, start_at), start_at, venue, organizer) + RLS (SELECT public-or-organizer, INSERT self-organizer + active, UPDATE organizer-only, DELETE yok — spec §6 hard delete yok) + updated_at trigger
- **Drizzle schema** [src/db/schema.ts](src/db/schema.ts): `event` + tipler.
- **State machine** [src/lib/event/state.ts](src/lib/event/state.ts): `canTransition`, `isOrganizerEditable`, `isJoinable`, `recomputeCapacityStatus`, `lazyTimeBasedStatus` (spec §11).
- **Validation** [src/lib/validation/event.ts](src/lib/validation/event.ts): `createEventSchema` superRefine ile cross-field (E1-E6: end>start, start≥now+30dk, ≤30 gün ileri, minPlayers≤capacity, skill range, capacity≥teamSize×2); `cancelEventSchema`; `eventFiltersSchema`.
- **Server actions** [src/lib/event/actions.ts](src/lib/event/actions.ts): `createEventAction` (rate-limit 10/dk per-IP), `cancelEventAction` (state-machine kontrol + organizer-only + reason), `getEventsAction` (city/bbox/date/format/skill/status filtreleri), `getEventByIdAction`, `getEventsByVenueAction`.
- **Pages**: [/events](src/app/[locale]/events/page.tsx) feed (harita + liste + city switcher + format & seviye filtreleri + geolocation; pin'ler status'a göre renkli — open emerald, full amber; auth ise "Maç oluştur" CTA), [/events/new](src/app/[locale]/events/new/page.tsx) form (venue picker, datetime-local Europe/Warsaw, format auto-suggest capacity, skill range), [/events/[id]](src/app/[locale]/events/[id]/page.tsx) detail (status badge + 6 info card + mini-map zoom 15 + organizer "Etkinliği iptal et" modalı + Roster/Chat placeholder).
- **Components**: [EventCard](src/components/event/event-card.tsx), [EventStatusBadge](src/components/event/event-status-badge.tsx) 7 status için renk-kodlu, [CancelEventDialog](src/components/event/cancel-event-dialog.tsx), [EventFeedPage](src/components/event/event-feed-page.tsx).
- **Venue detay**: o sahada yaklaşan event listesi (en fazla 5).
- **Ana sayfa**: "Yakındaki maçlar" → `/events`, "Maç oluştur" → `/events/new` (CTA amber, auth-only).
- **i18n**: `Events` namespace tr/en/pl ~50 key (statuses, skillLevels, form labels).

#### Phase 3 sırasında düzeltmeler

- `zod v4`: `createEventSchema.innerType()` yok → `updateEventSchema` kaldırıldı (Phase 4'te yeniden). Edit UI Phase 4'e ertelendi.
- i18n `capacityHint`: `{format}` placeholder'ı parametre olarak geçilmemişti, eklendi.

#### Ertelenen

- Event **edit UI** Phase 4'te (server action gerekirse o zaman manual partial zod schema).
- **Cron** ile status auto-transition (locked → in_progress, open|full → cancelled if min not met) Phase 9; şimdilik `lazyTimeBasedStatus` helper var, render-time hesap.
- Pin clustering 50+ event görünmeye başlayınca aktive.

---

### Phase 2 — Venue & Map (2026-04-30)

Spec §5 venue, §8 geo & map.

#### Eklendi

- **DB** [supabase/migrations/0002_venue_init.sql](supabase/migrations/0002_venue_init.sql): PostGIS extension + `venue` table + generated stored `location geography(POINT, 4326)` (Phase 3 `ST_DWithin` için hazır) + GIST spatial index + city/active btree indexes + RLS (`is_active=true` SELECT public; INSERT/UPDATE/DELETE service-role only) + check constraints (country ISO, lat/lng range, surface enum)
- **Drizzle schema** [src/db/schema.ts](src/db/schema.ts): `venue` table + tipler. Drizzle `lat`/`lng` döndürür; `location` raw SQL'de generated column.
- **Seed** [scripts/seed-venues.mjs](scripts/seed-venues.mjs): **20 gerçek halı saha** koordinat + adres ile (Warsaw 10: Arena Futbolu, Soccer Arena Annopol, RS Sport Chodakowska, Centrum Futbolu Warszawianka, Olimpijski FC Warszawa, Estadio De Ubocze, Hala Piłkarska Marymont, OSiR Targówek Łabiszyńska, Orlik Wilanów Worobczuka, Orlik Ursynów Bażantarni; Gdańsk 10: Football Arena, Olimpijski FC, Traugutta 29, KS Gedania 1922, KS Jaguar, Sport Park Przymorze, Orlik Subisława, Orlik Kołobrzeska, Orlik Niedźwiednik, Boisko Oliwska). Idempotent TRUNCATE + INSERT.
- **MapView** [src/components/map/map-view.tsx](src/components/map/map-view.tsx): MapLibre GL JS + OpenStreetMap raster tiles (attribution görünür) + emerald custom pin (top-down futbol sahası SVG) + user location dot. Lazy load: `next/dynamic({ ssr: false })`.
- **GeolocationPrompt** [src/components/map/geolocation-prompt.tsx](src/components/map/geolocation-prompt.tsx): explicit consent modal + `useGeolocationDecision` hook + localStorage'da karar persist + Warsaw fallback.
- **CitySwitcher** [src/components/map/city-switcher.tsx](src/components/map/city-switcher.tsx): Warsaw/Gdańsk dropdown.
- **VenueMapPage** [src/components/map/venue-map-page.tsx](src/components/map/venue-map-page.tsx): sol panel liste (badge'larla yüzey/aydınlatma/kapalı) + sağ harita layout; nearest-city snap geolocation kabul edildiğinde.
- **Pages**: [/venues](src/app/[locale]/venues/page.tsx) liste/harita + [/venues/[id]](src/app/[locale]/venues/[id]/page.tsx) detay (mini-map zoom 15 + resmi site linki). `approxPricePerHour` UI'da gizli (Phase 0 kararı).
- **Geo helpers** [src/lib/geo.ts](src/lib/geo.ts): `haversineKm`, `nearestCity`, `CITY_CENTERS`, `SUPPORTED_CITIES`, `DEFAULT_CITY`.
- **Migration runner** [scripts/apply-migration.mjs](scripts/apply-migration.mjs): `node --env-file=.env.local scripts/apply-migration.mjs <file>` — doğrudan postgres bağlantısı (RLS bypass) ile manuel SQL apply.
- **i18n**: `Cities`, `Geolocation`, `Venues` namespace'leri tr/en/pl tam (~30 key); zemin/aydınlatma/kapalı vb.
- **Ana sayfa**: "Sahalar" CTA → /venues link.
- **CSS**: `maplibre-gl/dist/maplibre-gl.css` global import.

#### Phase 2 sırasında yapılan düzeltmeler

- **MapView marker init**: `addTo(map)` öncesinde `setLngLat()` zinciri (MapLibre v5 strict — konumsuz marker throw ediyordu).
- **Pin click**: `mousedown` ve `touchstart` listener'larında `stopPropagation` — MapLibre canvas pan handler'ı click'i yutuyordu.
- **Pin ikonu**: gülümseyen yüz → top-down futbol sahası (logo ile aynı dilde).
- **NextIntlClientProvider locale prop**: explicit `locale={locale}` — hydration sırasında `useLocale()` ara sıra eski locale döndürüyordu.
- **LocaleSwitcher**: tek-buton next-locale rotasyonu → 3 dilin (TR/EN/PL + native isim + ✓) listelendiği dropdown. UX karışıklığı giderildi.

#### Atlandı / sonraki phase'e ertelendi

- **Nominatim proxy + geocode_cache**: Phase 2'de search UI yok; Phase 3 event create venue picker autocomplete'inde gerekecek.
- **Pin clustering**: <50 pin için gereksiz; 50+ event görünmeye başlayınca aktive (Phase 3+).
- **Mobile bottom sheet**: liste şu an mobile'da en üstte stack'leniyor; Phase 9 polish.

#### Notlar

- Pooler hostname tahmin denemeleri sonucu **`aws-1-eu-central-1`** olarak belirlendi (yeni Frankfurt pooler). `.env.local`'deki `DATABASE_URL` buna göre.
- Supabase Anonymous Sign-Ins provider'ının enable edilmesi gerekti (Phase 1 setup adımı, dashboard'dan tek toggle).
- Phase 2'de Drizzle migration generate kullanılmadı — RLS + PostGIS extension + generated column SQL'leri Drizzle schema'sının yapısında yok. Pattern: schema'da tablolar (Drizzle) + her phase için manuel `supabase/migrations/NNNN_*.sql`.

---

### Phase 1 — Auth & Profile (2026-04-30)

ADR-0002 uyarınca Anonymous Auth + nickname-only. Spec §5 profile schema, §6 RLS profile policies aynen.

#### Eklendi

- **DB**: `position` ve `skill_level` enum'ları, `profile` tablosu (spec §5), `auth.users` FK + ON DELETE CASCADE, updated_at trigger, `auth_user_active()` SECURITY DEFINER helper. Migration: [supabase/migrations/0001_profile_init.sql](supabase/migrations/0001_profile_init.sql)
- **RLS** (spec §6 profile satırı): SELECT public, INSERT/UPDATE self + `auth_user_active()`, DELETE yok
- **Drizzle schema** [src/db/schema.ts](src/db/schema.ts): `profile` table + enum'lar + check constraints (`username` regex, `locale` whitelist)
- **Server actions** [src/lib/auth/actions.ts](src/lib/auth/actions.ts): `createProfileAction` (rate-limited, anonymous sign-in + insert), `checkUsernameAvailabilityAction` (real-time uniqueness), `updateProfileAction` (camelCase → snake_case map, RLS apply)
- **Validation** [src/lib/validation/profile.ts](src/lib/validation/profile.ts): zod schemas (nickname regex, profile update partial)
- **Rate limit** [src/lib/rate-limit.ts](src/lib/rate-limit.ts): in-memory bucket; signup 5/dk per-IP. Phase 5'te Upstash'a geçilecek
- **shadcn primitives**: Dialog (Radix), Input, Label + `tw-animate-css` import
- **Components**: [JoinModal](src/components/auth/join-modal.tsx) — kapatılamaz, real-time uniqueness check, suggestion butonları; [ProfileEditForm](src/components/profile/profile-edit-form.tsx) — bio/city/position/skill/locale form, sonner toast
- **Pages**: [`/[locale]/profile`](src/app/[locale]/profile/page.tsx) (avatar gradient + stats + fields), [`/[locale]/profile/edit`](src/app/[locale]/profile/edit/page.tsx) (server fetch + client form)
- **Ana sayfa** session-aware: profile yoksa JoinModal otomatik açılır; varsa header'da `@username` linki
- **i18n**: `Auth` ve `Profile` namespace'leri tr/en/pl tam (40+ key)
- **Scripts**: `pnpm db:generate`, `db:push`, `db:studio`
- **README runbook**: Supabase Cloud SQL Editor ile migration apply, Anonymous Auth provider enable adımı

#### Notlar

- **Drizzle vs Supabase JS SDK ayrımı**: Phase 1 CRUD'unda RLS uygulanması için **Supabase JS SDK** kullanıldı (auth-aware). Drizzle Phase 3+'da complex query'ler (join, aggregation, ST_DWithin) için kullanılır. Schema yine Drizzle'da tek source of truth.
- **Drizzle migration auto-generate kullanılmıyor**: `0001_profile_init.sql` manuel yazıldı çünkü RLS + helper function + trigger SQL'leri Drizzle'ın schema'sında yok. Phase 2+'da yeni tablolarda da bu pattern: Drizzle schema → manuel migration SQL.
- **Banned middleware check henüz yok**: chat moderation Phase 5'te geleceği için Phase 1'de `auth_user_active()` sadece RLS'te. `is_banned=true` set edildiğinde insert/update reddedilir; cookie clear Phase 5+ moderation flow'unda.
