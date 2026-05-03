"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { toast } from "sonner";
import { Clock, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  PositionPickerDialog,
  type Position,
} from "@/components/event/position-picker";
import { useMotionPreset } from "@/lib/motion";
import { cancelRsvpAction, joinEventAction } from "@/lib/event/rsvp-actions";
import type { EventStatus } from "@/lib/event/state";
import type { MyRsvp } from "@/lib/event/rsvp-actions";

type OptimisticAction =
  | { type: "request"; position: Position }
  | { type: "cancel" };

export function JoinButton({
  eventId,
  status,
  isAuthed,
  isOrganizer,
  myParticipant,
  preferredPosition,
  startAt,
  locale,
}: {
  eventId: string;
  status: EventStatus;
  isAuthed: boolean;
  isOrganizer: boolean;
  myParticipant: MyRsvp | null;
  preferredPosition: Position | null;
  startAt: string;
  locale: string;
}) {
  const t = useTranslations("Roster");
  const errorMsg = useErrorMessage();
  const router = useRouter();
  const m = useMotionPreset();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  // Optimistic state — anında "pending" / "cleared" göster, server cevabı bekleme
  const [optimisticParticipant, applyOptimistic] = React.useOptimistic<
    MyRsvp | null,
    OptimisticAction
  >(myParticipant, (current, action) => {
    if (action.type === "request") {
      return {
        participantId: current?.participantId ?? "optimistic",
        status: "pending",
        position: action.position,
        joinedAt: new Date().toISOString(),
        rejectedReason: null,
      };
    }
    if (action.type === "cancel") {
      return null;
    }
    return current;
  });

  const isPast = new Date(startAt).getTime() <= Date.now();
  const isPending = optimisticParticipant?.status === "pending";
  const isConfirmed = optimisticParticipant?.status === "confirmed";

  const handleJoin = (position: Position) => {
    startTransition(async () => {
      applyOptimistic({ type: "request", position });
      setOpen(false);
      const result = await joinEventAction(eventId, position);
      if (!result.ok) {
        toast.error(t("joinError"), { description: errorMsg(result) });
        router.refresh();
        return;
      }
      toast.success(
        result.data.alreadyRequested ? t("alreadyRequested") : t("requested"),
      );
      router.refresh();
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      applyOptimistic({ type: "cancel" });
      const result = await cancelRsvpAction(eventId);
      if (!result.ok) {
        toast.error(t("cancelError"), { description: errorMsg(result) });
        router.refresh();
        return;
      }
      toast.success(t("rsvpCancelled"));
      router.refresh();
    });
  };

  if (isOrganizer) return null;

  if (!isAuthed) {
    return (
      <Button asChild size="lg">
        <a href={`/${locale}`}>{t("signInToJoin")}</a>
      </Button>
    );
  }
  if (status === "cancelled") {
    return (
      <Button size="lg" disabled>
        {t("eventCancelled")}
      </Button>
    );
  }
  if (status === "completed") {
    return (
      <Button size="lg" disabled>
        {t("eventCompleted")}
      </Button>
    );
  }
  if (isPast && !myParticipant) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="lg" disabled>
          {t("alreadyStarted")}
        </Button>
        <span className="text-muted-foreground text-xs">
          {formatTimeAgo(locale, Date.now() - new Date(startAt).getTime())}
        </span>
      </div>
    );
  }

  if (isConfirmed) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={m.snappySpring}
        className="flex flex-col items-end gap-2 sm:flex-row sm:items-center"
      >
        <span className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100">
          <Check className="size-4" />
          {t("confirmedAs", { position: optimisticParticipant!.position })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={pending || status === "locked"}
          title={status === "locked" ? t("lockedNoCancel") : undefined}
          className="tap-target"
        >
          {pending ? t("cancelling") : t("cancelRsvp")}
        </Button>
      </motion.div>
    );
  }

  if (isPending) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={m.snappySpring}
        className="flex flex-col items-end gap-2 sm:flex-row sm:items-center"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={optimisticParticipant!.position}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={m.fast}
            className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
          >
            <Clock className="size-4" />
            {t("requestPending", { position: optimisticParticipant!.position })}
          </motion.span>
        </AnimatePresence>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={pending}
          className="tap-target"
        >
          {pending ? t("cancelling") : t("withdrawRequest")}
        </Button>
      </motion.div>
    );
  }

  if (status === "full") {
    return (
      <Button size="lg" disabled>
        {t("rosterFull")}
      </Button>
    );
  }
  if (status === "locked" || status === "in_progress") {
    return (
      <Button size="lg" disabled>
        {t("rosterLocked")}
      </Button>
    );
  }

  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)} disabled={pending}>
        {t("requestToJoin")}
      </Button>
      <PositionPickerDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleJoin}
        initial={preferredPosition}
        pending={pending}
      />
    </>
  );
}

/**
 * Locale-aware "X minutes ago" / "X hours ago" / "X days ago" formatter.
 * Used when the event has already started — gives users a sense of how
 * late they are vs just a flat "Already started" string.
 */
function formatTimeAgo(locale: string, ms: number): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return rtf.format(0, "minute");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  return rtf.format(-days, "day");
}
