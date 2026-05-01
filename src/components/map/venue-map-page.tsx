"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Building2 } from "lucide-react";
import { CitySwitcher } from "@/components/map/city-switcher";
import {
  GeolocationPrompt,
  useGeolocationDecision,
} from "@/components/map/geolocation-prompt";
import {
  CITY_CENTERS,
  DEFAULT_CITY,
  nearestCity,
  type CityName,
} from "@/lib/geo";
import type { MapPin } from "@/components/map/map-view";

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

export type VenueRow = {
  id: string;
  name: string;
  address_line: string;
  city: string;
  surface: "artificial" | "grass" | "indoor";
  has_floodlights: boolean;
  is_covered: boolean;
  lat: number;
  lng: number;
};

export function VenueMapPage({
  venues,
  locale,
}: {
  venues: VenueRow[];
  locale: string;
}) {
  const t = useTranslations("Venues");
  const [city, setCity] = React.useState<CityName>(DEFAULT_CITY);
  const { result, showPrompt, request, decline } = useGeolocationDecision();

  // Geolocation kabul edilirse en yakın desteklenen şehre snap.
  const userPositionRef = React.useRef<{ lat: number; lng: number } | null>(
    null,
  );
  React.useEffect(() => {
    if (result.decision === "granted" && result.position) {
      userPositionRef.current = result.position;
      setCity(nearestCity(result.position));
    }
  }, [result.decision, result.position]);

  const visibleVenues = React.useMemo(
    () => venues.filter((v) => v.city === city),
    [venues, city],
  );

  const center = CITY_CENTERS[city];

  const pins: MapPin[] = visibleVenues.map((v) => ({
    id: v.id,
    name: v.name,
    lat: v.lat,
    lng: v.lng,
    href: `/${locale}/venues/${v.id}`,
  }));

  const handlePinClick = (pin: MapPin) => {
    if (pin.href) window.location.href = pin.href;
  };

  return (
    <>
      <GeolocationPrompt open={showPrompt} onAllow={request} onDeny={decline} />
      <div className="grid h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[400px_1fr]">
        <aside className="border-border flex flex-col overflow-hidden border-b lg:border-r lg:border-b-0">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <h1 className="text-base font-semibold">{t("title")}</h1>
            <CitySwitcher value={city} onChange={setCity} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {visibleVenues.length === 0 ? (
              <div className="text-muted-foreground p-6 text-center text-sm">
                {t("emptyForCity")}
              </div>
            ) : (
              <ul className="divide-border divide-y">
                {visibleVenues.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/${locale}/venues/${v.id}`}
                      className="hover:bg-accent block px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="bg-brand/10 text-brand mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md">
                          <Building2 className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {v.name}
                          </div>
                          <div className="text-muted-foreground truncate text-xs">
                            {v.address_line}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge>{t(`surfaces.${v.surface}`)}</Badge>
                            {v.has_floodlights && (
                              <Badge>{t("floodlights")}</Badge>
                            )}
                            {v.is_covered && <Badge>{t("covered")}</Badge>}
                          </div>
                        </div>
                      </div>
                    </Link>
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
            onPinClick={handlePinClick}
            className="h-full w-full"
          />
        </div>
      </div>
    </>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-secondary text-secondary-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
      {children}
    </span>
  );
}
