import dynamic from "next/dynamic";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Building2, Lightbulb, Square, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { PageBackground } from "@/components/page-background";
import { EventCard } from "@/components/event/event-card";
import { getEventsByVenueAction } from "@/lib/event/actions";

const MapView = dynamic(() =>
  import("@/components/map/map-view").then((m) => m.MapView),
);

type Venue = {
  id: string;
  name: string;
  address_line: string;
  city: string;
  country_code: string;
  lat: number;
  lng: number;
  surface: "artificial" | "grass" | "indoor";
  has_floodlights: boolean;
  is_covered: boolean;
  external_url: string | null;
};

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: venue } = await supabase
    .from("venue")
    .select(
      "id, name, address_line, city, country_code, lat, lng, surface, has_floodlights, is_covered, external_url",
    )
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle<Venue>();

  if (!venue) notFound();

  const eventsResult = await getEventsByVenueAction(venue!.id, 5);
  const venueEvents = eventsResult.ok ? eventsResult.data : [];

  const t = await getTranslations("Venues");
  const tEvents = await getTranslations("Events");

  return (
    <>
      <PageBackground variant="venueDetail" intensity="balanced" />
      <div className="flex min-h-screen flex-col">
        <AppHeader
          back={{ href: "/venues", label: t("backToList") }}
          title={venue!.name}
          maxWidth="5xl"
        />
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <div>
                <div className="flex items-center gap-3">
                  <div className="bg-brand/10 text-brand flex size-12 items-center justify-center rounded-lg">
                    <Building2 className="size-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold">{venue!.name}</h1>
                    <p className="text-muted-foreground text-sm">
                      {venue!.city}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm">{venue!.address_line}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Feature
                  icon={<Square className="size-4" />}
                  label={t("surface")}
                  value={t(`surfaces.${venue!.surface}`)}
                />
                <Feature
                  icon={<Lightbulb className="size-4" />}
                  label={t("floodlights")}
                  value={venue!.has_floodlights ? t("yes") : t("no")}
                />
                <Feature
                  icon={<Building2 className="size-4" />}
                  label={t("covered")}
                  value={venue!.is_covered ? t("yes") : t("no")}
                />
              </div>

              {venue!.external_url && (
                <Button asChild variant="outline" className="w-fit">
                  <a
                    href={venue!.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("officialSite")} <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              )}

              <section className="flex flex-col gap-2">
                <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
                  {tEvents("upcomingHere")}
                </h2>
                {venueEvents.length === 0 ? (
                  <p className="glass-card text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                    {tEvents("noUpcoming")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {venueEvents.map((e) => (
                      <li key={e.id}>
                        <EventCard event={e} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="h-80 lg:h-[440px]">
              <MapView
                center={{ lat: venue!.lat, lng: venue!.lng }}
                zoom={15}
                pins={[
                  {
                    id: venue!.id,
                    name: venue!.name,
                    lat: venue!.lat,
                    lng: venue!.lng,
                  },
                ]}
                className="glass-card h-full w-full overflow-hidden rounded-lg border shadow-md shadow-black/20"
              />
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

function Feature({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-card rounded-lg border p-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wide uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
