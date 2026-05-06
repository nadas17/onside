"use server";

/**
 * Team balancing server actions — nickname-only identity (post 0019).
 *
 *   computeAndSaveTeamsAction(eventId, opts?) — algorithm + persist
 *   saveTeamsAction(eventId, payload, seed)   — manual override persist
 *   unlockTeamsAction(eventId)                — locked → open/full
 *   getTeamsAction(eventId)                   — A/B + members (public read)
 *
 * The balance algorithm runs against `event_participant` rows directly.
 * `skill_rating` is no longer in the database; we feed every player a flat
 * 1000 so the algorithm degenerates to pure position-balancing. Skill-aware
 * balancing returns when ratings come back in a future iteration.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  balance,
  type BalanceConfig,
  type BalanceWarning,
  type Player,
  type Position,
} from "@/lib/balance/algorithm";
import type { ActionResult } from "@/lib/types";

type ConfirmedRow = {
  nickname: string;
  position: Position;
};

type SaveTeamsRpcOk = {
  ok: true;
  data: {
    team_a_id: string;
    team_b_id: string;
  };
};
type SaveTeamsRpcErr = { ok: false; code: string; error: string };
type SaveTeamsRpcResult = SaveTeamsRpcOk | SaveTeamsRpcErr;

type UnlockRpcOk = { ok: true };
type UnlockRpcErr = { ok: false; code: string; error: string };
type UnlockRpcResult = UnlockRpcOk | UnlockRpcErr;

export type ComputedTeam = {
  label: "A" | "B";
  skillTotal: number;
  members: Array<{
    nickname: string;
    position: Position;
    skillRating: number;
  }>;
};

export type ComputeTeamsResult = {
  seed: number;
  teamA: ComputedTeam;
  teamB: ComputedTeam;
  warnings: BalanceWarning[];
  iterations: number;
  skillDiff: number;
  positionPenalty: number;
};

const FLAT_SKILL_RATING = 1000;

export async function computeAndSaveTeamsAction(
  eventId: string,
  opts?: { seed?: number; positionWeight?: number },
): Promise<ActionResult<ComputeTeamsResult>> {
  const supabase = await createClient();

  const { data: rosterRows, error: rosterErr } = await supabase
    .from("event_participant")
    .select(`nickname, position`)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .returns<ConfirmedRow[]>();

  if (rosterErr) {
    return { ok: false, error: rosterErr.message, code: "db_error" };
  }
  const rows = rosterRows ?? [];
  if (rows.length < 4) {
    return {
      ok: false,
      error: "En az 4 onaylı oyuncu gerekli.",
      code: "not_enough_players",
    };
  }

  const players: Player[] = rows.map((r) => ({
    id: r.nickname,
    position: r.position,
    skillRating: FLAT_SKILL_RATING,
  }));

  const seed = opts?.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const config: BalanceConfig = {
    seed,
    positionWeight: opts?.positionWeight,
  };

  let result;
  try {
    result = balance(players, config);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "balance failed",
      code: "balance_error",
    };
  }

  const computed: ComputeTeamsResult = {
    seed,
    teamA: {
      label: "A",
      skillTotal: result.metrics.a.skillTotal,
      members: result.teamA.map((p) => ({
        nickname: p.id,
        position: p.position,
        skillRating: p.skillRating,
      })),
    },
    teamB: {
      label: "B",
      skillTotal: result.metrics.b.skillTotal,
      members: result.teamB.map((p) => ({
        nickname: p.id,
        position: p.position,
        skillRating: p.skillRating,
      })),
    },
    warnings: result.metrics.warnings,
    iterations: result.metrics.iterations,
    skillDiff: result.metrics.skillDiff,
    positionPenalty: result.metrics.positionPenalty,
  };

  const persistResult = await persistTeams(supabase, eventId, computed, seed);
  if (!persistResult.ok) return persistResult;

  return { ok: true, data: computed };
}

export async function saveTeamsAction(
  eventId: string,
  payload: { teamA: ComputedTeam; teamB: ComputedTeam },
  seed: number,
): Promise<ActionResult<{ eventId: string }>> {
  const supabase = await createClient();
  const persistResult = await persistTeams(
    supabase,
    eventId,
    {
      seed,
      teamA: payload.teamA,
      teamB: payload.teamB,
      warnings: [],
      iterations: 0,
      skillDiff: 0,
      positionPenalty: 0,
    },
    seed,
  );
  if (!persistResult.ok) return persistResult;
  return { ok: true, data: { eventId } };
}

export async function unlockTeamsAction(
  eventId: string,
): Promise<ActionResult<{ eventId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unlock_teams", {
    p_event_id: eventId,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as UnlockRpcResult;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };

  revalidatePath("/", "layout");
  return { ok: true, data: { eventId } };
}

export type TeamMember = {
  nickname: string;
  position: Position;
};

export type TeamView = {
  label: "A" | "B";
  skillTotal: number;
  members: TeamMember[];
};

export async function getTeamsAction(
  eventId: string,
): Promise<ActionResult<TeamView[]>> {
  const supabase = await createClient();
  const { data: teams, error: tErr } = await supabase
    .from("team")
    .select("id, label, skill_total")
    .eq("event_id", eventId)
    .order("label", { ascending: true });

  if (tErr) return { ok: false, error: tErr.message, code: "db_error" };
  if (!teams || teams.length === 0) return { ok: true, data: [] };

  type AssignmentRow = {
    team_id: string;
    position: Position;
    nickname: string;
  };

  const { data: assignments, error: aErr } = await supabase
    .from("team_assignment")
    .select(`team_id, position, nickname`)
    .eq("event_id", eventId)
    .returns<AssignmentRow[]>();

  if (aErr) return { ok: false, error: aErr.message, code: "db_error" };

  const assignmentRows = assignments ?? [];

  const teamViews: TeamView[] = teams.map((t) => ({
    label: t.label as "A" | "B",
    skillTotal: t.skill_total as number,
    members: assignmentRows
      .filter((a) => a.team_id === t.id)
      .map((a) => ({
        nickname: a.nickname,
        position: a.position,
      })),
  }));

  return { ok: true, data: teamViews };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function persistTeams(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  computed: ComputeTeamsResult,
  seed: number,
): Promise<ActionResult<{ eventId: string }>> {
  const payload = {
    teamA: {
      skillTotal: computed.teamA.skillTotal,
      members: computed.teamA.members.map((m) => ({
        nickname: m.nickname,
        position: m.position,
      })),
    },
    teamB: {
      skillTotal: computed.teamB.skillTotal,
      members: computed.teamB.members.map((m) => ({
        nickname: m.nickname,
        position: m.position,
      })),
    },
  };

  const { data, error } = await supabase.rpc("save_teams", {
    p_event_id: eventId,
    p_seed: seed,
    p_assignments: payload,
  });

  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as SaveTeamsRpcResult;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };

  revalidatePath("/", "layout");
  return { ok: true, data: { eventId } };
}
