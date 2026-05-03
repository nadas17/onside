"use server";

/**
 * Chat server actions — Phase 5 (spec §12).
 *
 * Mutation'lar SECURITY DEFINER RPC'ler aracılığıyla:
 *   send_message(uuid, text)        — confirmed katılımcı veya organizer
 *   delete_message(uuid)            — owner 5dk / organizer her zaman, soft delete
 *   report_message(uuid, reason)    — herkes raporlayabilir, idempotent
 *
 * Rate limit: 1 mesaj/saniye + 10 mesaj/dakika per-user (Phase 9'da Upstash).
 */

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/types";

export type ChatMessageRow = {
  id: string;
  event_id: string;
  sender_id: string | null;
  content: string;
  kind: "text" | "system";
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
  sender: {
    id: string;
    username: string;
    display_name: string;
  } | null;
};

type RpcOk<T = Record<string, unknown>> = { ok: true; data: T };
type RpcErr = { ok: false; code: string; error?: string };

export async function sendMessageAction(
  eventId: string,
  content: string,
): Promise<ActionResult<{ messageId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Oturum bulunamadı.", code: "auth_failed" };
  }

  // Per-user rate limit (1 msg/sec + 10 msg/min)
  const rl1s = await rateLimit(`chat:${user.id}:1s`, 1, 1000);
  if (!rl1s.allowed) {
    return {
      ok: false,
      error: "Çok hızlı yazıyorsun, biraz yavaşla.",
      code: "rate_limited",
    };
  }
  const rl1m = await rateLimit(`chat:${user.id}:1m`, 10, 60_000);
  if (!rl1m.allowed) {
    return {
      ok: false,
      error: "Bu dakika için mesaj limitini doldurdun.",
      code: "rate_limited",
    };
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Boş mesaj.", code: "invalid_input" };
  }
  if (trimmed.length > 1000) {
    return {
      ok: false,
      error: "Mesaj 1000 karakteri aşıyor.",
      code: "invalid_input",
    };
  }

  const { data, error } = await supabase.rpc("send_message", {
    p_event_id: eventId,
    p_content: trimmed,
  });

  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as RpcOk<{ message_id: string }> | RpcErr;
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "Mesaj gönderilemedi.",
      code: result.code,
    };
  }

  return { ok: true, data: { messageId: result.data.message_id } };
}

export async function deleteMessageAction(
  messageId: string,
): Promise<ActionResult<{ messageId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_message", {
    p_message_id: messageId,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as RpcOk<{ message_id: string }> | RpcErr;
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "Silinemedi.",
      code: result.code,
    };
  }
  return { ok: true, data: { messageId: result.data.message_id } };
}

export async function reportMessageAction(
  messageId: string,
  reason: "spam" | "harassment" | "inappropriate" | "other",
  notes?: string,
): Promise<ActionResult<{ alreadyReported?: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_message", {
    p_message_id: messageId,
    p_reason: reason,
    p_notes: notes && notes.trim() ? notes.trim() : null,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const result = data as
    | RpcOk<{ report_id?: string; already_reported?: boolean }>
    | RpcErr;
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "Raporlanamadı.",
      code: result.code,
    };
  }
  return {
    ok: true,
    data: { alreadyReported: result.data.already_reported ?? false },
  };
}

/** Server-only system message helper (cancel event vb). */
export async function postSystemMessage(
  eventId: string,
  content: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("post_system_message", {
    p_event_id: eventId,
    p_content: content,
  });
}

export async function getMessagesAction(
  eventId: string,
  limit: number = 100,
): Promise<ActionResult<ChatMessageRow[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_message")
    .select(
      `id, event_id, sender_id, content, kind, is_deleted, created_at, edited_at,
       sender:sender_id ( id, username, display_name )`,
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<ChatMessageRow[]>();

  if (error) return { ok: false, error: error.message, code: "db_error" };

  // Newest-first → oldest-first
  const sorted = (data ?? []).slice().reverse();
  return { ok: true, data: sorted };
}
