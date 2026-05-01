"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Filter } from "lucide-react";
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
import type { EventListItem } from "@/lib/event/actions";
import type { MapPin as MapPinType } from "@/components/map/map-view";

const MapView = dynamic(
  () => import("@/components/map/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="border-border bg-muted text-muted-foreground flex h-full w-full items-center justify-center rounded-lg border text-sm">
        Harita yükleniyor…
      </div>
    ),
  },
);

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
  const { result, showPrompt, request, decline } = useGeolocationDecision();

  React.useEffect(() => {
    if (result.decision === "granted" && result.position) {
      setCity(nearestCity(result.position));
    }
  }, [result.decision, result.position]);

  const filtered = React.useMemo(() => {
    return events.filter((e) => {
      if (e.venue?.city !== city) return false;
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
      <div className="grid h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[440px_1fr]">
        <aside className="border-border flex flex-col overflow-hidden border-b lg:border-r lg:border-b-0">
          <div className="border-border flex flex-col gap-3 border-b px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-base font-semibold">{t("feedTitle")}</h1>
              <CitySwitcher value={city} onChange={setCity} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                className="border-input bg-background h-9 rounded-md border px-2 text-xs"
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
                className="border-input bg-background h-9 rounded-md border px-2 text-xs"
                aria-label={t("filterSkill")}
              >
                <option value="">{t("allSkills")}</option>
                {SKILL_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`skillLevels.${l}`)}
                  </option>
                ))}
              </select>
            </div>
            {isAuthed && (
              <Button asChild size="sm">
                <Link href={`/${locale}/events/new`}>
                  <Plus className="size-4" />
                  {t("createEvent")}
                </Link>
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <EmptyState
                icon={<Filter className="size-5" />}
                title={t("emptyFeed")}
                description={t("emptyFeedHint")}
                size="sm"
                action={
                  isAuthed ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/${locale}/events/new`}>
                        {t("createFirst")}
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {filtered.map((e) => (
                  <li key={e.id}>
                    <EventCard event={e} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="relative h-[60vh] lg:h-auto">
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
      </div>
    </>
  );
}
