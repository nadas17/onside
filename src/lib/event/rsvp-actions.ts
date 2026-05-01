"use server";

/**
 * RSVP server actions — Phase 4 + ADR-0003 (organizer approval).
 *
 * Mutation'lar SECURITY DEFINER RPC'ler aracılığıyla atomik:
 *   join_event(uuid, position)        — pending insert
 *   approve_participant(uuid)         — organizer-only, capacity check
 *   reject_participant(uuid, reason?) — organizer-only, opsiyonel reason
 *   cancel_rsvp(uuid)                 — pending VEYA confirmed self-cancel
 *   kick_participant(uuid, uuid)      — organizer-only confirmed kick
 *
 * Roster ve pending listesi normal SELECT (RLS public).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

type Position = "GK" | "DEF" | "MID" | "FWD";

type RpcOk = {
  ok: true;
  data: {
    participant_id: string;
    already_requested?: boolean;
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
  position: Position,
): Promise<ActionResult<{ participantId: string; alreadyRequested: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_event", {
    p_event_id: eventId,
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
      alreadyRequested: result.data.already_requested ?? false,
    },
  };
}

export async function approveParticipantAction(
  participantId: string,
): Promise<ActionResult<{ participantId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_participant", {
    p_participant_id: participantId,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as RpcResult;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { participantId: result.data.participant_id } };
}

export async function rejectParticipantAction(
  participantId: string,
  reason?: string,
): Promise<ActionResult<{ participantId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reject_participant", {
    p_participant_id: participantId,
    p_reason: reason && reason.trim() ? reason.trim() : null,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as RpcResult;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { participantId: result.data.participant_id } };
}

export async function cancelRsvpAction(
  eventId: string,
): Promise<ActionResult<{ participantId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_rsvp", {
    p_event_id: eventId,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as RpcResult;
  if (!result.ok) return { ok: false, error: result.error, code: result.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { participantId: result.data.participant_id } };
}

export async function kickParticipantAction(
  eventId: string,
  profileId: string,
): Promise<ActionResult<{ participantId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kick_participant", {
    p_event_id: eventId,
    p_profile_id: profileId,
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
  profile: {
    id: string;
    username: string;
    display_name: string;
    skill_level: "beginner" | "intermediate" | "advanced" | "pro";
    skill_rating: number;
  };
};

/** Confirmed katılımcılar (kadro). */
export async function getEventRosterAction(
  eventId: string,
): Promise<ActionResult<RosterEntry[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_participant")
    .select(
      `id, position, joined_at, status, rejected_reason,
       profile:profile_id ( id, username, display_name, skill_level, skill_rating )`,
    )
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .order("joined_at", { ascending: true });

  if (error) return { ok: false, error: error.message, code: "db_error" };
  return { ok: true, data: (data ?? []) as unknown as RosterEntry[] };
}

/** Bekleyen talepler — sadece organizer'ın görmesi anlamlı (RLS public ama UI'da gizli). */
export async function getPendingRequestsAction(
  eventId: string,
): Promise<ActionResult<RosterEntry[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_participant")
    .select(
      `id, position, joined_at, status, rejected_reason,
       profile:profile_id ( id, username, display_name, skill_level, skill_rating )`,
    )
    .eq("event_id", eventId)
    .eq("status", "pending")
    .order("joined_at", { ascending: true });

  if (error) return { ok: false, error: error.message, code: "db_error" };
  return { ok: true, data: (data ?? []) as unknown as RosterEntry[] };
}

export type MyRsvp = {
  participantId: string;
  position: Position;
  status: "pending" | "confirmed";
  rejectedReason: string | null;
  joinedAt: string;
};

export async function getMyRsvpAction(
  eventId: string,
): Promise<ActionResult<MyRsvp | null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true, data: null };

  // En son aktif olan kayıt (pending veya confirmed)
  const { data } = await supabase
    .from("event_participant")
    .select("id, position, status, rejected_reason, joined_at")
    .eq("event_id", eventId)
    .eq("profile_id", user.id)
    .in("status", ["pending", "confirmed"])
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { ok: true, data: null };

  return {
    ok: true,
    data: {
      participantId: data.id as string,
      position: data.position as Position,
      status: data.status as "pending" | "confirmed",
      rejectedReason: (data.rejected_reason as string | null) ?? null,
      joinedAt: data.joined_at as string,
    },
  };
}
