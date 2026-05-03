"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  Crown,
  MapPin,
  TrendingDown,
  TrendingUp,
  Minus,
  History,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { RecentMatch } from "@/lib/profile/stats-queries";

export function RecentMatches({ matches }: { matches: RecentMatch[] }) {
  const t = useTranslations("Stats");
  const locale = useLocale();

  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title={t("recentEmpty")}
        description={t("recentEmptyHint")}
      />
    );
  }

  return (
    <div className="glass-card rounded-lg border shadow-md shadow-black/20">
      <div className="border-border border-b px-4 py-3 text-sm font-semibold">
        {t("recentMatches")}
      </div>
      <ul className="divide-border divide-y">
        {matches.map((m) => (
          <li key={m.eventId} className="px-4 py-3">
            <Link
              href={`/${locale}/events/${m.eventId}`}
              className="flex flex-col gap-1 hover:opacity-80"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <OutcomeBadge outcome={m.outcome} t={t} />
                  <span className="truncate font-medium">{m.title}</span>
                  {m.isMvp && (
                    <Crown className="size-3.5 shrink-0 text-amber-500" />
                  )}
                </div>
                <span className="shrink-0 text-sm tabular-nums">
                  {m.team === "A"
                    ? `${m.scoreA}–${m.scoreB}`
                    : `${m.scoreB}–${m.scoreA}`}
                </span>
              </div>
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {m.venueName}
                  {m.venueCity && (
                    <span className="text-muted-foreground/70">
                      · {m.venueCity}
                    </span>
                  )}
                </span>
                <span>{dateFmt.format(new Date(m.startAt))}</span>
                {m.attended && m.eloDelta !== 0 && (
                  <EloDelta delta={m.eloDelta} />
                )}
                {m.goals > 0 && (
                  <span>{t("goalsLabel", { count: m.goals })}</span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OutcomeBadge({
  outcome,
  t,
}: {
  outcome: RecentMatch["outcome"];
  t: ReturnType<typeof useTranslations>;
}) {
  const map: Record<RecentMatch["outcome"], { label: string; cls: string }> = {
    win: {
      label: t("outcome.win"),
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    loss: {
      label: t("outcome.loss"),
      cls: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    },
    draw: {
      label: t("outcome.draw"),
      cls: "border-border bg-muted/40 text-muted-foreground",
    },
    no_show: {
      label: t("outcome.noShow"),
      cls: "border-border bg-muted/40 text-muted-foreground line-through",
    },
  };
  const { label, cls } = map[outcome];
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${cls}`}
    >
      {label}
    </span>
  );
}

function EloDelta({ delta }: { delta: number }) {
  if (delta > 0) {
    return (
      <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="size-3" />+{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
        <TrendingDown className="size-3" />
        {delta}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground flex items-center gap-0.5">
      <Minus className="size-3" />0
    </span>
  );
}
