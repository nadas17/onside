"use client";

import { useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Error");
  const locale = useLocale();
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    console.error("[locale-error]", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <main
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-md">{t("description")}</p>
      <div className="flex gap-2">
        <Button ref={retryRef} onClick={reset}>
          {t("retry")}
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/${locale}`}>{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
