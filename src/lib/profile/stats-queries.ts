"use server";

/**
 * Profile stats queries — Phase 8.
 *
 * profile.{matches_played, matches_won, goals_scored, mvp_count, skill_rating}
 * zaten submit_score / finalize_mvp RPC'leriyle güncellendiği için tekil okuma
 * yeterli. Bu modül time-series ve detail listeler için ek select'ler ekler:
 *
 *   getSkillHistoryAction(profileId, limit?) — skill_snapshot kronolojik
 *   getRecentMatchesAction(profileId, limit?) — son N maç + sonuç + W/L
 */

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export type SkillPoint = {
  ratingAfter: number;
  ratingBefore: number;
  delta: number;
  reason: "match" | "mvp_bonus" | "admin";
  eventId: string | null;
  createdAt: string;
};

export async function getSkillHistoryAction(
  profileId: string,
  limit = 50,
): Promise<ActionResult<SkillPoint[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("skill_snapshot")
    .select("rating_before, rating_after, delta, reason, event_id, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return { ok: false, error: error.message, code: "db_error" };

  type Row = {
    rating_before: number;
    rating_after: number;
    delta: number;
    reason: "match" | "mvp_bonus" | "admin";
    event_id: string | null;
    created_at: string;
  };
  const rows = (data ?? []) as Row[];
  return {
    ok: true,
    data: rows.map((r) => ({
      ratingBefore: r.rating_before,
      ratingAfter: r.rating_after,
      delta: r.delta,
      reason: r.reason,
      eventId: r.event_id,
      createdAt: r.created_at,
    })),
  };
}

export type RecentMatch = {
  eventId: string;
  title: string;
  startAt: string;
  venueName: string;
  venueCity: string;
  team: "A" | "B";
  goals: number;
  attended: boolean;
  scoreA: number;
  scoreB: number;
  outcome: "win" | "loss" | "draw" | "no_show";
  eloDelta: number;
  isMvp: boolean;
};

export async function getRecentMatchesAction(
  profileId: string,
  limit = 10,
): Promise<ActionResult<RecentMatch[]>> {
  const supabase = await createClient();

  type StatRow = {
    event_id: string;
    team_label: "A" | "B";
    goals: number;
    attended: boolean;
    elo_delta: number;
    created_at: string;
    event: {
      id: string;
      title: string;
      start_at: string;
      venue: { name: string; city: string } | null;
    } | null;
  };

  // 1. Stats + event + venue
  const { data: stats, error: statErr } = await supabase
    .from("player_match_stat")
    .select(
      `event_id, team_label, goals, attended, elo_delta, created_at,
       event:event_id ( id, title, start_at,
         venue:venue_id ( name, city )
       )`,
    )
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<StatRow[]>();

  if (statErr) return { ok: false, error: statErr.message, code: "db_error" };

  const statRows = stats ?? [];
  const eventIds = statRows.map((s) => s.event_id);
  if (eventIds.length === 0) return { ok: true, data: [] };

  // 2. match_result tek query'de batch
  const { data: results, error: resErr } = await supabase
    .from("match_result")
    .select("event_id, score_a, score_b, mvp_profile_id")
    .in("event_id", eventIds);

  if (resErr) return { ok: false, error: resErr.message, code: "db_error" };

  type ResultRow = {
    event_id: string;
    score_a: number;
    score_b: number;
    mvp_profile_id: string | null;
  };
  const resultMap = new Map<string, ResultRow>();
  for (const r of (results ?? []) as ResultRow[]) {
    resultMap.set(r.event_id, r);
  }

  // 3. Birleştir
  const matches: RecentMatch[] = [];
  for (const s of statRows) {
    if (!s.event) continue;
    const m = resultMap.get(s.event_id);
    if (!m) continue;

    let outcome: RecentMatch["outcome"];
    if (!s.attended) {
      outcome = "no_show";
    } else if (m.score_a === m.score_b) {
      outcome = "draw";
    } else {
      const winnerTeam = m.score_a > m.score_b ? "A" : "B";
      outcome = winnerTeam === s.team_label ? "win" : "loss";
    }

    matches.push({
      eventId: s.event.id,
      title: s.event.title,
      startAt: s.event.start_at,
      venueName: s.event.venue?.name ?? "—",
      venueCity: s.event.venue?.city ?? "",
      team: s.team_label,
      goals: s.goals,
      attended: s.attended,
      scoreA: m.score_a,
      scoreB: m.score_b,
      outcome,
      eloDelta: s.elo_delta,
      isMvp: m.mvp_profile_id === profileId,
    });
  }

  return { ok: true, data: matches };
}
