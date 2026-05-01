/**
 * Halısaha — DB schema (single source of truth, spec §5).
 *
 * Phase 1: profile tablosu + position / skill_level enum'ları.
 * Sonraki phase'lerde event, venue, chat_message, vs. eklenir.
 *
 * NOT: ADR-0002 uyarınca email kolonu YOK (anonymous auth, auth.users.email NULL olabilir).
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const positionEnum = pgEnum("position", ["GK", "DEF", "MID", "FWD"]);

export const skillLevelEnum = pgEnum("skill_level", [
  "beginner",
  "intermediate",
  "advanced",
  "pro",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "open",
  "full",
  "locked",
  "in_progress",
  "completed",
  "cancelled",
]);

export const formatEnum = pgEnum("format", [
  "5v5",
  "6v6",
  "7v7",
  "8v8",
  "11v11",
]);

export const sportEnum = pgEnum("sport", ["football"]);

export const profile = pgTable(
  "profile",
  {
    // auth.users.id ile aynı; Supabase Auth tarafı yönetir.
    id: uuid("id").primaryKey(),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    preferredPosition: positionEnum("preferred_position"),
    secondaryPosition: positionEnum("secondary_position"),
    skillLevel: skillLevelEnum("skill_level").notNull().default("intermediate"),
    skillRating: integer("skill_rating").notNull().default(1000),
    matchesPlayed: integer("matches_played").notNull().default(0),
    matchesWon: integer("matches_won").notNull().default(0),
    goalsScored: integer("goals_scored").notNull().default(0),
    mvpCount: integer("mvp_count").notNull().default(0),
    homeCity: text("home_city"),
    homeLat: doublePrecision("home_lat"),
    homeLng: doublePrecision("home_lng"),
    locale: text("locale").notNull().default("tr"),
    noShowCount: integer("no_show_count").notNull().default(0),
    isBanned: boolean("is_banned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("profile_username_format", sql`${t.username} ~ '^[a-z0-9_]{3,20}$'`),
    check("profile_locale_valid", sql`${t.locale} IN ('tr', 'en', 'pl')`),
  ],
);

export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;

/**
 * Venue (saha) — Phase 2.
 *
 * Read-only katalog (spec §1: saha rezervasyonu / sahibi paneli yok). Seed Warsaw + Gdańsk.
 * `lat` ve `lng` Drizzle-tarafında; PostGIS `location geography(POINT, 4326)` kolonu
 * migration'da generated-stored olarak eklenir, spatial query'lerde kullanılır.
 */
export const venue = pgTable(
  "venue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
    countryCode: text("country_code").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    surface: text("surface").notNull().default("artificial"),
    hasFloodlights: boolean("has_floodlights").notNull().default(true),
    isCovered: boolean("is_covered").notNull().default(false),
    approxPricePerHour: integer("approx_price_per_hour"),
    externalUrl: text("external_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("venue_country_code_iso", sql`${t.countryCode} ~ '^[A-Z]{2}$'`),
    check("venue_lat_range", sql`${t.lat} BETWEEN -90 AND 90`),
    check("venue_lng_range", sql`${t.lng} BETWEEN -180 AND 180`),
    check(
      "venue_surface_valid",
      sql`${t.surface} IN ('artificial', 'grass', 'indoor')`,
    ),
    index("venue_city_idx").on(t.city),
    index("venue_active_idx").on(t.isActive),
  ],
);

export type Venue = typeof venue.$inferSelect;
export type NewVenue = typeof venue.$inferInsert;

/**
 * Event (etkinlik / pickup maç) — Phase 3 (spec §5).
 *
 * Status state machine: draft (skip MVP) → open ↔ full → locked → in_progress → completed.
 * cancelled hangi status'tan olursa hard transition. Detay: lib/event/state.ts.
 *
 * Future-proof kolonlar (`is_recurring`, `parent_event_id`) MVP'de read-only;
 * UI tarafında gösterilmiyor (spec §1).
 */
export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id")
      .notNull()
      .references(() => profile.id, { onDelete: "restrict" }),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venue.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    sport: sportEnum("sport").notNull().default("football"),
    format: formatEnum("format").notNull(),
    minSkillLevel: skillLevelEnum("min_skill_level")
      .notNull()
      .default("beginner"),
    maxSkillLevel: skillLevelEnum("max_skill_level").notNull().default("pro"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull(),
    minPlayersToConfirm: integer("min_players_to_confirm").notNull(),
    status: eventStatusEnum("status").notNull().default("open"),
    isRecurring: boolean("is_recurring").notNull().default(false),
    parentEventId: uuid("parent_event_id"),
    isHidden: boolean("is_hidden").notNull().default(false),
    cancelledReason: text("cancelled_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    notes: text("notes"),
    chatLocked: boolean("chat_locked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("event_time_range", sql`${t.startAt} < ${t.endAt}`),
    check("event_capacity_range", sql`${t.capacity} BETWEEN 4 AND 30`),
    check(
      "event_min_players_le_capacity",
      sql`${t.minPlayersToConfirm} <= ${t.capacity}`,
    ),
    check("event_skill_range", sql`${t.minSkillLevel} <= ${t.maxSkillLevel}`),
    index("event_status_start_idx").on(t.status, t.startAt),
    index("event_start_idx").on(t.startAt),
    index("event_venue_idx").on(t.venueId),
    index("event_organizer_idx").on(t.organizerId),
  ],
);

export type Event = typeof event.$inferSelect;
export type NewEvent = typeof event.$inferInsert;

/**
 * Event participant — Phase 4 RSVP (spec §5).
 *
 * Soft-cancellation: status='cancelled' (`cancelled_at` set), satır silinmez.
 * RPC `join_event(uuid, position)` advisory-lock + atomic capacity check
 * yapar (race condition for S5).
 */
export const participantStatusEnum = pgEnum("participant_status", [
  "pending",
  "confirmed",
  "cancelled",
  "no_show",
  "attended",
]);

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
    position: positionEnum("position").notNull(),
    status: participantStatusEnum("status").notNull().default("pending"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
  },
  (t) => [
    // Bir kullanıcı bir etkinlikte aktif (confirmed) olarak yalnızca bir satıra sahip.
    // Cancelled satırlar tekrar 'confirmed'a alınabilir (RPC'de upsert mantığı).
    uniqueIndex("event_participant_unique_active")
      .on(t.eventId, t.profileId)
      .where(sql`status <> 'cancelled'`),
    index("event_participant_event_idx").on(t.eventId),
    index("event_participant_profile_idx").on(t.profileId),
  ],
);

export type EventParticipant = typeof eventParticipant.$inferSelect;
export type NewEventParticipant = typeof eventParticipant.$inferInsert;

/**
 * Chat message — Phase 5 (spec §5, §12).
 *
 * `kind = 'text'`: kullanıcı mesajı, sender_id zorunlu.
 * `kind = 'system'`: bot mesajı (event cancel, approve, vs.), sender_id NULL.
 * Soft delete: `is_deleted = true` → UI'da "[mesaj silindi]" gösterilir.
 */
export const chatMessage = pgTable(
  "chat_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => profile.id, {
      onDelete: "cascade",
    }),
    content: text("content").notNull(),
    kind: text("kind").notNull().default("text"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [
    check("chat_message_kind_valid", sql`${t.kind} IN ('text', 'system')`),
    check(
      "chat_message_content_length",
      sql`char_length(${t.content}) BETWEEN 1 AND 1000`,
    ),
    check(
      "chat_message_system_no_sender",
      sql`(${t.kind} = 'system' AND ${t.senderId} IS NULL)
          OR (${t.kind} = 'text' AND ${t.senderId} IS NOT NULL)`,
    ),
    index("chat_message_event_time_idx").on(t.eventId, t.createdAt),
  ],
);

export type ChatMessage = typeof chatMessage.$inferSelect;
export type NewChatMessage = typeof chatMessage.$inferInsert;

/**
 * Team (takım) — Phase 6 (spec §5, §9).
 *
 * Bir event için iki team yaratılır (label='A', label='B'). Re-balance edilirse
 * eski team + team_assignment cascade silinir, yenileri yazılır. `seed` aynı
 * algoritma ile aynı sonucu deterministik üretmek için saklanır (debug/test).
 */
export const team = pgTable(
  "team",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    seed: integer("seed").notNull(),
    skillTotal: integer("skill_total").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("team_label_valid", sql`${t.label} IN ('A', 'B')`),
    uniqueIndex("team_event_label_unique").on(t.eventId, t.label),
    index("team_event_idx").on(t.eventId),
  ],
);

export type Team = typeof team.$inferSelect;
export type NewTeam = typeof team.$inferInsert;

/**
 * Team assignment — bir oyuncunun hangi takımda hangi pozisyonda oynadığı.
 *
 * `(event_id, profile_id)` unique → bir oyuncu sadece bir takımda. Re-balance
 * cascade siler, yenisi yazılır. Manuel drag-drop override de bu tabloyu
 * günceller (atomik replace_team_assignments RPC).
 */
export const teamAssignment = pgTable(
  "team_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    position: positionEnum("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("team_assignment_event_profile_unique").on(
      t.eventId,
      t.profileId,
    ),
    index("team_assignment_team_idx").on(t.teamId),
    index("team_assignment_event_idx").on(t.eventId),
  ],
);

export type TeamAssignment = typeof teamAssignment.$inferSelect;
export type NewTeamAssignment = typeof teamAssignment.$inferInsert;

/**
 * Match result — Phase 7 (spec §5, §10).
 *
 * Bir event tek match_result satırına sahip (unique event_id). Skoru organizer
 * girer; 24 saat içinde edit edilebilir (M3). Edit'te eski Elo update'i geri
 * alınmaz — yeni skor üzerinden tekrar uygulanır (skill_snapshot append-only).
 */
export const matchResult = pgTable(
  "match_result",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    scoreA: integer("score_a").notNull(),
    scoreB: integer("score_b").notNull(),
    notes: text("notes"),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => profile.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    mvpProfileId: uuid("mvp_profile_id").references(() => profile.id, {
      onDelete: "set null",
    }),
    mvpFinalizedAt: timestamp("mvp_finalized_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("match_result_event_unique").on(t.eventId),
    check("match_result_score_a_range", sql`${t.scoreA} BETWEEN 0 AND 30`),
    check("match_result_score_b_range", sql`${t.scoreB} BETWEEN 0 AND 30`),
  ],
);

export type MatchResult = typeof matchResult.$inferSelect;
export type NewMatchResult = typeof matchResult.$inferInsert;

/**
 * Player match stat — bir oyuncunun bir maçtaki istatistiği (spec §5).
 *
 * Tüm confirmed katılımcılar için match_result yazıldığında otomatik insert
 * edilir (default: attended=true, goals=0). Organizer post-match no-show
 * işaretler (M4). MVP `mvp_vote`tan derive (denormalize değil).
 */
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
    teamLabel: text("team_label").notNull(),
    attended: boolean("attended").notNull().default(true),
    goals: integer("goals").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    eloDelta: integer("elo_delta").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("player_match_stat_event_profile_unique").on(
      t.eventId,
      t.profileId,
    ),
    check("player_match_stat_team_valid", sql`${t.teamLabel} IN ('A', 'B')`),
    check("player_match_stat_goals_range", sql`${t.goals} BETWEEN 0 AND 30`),
    check(
      "player_match_stat_assists_range",
      sql`${t.assists} BETWEEN 0 AND 30`,
    ),
    index("player_match_stat_event_idx").on(t.eventId),
    index("player_match_stat_profile_idx").on(t.profileId),
  ],
);

export type PlayerMatchStat = typeof playerMatchStat.$inferSelect;
export type NewPlayerMatchStat = typeof playerMatchStat.$inferInsert;

/**
 * MVP vote — oyuncuların attended olduğu etkinlikte bir defa kullanım (spec §5).
 *
 * 7 günlük pencere V3, no-self V1, single-vote V2 (upsert). Birden fazla oy
 * patlaması yok: `(event_id, voter_id)` unique → değiştirebilir ama bir oy.
 */
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
  (t) => [
    uniqueIndex("mvp_vote_event_voter_unique").on(t.eventId, t.voterId),
    check("mvp_vote_no_self", sql`${t.voterId} <> ${t.voteeId}`),
    index("mvp_vote_event_idx").on(t.eventId),
  ],
);

export type MvpVote = typeof mvpVote.$inferSelect;
export type NewMvpVote = typeof mvpVote.$inferInsert;

/**
 * Skill snapshot — her Elo update'i sonrası append-only tarihçe (spec §5, §10).
 *
 * Profile rating chart (Phase 8) bunu okur. `delta` MVP bonusunu da içerir.
 */
export const skillSnapshot = pgTable(
  "skill_snapshot",
  {
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
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "skill_snapshot_reason_valid",
      sql`${t.reason} IN ('match', 'mvp_bonus', 'admin')`,
    ),
    index("skill_snapshot_profile_time_idx").on(t.profileId, t.createdAt),
    index("skill_snapshot_event_idx").on(t.eventId),
  ],
);

export type SkillSnapshot = typeof skillSnapshot.$inferSelect;
export type NewSkillSnapshot = typeof skillSnapshot.$inferInsert;

/**
 * Notification — Phase 9 (spec §13).
 *
 * In-app bildirim. Kinds (string union, schema CHECK):
 *   - rsvp_approved        → talebin onaylandı
 *   - rsvp_rejected        → talebin reddedildi
 *   - event_full           → event kadrosu doldu (organizer'a)
 *   - event_cancelled      → katıldığın event iptal
 *   - team_assignment      → takımlar oluşturuldu / güncellendi
 *   - match_completed      → katıldığın etkinlik bitti, MVP oylama açık
 *   - mvp_received         → senin için oy verildi (MVP kazandın)
 *   - chat_mention         → (Phase 9 backlog) mesajda etiketlendin
 *
 * Payload jsonb: kind'a göre değişen ek bilgi (event_id, ratingDelta, vs.).
 */
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    eventId: uuid("event_id").references(() => event.id, {
      onDelete: "cascade",
    }),
    payload: text("payload"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "notification_kind_valid",
      sql`${t.kind} IN ('rsvp_approved', 'rsvp_rejected', 'event_full',
                        'event_cancelled', 'team_assignment', 'match_completed',
                        'mvp_received', 'chat_mention')`,
    ),
    index("notification_recipient_unread_idx")
      .on(t.recipientId, t.createdAt)
      .where(sql`read_at IS NULL`),
    index("notification_recipient_time_idx").on(t.recipientId, t.createdAt),
  ],
);

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;

/** Report — chat moderation (spec §5, §12). */
export const report = pgTable("report", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => profile.id, { onDelete: "cascade" }),
  targetMessageId: uuid("target_message_id").references(() => chatMessage.id, {
    onDelete: "cascade",
  }),
  targetProfileId: uuid("target_profile_id").references(() => profile.id, {
    onDelete: "cascade",
  }),
  reason: text("reason").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Report = typeof report.$inferSelect;
