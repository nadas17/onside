"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Floating Action Button for the primary "create match" action.
 *
 * Hidden on lg+ where the in-page CTA / sidebar create button is enough.
 * Hidden on routes where it would be redundant (the create form itself,
 * the event detail page where a sticky CTA owns the bottom).
 * Positioned above the mobile bottom nav (~80px + safe area) at thumb-reach.
 */
export function FabCreate() {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  // Suppress on screens that already have an in-page primary CTA / would clash
  const HIDE_ON: Array<RegExp> = [
    /^\/events\/new$/,
    /^\/events\/[^/]+$/, // event detail
    /^\/legal/,
  ];
  if (HIDE_ON.some((re) => re.test(pathname))) return null;

  return (
    <Link
      href="/events/new"
      aria-label={t("create")}
      className="bg-accent-cta text-accent-cta-foreground hover:bg-accent-cta/90 active:bg-accent-cta/80 fixed right-4 z-30 flex size-14 items-center justify-center rounded-full shadow-lg shadow-black/20 transition-all hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 lg:hidden"
      style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
    >
      <Plus className="size-6" strokeWidth={2.5} />
    </Link>
  );
}
