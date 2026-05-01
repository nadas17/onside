"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkUsernameAvailabilityAction,
  createProfileAction,
} from "@/lib/auth/actions";

type Availability =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; suggestions: string[] }
  | { status: "invalid"; message: string };

const NICKNAME_REGEX = /^[a-z0-9_]{3,20}$/;

export function JoinModal({ open }: { open: boolean }) {
  const t = useTranslations("Auth");
  const router = useRouter();

  const [nickname, setNickname] = React.useState("");
  const [availability, setAvailability] = React.useState<Availability>({
    status: "idle",
  });
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Real-time uniqueness check — 300ms debounce
  React.useEffect(() => {
    const trimmed = nickname.trim().toLowerCase();
    if (trimmed.length === 0) {
      setAvailability({ status: "idle" });
      return;
    }
    if (!NICKNAME_REGEX.test(trimmed)) {
      setAvailability({ status: "invalid", message: t("nicknameFormat") });
      return;
    }

    setAvailability({ status: "checking" });
    const timer = setTimeout(async () => {
      const result = await checkUsernameAvailabilityAction(trimmed);
      if (!result.ok) {
        setAvailability({ status: "invalid", message: result.error });
      } else if (result.data.available) {
        setAvailability({ status: "available" });
      } else {
        setAvailability({
          status: "taken",
          suggestions: result.data.suggestions ?? [],
        });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [nickname, t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    startTransition(async () => {
      const result = await createProfileAction(nickname);
      if (!result.ok) {
        setSubmitError(result.error);
        if (
          result.code === "username_taken" &&
          "suggestions" in result &&
          Array.isArray(result.suggestions)
        ) {
          setAvailability({
            status: "taken",
            suggestions: result.suggestions,
          });
        }
        return;
      }
      router.refresh();
    });
  };

  const submitDisabled = pending || availability.status !== "available";

  return (
    <Dialog open={open}>
      <DialogContent
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("welcome")}</DialogTitle>
          <DialogDescription>{t("nicknamePrompt")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="nickname">{t("nickname")}</Label>
            <Input
              id="nickname"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={20}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("nicknamePlaceholder")}
              aria-describedby="nickname-status"
              disabled={pending}
            />
            <p
              id="nickname-status"
              className="min-h-4 text-xs"
              aria-live="polite"
            >
              {availability.status === "checking" && (
                <span className="text-muted-foreground">{t("checking")}</span>
              )}
              {availability.status === "available" && (
                <span className="text-brand">{t("available")}</span>
              )}
              {availability.status === "invalid" && (
                <span className="text-destructive">{availability.message}</span>
              )}
              {availability.status === "taken" && (
                <span className="text-destructive">{t("taken")}</span>
              )}
            </p>
            {availability.status === "taken" &&
              availability.suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-muted-foreground text-xs">
                    {t("trySuggestion")}
                  </span>
                  {availability.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNickname(s)}
                      className="bg-secondary hover:bg-secondary/80 rounded-md px-2 py-1 text-xs font-medium"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
          </div>

          {submitError && (
            <p
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
              role="alert"
            >
              {submitError}
            </p>
          )}

          <Button type="submit" size="lg" disabled={submitDisabled}>
            {pending ? t("starting") : t("start")}
          </Button>
        </form>

        <p className="text-muted-foreground text-xs">{t("anonNotice")}</p>
      </DialogContent>
    </Dialog>
  );
}
