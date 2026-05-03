"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { toast } from "sonner";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cancelEventAction } from "@/lib/event/actions";

export function CancelEventDialog({ eventId }: { eventId: string }) {
  const t = useTranslations("Events");
  const errorMsg = useErrorMessage();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await cancelEventAction(eventId, { reason });
      if (!result.ok) {
        toast.error(t("cancelError"), { description: errorMsg(result) });
        return;
      }
      toast.success(t("cancelled"));
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        {t("cancelEvent")}
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("cancelEvent")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("cancelDescription")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cancel-reason">{t("cancelReason")}</Label>
              <textarea
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                minLength={3}
                maxLength={200}
                required
                placeholder={t("cancelReasonPlaceholder")}
                className="glass-strong border-input ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              />
            </div>
            <ResponsiveDialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="h-12 sm:h-10"
              >
                {t("cancel")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending}
                className="h-12 sm:h-10"
              >
                {pending ? t("cancelling") : t("confirmCancel")}
              </Button>
            </ResponsiveDialogFooter>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
