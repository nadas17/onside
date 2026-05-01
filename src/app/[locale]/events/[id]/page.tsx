import Link from "next/link";
import dynamic from "next/dynamic";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Trophy,
  ChevronLeft,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { HeaderActions } from "@/components/header-actions";
import { EventStatusBadge } from "@/components/event/event-status-badge";
import { CancelEventDialog } from "@/components/event/cancel-event-dialog";
import { JoinButton } from "@/components/event/join-button";
import { EventRosterPanel } from "@/components/event/event-roster-panel";
import { ChatRoom } from "@/components/event/chat-room";
import { TeamPanel } from "@/components/event/team-panel";
import { ResultPanel } from "@/components/event/result-panel";
import {
  getEventRosterAction,
  getMyRsvpAction,
  getPendingRequestsAction,
} from "@/lib/event/rsvp-actions";
import { getMessagesAction } from "@/lib/event/chat-actions";
import { getTeamsAction } from "@/lib/event/team-actions";
import {
  getMatchResultAction,
  getMvpStateAction,
} from "@/lib/event/result-actions";
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
  organizer_id: string;
  notes: string | null;
  cancelled_reason: string | null;
  organizer: {
    id: string;
    username: string;
    display_name: string;
  };
  venue: {
    id: string;
    name: string;
    address_line: string;
    city: string;
    lat: number;
    lng: number;
  };
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
       min_skill_level, max_skill_level, start_at, end_at, status, organizer_id,
       notes, cancelled_reason,
       organizer:organizer_id ( id, username, display_name ),
       venue:venue_id ( id, name, address_line, city, lat, lng )`,
    )
    .eq("id", id)
    .maybeSingle<EventRow>();

  if (!event) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOrganizer = user?.id === event!.organizer_id;
  const canCancel = isOrganizer && canTransition(event!.status, "cancelled");

  // Phase 4-7: roster + pending + RSVP + messages + teams + result + MVP
  const [
    rosterResult,
    pendingResult,
    myRsvpResult,
    messagesResult,
    teamsResult,
    matchResult,
    mvpStateResult,
  ] = await Promise.all([
    getEventRosterAction(event!.id),
    isOrganizer
      ? getPendingRequestsAction(event!.id)
      : Promise.resolve({ ok: true as const, data: [] }),
    getMyRsvpAction(event!.id),
    getMessagesAction(event!.id, 100),
    getTeamsAction(event!.id),
    getMatchResultAction(event!.id),
    getMvpStateAction(event!.id),
  ]);
  const roster = rosterResult.ok ? rosterResult.data : [];
  const pendingRequests = pendingResult.ok ? pendingResult.data : [];
  const myParticipant = myRsvpResult.ok ? myRsvpResult.data : null;
  const messages = messagesResult.ok ? messagesResult.data : [];
  const teams = teamsResult.ok ? teamsResult.data : [];
  const result = matchResult.ok ? matchResult.data : null;
  const mvpState = mvpStateResult.ok
    ? mvpStateResult.data
    : {
        candidates: [],
        myVoteId: null,
        totalVotes: 0,
        votingOpen: false,
        windowEndsAt: null,
      };

  // Chat yazma izni: organizer veya confirmed katılımcı
  const canPostChat =
    !!user && (isOrganizer || myParticipant?.status === "confirmed");

  let preferredPosition: "GK" | "DEF" | "MID" | "FWD" | null = null;
  if (user) {
    const { data: prof } = await supabase
      .from("profile")
      .select("preferred_position")
      .eq("id", user.id)
      .maybeSingle<{
        preferred_position: "GK" | "DEF" | "MID" | "FWD" | null;
      }>();
    preferredPosition = prof?.preferred_position ?? null;
  }

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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border h-16 border-b">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-6">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-1 text-sm font-medium hover:underline"
          >
            <ChevronLeft className="size-4" />
            Onside
          </Link>
          <HeaderActions />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <EventStatusBadge status={event!.status} />
                <span className="text-muted-foreground text-xs">
                  {t("organizedBy")} @{event!.organizer.username}
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
                  <Link
                    href={`/${locale}/venues/${event!.venue.id}`}
                    className="hover:underline"
                  >
                    {event!.venue.name}, {event!.venue.city}
                  </Link>
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

            <div className="border-border flex flex-wrap items-center gap-3 rounded-md border p-4">
              <span className="text-muted-foreground text-sm">
                {t("capacityValue", { count: event!.capacity })} ·{" "}
                {roster.length} / {event!.capacity}
              </span>
              <div className="ml-auto">
                <JoinButton
                  eventId={event!.id}
                  status={event!.status}
                  isAuthed={!!user}
                  isOrganizer={isOrganizer}
                  myParticipant={myParticipant}
                  preferredPosition={preferredPosition}
                  startAt={event!.start_at}
                  locale={locale}
                />
              </div>
            </div>

            <EventRosterPanel
              eventId={event!.id}
              initialRoster={roster}
              initialPending={pendingRequests}
              capacity={event!.capacity}
              isOrganizer={isOrganizer}
              myPending={
                myParticipant?.status === "pending"
                  ? {
                      position: myParticipant.position,
                      joinedAt: myParticipant.joinedAt,
                      rejectedReason: myParticipant.rejectedReason,
                    }
                  : null
              }
            />

            <TeamPanel
              eventId={event!.id}
              initialTeams={teams}
              isOrganizer={isOrganizer}
              status={event!.status}
              confirmedCount={roster.length}
              minPlayersToConfirm={event!.min_players_to_confirm}
              capacity={event!.capacity}
            />

            <ResultPanel
              eventId={event!.id}
              isOrganizer={isOrganizer}
              status={event!.status}
              hasTeams={teams.length === 2}
              initialResult={result}
              initialMvpState={mvpState}
              myUserId={user?.id ?? null}
              startAt={event!.start_at}
            />

            <section>
              <ChatRoom
                eventId={event!.id}
                initialMessages={messages}
                canPost={canPostChat}
                myUserId={user?.id ?? null}
                organizerId={event!.organizer_id}
                chatLocked={false}
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
            <div className="border-border h-64 overflow-hidden rounded-lg border">
              <MapView
                center={{ lat: event!.venue.lat, lng: event!.venue.lng }}
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
            <div className="border-border rounded-md border p-4 text-sm">
              <div className="font-medium">{event!.venue.name}</div>
              <div className="text-muted-foreground text-xs">
                {event!.venue.address_line}, {event!.venue.city}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
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
    <div className="border-border rounded-md border p-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs tracking-wide uppercase">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
