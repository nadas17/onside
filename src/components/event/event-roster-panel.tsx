"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { RosterEntry } from "@/lib/event/rsvp-actions";
import { RosterList } from "@/components/event/roster-list";

type Position = "GK" | "DEF" | "MID" | "FWD";

type ParticipantRow = {
  id: string;
  event_id: string;
  nickname: string;
  position: Position;
  status: "pending" | "confirmed" | "cancelled" | "no_show" | "attended";
  joined_at: string;
  cancelled_at: string | null;
  rejected_reason: string | null;
};

/**
 * Holds the confirmed roster as client state and re-syncs from realtime
 * `event_participant` changes. There's no approval flow anymore — every
 * RSVP lands as 'confirmed' — so the UI shows a single roster list.
 */
export function EventRosterPanel({
  eventId,
  initialRoster,
  capacity,
}: {
  eventId: string;
  initialRoster: RosterEntry[];
  capacity: number;
}) {
  const [roster, setRoster] = React.useState<RosterEntry[]>(initialRoster);

  React.useEffect(() => {
    setRoster(initialRoster);
  }, [initialRoster]);

  React.useEffect(() => {
    const supabase = createClient();

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
        (payload) => {
          const newRow = payload.new as ParticipantRow | null;
          const oldRow = payload.old as ParticipantRow | null;

          if (newRow && payload.eventType !== "DELETE") {
            const id = newRow.id;
            setRoster((prev) => prev.filter((p) => p.id !== id));

            if (newRow.status === "confirmed") {
              const incoming: RosterEntry = {
                id: newRow.id,
                nickname: newRow.nickname,
                position: newRow.position,
                joined_at: newRow.joined_at,
                status: newRow.status,
                rejected_reason: newRow.rejected_reason,
              };
              setRoster((prev) =>
                prev.some((p) => p.id === id) ? prev : [...prev, incoming],
              );
            }
          } else if (payload.eventType === "DELETE" && oldRow) {
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
    <section>
      <RosterList eventId={eventId} roster={roster} capacity={capacity} />
    </section>
  );
}
