"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Filter, List, Map as MapIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CitySwitcher } from "@/components/map/city-switcher";
import {
  GeolocationPrompt,
  useGeolocationDecision,
} from "@/components/map/geolocation-prompt";
import { EventCard } from "@/components/event/event-card";
import {
  CITY_CENTERS,
  DEFAULT_CITY,
  nearestCity,
  type CityName,
} from "@/lib/geo";
import { FORMATS, SKILL_LEVELS } from "@/lib/validation/event";
import { cn } from "@/lib/utils";
import type { EventListItem } from "@/lib/event/actions";
import type { MapPin as MapPinType } from "@/components/map/map-view";

const MapView = dynamic(
  () => import("@/components/map/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="glass-card text-muted-foreground flex h-full w-full items-center justify-center rounded-lg border text-sm">
        Harita yükleniyor…
      </div>
    ),
  },
);

/**
 * Events feed — list-first.
 *
 * Map is opt-in via the "Show on map" toggle (mobile + desktop). When opened
 * on desktop, it appears as a glass overlay panel on the right; on mobile it
 * replaces the list. Each event card already shows venue text, so the map is
 * useful but not necessary at the feed level.
 */

export function EventFeedPage({
  events,
  locale,
  isAuthed,
}: {
  events: EventListItem[];
  locale: string;
  isAuthed: boolean;
}) {
  const t = useTranslations("Events");
  const [city, setCity] = React.useState<CityName>(DEFAULT_CITY);
  const [formatFilter, setFormatFilter] = React.useState<string>("");
  const [skillFilter, setSkillFilter] = React.useState<string>("");
  const [showMap, setShowMap] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const { result, showPrompt, request, decline } = useGeolocationDecision();

  React.useEffect(() => {
    if (result.decision === "granted" && result.position) {
      setCity(nearestCity(result.position));
    }
  }, [result.decision, result.position]);

  const filtered = React.useMemo(() => {
    return events.filter((e) => {
      // Custom-venue events have no curated city; show them regardless so
      // organisers using one-off locations still surface in the feed.
      if (e.venue && e.venue.city !== city) return false;
      if (formatFilter && e.format !== formatFilter) return false;
      if (skillFilter) {
        const order = SKILL_LEVELS as readonly string[];
        const target = order.indexOf(skillFilter);
        const min = order.indexOf(e.min_skill_level);
        const max = order.indexOf(e.max_skill_level);
        if (target < min || target > max) return false;
      }
      return true;
    });
  }, [events, city, formatFilter, skillFilter]);

  const center = CITY_CENTERS[city];
  const pins: MapPinType[] = filtered
    .filter((e) => e.venue)
    .map((e) => ({
      id: e.id,
      name: e.title,
      lat: e.venue!.lat,
      lng: e.venue!.lng,
      href: `/${locale}/events/${e.id}`,
      color: e.status === "full" ? "#f59e0b" : "#059669",
    }));

  return (
    <>
      <GeolocationPrompt open={showPrompt} onAllow={request} onDeny={decline} />

      <main
        className={cn(
          "mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8",
          showMap && "hidden lg:block",
        )}
      >
        {/* Header row: title + city + show-map */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("feedTitle")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("pinsShown", { count: filtered.length })}
            </p>
          </div>
          <CitySwitcher value={city} onChange={setCity} />
        </div>

        {/* Filter row */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="glass-strong border-input h-10 rounded-md border px-2 text-sm"
            aria-label={t("filterFormat")}
          >
            <option value="">{t("allFormats")}</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            className="glass-strong border-input h-10 rounded-md border px-2 text-sm"
            aria-label={t("filterSkill")}
          >
            <option value="">{t("allSkills")}</option>
            {SKILL_LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`skillLevels.${l}`)}
              </option>
            ))}
          </select>
          {pins.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMap(true)}
              className="glass-strong hover:border-foreground/30 inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors"
            >
              <MapIcon className="size-4" />
              {t("openMap", { count: pins.length })}
            </button>
          )}
          {isAuthed && (
            <Button asChild size="sm" className="ml-auto h-10">
              <Link href={`/${locale}/events/new`}>
                <Plus className="size-4" />
                {t("createEvent")}
              </Link>
            </Button>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Filter />}
            title={t("emptyFeed")}
            description={t("emptyFeedHint")}
            size="sm"
            action={
              isAuthed ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/${locale}/events/new`}>{t("createFirst")}</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {filtered.map((e) => (
              <li key={e.id}>
                <EventCard event={e} />
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* Map overlay — opt-in. Mobile: full screen replacement. Desktop: glass panel. */}
      {showMap && (
        <div
          className={cn(
            "fixed inset-0 z-40 lg:inset-auto lg:right-6 lg:bottom-6 lg:z-30 lg:h-[70vh] lg:w-[520px] lg:rounded-xl lg:shadow-2xl lg:shadow-black/40",
          )}
        >
          <div className="glass-bar absolute top-0 right-0 left-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-2 lg:rounded-t-xl">
            <button
              type="button"
              onClick={() => setShowMap(false)}
              className="hover:bg-accent active:bg-accent/80 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors"
            >
              <List className="size-4 lg:hidden" />
              <X className="hidden size-4 lg:block" />
              <span className="lg:hidden">{t("backToList")}</span>
              <span className="hidden lg:inline">
                {t("pinsShown", { count: pins.length })}
              </span>
            </button>
            <span className="text-muted-foreground text-xs lg:hidden">
              {t("pinsShown", { count: pins.length })}
            </span>
          </div>
          {mounted && (
            <div className="absolute inset-0 lg:overflow-hidden lg:rounded-xl">
              <MapView
                center={{ lat: center.lat, lng: center.lng }}
                zoom={center.zoom}
                pins={pins}
                userLocation={
                  result.decision === "granted" ? result.position : null
                }
                onPinClick={(pin) => {
                  if (pin.href) window.location.href = pin.href;
                }}
                className="h-full w-full"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
