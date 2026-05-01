"use server";

/**
 * Team balancing server actions — Phase 6.
 *
 *   computeAndSaveTeamsAction(eventId, opts?)  — algoritma çalıştırır + kaydeder
 *   saveTeamsAction(eventId, payload, seed)    — manuel override sonucunu kaydeder
 *   unlockTeamsAction(eventId)                 — locked → open/full geri al
 *   getTeamsAction(eventId)                    — A/B + members list (public read)
 *
 * Algoritma `lib/balance/algorithm.ts` (pure). DB persist `save_teams` RPC
 * (atomik, organizer-only, capacity + roster validation).
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
  profile_id: string;
  position: Position;
  profile: {
    id: string;
    skill_rating: number;
  };
};

type SaveTeamsRpcOk = {
  ok: true;
  data: {
    event_id: string;
    team_a_id: string;
    team_b_id: string;
  };
};
type SaveTeamsRpcErr = { ok: false; code: string; error: string };
type SaveTeamsRpcResult = SaveTeamsRpcOk | SaveTeamsRpcErr;

type UnlockRpcOk = {
  ok: true;
  data: { event_id: string; status: "open" | "full" };
};
type UnlockRpcErr = { ok: false; code: string; error: string };
type UnlockRpcResult = UnlockRpcOk | UnlockRpcErr;

export type ComputedTeam = {
  label: "A" | "B";
  skillTotal: number;
  members: Array<{
    profileId: string;
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

/** Kadrodan oyuncu listesini çek + balance + RPC'ye gönder. */
export async function computeAndSaveTeamsAction(
  eventId: string,
  opts?: { seed?: number; positionWeight?: number },
): Promise<ActionResult<ComputeTeamsResult>> {
  const supabase = await createClient();

  // Roster
  const { data: rosterRows, error: rosterErr } = await supabase
    .from("event_participant")
    .select(
      `profile_id, position,
       profile:profile_id ( id, skill_rating )`,
    )
    .eq("event_id", eventId)
    .eq("status", "confirmed");

  if (rosterErr) {
    return { ok: false, error: rosterErr.message, code: "db_error" };
  }
  const rows = (rosterRows ?? []) as unknown as ConfirmedRow[];
  if (rows.length < 4) {
    return {
      ok: false,
      error: "En az 4 onaylı oyuncu gerekli.",
      code: "not_enough_players",
    };
  }

  const players: Player[] = rows.map((r) => ({
    id: r.profile_id,
    position: r.position,
    skillRating: r.profile?.skill_rating ?? 1000,
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
        profileId: p.id,
        position: p.position,
        skillRating: p.skillRating,
      })),
    },
    teamB: {
      label: "B",
      skillTotal: result.metrics.b.skillTotal,
      members: result.teamB.map((p) => ({
        profileId: p.id,
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

/** Manuel drag-drop override sonucunu kaydeder. */
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

/** Locked → open/full geri alır (re-balance için). */
export async function unlockTeamsAction(
  eventId: string,
): Promise<ActionResult<{ status: "open" | "full" }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unlock_teams", {
    p_event_id: eventId,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as UnlockRpcResult;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };

  revalidatePath("/", "layout");
  return { ok: true, data: { status: result.data.status } };
}

export type TeamMember = {
  profileId: string;
  username: string;
  displayName: string;
  position: Position;
  skillLevel: "beginner" | "intermediate" | "advanced" | "pro";
  skillRating: number;
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

  const { data: assignments, error: aErr } = await supabase
    .from("team_assignment")
    .select(
      `team_id, position,
       profile:profile_id ( id, username, display_name, skill_level, skill_rating )`,
    )
    .eq("event_id", eventId);

  if (aErr) return { ok: false, error: aErr.message, code: "db_error" };

  type AssignmentRow = {
    team_id: string;
    position: Position;
    profile: {
      id: string;
      username: string;
      display_name: string;
      skill_level: "beginner" | "intermediate" | "advanced" | "pro";
      skill_rating: number;
    } | null;
  };
  const assignmentRows = (assignments ?? []) as unknown as AssignmentRow[];

  const teamViews: TeamView[] = teams.map((t) => ({
    label: t.label as "A" | "B",
    skillTotal: t.skill_total as number,
    members: assignmentRows
      .filter((a) => a.team_id === t.id && a.profile)
      .map((a) => ({
        profileId: a.profile!.id,
        username: a.profile!.username,
        displayName: a.profile!.display_name,
        position: a.position,
        skillLevel: a.profile!.skill_level,
        skillRating: a.profile!.skill_rating,
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
  const payload = [
    {
      team_label: computed.teamA.label,
      skill_total: computed.teamA.skillTotal,
      members: computed.teamA.members.map((m) => ({
        profile_id: m.profileId,
        position: m.position,
      })),
    },
    {
      team_label: computed.teamB.label,
      skill_total: computed.teamB.skillTotal,
      members: computed.teamB.members.map((m) => ({
        profile_id: m.profileId,
        position: m.position,
      })),
    },
  ];

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
