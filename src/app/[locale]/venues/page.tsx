import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { HeaderActions } from "@/components/header-actions";
import { VenueMapPage, type VenueRow } from "@/components/map/venue-map-page";

export default async function VenuesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: venues, error } = await supabase
    .from("venue")
    .select(
      "id, name, address_line, city, surface, has_floodlights, is_covered, lat, lng",
    )
    .eq("is_active", true)
    .order("city")
    .order("name")
    .returns<VenueRow[]>();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border h-16 border-b">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          <Link
            href={`/${locale}`}
            className="text-lg font-bold tracking-tight"
          >
            Halısaha
          </Link>
          <HeaderActions />
        </div>
      </header>

      {error ? (
        <main className="flex flex-1 items-center justify-center p-6">
          <p className="text-destructive text-sm">{error.message}</p>
        </main>
      ) : (
        <VenueMapPage venues={venues ?? []} locale={locale} />
      )}
    </div>
  );
}
