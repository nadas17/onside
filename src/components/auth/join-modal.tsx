"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMotionPreset } from "@/lib/motion";
import { useErrorMessage } from "@/lib/i18n-errors";
import {
  checkUsernameAvailabilityAction,
  createProfileAction,
  signInWithGoogleAction,
} from "@/lib/auth/actions";

type Availability =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken"; suggestions: string[] }
  | { status: "invalid"; message: string };

const NICKNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const NICKNAME_DRAFT_KEY = "onside:nickname-draft";

export function JoinModal({ open }: { open: boolean }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const m = useMotionPreset();
  const errorMsg = useErrorMessage();

  const [nickname, setNickname] = React.useState("");
  const [availability, setAvailability] = React.useState<Availability>({
    status: "idle",
  });
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [googlePending, startGoogleTransition] = React.useTransition();

  const handleGoogleSignIn = () => {
    setSubmitError(null);
    startGoogleTransition(async () => {
      const result = await signInWithGoogleAction();
      if (!result.ok) {
        setSubmitError(errorMsg(result) || t("googleError"));
        return;
      }
      window.location.href = result.data.url;
    });
  };

  // Restore nickname draft from sessionStorage on mount — survives browser
  // back-button, accidental tab close, and reload until profile is created.
  React.useEffect(() => {
    if (!open) return;
    try {
      const saved = window.sessionStorage.getItem(NICKNAME_DRAFT_KEY);
      if (saved) setNickname(saved);
    } catch {
      // Storage unavailable (private mode, etc.) — silently skip.
    }
  }, [open]);

  // Persist nickname draft on every change.
  React.useEffect(() => {
    if (!open) return;
    try {
      if (nickname) {
        window.sessionStorage.setItem(NICKNAME_DRAFT_KEY, nickname);
      } else {
        window.sessionStorage.removeItem(NICKNAME_DRAFT_KEY);
      }
    } catch {
      // Storage unavailable — drafts won't survive but UI still works.
    }
  }, [nickname, open]);

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
        setSubmitError(errorMsg(result));
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
      // Profile created — clear draft so it doesn't haunt a future signup
      // (e.g. session expires 30 days later).
      try {
        window.sessionStorage.removeItem(NICKNAME_DRAFT_KEY);
      } catch {
        /* ignore */
      }
      router.refresh();
    });
  };

  const submitDisabled = pending || availability.status !== "available";

  return (
    <ResponsiveDialog open={open} dismissible={false}>
      <ResponsiveDialogContent hideCloseButton blockDismiss>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("welcome")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("nicknamePrompt")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="mt-4 flex flex-col gap-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleGoogleSignIn}
            disabled={googlePending || pending}
            className="h-12 text-base sm:h-11"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mr-2 h-5 w-5"
            >
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.46c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.55-5.18 3.55-8.87Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29 0-.8.14-1.57.38-2.29V6.6H1.27C.46 8.21 0 10.05 0 12c0 1.95.46 3.79 1.27 5.4l4-3.11Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.6l4 3.11C6.22 6.85 8.87 4.75 12 4.75Z"
              />
            </svg>
            {googlePending ? t("googleStarting") : t("googleContinue")}
          </Button>

          <div className="flex items-center gap-3">
            <div className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-xs tracking-wide uppercase">
              {t("or")}
            </span>
            <div className="bg-border h-px flex-1" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
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
              inputMode="text"
              enterKeyHint="go"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("nicknamePlaceholder")}
              aria-describedby="nickname-status"
              disabled={pending}
              className="h-12 text-base sm:h-10 sm:text-sm"
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
                <motion.span
                  className="text-brand inline-block"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={m.snappySpring}
                >
                  {t("available")}
                </motion.span>
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
                <motion.div
                  className="flex flex-wrap items-center gap-2 pt-1"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={m.fade}
                >
                  <span className="text-muted-foreground text-xs">
                    {t("trySuggestion")}
                  </span>
                  {availability.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNickname(s)}
                      className="bg-secondary hover:bg-secondary/80 active:bg-secondary/60 tap-target rounded-md px-3 py-2 text-xs font-medium transition-colors sm:px-2 sm:py-1"
                    >
                      {s}
                    </button>
                  ))}
                </motion.div>
              )}
          </div>

          {submitError && (
            <motion.p
              className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={m.fade}
            >
              {submitError}
            </motion.p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={submitDisabled}
            className="h-12 text-base sm:h-11"
          >
            {pending ? t("starting") : t("start")}
          </Button>
        </form>

        <p className="text-muted-foreground mt-3 text-xs">{t("anonNotice")}</p>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
