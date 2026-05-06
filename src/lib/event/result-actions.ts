"use server";

/**
 * Match result server actions — nickname-only identity (post 0019).
 *
 *   submitScoreAction(eventId, scoreA, scoreB, submitterNickname, notes?)
 *   editScoreAction(eventId, scoreA, scoreB, notes?)
 *   getMatchResultAction(eventId)
 *
 * MVP voting/Elo are deferred — `submit_mvp_vote`, `finalize_mvp`,
 * `getMvpStateAction` are gone with the `mvp_vote` and `skill_snapshot`
 * tables.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { nicknameSchema } from "@/lib/validation/nickname";

type RpcOk<T> = { ok: true; data: T };
type RpcErr = { ok: false; code: string; error: string };

export async function submitScoreAction(
  eventId: string,
  scoreA: number,
  scoreB: number,
  submitterNickname: string,
  notes?: string,
): Promise<ActionResult<{ matchId: string }>> {
  const parsed = nicknameSchema.safeParse(submitterNickname);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Geçersiz takma ad.",
      code: "invalid_nickname",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_score", {
    p_event_id: eventId,
    p_score_a: scoreA,
    p_score_b: scoreB,
    p_submitter_nickname: parsed.data,
    p_notes: notes && notes.trim() ? notes.trim() : null,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const r = data as RpcOk<{ match_id: string }> | RpcErr;
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { matchId: r.data.match_id } };
}

export async function editScoreAction(
  eventId: string,
  scoreA: number,
  scoreB: number,
  notes?: string,
): Promise<ActionResult<{ matchId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edit_score", {
    p_event_id: eventId,
    p_score_a: scoreA,
    p_score_b: scoreB,
    p_notes: notes && notes.trim() ? notes.trim() : null,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const r = data as RpcOk<{ match_id: string }> | RpcErr;
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { matchId: r.data.match_id } };
}

export type MatchResultView = {
  eventId: string;
  scoreA: number;
  scoreB: number;
  notes: string | null;
  submittedAt: string;
  editedAt: string | null;
  submittedByNickname: string;
};

type MatchResultRow = {
  event_id: string;
  score_a: number;
  score_b: number;
  notes: string | null;
  submitted_at: string;
  edited_at: string | null;
  submitted_by_nickname: string;
};

export async function getMatchResultAction(
  eventId: string,
): Promise<ActionResult<MatchResultView | null>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match_result")
    .select(
      `event_id, score_a, score_b, notes, submitted_at, edited_at, submitted_by_nickname`,
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
      submittedByNickname: data.submitted_by_nickname,
    },
  };
}
