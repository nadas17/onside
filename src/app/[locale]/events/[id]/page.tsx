import Link from "next/link";
import dynamic from "next/dynamic";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Calendar, Clock, MapPin, Users, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { PageBackground } from "@/components/page-background";
import { EventStatusBadge } from "@/components/event/event-status-badge";
import { CancelEventDialog } from "@/components/event/cancel-event-dialog";
import { JoinButton } from "@/components/event/join-button";
import { EventRosterPanel } from "@/components/event/event-roster-panel";
import { ChatRoom } from "@/components/event/chat-room";
import { TeamPanel } from "@/components/event/team-panel";
import { ResultPanel } from "@/components/event/result-panel";
import { getEventRosterAction } from "@/lib/event/rsvp-actions";
import { getMessagesAction } from "@/lib/event/chat-actions";
import { getTeamsAction } from "@/lib/event/team-actions";
import { getMatchResultAction } from "@/lib/event/result-actions";
import { canTransition, type EventStatus } from "@/lib/event/state";

const MapView = dynamic(() =>
  import("@/components/map/map-view").then((m) => m.MapView),
);

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  format: "5v5" | "6v6" | "7v7" | "8v8" | "11v11";
  capacity: number;
  min_players_to_confirm: number;
  min_skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  max_skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  start_at: string;
  end_at: string;
  status: EventStatus;
  organizer_nickname: string;
  notes: string | null;
  cancelled_reason: string | null;
  chat_locked: boolean;
  venue: {
    id: string;
    name: string;
    address_line: string;
    city: string;
    lat: number;
    lng: number;
  } | null;
  custom_venue_name: string | null;
  custom_venue_url: string | null;
};

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: event } = await supabase
    .from("event")
    .select(
      `id, title, description, format, capacity, min_players_to_confirm,
       min_skill_level, max_skill_level, start_at, end_at, status, organizer_nickname,
       notes, cancelled_reason, chat_locked, custom_venue_name, custom_venue_url,
       venue:venue_id ( id, name, address_line, city, lat, lng )`,
    )
    .eq("id", id)
    .maybeSingle<EventRow>();

  if (!event) notFound();

  const canCancel = canTransition(event!.status, "cancelled");

  const [rosterResult, messagesResult, teamsResult, matchResult] =
    await Promise.all([
      getEventRosterAction(event!.id),
      getMessagesAction(event!.id, 100),
      getTeamsAction(event!.id),
      getMatchResultAction(event!.id),
    ]);
  const roster = rosterResult.ok ? rosterResult.data : [];
  const messages = messagesResult.ok ? messagesResult.data : [];
  const teams = teamsResult.ok ? teamsResult.data : [];
  const result = matchResult.ok ? matchResult.data : null;

  const t = await getTranslations("Events");
  const tProfile = await getTranslations("Profile");

  const startDate = new Date(event!.start_at);
  const endDate = new Date(event!.end_at);
  const dateFmt = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Warsaw",
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
    timeZone: "Europe/Warsaw",
  });

  const rosterNicknames = roster.map((r) => r.nickname);

  return (
    <>
      <PageBackground variant="eventDetail" intensity="heavy" />
      <div className="flex min-h-screen flex-col">
        <AppHeader
          back={{ href: "/events", label: "Onside" }}
          title={event!.title}
          maxWidth="5xl"
        />
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <EventStatusBadge status={event!.status} />
                  <span className="text-muted-foreground text-xs">
                    {t("organizedBy")} {event!.organizer_nickname}
                  </span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {event!.title}
                </h1>
                {event!.description && (
                  <p className="text-muted-foreground text-sm">
                    {event!.description}
                  </p>
                )}
              </div>

              {event!.status === "cancelled" && event!.cancelled_reason && (
                <div className="border-destructive/30 bg-destructive/5 rounded-md border px-4 py-3 text-sm">
                  <strong>{t("cancelledNotice")}</strong>{" "}
                  {event!.cancelled_reason}
                </div>
              )}

              <section className="grid gap-3 sm:grid-cols-2">
                <Info
                  icon={<Calendar className="size-4" />}
                  label={t("date")}
                  value={dateFmt.format(startDate)}
                />
                <Info
                  icon={<Clock className="size-4" />}
                  label={t("time")}
                  value={`${timeFmt.format(startDate)} – ${timeFmt.format(endDate)}`}
                />
                <Info
                  icon={<MapPin className="size-4" />}
                  label={t("venue")}
                  value={
                    event!.venue ? (
                      <Link
                        href={`/${locale}/venues/${event!.venue.id}`}
                        className="hover:underline"
                      >
                        {event!.venue.name}, {event!.venue.city}
                      </Link>
                    ) : event!.custom_venue_url ? (
                      <a
                        href={event!.custom_venue_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {event!.custom_venue_name}
                      </a>
                    ) : (
                      <span>{event!.custom_venue_name}</span>
                    )
                  }
                />
                <Info
                  icon={<Users className="size-4" />}
                  label={t("format")}
                  value={`${event!.format} · ${t("capacityValue", { count: event!.capacity })}`}
                />
                <Info
                  icon={<Trophy className="size-4" />}
                  label={t("skillLevel")}
                  value={`${tProfile(`skillLevels.${event!.min_skill_level}`)} – ${tProfile(`skillLevels.${event!.max_skill_level}`)}`}
                />
                <Info
                  icon={<Users className="size-4" />}
                  label={t("minPlayers")}
                  value={t("minPlayersValue", {
                    count: event!.min_players_to_confirm,
                  })}
                />
              </section>

              {event!.notes && (
                <section>
                  <h2 className="text-muted-foreground text-sm font-semibold">
                    {t("notes")}
                  </h2>
                  <p className="mt-2 text-sm">{event!.notes}</p>
                </section>
              )}

              <div className="glass-card flex flex-wrap items-center gap-3 rounded-lg border p-4 shadow-md shadow-black/20">
                <span className="text-muted-foreground text-sm">
                  {t("capacityValue", { count: event!.capacity })} ·{" "}
                  {roster.length} / {event!.capacity}
                </span>
                <div className="ml-auto">
                  <JoinButton
                    eventId={event!.id}
                    status={event!.status}
                    startAt={event!.start_at}
                    rosterNicknames={rosterNicknames}
                    locale={locale}
                  />
                </div>
              </div>

              <EventRosterPanel
                eventId={event!.id}
                initialRoster={roster}
                capacity={event!.capacity}
              />

              <TeamPanel
                eventId={event!.id}
                initialTeams={teams}
                status={event!.status}
                confirmedCount={roster.length}
                minPlayersToConfirm={event!.min_players_to_confirm}
                capacity={event!.capacity}
              />

              <ResultPanel
                eventId={event!.id}
                status={event!.status}
                hasTeams={teams.length === 2}
                initialResult={result}
              />

              <section>
                <ChatRoom
                  eventId={event!.id}
                  initialMessages={messages}
                  chatLocked={event!.chat_locked}
                  eventStatus={event!.status}
                  locale={locale}
                />
              </section>

              {canCancel && (
                <div className="flex justify-end">
                  <CancelEventDialog eventId={event!.id} />
                </div>
              )}
            </div>

            <aside className="flex flex-col gap-3">
              {event!.venue ? (
                <>
                  <div className="glass-card h-64 overflow-hidden rounded-lg border shadow-md shadow-black/20">
                    <MapView
                      center={{
                        lat: event!.venue.lat,
                        lng: event!.venue.lng,
                      }}
                      zoom={15}
                      pins={[
                        {
                          id: event!.venue.id,
                          name: event!.venue.name,
                          lat: event!.venue.lat,
                          lng: event!.venue.lng,
                        },
                      ]}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="glass-card rounded-lg border p-4 text-sm">
                    <div className="font-medium">{event!.venue.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {event!.venue.address_line}, {event!.venue.city}
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-card rounded-lg border p-4 text-sm">
                  <div className="font-medium">{event!.custom_venue_name}</div>
                  {event!.custom_venue_url && (
                    <a
                      href={event!.custom_venue_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand mt-1 inline-block text-xs hover:underline"
                    >
                      {t("openInMaps")}
                    </a>
                  )}
                </div>
              )}
            </aside>
          </div>
        </main>
      </div>
    </>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
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
