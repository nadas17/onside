"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/lib/i18n-errors";
import { linkGoogleAccountAction } from "@/lib/auth/actions";

/**
 * Banner shown only to anonymous accounts. Calls Supabase's linkIdentity
 * for Google so the existing UUID — and therefore all match history,
 * Elo, and profile data — carries over to a real, cross-device account.
 */
export function LinkGoogleCTA() {
  const t = useTranslations("Profile");
  const errorMsg = useErrorMessage();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const handleLink = () => {
    setError(null);
    startTransition(async () => {
      const result = await linkGoogleAccountAction();
      if (!result.ok) {
        setError(errorMsg(result) || t("linkGoogleError"));
        return;
      }
      window.location.href = result.data.url;
    });
  };

  return (
    <div className="border-brand/30 bg-brand/5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{t("linkGoogleTitle")}</h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t("linkGoogleDescription")}
        </p>
        {error && (
          <p className="text-destructive pt-1 text-xs" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleLink}
        disabled={pending}
        className="shrink-0"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-2 h-4 w-4">
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
        {pending ? t("linkGoogleStarting") : t("linkGoogleButton")}
      </Button>
    </div>
  );
}
