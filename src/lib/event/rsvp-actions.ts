"use server";

/**
 * RSVP server actions — nickname-only identity (post 0019).
 *
 *   joinEventAction(eventId, nickname, position)   — idempotent on (event_id, nickname)
 *   cancelRsvpAction(eventId, nickname)            — soft-cancel, frees capacity
 *   getEventRosterAction(eventId)                  — confirmed list, flat nicknames
 *
 * Approval/kick/getMyRsvp/getPending all gone — no organizer concept and no
 * persistent identity to scope "my" RSVP to.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { nicknameSchema } from "@/lib/validation/nickname";

type Position = "GK" | "DEF" | "MID" | "FWD";

type RpcOk = {
  ok: true;
  data: {
    participant_id: string;
    already_joined?: boolean;
  };
};
type RpcErr = {
  ok: false;
  code: string;
  error: string;
};
type RpcResult = RpcOk | RpcErr;

export async function joinEventAction(
  eventId: string,
  nickname: string,
  position: Position,
): Promise<ActionResult<{ participantId: string; alreadyJoined: boolean }>> {
  const parsed = nicknameSchema.safeParse(nickname);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Geçersiz takma ad.",
      code: "invalid_nickname",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_event", {
    p_event_id: eventId,
    p_nickname: parsed.data,
    p_position: position,
  });

  if (error) {
    return { ok: false, error: error.message, code: "db_error" };
  }
  const result = data as RpcResult;
  if (!result.ok) {
    return { ok: false, error: result.error, code: result.code };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    data: {
      participantId: result.data.participant_id,
      alreadyJoined: result.data.already_joined ?? false,
    },
  };
}

export async function cancelRsvpAction(
  eventId: string,
  nickname: string,
): Promise<ActionResult<{ participantId: string }>> {
  const parsed = nicknameSchema.safeParse(nickname);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Geçersiz takma ad.",
      code: "invalid_nickname",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_rsvp", {
    p_event_id: eventId,
    p_nickname: parsed.data,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as RpcResult;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { participantId: result.data.participant_id } };
}

export type RosterEntry = {
  id: string;
  position: Position;
  joined_at: string;
  status: "pending" | "confirmed" | "cancelled" | "no_show" | "attended";
  rejected_reason: string | null;
  nickname: string;
};

export async function getEventRosterAction(
  eventId: string,
): Promise<ActionResult<RosterEntry[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_participant")
    .select(`id, position, joined_at, status, rejected_reason, nickname`)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .order("joined_at", { ascending: true })
    .returns<RosterEntry[]>();

  if (error) return { ok: false, error: error.message, code: "db_error" };
  return { ok: true, data: data ?? [] };
}
