import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { PageBackground } from "@/components/page-background";
import { EventFeedPage } from "@/components/event/event-feed-page";
import { getEventsAction } from "@/lib/event/actions";

export default async function EventsPage({
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
  const isAuthed = !!user;

  const result = await getEventsAction({ limit: 50 });
  const events = result.ok ? result.data : [];

  return (
    <>
      <PageBackground variant="events" intensity="heavy" />
      <div className="flex min-h-screen flex-col">
        <AppHeader maxWidth="6xl" />
        <EventFeedPage events={events} locale={locale} isAuthed={isAuthed} />
      </div>
    </>
  );
}
