import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/", locale });

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
          <EventForm venues={venues ?? []} locale={locale} />
        </main>
      </div>
    </>
  );
}
