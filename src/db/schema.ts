/**
 * Onside — DB schema (single source of truth).
 *
 * Identity model: every action carries an inline `nickname` text. There is no
 * profile table, no Supabase Auth coupling, no UUID-per-user. See
 * `0019_drop_auth_profile.sql` for the schema reshape that introduced this.
 *
 * Tables retired in 0019: profile, mvp_vote, skill_snapshot, notification, report.
 * They will be reintroduced in fresh form when their features return.
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

/**
 * Venue (saha) — read-only catalog. PostGIS `location geography(POINT, 4326)`
 * column is added in migration 0002 as a generated-stored column.
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
 * Event — every event carries an `organizerNickname` set by whoever filled out
 * the create form. There's no notion of a returning organizer; the field is
 * informational on the listing/detail screens.
 */
export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerNickname: text("organizer_nickname").notNull(),
    venueId: uuid("venue_id").references(() => venue.id, {
      onDelete: "restrict",
    }),
    customVenueName: text("custom_venue_name"),
    customVenueUrl: text("custom_venue_url"),
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
    check(
      "event_venue_xor",
      sql`(${t.venueId} IS NOT NULL)::int + (${t.customVenueName} IS NOT NULL)::int = 1`,
    ),
    check(
      "event_custom_venue_name_len",
      sql`${t.customVenueName} IS NULL OR char_length(${t.customVenueName}) <= 200`,
    ),
    check(
      "event_custom_venue_url_len",
      sql`${t.customVenueUrl} IS NULL OR char_length(${t.customVenueUrl}) <= 500`,
    ),
    check(
      "event_organizer_nickname_format",
      sql`${t.organizerNickname} ~ '^[A-Za-z0-9_ -]{3,24}$'`,
    ),
    index("event_status_start_idx").on(t.status, t.startAt),
    index("event_start_idx").on(t.startAt),
    index("event_venue_idx").on(t.venueId),
  ],
);

export type Event = typeof event.$inferSelect;
export type NewEvent = typeof event.$inferInsert;

export const participantStatusEnum = pgEnum("participant_status", [
  "pending",
  "confirmed",
  "cancelled",
  "no_show",
  "attended",
]);

/**
 * Event participant — RSVP keyed on `(event_id, nickname)` for active rows.
 * Same nickname re-RSVPing is idempotent at the RPC layer; different
 * nicknames from the same browser are allowed (no uniqueness on identity
 * because there is no identity).
 */
export const eventParticipant = pgTable(
  "event_participant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    position: positionEnum("position").notNull(),
    status: participantStatusEnum("status").notNull().default("confirmed"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
  },
  (t) => [
    check(
      "event_participant_nickname_format",
      sql`${t.nickname} ~ '^[A-Za-z0-9_ -]{3,24}$'`,
    ),
    uniqueIndex("event_participant_unique_active")
      .on(t.eventId, t.nickname)
      .where(sql`status <> 'cancelled'`),
    index("event_participant_event_idx").on(t.eventId),
    index("event_participant_nickname_idx").on(t.nickname),
  ],
);

export type EventParticipant = typeof eventParticipant.$inferSelect;
export type NewEventParticipant = typeof eventParticipant.$inferInsert;

/**
 * Chat message — `kind='text'` requires a non-null `sender_nickname`;
 * `kind='system'` requires NULL (server-emitted prompts like "Takımlar
 * oluşturuldu.").
 */
export const chatMessage = pgTable(
  "chat_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    senderNickname: text("sender_nickname"),
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
      sql`(${t.kind} = 'system' AND ${t.senderNickname} IS NULL)
          OR (${t.kind} = 'text' AND ${t.senderNickname} IS NOT NULL)`,
    ),
    check(
      "chat_message_sender_nickname_format",
      sql`${t.senderNickname} IS NULL OR ${t.senderNickname} ~ '^[A-Za-z0-9_ -]{3,24}$'`,
    ),
    index("chat_message_event_time_idx").on(t.eventId, t.createdAt),
  ],
);

export type ChatMessage = typeof chatMessage.$inferSelect;
export type NewChatMessage = typeof chatMessage.$inferInsert;

/**
 * Team — two rows per event (label='A', label='B'). `seed` is the algorithm's
 * input so the same nicknames always balance the same way for a given seed.
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
 * Team assignment — keyed on `(event_id, nickname)` per row; one row per
 * confirmed nickname when teams are saved.
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
    nickname: text("nickname").notNull(),
    position: positionEnum("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "team_assignment_nickname_format",
      sql`${t.nickname} ~ '^[A-Za-z0-9_ -]{3,24}$'`,
    ),
    uniqueIndex("team_assignment_event_nickname_unique").on(
      t.eventId,
      t.nickname,
    ),
    index("team_assignment_team_idx").on(t.teamId),
    index("team_assignment_event_idx").on(t.eventId),
  ],
);

export type TeamAssignment = typeof teamAssignment.$inferSelect;
export type NewTeamAssignment = typeof teamAssignment.$inferInsert;

/**
 * Match result — one row per event. `submittedByNickname` records who entered
 * the score; no enforcement (anyone with the link can submit).
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
    submittedByNickname: text("submitted_by_nickname").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("match_result_event_unique").on(t.eventId),
    check("match_result_score_a_range", sql`${t.scoreA} BETWEEN 0 AND 30`),
    check("match_result_score_b_range", sql`${t.scoreB} BETWEEN 0 AND 30`),
    check(
      "match_result_submitter_nickname_format",
      sql`${t.submittedByNickname} ~ '^[A-Za-z0-9_ -]{3,24}$'`,
    ),
  ],
);

export type MatchResult = typeof matchResult.$inferSelect;
export type NewMatchResult = typeof matchResult.$inferInsert;

/**
 * Player match stat — one row per nickname assigned to a team for a match.
 * Seeded by `submit_score`, edited per goal/assist by future score-editing UI.
 */
export const playerMatchStat = pgTable(
  "player_match_stat",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    teamLabel: text("team_label").notNull(),
    attended: boolean("attended").notNull().default(true),
    goals: integer("goals").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "player_match_stat_nickname_format",
      sql`${t.nickname} ~ '^[A-Za-z0-9_ -]{3,24}$'`,
    ),
    uniqueIndex("player_match_stat_event_nickname_unique").on(
      t.eventId,
      t.nickname,
    ),
    check("player_match_stat_team_valid", sql`${t.teamLabel} IN ('A', 'B')`),
    check("player_match_stat_goals_range", sql`${t.goals} BETWEEN 0 AND 30`),
    check(
      "player_match_stat_assists_range",
      sql`${t.assists} BETWEEN 0 AND 30`,
    ),
    index("player_match_stat_event_idx").on(t.eventId),
    index("player_match_stat_nickname_idx").on(t.nickname),
  ],
);

export type PlayerMatchStat = typeof playerMatchStat.$inferSelect;
export type NewPlayerMatchStat = typeof playerMatchStat.$inferInsert;
