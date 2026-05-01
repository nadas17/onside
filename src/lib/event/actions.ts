"use server";

/**
 * Event server actions — Phase 3 (spec §11 lifecycle).
 *
 *   createEventAction      organizer = auth.uid(), default status='open'
 *   updateEventAction      organizer-only, locked sonrası restrictions
 *   cancelEventAction      *  → 'cancelled' (state machine kontrolü)
 *   getEventsAction        anasayfa feed; filtreler
 *   getEventByIdAction     detay sayfası
 *   getEventsByVenueAction venue detay sayfası (yaklaşan etkinlikler)
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  cancelEventSchema,
  createEventSchema,
  eventFiltersSchema,
  type CancelEventInput,
  type CreateEventInput,
  type EventFilters,
} from "@/lib/validation/event";
import { canTransition, type EventStatus } from "@/lib/event/state";
import type { ActionResult } from "@/lib/types";

const nullIfEmpty = (v: string | null | undefined): string | null =>
  v && v.trim() ? v.trim() : null;

export async function createEventAction(
  input: CreateEventInput,
): Promise<ActionResult<{ id: string }>> {
  const headerList = await headers();
  const ip = getClientIp(headerList);
  const rl = await rateLimit(`event-create:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Çok hızlı etkinlik oluşturuyorsun, biraz bekle.",
      code: "rate_limited",
    };
  }

  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Geçersiz girdi.",
      code: "invalid_input",
    };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Oturum bulunamadı.", code: "auth_failed" };
  }

  const insert = {
    organizer_id: user.id,
    venue_id: data.venueId,
    title: data.title,
    description: nullIfEmpty(data.description ?? null),
    format: data.format,
    capacity: data.capacity,
    min_players_to_confirm: data.minPlayersToConfirm,
    min_skill_level: data.minSkillLevel,
    max_skill_level: data.maxSkillLevel,
    start_at: data.startAt,
    end_at: data.endAt,
    notes: nullIfEmpty(data.notes ?? null),
    status: "open" as const,
  };

  const { data: row, error } = await supabase
    .from("event")
    .insert(insert)
    .select("id")
    .single();

  if (error || !row) {
    return {
      ok: false,
      error: error?.message ?? "Etkinlik oluşturulamadı.",
      code: "db_error",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id: row.id as string } };
}

export async function cancelEventAction(
  eventId: string,
  input: CancelEventInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = cancelEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Geçersiz girdi.",
      code: "invalid_input",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Oturum bulunamadı.", code: "auth_failed" };
  }

  // Mevcut event'i çek + state machine kontrol et.
  const { data: existing } = await supabase
    .from("event")
    .select("id, status, organizer_id")
    .eq("id", eventId)
    .maybeSingle<{ id: string; status: EventStatus; organizer_id: string }>();

  if (!existing) {
    return { ok: false, error: "Etkinlik bulunamadı.", code: "not_found" };
  }
  if (existing.organizer_id !== user.id) {
    return {
      ok: false,
      error: "Sadece organizatör iptal edebilir.",
      code: "forbidden",
    };
  }
  if (!canTransition(existing.status, "cancelled")) {
    return {
      ok: false,
      error: "Bu durumdan iptal edilemez.",
      code: "invalid_input",
    };
  }

  const { error } = await supabase
    .from("event")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: parsed.data.reason,
    })
    .eq("id", eventId);

  if (error) {
    return { ok: false, error: error.message, code: "db_error" };
  }

  // Sistem mesajı: tüm katılımcılar chat'te görür (spec §11)
  await supabase.rpc("post_system_message", {
    p_event_id: eventId,
    p_content: `📢 Etkinlik iptal edildi: ${parsed.data.reason}`,
  });

  revalidatePath("/", "layout");
  return { ok: true, data: { id: eventId } };
}

export type EventListItem = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  format: "5v5" | "6v6" | "7v7" | "8v8" | "11v11";
  capacity: number;
  min_skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  max_skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  status: EventStatus;
  venue: {
    id: string;
    name: string;
    city: string;
    lat: number;
    lng: number;
  };
};

export async function getEventsAction(
  filters: Partial<EventFilters>,
): Promise<ActionResult<EventListItem[]>> {
  const parsed = eventFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Geçersiz filtre.",
      code: "invalid_input",
    };
  }
  const f = parsed.data;

  const supabase = await createClient();
  let q = supabase
    .from("event")
    .select(
      `id, title, start_at, end_at, format, capacity, min_skill_level, max_skill_level, status,
       venue:venue_id ( id, name, city, lat, lng )`,
    )
    .eq("is_hidden", false)
    .order("start_at", { ascending: true })
    .limit(f.limit);

  // Status: default open + full
  const statuses = f.status ?? ["open", "full"];
  q = q.in("status", statuses);

  // Date range: default >= now
  const dateFromIso = f.dateFrom ?? new Date().toISOString();
  q = q.gte("start_at", dateFromIso);
  if (f.dateTo) q = q.lte("start_at", f.dateTo);

  if (f.format) q = q.eq("format", f.format);

  const { data, error } = await q;
  if (error) {
    return { ok: false, error: error.message, code: "db_error" };
  }

  // Server-side post-filter: city, bbox ve skill range (Supabase JS join filter
  // sınırları nedeniyle daha güvenli).
  let rows = (data ?? []) as unknown as EventListItem[];

  if (f.city) {
    rows = rows.filter((r) => r.venue?.city === f.city);
  }
  if (f.bbox) {
    rows = rows.filter(
      (r) =>
        r.venue &&
        r.venue.lat >= f.bbox!.south &&
        r.venue.lat <= f.bbox!.north &&
        r.venue.lng >= f.bbox!.west &&
        r.venue.lng <= f.bbox!.east,
    );
  }
  if (f.minSkill) {
    const order = ["beginner", "intermediate", "advanced", "pro"] as const;
    const min = order.indexOf(f.minSkill);
    rows = rows.filter((r) => order.indexOf(r.max_skill_level) >= min);
  }
  if (f.maxSkill) {
    const order = ["beginner", "intermediate", "advanced", "pro"] as const;
    const max = order.indexOf(f.maxSkill);
    rows = rows.filter((r) => order.indexOf(r.min_skill_level) <= max);
  }

  return { ok: true, data: rows };
}

export type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  format: "5v5" | "6v6" | "7v7" | "8v8" | "11v11";
  capacity: number;
  min_players_to_confirm: number;
  min_skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  max_skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  start_at: string;
  end_at: string;
  status: EventStatus;
  notes: string | null;
  cancelled_reason: string | null;
  organizer: {
    id: string;
    username: string;
    display_name: string;
  };
  venue: {
    id: string;
    name: string;
    address_line: string;
    city: string;
    lat: number;
    lng: number;
  };
};

export async function getEventByIdAction(
  id: string,
): Promise<ActionResult<EventDetail>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event")
    .select(
      `id, title, description, format, capacity, min_players_to_confirm,
       min_skill_level, max_skill_level, start_at, end_at, status, notes,
       cancelled_reason,
       organizer:organizer_id ( id, username, display_name ),
       venue:venue_id ( id, name, address_line, city, lat, lng )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message, code: "db_error" };
  }
  if (!data) {
    return { ok: false, error: "Etkinlik bulunamadı.", code: "not_found" };
  }

  return { ok: true, data: data as unknown as EventDetail };
}

export type MyEventItem = {
  id: string;
  title: string;
  start_at: string;
  format: "5v5" | "6v6" | "7v7" | "8v8" | "11v11";
  capacity: number;
  status: EventStatus;
  is_organizer: boolean;
  venue: {
    id: string;
    name: string;
    city: string;
  };
};

/**
 * Kullanıcının yaklaşan etkinlikleri (organize ettiği + onaylandığı).
 * Trigger 0006 sayesinde organizer event_participant'ta confirmed olduğundan
 * tek sorgu yeterli.
 */
export async function getMyEventsAction(): Promise<
  ActionResult<MyEventItem[]>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true, data: [] };

  const { data, error } = await supabase
    .from("event_participant")
    .select(
      `id, status,
       event:event_id (
         id, title, start_at, format, capacity, status, organizer_id,
         venue:venue_id ( id, name, city )
       )`,
    )
    .eq("profile_id", user.id)
    .eq("status", "confirmed")
    .order("joined_at", { ascending: false })
    .limit(20);

  if (error) return { ok: false, error: error.message, code: "db_error" };

  type Row = {
    event: {
      id: string;
      title: string;
      start_at: string;
      format: MyEventItem["format"];
      capacity: number;
      status: EventStatus;
      organizer_id: string;
      venue: { id: string; name: string; city: string } | null;
    } | null;
  };

  const nowIso = new Date().toISOString();
  const ACTIVE: EventStatus[] = ["open", "full", "locked", "in_progress"];

  const items = (data as unknown as Row[])
    .map((row) => row.event)
    .filter((e): e is NonNullable<Row["event"]> => Boolean(e))
    .filter((e) => e.venue && e.start_at >= nowIso && ACTIVE.includes(e.status))
    .map<MyEventItem>((e) => ({
      id: e.id,
      title: e.title,
      start_at: e.start_at,
      format: e.format,
      capacity: e.capacity,
      status: e.status,
      is_organizer: e.organizer_id === user.id,
      venue: e.venue!,
    }))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  return { ok: true, data: items };
}

export async function getEventsByVenueAction(
  venueId: string,
  limit: number = 5,
): Promise<ActionResult<EventListItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event")
    .select(
      `id, title, start_at, end_at, format, capacity, min_skill_level, max_skill_level, status,
       venue:venue_id ( id, name, city, lat, lng )`,
    )
    .eq("venue_id", venueId)
    .eq("is_hidden", false)
    .in("status", ["open", "full", "locked", "in_progress"])
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(limit);

  if (error) return { ok: false, error: error.message, code: "db_error" };
  return { ok: true, data: (data ?? []) as unknown as EventListItem[] };
}
