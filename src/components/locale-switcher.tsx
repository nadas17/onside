"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

const LABELS: Record<Locale, string> = {
  tr: "TR",
  en: "EN",
  pl: "PL",
};

const NATIVE_NAMES: Record<Locale, string> = {
  tr: "Türkçe",
  en: "English",
  pl: "Polski",
};

export function LocaleSwitcher() {
  const t = useTranslations("Locale");
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const select = (locale: Locale) => {
    setOpen(false);
    if (locale === currentLocale) return;
    startTransition(() => {
      router.replace(pathname, { locale });
    });
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("switch")}
        disabled={pending}
      >
        <Globe />
        <span className="text-xs uppercase">{LABELS[currentLocale]}</span>
      </Button>
      {open && (
        <ul
          role="listbox"
          aria-label={t("switch")}
          className="border-border bg-popover absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-md border shadow-lg"
        >
          {routing.locales.map((loc) => (
            <li key={loc}>
              <button
                type="button"
                role="option"
                aria-selected={loc === currentLocale}
                onClick={() => select(loc)}
                className="hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between px-3 py-2 text-left text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground font-mono text-xs">
                    {LABELS[loc]}
                  </span>
                  <span>{NATIVE_NAMES[loc]}</span>
                </span>
                {loc === currentLocale && (
                  <Check className="text-brand size-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
