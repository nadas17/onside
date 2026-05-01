"use server";

/**
 * Notification server actions — Phase 9.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export type NotificationKind =
  | "rsvp_approved"
  | "rsvp_rejected"
  | "event_full"
  | "event_cancelled"
  | "team_assignment"
  | "match_completed"
  | "mvp_received"
  | "chat_mention";

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  eventId: string | null;
  eventTitle: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export async function getNotificationsAction(
  limit = 30,
): Promise<ActionResult<NotificationView[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true, data: [] };

  const { data, error } = await supabase
    .from("notification")
    .select(
      `id, kind, event_id, payload, read_at, created_at,
       event:event_id ( title )`,
    )
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message, code: "db_error" };

  type Row = {
    id: string;
    kind: NotificationKind;
    event_id: string | null;
    payload: Record<string, unknown> | null;
    read_at: string | null;
    created_at: string;
    event: { title: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      eventId: r.event_id,
      eventTitle: r.event?.title ?? null,
      payload: r.payload,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
  };
}

export async function markNotificationReadAction(
  notificationId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const r = data as
    | { ok: true; data: { id: string } }
    | { ok: false; code: string; error: string };
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { id: r.data.id } };
}

export async function markAllNotificationsReadAction(): Promise<
  ActionResult<{ marked: number }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { ok: false, error: error.message, code: "db_error" };
  const r = data as
    | { ok: true; data: { marked: number } }
    | { ok: false; code: string; error: string };
  if (!r.ok) return { ok: false, error: r.error, code: r.code };
  revalidatePath("/", "layout");
  return { ok: true, data: { marked: r.data.marked } };
}
