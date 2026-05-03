"use client";

/**
 * My Pending Card — kullanıcının kendi pending talebini roster yakınında
 * persistent şekilde gösterir (Norman: pending state'in yetersiz signifier'ı sorununu çözer).
 *
 * - Sadece authenticated + non-organizer + status='pending' kullanıcıya render edilir
 * - Talep zamanını "X dk önce" olarak gösterir, organize edilmenin canlı bir
 *   feedback loop'u olduğunu hissettirir
 * - Hızlı "İptal et" affordance'ı sağlar
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelRsvpAction } from "@/lib/event/rsvp-actions";

type Position = "GK" | "DEF" | "MID" | "FWD";

export function MyPendingCard({
  eventId,
  position,
  joinedAt,
  rejectedReason,
}: {
  eventId: string;
  position: Position;
  joinedAt: string;
  rejectedReason: string | null;
}) {
  const t = useTranslations("Roster");
  const errorMsg = useErrorMessage();
  const tPos = useTranslations("Profile.positions");
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  // Saat tikertik akıyormuş hissi için 60 saniyede bir tetikle
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const elapsedMin = Math.max(
    0,
    Math.floor((now - new Date(joinedAt).getTime()) / 60_000),
  );

  const elapsedLabel = (() => {
    if (elapsedMin < 1) return t("justNow");
    if (elapsedMin < 60) return t("minutesAgo", { count: elapsedMin });
    if (elapsedMin < 60 * 24) {
      return t("hoursAgo", { count: Math.floor(elapsedMin / 60) });
    }
    return t("daysAgo", { count: Math.floor(elapsedMin / 60 / 24) });
  })();

  const handleWithdraw = async () => {
    setBusy(true);
    const result = await cancelRsvpAction(eventId);
    setBusy(false);
    if (!result.ok) {
      toast.error(t("cancelError"), { description: errorMsg(result) });
      return;
    }
    toast.success(t("rsvpCancelled"));
    router.refresh();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-50/60 px-4 py-3 dark:border-amber-400/30 dark:bg-amber-900/20"
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200"
      >
        <Clock className="size-4" />
      </span>
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          {t("myPendingTitle")}
        </span>
        <span className="text-xs text-amber-800/80 dark:text-amber-200/70">
          {t("myPendingDescription", {
            position: tPos(position),
            elapsed: elapsedLabel,
          })}
        </span>
        {rejectedReason && (
          <span className="text-destructive mt-1 text-xs">
            {t("rejectedNote")}: {rejectedReason}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleWithdraw}
        disabled={busy}
        className="text-amber-900 hover:bg-amber-500/10 dark:text-amber-100"
      >
        <X className="mr-1 size-3.5" />
        {busy ? t("cancelling") : t("withdrawRequest")}
      </Button>
    </div>
  );
}
