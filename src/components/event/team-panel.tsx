"use client";

/**
 * Team Panel — event detail sayfasının team bölümü.
 *
 * Modlar:
 *   - status open|full + organizer + min met → "Takımları oluştur" CTA
 *   - status locked + organizer → "Düzenle" / "Yeniden Dağıt" / "Kilidi Aç"
 *   - teams var + non-organizer → read-only A/B kartları
 *   - teams var + edit mode → TeamBuilder (drag-drop)
 *
 * Realtime: team_assignment INSERT/DELETE'i dinler → herkes anlık takım görür.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { toast } from "sonner";
import { Shuffle, Pencil, Unlock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  computeAndSaveTeamsAction,
  unlockTeamsAction,
  getTeamsAction,
  type TeamView,
} from "@/lib/event/team-actions";
import { TeamBuilder } from "@/components/event/team-builder";
import type { EventStatus } from "@/lib/event/state";

type Position = "GK" | "DEF" | "MID" | "FWD";

const POSITION_GROUPS = ["GK", "DEF", "MID", "FWD"] as const;

export function TeamPanel({
  eventId,
  initialTeams,
  status,
  confirmedCount,
  minPlayersToConfirm,
  capacity,
}: {
  eventId: string;
  initialTeams: TeamView[];
  status: EventStatus;
  confirmedCount: number;
  minPlayersToConfirm: number;
  capacity: number;
}) {
  const t = useTranslations("Teams");
  const errorMsg = useErrorMessage();
  const tPos = useTranslations("Profile.positions");

  const [teams, setTeams] = React.useState<TeamView[]>(initialTeams);
  const [mode, setMode] = React.useState<"view" | "edit">("view");
  const [busy, setBusy] = React.useState<null | "balance" | "unlock">(null);
  const [seedRef, setSeedRef] = React.useState<number>(() =>
    Math.floor(Math.random() * 0x7fffffff),
  );

  React.useEffect(() => {
    setTeams(initialTeams);
  }, [initialTeams]);

  // Realtime: team_assignment INSERT/DELETE → debounced refetch.
  //
  // A single save_teams transaction emits N events (one DELETE + one INSERT
  // per player swap). For a 14-player team that's ~28 events firing within
  // a few hundred ms. Without the 200ms debounce we'd hit getTeamsAction
  // 28 times in a row; with it, we collapse the burst to a single fetch.
  React.useEffect(() => {
    const supabase = createClient();
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefetch = () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(async () => {
        refetchTimer = null;
        const result = await getTeamsAction(eventId);
        if (result.ok) setTeams(result.data);
      }, 200);
    };

    const channel = supabase
      .channel(`event:${eventId}:teams`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "team_assignment",
          filter: `event_id=eq.${eventId}`,
        },
        () => scheduleRefetch(),
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || err) {
          console.error("[teams] channel", status, err);
        }
      });

    return () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const canBalance =
    (status === "open" || status === "full") &&
    confirmedCount >= minPlayersToConfirm &&
    confirmedCount >= 4;

  const canEdit = status === "locked";

  const handleBalance = async () => {
    setBusy("balance");
    const result = await computeAndSaveTeamsAction(eventId, { seed: seedRef });
    setBusy(null);
    if (!result.ok) {
      toast.error(t("balanceError"), { description: errorMsg(result) });
      return;
    }
    toast.success(t("balanced"));
    if (result.data.warnings.includes("no_goalkeeper")) {
      toast.warning(t("warnNoGk"));
    } else if (result.data.warnings.includes("single_goalkeeper")) {
      toast.warning(t("warnSingleGk"));
    }
    if (result.data.warnings.includes("odd_count")) {
      toast.warning(t("warnOddCount"));
    }
  };

  const handleUnlock = async () => {
    if (!confirm(t("confirmUnlock"))) return;
    setBusy("unlock");
    const result = await unlockTeamsAction(eventId);
    setBusy(null);
    if (!result.ok) {
      toast.error(t("unlockError"), { description: errorMsg(result) });
      return;
    }
    toast.success(t("unlocked"));
    setTeams([]);
    // Yeni rebalance için seed yenile
    setSeedRef(Math.floor(Math.random() * 0x7fffffff));
  };

  const handleRebalance = async () => {
    if (!confirm(t("confirmRebalance"))) return;
    setBusy("balance");
    const newSeed = Math.floor(Math.random() * 0x7fffffff);
    setSeedRef(newSeed);
    // Locked'ta save_teams direkt yeni assignment yazar (DELETE eski, INSERT yeni)
    const result = await computeAndSaveTeamsAction(eventId, { seed: newSeed });
    setBusy(null);
    if (!result.ok) {
      toast.error(t("balanceError"), { description: errorMsg(result) });
      return;
    }
    toast.success(t("rebalanced"));
  };

  // No teams + cannot balance + non-organizer veya min met değil → render etme
  if (teams.length === 0) {
    if (!canBalance) {
      // Min henüz dolmadı → açıklayıcı placeholder
      if (status === "open" || status === "full") {
        return (
          <section className="border-border flex flex-col gap-2 rounded-md border border-dashed p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Shuffle className="size-4" />
              {t("title")}
            </div>
            <p className="text-muted-foreground text-xs">
              {t("waitingForMinPlayers", {
                current: confirmedCount,
                min: minPlayersToConfirm,
              })}
            </p>
          </section>
        );
      }
      return null;
    }
    return (
      <section className="glass-card flex flex-col gap-3 rounded-lg border p-4 shadow-md shadow-black/20">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Shuffle className="size-4" />
            {t("title")}
          </div>
          <span className="text-muted-foreground text-xs">
            {confirmedCount} / {capacity}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">{t("description")}</p>
        <Button
          onClick={handleBalance}
          disabled={busy !== null}
          className="self-start"
        >
          <Shuffle className="mr-2 size-4" />
          {busy === "balance" ? t("balancing") : t("balanceNow")}
        </Button>
      </section>
    );
  }

  if (mode === "edit") {
    return (
      <section className="glass-card flex flex-col gap-3 rounded-lg border p-4 shadow-md shadow-black/20">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Pencil className="size-4" />
          {t("editTitle")}
        </div>
        <TeamBuilder
          eventId={eventId}
          initialTeams={teams}
          seed={seedRef}
          onCancel={() => setMode("view")}
          onSaved={() => setMode("view")}
        />
      </section>
    );
  }

  return (
    <section className="glass-card flex flex-col gap-3 rounded-lg border p-4 shadow-md shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Shuffle className="size-4" />
          {t("title")}
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode("edit")}
              disabled={busy !== null}
            >
              <Pencil className="mr-1 size-3.5" />
              {t("edit")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRebalance}
              disabled={busy !== null}
            >
              <Shuffle className="mr-1 size-3.5" />
              {busy === "balance" ? t("balancing") : t("rebalance")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlock}
              disabled={busy !== null}
            >
              <Unlock className="mr-1 size-3.5" />
              {busy === "unlock" ? t("unlocking") : t("unlock")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((team) => (
          <TeamCard key={team.label} team={team} tPos={tPos} />
        ))}
      </div>

      {teams.length === 2 && (
        <SkillDeltaIndicator
          a={teams[0]!.skillTotal}
          b={teams[1]!.skillTotal}
        />
      )}
    </section>
  );
}

function TeamCard({
  team,
  tPos,
}: {
  team: TeamView;
  tPos: ReturnType<typeof useTranslations>;
}) {
  const grouped = new Map<Position, TeamView["members"]>();
  POSITION_GROUPS.forEach((p) => grouped.set(p, []));
  for (const m of team.members) {
    grouped.get(m.position)?.push(m);
  }

  return (
    <div className="glass-card rounded-lg border p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold">{team.label}</span>
        <span className="text-muted-foreground text-xs">
          {team.members.length} · Σ {team.skillTotal}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {POSITION_GROUPS.map((pos) => {
          const list = grouped.get(pos) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={pos}>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-mono text-[9px] uppercase">
                  {pos}
                </span>
                <span className="text-muted-foreground text-[10px]">
                  {tPos(pos)}
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {list.map((m) => (
                  <li
                    key={m.nickname}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Avatar name={m.nickname} />
                      <span className="truncate">{m.nickname}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkillDeltaIndicator({ a, b }: { a: number; b: number }) {
  const diff = Math.abs(a - b);
  const t = useTranslations("Teams");
  const big = diff >= 300;
  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
        big
          ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300"
          : "border-border text-muted-foreground"
      }`}
    >
      {big && <AlertTriangle className="size-3.5" />}
      {t("skillDelta", { value: diff })}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className="from-brand to-accent-cta flex size-5 items-center justify-center rounded-full bg-gradient-to-br text-[9px] font-bold text-white"
    >
      {initial}
    </span>
  );
}
