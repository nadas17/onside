"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  approveParticipantAction,
  rejectParticipantAction,
} from "@/lib/event/rsvp-actions";
import type { RosterEntry } from "@/lib/event/rsvp-actions";

export function PendingRequests({
  pending,
  capacity,
  confirmedCount,
}: {
  pending: RosterEntry[];
  capacity: number;
  confirmedCount: number;
}) {
  const t = useTranslations("Roster");
  const tPos = useTranslations("Profile.positions");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejectingId, setRejectingId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");

  const remainingSpots = Math.max(0, capacity - confirmedCount);

  const handleApprove = async (id: string) => {
    setBusy(id);
    const result = await approveParticipantAction(id);
    setBusy(null);
    if (!result.ok) {
      toast.error(t("approveError"), { description: result.error });
      return;
    }
    toast.success(t("approved"));
    // Realtime UPDATE channel parent state'i güncelleyecek; router.refresh gereksiz.
  };

  const handleReject = async (id: string) => {
    setBusy(id);
    const result = await rejectParticipantAction(
      id,
      rejectReason.trim() || undefined,
    );
    setBusy(null);
    if (!result.ok) {
      toast.error(t("rejectError"), { description: result.error });
      return;
    }
    toast.success(t("rejected"));
    setRejectingId(null);
    setRejectReason("");
  };

  if (pending.length === 0) {
    return null;
  }

  return (
    <section className="rounded-md border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          {t("pendingTitle", { count: pending.length })}
        </h2>
        <span className="text-xs text-amber-800/80 dark:text-amber-200/80">
          {t("remainingSpots", { count: remainingSpots })}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {pending.map((p) => (
          <li
            key={p.id}
            className="border-border bg-background flex flex-col gap-2 rounded-md border p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Avatar name={p.profile.display_name} />
                <div>
                  <div className="font-medium">{p.profile.display_name}</div>
                  <div className="text-muted-foreground text-xs">
                    @{p.profile.username} · {tPos(p.position)} ·{" "}
                    {p.profile.skill_rating}
                  </div>
                </div>
              </div>
              {rejectingId !== p.id && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(p.id)}
                    disabled={busy === p.id || remainingSpots === 0}
                    title={remainingSpots === 0 ? t("rosterFull") : undefined}
                  >
                    <Check className="size-3.5" />
                    {t("approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectingId(p.id);
                      setRejectReason("");
                    }}
                    disabled={busy === p.id}
                  >
                    <X className="size-3.5" />
                    {t("reject")}
                  </Button>
                </div>
              )}
            </div>
            {rejectingId === p.id && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  maxLength={200}
                  placeholder={t("rejectReasonPlaceholder")}
                  className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                />
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRejectingId(null);
                      setRejectReason("");
                    }}
                    disabled={busy === p.id}
                  >
                    {t("cancel")}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReject(p.id)}
                    disabled={busy === p.id}
                  >
                    {busy === p.id ? t("rejecting") : t("confirmReject")}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className="from-brand to-accent-cta flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white"
    >
      {initial}
    </span>
  );
}
