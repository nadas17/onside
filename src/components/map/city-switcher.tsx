"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORTED_CITIES, type CityName } from "@/lib/geo";

export function CitySwitcher({
  value,
  onChange,
}: {
  value: CityName;
  onChange: (city: CityName) => void;
}) {
  const t = useTranslations("Cities");
  const [open, setOpen] = React.useState(false);
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

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <MapPin className="size-4" />
        <span>{t(value)}</span>
        <ChevronDown className="size-3 opacity-60" />
      </Button>
      {open && (
        <ul
          role="listbox"
          className="border-border bg-popover absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-md border shadow-lg"
        >
          {SUPPORTED_CITIES.map((city) => (
            <li key={city}>
              <button
                type="button"
                role="option"
                aria-selected={city === value}
                onClick={() => {
                  onChange(city);
                  setOpen(false);
                }}
                className="hover:bg-accent hover:text-accent-foreground flex w-full items-center justify-between px-3 py-2 text-left text-sm"
              >
                {t(city)}
                {city === value && (
                  <span className="text-brand text-xs">●</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
