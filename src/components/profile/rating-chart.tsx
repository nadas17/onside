"use client";

/**
 * Rating Chart — pure SVG, dependency-free.
 *
 * skill_snapshot kronolojik sıraladığımız time-series'i çizer. recharts gibi
 * bir kütüphane yerine inline SVG (~100 satır), ~0 KB bundle artışı.
 *
 * MVP bonus puanları altın renkli marker; match Elo'sı brand renkli.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import { LineChart } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { SkillPoint } from "@/lib/profile/stats-queries";

const VIEW_W = 560;
const VIEW_H = 200;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;

export function RatingChart({
  history,
  initialRating = 1000,
}: {
  history: SkillPoint[];
  initialRating?: number;
}) {
  const t = useTranslations("Stats");

  // Veri noktaları: ilk satırın ratingBefore'u + her snapshot'ın ratingAfter'ı
  const points = React.useMemo(() => {
    if (history.length === 0) return [];
    const start = {
      rating: history[0]!.ratingBefore,
      time: new Date(history[0]!.createdAt).getTime() - 24 * 60 * 60 * 1000,
      reason: "match" as const,
    };
    const tail = history.map((h) => ({
      rating: h.ratingAfter,
      time: new Date(h.createdAt).getTime(),
      reason: h.reason,
    }));
    return [start, ...tail];
  }, [history]);

  if (points.length < 2) {
    return (
      <EmptyState
        icon={<LineChart className="size-5" />}
        title={t("chartEmpty", { rating: initialRating })}
        description={t("chartEmptyHint")}
      />
    );
  }

  const ratings = points.map((p) => p.rating);
  const times = points.map((p) => p.time);
  const minR = Math.min(...ratings) - 25;
  const maxR = Math.max(...ratings) + 25;
  const minT = times[0]!;
  const maxT = times[times.length - 1]!;

  const xScale = (time: number) => {
    if (maxT === minT) return PAD_LEFT;
    return (
      PAD_LEFT +
      ((time - minT) / (maxT - minT)) * (VIEW_W - PAD_LEFT - PAD_RIGHT)
    );
  };
  const yScale = (rating: number) => {
    if (maxR === minR) return VIEW_H / 2;
    return (
      PAD_TOP +
      ((maxR - rating) / (maxR - minR)) * (VIEW_H - PAD_TOP - PAD_BOTTOM)
    );
  };

  const path = points
    .map((p, i) => {
      const cmd = i === 0 ? "M" : "L";
      return `${cmd} ${xScale(p.time).toFixed(1)} ${yScale(p.rating).toFixed(1)}`;
    })
    .join(" ");

  // Y-axis ticks (3 step)
  const yTicks: number[] = [];
  for (let i = 0; i <= 3; i++) {
    yTicks.push(minR + ((maxR - minR) * i) / 3);
  }

  // X-axis: ilk + son tarih
  const dateFmt = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  });

  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border p-4">
      <div className="flex items-baseline justify-between pb-2">
        <span className="text-sm font-semibold">{t("ratingChart")}</span>
        <span className="text-muted-foreground text-xs">
          {points[points.length - 1]!.rating} ({history.length} {t("matches")})
        </span>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-48 w-full"
        role="img"
        aria-label={t("ratingChartAlt")}
      >
        {/* Y grid + labels */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              x2={VIEW_W - PAD_RIGHT}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={PAD_LEFT - 6}
              y={yScale(tick) + 4}
              textAnchor="end"
              fontSize={10}
              className="fill-muted-foreground"
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {/* X labels */}
        <text
          x={PAD_LEFT}
          y={VIEW_H - 8}
          fontSize={10}
          className="fill-muted-foreground"
        >
          {dateFmt.format(new Date(minT))}
        </text>
        <text
          x={VIEW_W - PAD_RIGHT}
          y={VIEW_H - 8}
          fontSize={10}
          textAnchor="end"
          className="fill-muted-foreground"
        >
          {dateFmt.format(new Date(maxT))}
        </text>

        {/* Line */}
        <path
          d={path}
          fill="none"
          stroke="var(--color-brand, #059669)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Markers */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={xScale(p.time)}
            cy={yScale(p.rating)}
            r={p.reason === "mvp_bonus" ? 4 : 2.5}
            className={
              p.reason === "mvp_bonus"
                ? "fill-amber-500"
                : "fill-[var(--color-brand,#059669)]"
            }
          >
            <title>
              {p.rating} ({dateFmt.format(new Date(p.time))})
            </title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
