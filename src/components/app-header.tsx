/**
 * AppHeader — single source of truth for all top bars.
 *
 * Mobile (< 640px):  56px height, icon-only logo, avatar circle for @username
 * Desktop (≥ 640px): 64px height, full wordmark, @username text link
 *
 * Sticky + backdrop-blur so it stays visible while scrolling — modern app feel.
 *
 * Server component: fetches the current user/profile once. (HeaderActions
 * does its own auth.getUser, but Supabase caches per-request so it's free.)
 */

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { HeaderActions } from "@/components/header-actions";
import { SignInCTA } from "@/components/auth/sign-in-cta";
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

export async function AppHeader({
  back,
  title,
  maxWidth = "6xl",
  className,
}: AppHeaderProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let username: string | null = null;
  let displayName: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("profile")
      .select("username, display_name")
      .eq("id", user.id)
      .maybeSingle<{ username: string; display_name: string }>();
    if (data) {
      username = data.username;
      displayName = data.display_name;
    }
  }

  const tAuth = await getTranslations("Auth");

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

        {/* Spacer that flex-grows to push right actions to the edge.
            On mobile, when both `back` and `title` are set, the title fills
            this slot (truncated). On desktop, the title is hidden and the
            slot stays empty — but the flex-1 still works. */}
        <div className="min-w-0 flex-1">
          {title && back && (
            <span className="block truncate text-sm font-semibold sm:hidden">
              {title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {username ? (
            <Link
              href={"/profile" as Route}
              aria-label={`@${username}`}
              className="hover:bg-accent rounded-full transition-colors sm:rounded-md"
              prefetch={false}
            >
              {/* Mobile: avatar circle (initial-based gradient) */}
              <span
                aria-hidden
                className="from-brand to-accent-cta flex size-9 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white sm:hidden"
              >
                {(displayName || username).charAt(0).toUpperCase()}
              </span>
              {/* Desktop: @username text */}
              <span className="text-foreground hidden px-2 py-1 text-sm font-medium sm:inline">
                @{username}
              </span>
            </Link>
          ) : (
            <SignInCTA label={tAuth("signIn")} />
          )}
          <HeaderActions />
        </div>
      </div>
    </header>
  );
}
