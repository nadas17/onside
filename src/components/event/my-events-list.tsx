import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Calendar, MapPin, Users, Crown } from "lucide-react";
import { EventStatusBadge } from "@/components/event/event-status-badge";
import { Button } from "@/components/ui/button";
import type { MyEventItem } from "@/lib/event/actions";

const MAX_VISIBLE = 4;

export async function MyEventsList({
  events,
  locale,
}: {
  events: MyEventItem[];
  locale: string;
}) {
  if (events.length === 0) return null;

  const t = await getTranslations("MyEvents");

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

  const visible = events.slice(0, MAX_VISIBLE);
  const more = events.length - visible.length;

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
        {events.length > MAX_VISIBLE && (
          <Link
            href={`/${locale}/events`}
            className="text-brand text-sm font-medium hover:underline"
          >
            {t("seeAll", { count: events.length })}
          </Link>
        )}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {visible.map((e) => {
          const start = new Date(e.start_at);
          return (
            <li key={e.id}>
              <article className="glass-card hover:border-brand/30 flex h-full flex-col justify-between rounded-lg border p-4 shadow-md shadow-black/20 transition hover:shadow-lg hover:shadow-black/30">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <EventStatusBadge status={e.status} />
                    {e.is_organizer && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-900 uppercase dark:bg-amber-900/40 dark:text-amber-100">
                        <Crown className="size-3" />
                        {t("organizerBadge")}
                      </span>
                    )}
                    <span className="text-muted-foreground font-mono text-xs uppercase">
                      {e.format}
                    </span>
                  </div>
                  <h3 className="text-base leading-tight font-semibold">
                    {e.title}
                  </h3>
                  <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
                    <li className="flex items-center gap-1.5">
                      <Calendar className="size-3" />
                      {dateFmt.format(start)} · {timeFmt.format(start)}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <MapPin className="size-3" />
                      {e.venue.name}, {e.venue.city}
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Users className="size-3" />
                      {e.capacity}
                    </li>
                  </ul>
                </div>
                <div className="mt-3">
                  <Button
                    asChild
                    size="sm"
                    variant="default"
                    className="w-full"
                  >
                    <Link href={`/${locale}/events/${e.id}`}>
                      {t("goToEvent")}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {more > 0 && (
        <p className="text-muted-foreground mt-3 text-xs">
          {t("plusMore", { count: more })}
        </p>
      )}
    </section>
  );
}
