"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { EmptyState } from "@/components/ui/empty-state";
import { useMotionPreset } from "@/lib/motion";
import type { RosterEntry } from "@/lib/event/rsvp-actions";

const POSITION_GROUPS = ["GK", "DEF", "MID", "FWD"] as const;

export function RosterList({
  eventId,
  roster,
  capacity,
}: {
  eventId: string;
  roster: RosterEntry[];
  capacity: number;
}) {
  // eventId is informational for now; kick/moderation removed.
  void eventId;
  const t = useTranslations("Roster");
  const tPos = useTranslations("Profile.positions");
  const m = useMotionPreset();

  const grouped = React.useMemo(() => {
    const map = new Map<string, RosterEntry[]>();
    POSITION_GROUPS.forEach((p) => map.set(p, []));
    for (const r of roster) {
      map.get(r.position)?.push(r);
    }
    return map;
  }, [roster]);

  const filled = roster.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          {t("rosterTitle")}
        </h2>
        <span className="text-muted-foreground text-xs">
          {filled} / {capacity}
        </span>
      </div>

      {filled === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t("noParticipants")}
          description={t("emptyJoinerHint")}
          size="sm"
        />
      ) : (
        <div className="grid gap-2">
          {POSITION_GROUPS.map((pos) => {
            const entries = grouped.get(pos) ?? [];
            if (entries.length === 0) return null;
            return (
              <div key={pos} className="glass-card rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 font-mono text-[10px] uppercase">
                    {pos}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {tPos(pos)} · {entries.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                    {entries.map((r) => (
                      <motion.li
                        key={r.id}
                        layout
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 16, scale: 0.95 }}
                        transition={m.spring}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={r.nickname} />
                          <span className="truncate font-medium">
                            {r.nickname}
                          </span>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className="from-brand to-accent-cta flex size-6 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white"
    >
      {initial}
    </span>
  );
}
