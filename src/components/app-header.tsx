/**
 * AppHeader — single source of truth for all top bars.
 *
 * Mobile (< 640px):  56px height, icon-only logo
 * Desktop (≥ 640px): 64px height, full wordmark
 *
 * Sticky + backdrop-blur so it stays visible while scrolling.
 *
 * Identity is purely nickname-based now (no Supabase Auth); the per-device
 * nickname is surfaced inline by the chat/join flows, not in the header.
 */

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { HeaderActions } from "@/components/header-actions";
import { cn } from "@/lib/utils";
import type { Route } from "next";

interface AppHeaderProps {
  /** Back link — replaces the logo on the left. Locale prefix is added automatically. */
  back?: { href: string; label: string };
  /** Page title shown next to back link (mobile only). */
  title?: string;
  /** Tighten max-width for narrower content pages (default: max-w-6xl). */
  maxWidth?: "5xl" | "6xl" | "3xl" | "2xl";
  className?: string;
}

const MAX_WIDTH_CLASS: Record<
  NonNullable<AppHeaderProps["maxWidth"]>,
  string
> = {
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
};

export function AppHeader({
  back,
  title,
  maxWidth = "6xl",
  className,
}: AppHeaderProps) {
  return (
    <header className={cn("glass-bar sticky top-0 z-30 border-b", className)}>
      <div
        className={cn(
          "mx-auto flex h-14 items-center gap-2 px-4 sm:h-16 sm:px-6",
          MAX_WIDTH_CLASS[maxWidth],
        )}
      >
        {back ? (
          <Link
            href={back.href as Route}
            className="hover:bg-accent tap-target -ml-2 inline-flex items-center gap-1 rounded-md px-2 text-sm font-medium transition-colors"
          >
            <ChevronLeft className="size-5 sm:size-4" />
            <span className="hidden sm:inline">{back.label}</span>
          </Link>
        ) : (
          <Link
            href={"/" as Route}
            className="hover:bg-accent flex shrink-0 items-center gap-2 rounded-md px-1 py-1 transition-colors"
          >
            <Image
              src="/onside-logo.svg"
              alt="Onside"
              width={36}
              height={36}
              className="size-8 sm:size-9"
              priority
            />
            <span className="text-foreground hidden text-lg font-semibold tracking-tight sm:inline">
              Onside
            </span>
          </Link>
        )}

        <div className="min-w-0 flex-1">
          {title && back && (
            <span className="block truncate text-sm font-semibold sm:hidden">
              {title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <HeaderActions />
        </div>
      </div>
    </header>
  );
}
