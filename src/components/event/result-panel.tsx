"use client";

/**
 * Result Panel — score display + organizer-free score submit/edit.
 *
 * MVP voting + Elo are deferred; once they return as features, this panel
 * grows back its bottom half. For now it just renders the final score and
 * a "Submit / Edit" button anyone can use.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { Trophy, Pencil } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useMotionPreset } from "@/lib/motion";
import { createClient } from "@/lib/supabase/client";
import {
  getMatchResultAction,
  type MatchResultView,
} from "@/lib/event/result-actions";
import { ScoreSubmitForm } from "@/components/event/score-submit-form";
import type { EventStatus } from "@/lib/event/state";

export function ResultPanel({
  eventId,
  status,
  hasTeams,
  initialResult,
}: {
  eventId: string;
  status: EventStatus;
  hasTeams: boolean;
  initialResult: MatchResultView | null;
}) {
  const t = useTranslations("Result");
  const m = useMotionPreset();

  const [result, setResult] = React.useState<MatchResultView | null>(
    initialResult,
  );
  const [editing, setEditing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => setResult(initialResult), [initialResult]);

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
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  // Submit mode: anyone can enter the score after teams are formed and the
  // event has not been completed yet.
  const canSubmit =
    !result && hasTeams && (status === "locked" || status === "in_progress");

  if (submitting) {
    return (
      <div className="glass-card rounded-lg border p-4 shadow-md shadow-black/20">
        <ScoreSubmitForm
          eventId={eventId}
          mode="submit"
          onSaved={() => setSubmitting(false)}
          onCancel={() => setSubmitting(false)}
        />
      </div>
    );
  }

  if (editing && result) {
    return (
      <div className="glass-card rounded-lg border p-4 shadow-md shadow-black/20">
        <ScoreSubmitForm
          eventId={eventId}
          mode="edit"
          initialScoreA={result.scoreA}
          initialScoreB={result.scoreB}
          initialNotes={result.notes ?? ""}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  if (canSubmit) {
    return (
      <div className="glass-card rounded-lg border p-4 shadow-md shadow-black/20">
        <div className="mb-3 flex items-center gap-2 text-sm">
          <Trophy className="size-4" />
          <span className="font-semibold">{t("submitTitle")}</span>
        </div>
        <p className="text-muted-foreground mb-3 text-xs">{t("submitHint")}</p>
        <Button onClick={() => setSubmitting(true)}>{t("submitCTA")}</Button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.spring}
      className="glass-card rounded-lg border p-4 shadow-md shadow-black/20"
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Trophy className="size-4" />
          {t("title")}
        </div>
        {status === "completed" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-label={t("edit")}
          >
            <Pencil className="mr-1 size-3.5" />
            {t("edit")}
          </Button>
        )}
      </div>

      <div className="mt-2 flex items-center justify-center gap-6 text-3xl font-bold">
        <span>{result.scoreA}</span>
        <span className="text-muted-foreground text-xl">–</span>
        <span>{result.scoreB}</span>
      </div>

      <div className="text-muted-foreground mt-2 text-center text-xs">
        {t("submittedBy", { nickname: result.submittedByNickname })}
      </div>

      {result.notes && (
        <p className="mt-3 text-center text-sm">{result.notes}</p>
      )}
    </motion.div>
  );
}
