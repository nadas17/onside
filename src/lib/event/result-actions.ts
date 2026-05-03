"use server";

/**
 * Match result + MVP server actions — Phase 7.
 *
 *   submitScoreAction(eventId, scoreA, scoreB, notes?)   — organizer-only
 *   editScoreAction(eventId, scoreA, scoreB, notes?)     — 24h pencere
 *   submitMvpVoteAction(eventId, voteeId)                — attended only
 *   finalizeMvpAction(eventId, voteeId?)                 — organizer-only
 *   getMatchResultAction(eventId)
 *   getMvpStateAction(eventId)
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

type RpcOk<T> = { ok: true; data: T };
type RpcErr = { ok: false; code: string; error: string };

export async function submitScoreAction(
  eventId: string,
  scoreA: number,
  scoreB: number,
  notes?: string,
): Promise<ActionResult<{ eventId: string; scoreA: number; scoreB: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_score", {
    p_event_id: eventId,
    p_score_a: scoreA,
    p_score_b: scoreB,
    p_notes: notes && notes.trim() ? notes.trim() : null,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const r = data as
    | RpcOk<{ event_id: string; score_a: number; score_b: number }>
    | RpcErr;
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  revalidatePath("/", "layout");
  return {
    ok: true,
    data: {
      eventId: r.data.event_id,
      scoreA: r.data.score_a,
      scoreB: r.data.score_b,
    },
  };
}

export async function editScoreAction(
  eventId: string,
  scoreA: number,
  scoreB: number,
  notes?: string,
): Promise<ActionResult<{ eventId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edit_score", {
    p_event_id: eventId,
    p_score_a: scoreA,
    p_score_b: scoreB,
    p_notes: notes && notes.trim() ? notes.trim() : null,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const r = data as RpcOk<{ event_id: string }> | RpcErr;
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { eventId: r.data.event_id } };
}

export async function submitMvpVoteAction(
  eventId: string,
  voteeId: string,
): Promise<ActionResult<{ eventId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_mvp_vote", {
    p_event_id: eventId,
    p_votee_id: voteeId,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const r = data as RpcOk<{ event_id: string }> | RpcErr;
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { eventId: r.data.event_id } };
}

export async function finalizeMvpAction(
  eventId: string,
  voteeId?: string,
): Promise<
  ActionResult<{
    eventId: string;
    mvpProfileId: string | null;
    noVotes?: boolean;
  }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finalize_mvp", {
    p_event_id: eventId,
    p_votee_id: voteeId ?? null,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const r = data as
    | RpcOk<{
        event_id: string;
        mvp_profile_id: string | null;
        no_votes?: boolean;
      }>
    | RpcErr;
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  revalidatePath("/", "layout");
  return {
    ok: true,
    data: {
      eventId: r.data.event_id,
      mvpProfileId: r.data.mvp_profile_id,
      noVotes: r.data.no_votes,
    },
  };
}

export type MatchResultView = {
  eventId: string;
  scoreA: number;
  scoreB: number;
  notes: string | null;
  submittedAt: string;
  editedAt: string | null;
  mvpProfileId: string | null;
  mvpFinalizedAt: string | null;
  mvp: {
    id: string;
    username: string;
    displayName: string;
  } | null;
};

type MatchResultRow = {
  event_id: string;
  score_a: number;
  score_b: number;
  notes: string | null;
  submitted_at: string;
  edited_at: string | null;
  mvp_profile_id: string | null;
  mvp_finalized_at: string | null;
  mvp: { id: string; username: string; display_name: string } | null;
};

export async function getMatchResultAction(
  eventId: string,
): Promise<ActionResult<MatchResultView | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match_result")
    .select(
      `event_id, score_a, score_b, notes, submitted_at, edited_at,
       mvp_profile_id, mvp_finalized_at,
       mvp:mvp_profile_id ( id, username, display_name )`,
    )
    .eq("event_id", eventId)
    .maybeSingle()
    .returns<MatchResultRow>();

  if (error) return { ok: false, error: error.message, code: "db_error" };
  if (!data) return { ok: true, data: null };

  return {
    ok: true,
    data: {
      eventId: data.event_id,
      scoreA: data.score_a,
      scoreB: data.score_b,
      notes: data.notes,
      submittedAt: data.submitted_at,
      editedAt: data.edited_at,
      mvpProfileId: data.mvp_profile_id,
      mvpFinalizedAt: data.mvp_finalized_at,
      mvp: data.mvp
        ? {
            id: data.mvp.id,
            username: data.mvp.username,
            displayName: data.mvp.display_name,
          }
        : null,
    },
  };
}

export type MvpCandidate = {
  profileId: string;
  username: string;
  displayName: string;
  team: "A" | "B";
  voteCount: number;
};

export type MvpState = {
  candidates: MvpCandidate[];
  myVoteId: string | null;
  totalVotes: number;
  votingOpen: boolean;
  windowEndsAt: string | null;
};

export async function getMvpStateAction(
  eventId: string,
): Promise<ActionResult<MvpState>> {
  const supabase = await createClient();

  // Match + window check
  const { data: match } = await supabase
    .from("match_result")
    .select("submitted_at, mvp_finalized_at")
    .eq("event_id", eventId)
    .maybeSingle<{ submitted_at: string; mvp_finalized_at: string | null }>();

  if (!match) {
    return {
      ok: true,
      data: {
        candidates: [],
        myVoteId: null,
        totalVotes: 0,
        votingOpen: false,
        windowEndsAt: null,
      },
    };
  }

  const submittedAt = new Date(match.submitted_at);
  const windowEnds = new Date(submittedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const votingOpen =
    !match.mvp_finalized_at && Date.now() < windowEnds.getTime();

  type StatRow = {
    profile_id: string;
    team_label: "A" | "B";
    profile: { id: string; username: string; display_name: string } | null;
  };

  // Aday liste: attended olanlar
  const { data: stats } = await supabase
    .from("player_match_stat")
    .select(
      `profile_id, team_label,
       profile:profile_id ( id, username, display_name )`,
    )
    .eq("event_id", eventId)
    .eq("attended", true)
    .returns<StatRow[]>();

  const statRows = stats ?? [];

  // Vote sayıları
  const { data: votes } = await supabase
    .from("mvp_vote")
    .select("voter_id, votee_id")
    .eq("event_id", eventId);

  const voteRows = (votes ?? []) as Array<{
    voter_id: string;
    votee_id: string;
  }>;
  const voteCounts = new Map<string, number>();
  for (const v of voteRows) {
    voteCounts.set(v.votee_id, (voteCounts.get(v.votee_id) ?? 0) + 1);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myVote = user
    ? voteRows.find((v) => v.voter_id === user.id)
    : undefined;

  const candidates: MvpCandidate[] = statRows
    .filter((r) => r.profile)
    .map((r) => ({
      profileId: r.profile_id,
      username: r.profile!.username,
      displayName: r.profile!.display_name,
      team: r.team_label,
      voteCount: voteCounts.get(r.profile_id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.voteCount - a.voteCount || a.displayName.localeCompare(b.displayName),
    );

  return {
    ok: true,
    data: {
      candidates,
      myVoteId: myVote ? myVote.votee_id : null,
      totalVotes: voteRows.length,
      votingOpen,
      windowEndsAt: windowEnds.toISOString(),
    },
  };
}
