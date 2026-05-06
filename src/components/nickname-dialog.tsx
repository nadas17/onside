"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { isValidNickname } from "@/lib/validation/nickname";

/**
 * Modal that asks for a nickname and resolves with it. Used by JoinButton
 * (when no nickname is set yet) and by the header "switch nickname" link.
 *
 * Reusing this dialog instead of an inline field keeps every entry-point's
 * validation and copy in one place.
 */
export function NicknameDialog({
  open,
  defaultValue,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  defaultValue?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (nickname: string) => void;
}) {
  const t = useTranslations("Nickname");
  const [value, setValue] = React.useState(defaultValue ?? "");

  React.useEffect(() => {
    if (open) setValue(defaultValue ?? "");
  }, [open, defaultValue]);

  const valid = isValidNickname(value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit(value.trim());
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("title")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("description")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="grid gap-2">
            <Label htmlFor="nickname-input">{t("label")}</Label>
            <Input
              id="nickname-input"
              autoFocus
              value={value}
              maxLength={24}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("placeholder")}
              className="h-12 text-base sm:h-10 sm:text-sm"
            />
            <p className="text-muted-foreground text-xs">{t("rules")}</p>
          </div>
          <ResponsiveDialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-12 sm:h-10"
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!valid} className="h-12 sm:h-10">
              {t("save")}
            </Button>
          </ResponsiveDialogFooter>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
