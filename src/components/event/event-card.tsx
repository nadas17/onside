"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Calendar, MapPin, Users } from "lucide-react";
import { EventStatusBadge } from "@/components/event/event-status-badge";
import type { EventListItem } from "@/lib/event/actions";

export function EventCard({ event }: { event: EventListItem }) {
  const locale = useLocale();
  const t = useTranslations("Events");

  const start = new Date(event.start_at);
  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Warsaw",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
    timeZone: "Europe/Warsaw",
  });

  return (
    <Link
      href={`/${locale}/events/${event.id}`}
      className="glass-card hover:border-brand/30 block rounded-lg border p-4 shadow-md shadow-black/20 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 active:translate-y-0 active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <EventStatusBadge status={event.status} />
            <span className="text-muted-foreground font-mono text-xs uppercase">
              {event.format}
            </span>
          </div>
          <div className="truncate text-sm font-semibold">{event.title}</div>
          <div className="text-muted-foreground mt-2 flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-1">
              <Calendar className="size-3 shrink-0" />
              {dateFmt.format(start)} · {timeFmt.format(start)}
            </span>
            {event.venue ? (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">
                  {event.venue.name}, {event.venue.city}
                </span>
              </span>
            ) : event.custom_venue_name ? (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{event.custom_venue_name}</span>
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Users className="size-3 shrink-0" />
              {t("capacityValue", { count: event.capacity })}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
