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
import { useErrorMessage } from "@/lib/i18n-errors";
import { toast } from "sonner";
import { Trophy, Pencil, Crown, Vote, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useMotionPreset } from "@/lib/motion";
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
  const errorMsg = useErrorMessage();
  const tMvp = useTranslations("Mvp");
  const m = useMotionPreset();

  const [result, setResult] = React.useState<MatchResultView | null>(
    initialResult,
  );
  const [mvp, setMvp] = React.useState<MvpState>(initialMvpState);
  const [editing, setEditing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "vote" | "finalize">(null);
  const [, startVoteTransition] = React.useTransition();

  // Optimistic MVP state — vote anında butona checkmark, count'a +1
  const [optimisticMvp, applyOptimisticVote] = React.useOptimistic<
    MvpState,
    string
  >(mvp, (current, voteeId) => {
    if (current.myVoteId === voteeId) return current;
    return {
      ...current,
      myVoteId: voteeId,
      totalVotes:
        current.myVoteId === null ? current.totalVotes + 1 : current.totalVotes,
      candidates: current.candidates.map((c) => {
        let voteCount = c.voteCount;
        if (c.profileId === current.myVoteId && current.myVoteId !== voteeId) {
          voteCount = Math.max(0, voteCount - 1);
        }
        if (c.profileId === voteeId && current.myVoteId !== voteeId) {
          voteCount = voteCount + 1;
        }
        return { ...c, voteCount };
      }),
    };
  });

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
      <section className="glass-card rounded-lg border p-4 shadow-md shadow-black/20">
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
        <section className="glass-card flex flex-col gap-3 rounded-lg border p-4 shadow-md shadow-black/20">
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
        <section className="glass-card flex flex-col gap-2 rounded-lg border border-dashed p-4">
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

  const handleVote = (voteeId: string) => {
    startVoteTransition(async () => {
      applyOptimisticVote(voteeId);
      setBusy("vote");
      const r = await submitMvpVoteAction(eventId, voteeId);
      setBusy(null);
      if (!r.ok) {
        toast.error(tMvp("voteError"), { description: errorMsg(r) });
        return;
      }
      toast.success(tMvp("voted"));
    });
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
      toast.error(tMvp("finalizeError"), { description: errorMsg(r) });
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

  // Edit window: 24h after submitted_at. Compute remaining time so the user
  // sees they have a hard deadline (no surprise when the button vanishes).
  const editWindowMs = 24 * 60 * 60 * 1000;
  const editWindowEndsAt = result
    ? new Date(result.submittedAt).getTime() + editWindowMs
    : 0;
  const editMsLeft = Math.max(0, editWindowEndsAt - Date.now());
  const editHoursLeft = Math.floor(editMsLeft / (60 * 60 * 1000));
  const editMinsLeft = Math.floor((editMsLeft % (60 * 60 * 1000)) / 60_000);
  const editTimeLeftLabel =
    editHoursLeft > 0
      ? t("editWindowHours", { count: editHoursLeft })
      : t("editWindowMinutes", { count: Math.max(1, editMinsLeft) });
  const editClosingSoon = editMsLeft > 0 && editMsLeft < 30 * 60 * 1000;

  return (
    <section className="glass-card flex flex-col gap-4 rounded-lg border p-4 shadow-md shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="size-4" />
          {t("title")}
        </div>
        {canEditScore && (
          <div className="flex items-center gap-2">
            <span
              className={`text-xs ${
                editClosingSoon ? "text-amber-warm" : "text-muted-foreground"
              }`}
              title={t("editWindowFull")}
            >
              {editTimeLeftLabel}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={busy !== null}
            >
              <Pencil className="mr-1 size-3.5" />
              {t("edit")}
            </Button>
          </div>
        )}
      </div>

      <div className="glass-strong flex items-center justify-center gap-6 rounded-lg border p-6">
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
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.92, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={m.softSpring}
          className="flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
        >
          <motion.span
            initial={{ rotate: -20, scale: 0.6 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ ...m.snappySpring, delay: m.reduced ? 0 : 0.1 }}
          >
            <Crown className="size-5 text-amber-500" />
          </motion.span>
          <div className="text-sm">
            <div className="font-semibold">{tMvp("winnerLabel")}</div>
            <div className="text-muted-foreground">
              {result.mvp.displayName}{" "}
              <span className="text-xs">@{result.mvp.username}</span>
            </div>
          </div>
        </motion.div>
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

          {optimisticMvp.candidates.length > 0 ? (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {optimisticMvp.candidates.map((c) => {
                const isMine = optimisticMvp.myVoteId === c.profileId;
                const cantVote =
                  !optimisticMvp.votingOpen || c.profileId === myUserId;
                return (
                  <motion.li
                    key={c.profileId}
                    layout
                    animate={
                      m.reduced
                        ? undefined
                        : isMine
                          ? { scale: 1, borderColor: "var(--brand)" }
                          : { scale: 1 }
                    }
                    transition={m.snappySpring}
                    className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
                      isMine ? "border-brand bg-brand/5" : "glass-card"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={c.displayName} />
                      <span className="truncate">{c.displayName}</span>
                      <span className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 font-mono text-[9px] uppercase">
                        {c.team}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <motion.span
                        key={c.voteCount}
                        initial={m.reduced ? undefined : { y: -4, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={m.fast}
                        className="text-muted-foreground text-xs tabular-nums"
                      >
                        {c.voteCount}
                      </motion.span>
                      {!cantVote && (
                        <Button
                          size="sm"
                          variant={isMine ? "default" : "outline"}
                          onClick={() => handleVote(c.profileId)}
                          disabled={busy !== null}
                          className="tap-target"
                          aria-label={
                            isMine
                              ? tMvp("yourVoteFor", { name: c.displayName })
                              : tMvp("voteForName", { name: c.displayName })
                          }
                        >
                          {isMine ? (
                            <CheckCircle2 className="size-3.5" aria-hidden />
                          ) : (
                            tMvp("voteFor")
                          )}
                        </Button>
                      )}
                      {isOrganizer && !optimisticMvp.votingOpen && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleFinalize(c.profileId)}
                          disabled={busy !== null}
                          title={tMvp("manualPick")}
                          className="tap-target"
                        >
                          <Crown className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </motion.li>
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
