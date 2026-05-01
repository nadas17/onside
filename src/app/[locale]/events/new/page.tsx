import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventForm } from "@/components/event/event-form";
import { HeaderActions } from "@/components/header-actions";

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
    <div className="flex min-h-screen flex-col">
      <header className="border-border h-16 border-b">
        <div className="mx-auto flex h-full max-w-3xl items-center justify-between px-6">
          <Link href={`/${locale}`} className="text-sm font-medium">
            ← Onside
          </Link>
          <h1 className="text-base font-semibold">{t("createTitle")}</h1>
          <HeaderActions />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        {(venues?.length ?? 0) === 0 ? (
          <p className="border-border text-muted-foreground rounded-md border border-dashed px-4 py-3 text-sm">
            {t("noVenues")}
          </p>
        ) : (
          <EventForm venues={venues ?? []} locale={locale} />
        )}
      </main>
    </div>
  );
}
