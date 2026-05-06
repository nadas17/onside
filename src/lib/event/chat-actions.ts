"use server";

/**
 * Chat server actions — nickname-only identity (post 0019).
 *
 *   sendMessageAction(eventId, nickname, content)
 *   getMessagesAction(eventId, limit?)
 *   postSystemMessage(eventId, content)              — internal helper
 *
 * delete/report removed alongside the moderation surface; identity is
 * inline-nickname so there's no reliable owner to gate on.
 *
 * Rate limit: IP-keyed (1/sec + 30/min) — anyone can chat without auth.
 */

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/types";
import { nicknameSchema } from "@/lib/validation/nickname";

export type ChatMessageRow = {
  id: string;
  event_id: string;
  sender_nickname: string | null;
  content: string;
  kind: "text" | "system";
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
};

type RpcOk<T = Record<string, unknown>> = { ok: true; data: T };
type RpcErr = { ok: false; code: string; error?: string };

export async function sendMessageAction(
  eventId: string,
  nickname: string,
  content: string,
): Promise<ActionResult<{ messageId: string }>> {
  const parsed = nicknameSchema.safeParse(nickname);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Geçersiz takma ad.",
      code: "invalid_nickname",
    };
  }

  const headerList = await headers();
  const ip = getClientIp(headerList);

  const rl1s = await rateLimit(`chat:${ip}:1s`, 1, 1000);
  if (!rl1s.allowed) {
    return {
      ok: false,
      error: "Çok hızlı yazıyorsun, biraz yavaşla.",
      code: "rate_limited",
    };
  }
  const rl1m = await rateLimit(`chat:${ip}:1m`, 30, 60_000);
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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_message", {
    p_event_id: eventId,
    p_nickname: parsed.data,
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

/** Server-only system message helper (event cancel, etc.). */
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
      `id, event_id, sender_nickname, content, kind, is_deleted, created_at, edited_at`,
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
