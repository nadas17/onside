"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PositionPickerDialog,
  type Position,
} from "@/components/event/position-picker";
import { cancelRsvpAction, joinEventAction } from "@/lib/event/rsvp-actions";
import type { EventStatus } from "@/lib/event/state";
import type { MyRsvp } from "@/lib/event/rsvp-actions";

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
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const isPast = new Date(startAt).getTime() <= Date.now();
  const isPending = myParticipant?.status === "pending";
  const isConfirmed = myParticipant?.status === "confirmed";

  const handleJoin = (position: Position) => {
    startTransition(async () => {
      const result = await joinEventAction(eventId, position);
      if (!result.ok) {
        toast.error(t("joinError"), { description: result.error });
        return;
      }
      toast.success(
        result.data.alreadyRequested ? t("alreadyRequested") : t("requested"),
      );
      setOpen(false);
      router.refresh();
    });
  };

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelRsvpAction(eventId);
      if (!result.ok) {
        toast.error(t("cancelError"), { description: result.error });
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
      <Button size="lg" disabled>
        {t("alreadyStarted")}
      </Button>
    );
  }

  if (isConfirmed) {
    return (
      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
        <span className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100">
          <Check className="size-4" />
          {t("confirmedAs", { position: myParticipant!.position })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={pending || status === "locked"}
          title={status === "locked" ? t("lockedNoCancel") : undefined}
        >
          {pending ? t("cancelling") : t("cancelRsvp")}
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
        <span className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          <Clock className="size-4" />
          {t("requestPending", { position: myParticipant!.position })}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={pending}
        >
          {pending ? t("cancelling") : t("withdrawRequest")}
        </Button>
      </div>
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
