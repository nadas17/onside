"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Building2 } from "lucide-react";
import { CitySwitcher } from "@/components/map/city-switcher";
import {
  GeolocationPrompt,
  useGeolocationDecision,
} from "@/components/map/geolocation-prompt";
import { DEFAULT_CITY, nearestCity, type CityName } from "@/lib/geo";

/**
 * Venues feed — list-only view.
 *
 * Map intentionally removed from this page (each venue has its own detail
 * page with a map). Geolocation prompt is kept so the list snaps to the
 * user's nearest supported city.
 */

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

  React.useEffect(() => {
    if (result.decision === "granted" && result.position) {
      setCity(nearestCity(result.position));
    }
  }, [result.decision, result.position]);

  const visibleVenues = React.useMemo(
    () => venues.filter((v) => v.city === city),
    [venues, city],
  );

  return (
    <>
      <GeolocationPrompt open={showPrompt} onAllow={request} onDeny={decline} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("subtitle", { count: visibleVenues.length })}
            </p>
          </div>
          <CitySwitcher value={city} onChange={setCity} />
        </div>

        {visibleVenues.length === 0 ? (
          <p className="glass-card text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            {t("emptyForCity")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {visibleVenues.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/${locale}/venues/${v.id}`}
                  className="glass-card hover:border-brand/40 active:bg-accent/40 flex h-full items-start gap-3 rounded-lg border p-4 shadow-md shadow-black/20 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 active:translate-y-0 active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <div className="bg-brand/15 text-brand mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md">
                    <Building2 className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {v.name}
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {v.address_line}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge>{t(`surfaces.${v.surface}`)}</Badge>
                      {v.has_floodlights && <Badge>{t("floodlights")}</Badge>}
                      {v.is_covered && <Badge>{t("covered")}</Badge>}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-secondary/70 text-secondary-foreground inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
      {children}
    </span>
  );
}
