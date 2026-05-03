"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useMotionPreset } from "@/lib/motion";
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
  const m = useMotionPreset();
  const [selected, setSelected] = React.useState<Position | null>(
    initial ?? null,
  );

  React.useEffect(() => {
    if (open) setSelected(initial ?? null);
  }, [open, initial]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t("pickPositionTitle")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("pickPositionDesc")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {POSITIONS.map((p) => {
            const isSelected = selected === p;
            return (
              <motion.button
                key={p}
                type="button"
                onClick={() => setSelected(p)}
                whileTap={m.reduced ? undefined : { scale: 0.96 }}
                animate={
                  m.reduced
                    ? undefined
                    : isSelected
                      ? { scale: 1.02 }
                      : { scale: 1 }
                }
                transition={m.snappySpring}
                className={cn(
                  "tap-target flex min-h-[88px] flex-col items-center justify-center gap-1 rounded-lg border-2 px-3 py-5 text-sm font-medium transition-colors",
                  isSelected
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border hover:bg-accent active:bg-accent/80",
                )}
                aria-pressed={isSelected}
              >
                <span className="font-mono text-xs uppercase opacity-60">
                  {p}
                </span>
                <span>{tProfile(p)}</span>
              </motion.button>
            );
          })}
        </div>
        <ResponsiveDialogFooter className="mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="h-12 sm:h-10"
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || pending}
            className="h-12 sm:h-10"
          >
            {pending ? t("joining") : t("confirmJoin")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
