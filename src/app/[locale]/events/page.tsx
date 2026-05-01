import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { HeaderActions } from "@/components/header-actions";
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
    <div className="flex min-h-screen flex-col">
      <header className="border-border h-16 border-b">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          <Link
            href={`/${locale}`}
            className="text-lg font-bold tracking-tight"
          >
            Onside
          </Link>
          <HeaderActions />
        </div>
      </header>

      <EventFeedPage events={events} locale={locale} isAuthed={isAuthed} />
    </div>
  );
}
