import { setRequestLocale, getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/event/event-form";
import { AppHeader } from "@/components/app-header";
import { PageBackground } from "@/components/page-background";

type VenueOption = {
  id: string;
  name: string;
  city: string;
  address_line: string;
};

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: venues } = await supabase
    .from("venue")
    .select("id, name, city, address_line")
    .eq("is_active", true)
    .order("city")
    .order("name")
    .returns<VenueOption[]>();

  const t = await getTranslations("Events");

  return (
    <>
      <PageBackground variant="eventNew" intensity="heavy" />
      <div className="flex min-h-screen flex-col">
        <AppHeader
          back={{ href: "/events", label: "Onside" }}
          title={t("createTitle")}
          maxWidth="3xl"
        />
        <main className="mx-auto w-full max-w-2xl px-6 py-6 sm:py-8">
          <div
            role="note"
            className="mb-6 flex items-start gap-3 rounded-lg border border-amber-400/50 bg-amber-50/95 p-4 text-sm text-amber-950 shadow-sm supports-[backdrop-filter]:bg-amber-50/80 supports-[backdrop-filter]:backdrop-blur-md dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-100"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{t("noticeNotReservation")}</p>
          </div>
          <EventForm venues={venues ?? []} locale={locale} />
        </main>
      </div>
    </>
  );
}
