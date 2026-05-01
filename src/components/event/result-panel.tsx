"use client";

/**
 * Result Panel — Phase 7.
 *
 * Modlar:
 *   - status locked|in_progress + organizer + team kurulu → "Skoru Gir" CTA
 *   - status completed → skor display + MVP voting (window açık) veya MVP winner
 *   - status completed + organizer + 24h pencere → "Skoru Düzenle"
 *   - status completed + organizer + voting penceresi kapalı + finalize edilmedi
 *     → "MVP'yi sonuçlandır" butonu (otomatik veya tie'da manuel)
 *
 * Realtime: match_result + mvp_vote postgres_changes → herkes anlık görür.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trophy, Pencil, Crown, Vote, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  finalizeMvpAction,
  getMatchResultAction,
  getMvpStateAction,
  submitMvpVoteAction,
  type MatchResultView,
  type MvpState,
} from "@/lib/event/result-actions";
import { ScoreSubmitForm } from "@/components/event/score-submit-form";
import type { EventStatus } from "@/lib/event/state";

export function ResultPanel({
  eventId,
  isOrganizer,
  status,
  hasTeams,
  initialResult,
  initialMvpState,
  myUserId,
  startAt,
}: {
  eventId: string;
  isOrganizer: boolean;
  status: EventStatus;
  hasTeams: boolean;
  initialResult: MatchResultView | null;
  initialMvpState: MvpState;
  myUserId: string | null;
  startAt: string;
}) {
  const t = useTranslations("Result");
  const tMvp = useTranslations("Mvp");

  const [result, setResult] = React.useState<MatchResultView | null>(
    initialResult,
  );
  const [mvp, setMvp] = React.useState<MvpState>(initialMvpState);
  const [editing, setEditing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "vote" | "finalize">(null);

  React.useEffect(() => setResult(initialResult), [initialResult]);
  React.useEffect(() => setMvp(initialMvpState), [initialMvpState]);

  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`event:${eventId}:result`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_result",
          filter: `event_id=eq.${eventId}`,
        },
        async () => {
          const r = await getMatchResultAction(eventId);
          if (r.ok) setResult(r.data);
          const m = await getMvpStateAction(eventId);
          if (m.ok) setMvp(m.data);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mvp_vote",
          filter: `event_id=eq.${eventId}`,
        },
        async () => {
          const m = await getMvpStateAction(eventId);
          if (m.ok) setMvp(m.data);
        },
      )
      .subscribe((s, err) => {
        if (s === "CHANNEL_ERROR" || err) {
          console.error("[result] channel", s, err);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  // --- Score submit / edit modu ---
  const matchHasStarted = new Date(startAt).getTime() <= Date.now();
  const canSubmitScore =
    isOrganizer &&
    !result &&
    hasTeams &&
    (status === "locked" || status === "in_progress") &&
    matchHasStarted;
  const canEditScore =
    isOrganizer &&
    result &&
    new Date(result.submittedAt).getTime() > Date.now() - 24 * 60 * 60 * 1000;

  if (submitting || editing) {
    return (
      <section className="border-border rounded-md border p-4">
        <ScoreSubmitForm
          eventId={eventId}
          mode={editing ? "edit" : "submit"}
          initialScoreA={editing && result ? result.scoreA : 0}
          initialScoreB={editing && result ? result.scoreB : 0}
          initialNotes={editing && result ? (result.notes ?? "") : ""}
          onSaved={() => {
            setSubmitting(false);
            setEditing(false);
          }}
          onCancel={() => {
            setSubmitting(false);
            setEditing(false);
          }}
        />
      </section>
    );
  }

  if (!result) {
    if (canSubmitScore) {
      return (
        <section className="border-border flex flex-col gap-3 rounded-md border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4" />
            {t("title")}
          </div>
          <p className="text-muted-foreground text-xs">{t("description")}</p>
          <Button onClick={() => setSubmitting(true)} className="self-start">
            <Trophy className="mr-2 size-4" />
            {t("submit")}
          </Button>
        </section>
      );
    }
    if (
      isOrganizer &&
      hasTeams &&
      (status === "locked" || status === "in_progress") &&
      !matchHasStarted
    ) {
      return (
        <section className="border-border flex flex-col gap-2 rounded-md border border-dashed p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4" />
            {t("title")}
          </div>
          <p className="text-muted-foreground text-xs">
            {t("waitingForKickoff")}
          </p>
        </section>
      );
    }
    return null;
  }

  // --- Result var ---
  const winner =
    result.scoreA > result.scoreB
      ? "A"
      : result.scoreB > result.scoreA
        ? "B"
        : "draw";

  const handleVote = async (voteeId: string) => {
    setBusy("vote");
    const r = await submitMvpVoteAction(eventId, voteeId);
    setBusy(null);
    if (!r.ok) {
      toast.error(tMvp("voteError"), { description: r.error });
      return;
    }
    toast.success(tMvp("voted"));
  };

  const handleFinalize = async (voteeId?: string) => {
    setBusy("finalize");
    const r = await finalizeMvpAction(eventId, voteeId);
    setBusy(null);
    if (!r.ok) {
      if (r.code === "tie") {
        toast.warning(tMvp("tieWarning"));
        return;
      }
      toast.error(tMvp("finalizeError"), { description: r.error });
      return;
    }
    if (r.data.noVotes) {
      toast.info(tMvp("noVotes"));
    } else {
      toast.success(tMvp("finalized"));
    }
  };

  const canFinalize =
    isOrganizer &&
    !result.mvpFinalizedAt &&
    (!mvp.votingOpen || mvp.totalVotes === 0);

  return (
    <section className="border-border flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="size-4" />
          {t("title")}
        </div>
        {canEditScore && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={busy !== null}
          >
            <Pencil className="mr-1 size-3.5" />
            {t("edit")}
          </Button>
        )}
      </div>

      <div className="border-border bg-muted/30 flex items-center justify-center gap-6 rounded-md border p-6">
        <ScoreColumn
          label={t("teamA")}
          score={result.scoreA}
          winner={winner === "A"}
        />
        <span className="text-muted-foreground text-3xl font-bold">–</span>
        <ScoreColumn
          label={t("teamB")}
          score={result.scoreB}
          winner={winner === "B"}
        />
      </div>

      {result.notes && (
        <p className="bg-muted/40 text-muted-foreground rounded-md px-3 py-2 text-sm">
          {result.notes}
        </p>
      )}

      {result.mvp && (
        <div className="flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <Crown className="size-5 text-amber-500" />
          <div className="text-sm">
            <div className="font-semibold">{tMvp("winnerLabel")}</div>
            <div className="text-muted-foreground">
              {result.mvp.displayName}{" "}
              <span className="text-xs">@{result.mvp.username}</span>
            </div>
          </div>
        </div>
      )}

      {!result.mvpFinalizedAt && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Vote className="size-4" />
            {tMvp("title")}
          </div>
          {mvp.votingOpen ? (
            <p className="text-muted-foreground text-xs">
              {tMvp("openHint", { total: mvp.totalVotes })}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              {tMvp("closedHint", { total: mvp.totalVotes })}
            </p>
          )}

          {mvp.candidates.length > 0 ? (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {mvp.candidates.map((c) => {
                const isMine = mvp.myVoteId === c.profileId;
                const cantVote = !mvp.votingOpen || c.profileId === myUserId;
                return (
                  <li
                    key={c.profileId}
                    className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                      isMine
                        ? "border-brand bg-brand/5"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Avatar name={c.displayName} />
                      <span className="truncate">{c.displayName}</span>
                      <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-mono text-[9px] uppercase">
                        {c.team}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {c.voteCount}
                      </span>
                      {!cantVote && (
                        <Button
                          size="sm"
                          variant={isMine ? "default" : "outline"}
                          onClick={() => handleVote(c.profileId)}
                          disabled={busy !== null}
                        >
                          {isMine ? (
                            <CheckCircle2 className="size-3.5" />
                          ) : (
                            tMvp("voteFor")
                          )}
                        </Button>
                      )}
                      {isOrganizer && !mvp.votingOpen && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleFinalize(c.profileId)}
                          disabled={busy !== null}
                          title={tMvp("manualPick")}
                        >
                          <Crown className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground text-xs">
              {tMvp("noCandidates")}
            </p>
          )}

          {canFinalize && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFinalize(undefined)}
              disabled={busy !== null}
              className="self-start"
            >
              <Crown className="mr-1 size-3.5" />
              {busy === "finalize" ? tMvp("finalizing") : tMvp("finalize")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function ScoreColumn({
  label,
  score,
  winner,
}: {
  label: string;
  score: number;
  winner: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </span>
      <span
        className={`text-4xl font-bold tabular-nums ${
          winner ? "text-brand" : ""
        }`}
      >
        {score}
      </span>
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
