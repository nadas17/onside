"use client";

import * as React from "react";
import { Calendar, Home, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom navigation — 3 primary destinations always within thumb reach.
 *
 * Hidden on `lg+` (≥1024px) where the regular header navigation is sufficient.
 * Sticky to viewport bottom, respects iOS home-indicator safe area.
 *
 * Active route gets brand color + bolder icon — instant orientation cue.
 */

type Tab = {
  href: "/" | "/events" | "/venues";
  labelKey: "home" | "events" | "venues";
  Icon: typeof Home;
};

const TABS: Tab[] = [
  { href: "/", labelKey: "home", Icon: Home },
  { href: "/events", labelKey: "events", Icon: Calendar },
  { href: "/venues", labelKey: "venues", Icon: MapPin },
];

export function MobileBottomNav({ isAuthed }: { isAuthed: boolean }) {
  // isAuthed is no longer consulted (the gated /profile tab is gone). Prop
  // remains so layout.tsx doesn't break this commit; commit 4 drops it.
  void isAuthed;
  const pathname = usePathname();
  const t = useTranslations("Nav");

  const tabs = TABS;

  return (
    <nav
      aria-label="Primary"
      className="glass-bar fixed right-0 bottom-0 left-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tabs.map((tab) => {
        const isActive =
          tab.href === "/"
            ? pathname === "/"
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const Icon = tab.Icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              "min-h-[56px]",
              isActive
                ? "text-brand"
                : "text-muted-foreground hover:text-foreground active:text-foreground",
            )}
          >
            {/* Active indicator pill at top */}
            <span
              aria-hidden
              className={cn(
                "absolute top-0 h-0.5 w-8 rounded-b-full transition-colors",
                isActive ? "bg-brand" : "bg-transparent",
              )}
            />
            <Icon
              className={cn("size-5", isActive && "stroke-[2.5]")}
              aria-hidden
            />
            <span className="leading-tight">{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
