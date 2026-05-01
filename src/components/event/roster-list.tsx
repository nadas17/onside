"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UserMinus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { kickParticipantAction } from "@/lib/event/rsvp-actions";
import type { RosterEntry } from "@/lib/event/rsvp-actions";

const POSITION_GROUPS = ["GK", "DEF", "MID", "FWD"] as const;

export function RosterList({
  eventId,
  roster,
  capacity,
  isOrganizer,
}: {
  eventId: string;
  roster: RosterEntry[];
  capacity: number;
  isOrganizer: boolean;
}) {
  const t = useTranslations("Roster");
  const tPos = useTranslations("Profile.positions");
  const [kicking, setKicking] = React.useState<string | null>(null);

  const grouped = React.useMemo(() => {
    const map = new Map<string, RosterEntry[]>();
    POSITION_GROUPS.forEach((p) => map.set(p, []));
    for (const r of roster) {
      map.get(r.position)?.push(r);
    }
    return map;
  }, [roster]);

  const handleKick = async (profileId: string, displayName: string) => {
    if (!confirm(t("confirmKick", { name: displayName }))) return;
    setKicking(profileId);
    const result = await kickParticipantAction(eventId, profileId);
    setKicking(null);
    if (!result.ok) {
      toast.error(t("kickError"), { description: result.error });
      return;
    }
    toast.success(t("kicked"));
    // Realtime UPDATE channel parent state'i güncelleyecek; router.refresh gereksiz.
  };

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
          icon={<Users className="size-5" />}
          title={t("noParticipants")}
          description={
            isOrganizer ? t("emptyOrganizerHint") : t("emptyJoinerHint")
          }
          size="sm"
        />
      ) : (
        <div className="grid gap-2">
          {POSITION_GROUPS.map((pos) => {
            const entries = grouped.get(pos) ?? [];
            if (entries.length === 0) return null;
            return (
              <div key={pos} className="border-border rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 font-mono text-[10px] uppercase">
                    {pos}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {tPos(pos)} · {entries.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {entries.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={r.profile.display_name} />
                        <span className="font-medium">
                          {r.profile.display_name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          @{r.profile.username}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-xs">
                          {r.profile.skill_rating}
                        </span>
                        {isOrganizer && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleKick(r.profile.id, r.profile.display_name)
                            }
                            disabled={kicking === r.profile.id}
                            title={t("kick")}
                            aria-label={t("kick")}
                          >
                            <UserMinus className="text-destructive size-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
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
