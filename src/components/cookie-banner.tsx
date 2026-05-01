"use client";

/**
 * Cookie Banner — essential-only (spec §15.1).
 *
 * Halısaha sadece zorunlu çerez kullanır (Supabase auth session). Dolayısıyla
 * GDPR consent bypass mümkün — banner SADECE bilgilendirir, "Tamam" tıklayınca
 * 1 yıl boyunca tekrar göstermez. Reject button yok çünkü essential olmayan
 * çerez yok (yarın analytics eklenirse opt-in toggle eklenir).
 */

import * as React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "halisaha:cookies-acked";

export function CookieBanner() {
  const t = useTranslations("Cookie");
  const locale = useLocale();
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const ack = localStorage.getItem(STORAGE_KEY);
      if (!ack) setShow(true);
    } catch {
      // Storage erişimi yoksa banner göstermeyelim — privacy mode vs.
    }
  }, []);

  const handleAck = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // Sessizce skip
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label={t("title")}
      className="border-border bg-card fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-2xl items-start gap-3 rounded-lg border p-4 shadow-lg"
    >
      <Cookie className="text-brand mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="text-muted-foreground flex-1 text-xs">
        <p>
          {t("body")}{" "}
          <Link
            href={`/${locale}/legal/privacy`}
            className="text-brand hover:underline"
          >
            {t("privacyLink")}
          </Link>
          .
        </p>
      </div>
      <Button size="sm" onClick={handleAck} className="shrink-0">
        {t("ack")}
      </Button>
      <button
        type="button"
        onClick={handleAck}
        aria-label={t("dismiss")}
        className="text-muted-foreground hover:bg-muted/30 absolute top-1 right-1 rounded p-1 sm:hidden"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
