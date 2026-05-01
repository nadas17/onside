"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Position = "GK" | "DEF" | "MID" | "FWD";

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export function PositionPickerDialog({
  open,
  onOpenChange,
  onConfirm,
  initial,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (position: Position) => void;
  initial?: Position | null;
  pending?: boolean;
}) {
  const t = useTranslations("Roster");
  const tProfile = useTranslations("Profile.positions");
  const [selected, setSelected] = React.useState<Position | null>(
    initial ?? null,
  );

  React.useEffect(() => {
    if (open) setSelected(initial ?? null);
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pickPositionTitle")}</DialogTitle>
          <DialogDescription>{t("pickPositionDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setSelected(p)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-lg border-2 px-3 py-5 text-sm font-medium transition",
                selected === p
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border hover:bg-accent",
              )}
              aria-pressed={selected === p}
            >
              <span className="font-mono text-xs uppercase opacity-60">
                {p}
              </span>
              <span>{tProfile(p)}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || pending}
          >
            {pending ? t("joining") : t("confirmJoin")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
