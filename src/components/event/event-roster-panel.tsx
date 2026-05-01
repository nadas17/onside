"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { RosterEntry } from "@/lib/event/rsvp-actions";
import { PendingRequests } from "@/components/event/pending-requests";
import { RosterList } from "@/components/event/roster-list";
import { MyPendingCard } from "@/components/event/my-pending-card";

type ProfileSummary = {
  id: string;
  username: string;
  display_name: string;
  skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  skill_rating: number;
};

type Position = "GK" | "DEF" | "MID" | "FWD";

type ParticipantRow = {
  id: string;
  event_id: string;
  profile_id: string;
  position: Position;
  status: "pending" | "confirmed" | "cancelled" | "no_show" | "attended";
  joined_at: string;
  cancelled_at: string | null;
  rejected_reason: string | null;
};

/**
 * Hem confirmed (roster) hem pending listesini client-state olarak tutar
 * ve `event_participant` tablosundaki realtime değişikliklerine subscribe olur.
 *
 * Approve/reject/kick aksiyonları realtime UPDATE event'i tetikler →
 * state otomatik güncellenir → sayfa refresh gerekmez.
 */
export function EventRosterPanel({
  eventId,
  initialRoster,
  initialPending,
  capacity,
  isOrganizer,
  myPending,
}: {
  eventId: string;
  initialRoster: RosterEntry[];
  initialPending: RosterEntry[];
  capacity: number;
  isOrganizer: boolean;
  myPending: {
    position: "GK" | "DEF" | "MID" | "FWD";
    joinedAt: string;
    rejectedReason: string | null;
  } | null;
}) {
  const [roster, setRoster] = React.useState<RosterEntry[]>(initialRoster);
  const [pending, setPending] = React.useState<RosterEntry[]>(initialPending);
  const profileCacheRef = React.useRef<Map<string, ProfileSummary>>(new Map());

  // Initial profile cache
  React.useEffect(() => {
    for (const r of [...initialRoster, ...initialPending]) {
      if (r.profile) profileCacheRef.current.set(r.profile.id, r.profile);
    }
  }, [initialRoster, initialPending]);

  // Initial fetch ile parent props'u sync (page refresh sonrası prop güncellenirse)
  React.useEffect(() => {
    setRoster(initialRoster);
  }, [initialRoster]);
  React.useEffect(() => {
    setPending(initialPending);
  }, [initialPending]);

  React.useEffect(() => {
    const supabase = createClient();

    const fetchProfile = async (
      profileId: string,
    ): Promise<ProfileSummary | null> => {
      const cached = profileCacheRef.current.get(profileId);
      if (cached) return cached;
      const { data } = await supabase
        .from("profile")
        .select("id, username, display_name, skill_level, skill_rating")
        .eq("id", profileId)
        .maybeSingle<ProfileSummary>();
      if (data) profileCacheRef.current.set(data.id, data);
      return data ?? null;
    };

    const enrich = async (row: ParticipantRow): Promise<RosterEntry> => {
      const profile = await fetchProfile(row.profile_id);
      return {
        id: row.id,
        position: row.position,
        joined_at: row.joined_at,
        status: row.status,
        rejected_reason: row.rejected_reason,
        profile: profile ?? {
          id: row.profile_id,
          username: row.profile_id.slice(0, 8),
          display_name: "—",
          skill_level: "intermediate",
          skill_rating: 1000,
        },
      };
    };

    const channel = supabase
      .channel(`event:${eventId}:participants`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_participant",
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          const newRow = payload.new as ParticipantRow | null;
          const oldRow = payload.old as ParticipantRow | null;

          // INSERT veya UPDATE: önce her iki listeden ID'yi temizle
          // (payload.old güvenilmez — REPLICA IDENTITY FULL bile bazen eksik
          // payload üretiyor). Sonra newRow.status'a göre doğru listeye ekle.
          if (newRow && payload.eventType !== "DELETE") {
            const id = newRow.id;
            const status = newRow.status;

            // Eski konumdan kaldır (hangisindeyse)
            setPending((prev) => prev.filter((p) => p.id !== id));
            setRoster((prev) => prev.filter((p) => p.id !== id));

            // Yeni konuma ekle
            if (status === "pending") {
              const enriched = await enrich(newRow);
              setPending((prev) =>
                prev.some((p) => p.id === id) ? prev : [...prev, enriched],
              );
            } else if (status === "confirmed") {
              const enriched = await enrich(newRow);
              setRoster((prev) =>
                prev.some((p) => p.id === id) ? prev : [...prev, enriched],
              );
            }
            // status cancelled / no_show / attended → her iki listeden de yok
          } else if (payload.eventType === "DELETE" && oldRow) {
            setPending((prev) => prev.filter((p) => p.id !== oldRow.id));
            setRoster((prev) => prev.filter((p) => p.id !== oldRow.id));
          }
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || err) {
          console.error("[roster-panel] channel", status, err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return (
    <>
      {!isOrganizer && myPending && (
        <MyPendingCard
          eventId={eventId}
          position={myPending.position}
          joinedAt={myPending.joinedAt}
          rejectedReason={myPending.rejectedReason}
        />
      )}
      {isOrganizer && pending.length > 0 && (
        <PendingRequests
          pending={pending}
          capacity={capacity}
          confirmedCount={roster.length}
        />
      )}
      <section>
        <RosterList
          eventId={eventId}
          roster={roster}
          capacity={capacity}
          isOrganizer={isOrganizer}
        />
      </section>
    </>
  );
}
