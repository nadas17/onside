"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  PositionPickerDialog,
  type Position,
} from "@/components/event/position-picker";
import { NicknameDialog } from "@/components/nickname-dialog";
import { useNickname } from "@/components/nickname-provider";
import { useMotionPreset } from "@/lib/motion";
import { cancelRsvpAction, joinEventAction } from "@/lib/event/rsvp-actions";
import type { EventStatus } from "@/lib/event/state";

export function JoinButton({
  eventId,
  status,
  startAt,
  rosterNicknames,
  locale,
}: {
  eventId: string;
  status: EventStatus;
  startAt: string;
  /** Confirmed nicknames in this event's roster — used to derive "am I in?" */
  rosterNicknames: string[];
  locale: string;
}) {
  const t = useTranslations("Roster");
  const errorMsg = useErrorMessage();
  const router = useRouter();
  const m = useMotionPreset();
  const { nickname, setNickname, hydrated } = useNickname();
  const [nicknameDialogOpen, setNicknameDialogOpen] = React.useState(false);
  const [positionDialogOpen, setPositionDialogOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const isPast = new Date(startAt).getTime() <= Date.now();
  const isInRoster =
    nickname !== null &&
    rosterNicknames.some((n) => n.toLowerCase() === nickname.toLowerCase());

  const handleJoin = (position: Position) => {
    if (!nickname) return;
    startTransition(async () => {
      setPositionDialogOpen(false);
      const result = await joinEventAction(eventId, nickname, position);
      if (!result.ok) {
        toast.error(t("joinError"), { description: errorMsg(result) });
        router.refresh();
        return;
      }
      toast.success(
        result.data.alreadyJoined ? t("alreadyJoined") : t("joined"),
      );
      router.refresh();
    });
  };

  const handleCancel = () => {
    if (!nickname) return;
    startTransition(async () => {
      const result = await cancelRsvpAction(eventId, nickname);
      if (!result.ok) {
        toast.error(t("cancelError"), { description: errorMsg(result) });
        router.refresh();
        return;
      }
      toast.success(t("rsvpCancelled"));
      router.refresh();
    });
  };

  const startJoinFlow = () => {
    if (!nickname) {
      setNicknameDialogOpen(true);
      return;
    }
    setPositionDialogOpen(true);
  };

  if (!hydrated) {
    return (
      <Button size="lg" disabled>
        …
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
  if (isPast && !isInRoster) {
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

  if (isInRoster) {
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
          {t("confirmedAsNickname", { nickname: nickname! })}
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
      <Button size="lg" onClick={startJoinFlow} disabled={pending}>
        {t("join")}
      </Button>
      <NicknameDialog
        open={nicknameDialogOpen}
        defaultValue={nickname ?? ""}
        onOpenChange={setNicknameDialogOpen}
        onSubmit={(next) => {
          setNickname(next);
          setNicknameDialogOpen(false);
          setPositionDialogOpen(true);
        }}
      />
      <PositionPickerDialog
        open={positionDialogOpen}
        onOpenChange={setPositionDialogOpen}
        onConfirm={handleJoin}
        initial={null}
        pending={pending}
      />
    </>
  );
}

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
