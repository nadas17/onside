import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { HeaderActions } from "@/components/header-actions";
import { JoinModal } from "@/components/auth/join-modal";
import { MyEventsList } from "@/components/event/my-events-list";
import { getMyEventsAction, type MyEventItem } from "@/lib/event/actions";

type ProfileSummary = {
  username: string;
  display_name: string;
};

export default async function HomePage({
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

  let profile: ProfileSummary | null = null;
  if (user) {
    const { data } = await supabase
      .from("profile")
      .select("username, display_name")
      .eq("id", user.id)
      .maybeSingle<ProfileSummary>();
    profile = data;
  }

  let myEvents: MyEventItem[] = [];
  if (profile) {
    const result = await getMyEventsAction();
    myEvents = result.ok ? result.data : [];
  }

  return <HomeView profile={profile} locale={locale} myEvents={myEvents} />;
}

function HomeView({
  profile,
  locale,
  myEvents,
}: {
  profile: ProfileSummary | null;
  locale: string;
  myEvents: MyEventItem[];
}) {
  const t = useTranslations("Home");

  return (
    <>
      <JoinModal open={!profile} />
      <div className="flex min-h-screen flex-col">
        <header className="border-border border-b">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Image
              src="/onside-wordmark.svg"
              alt="Onside"
              width={140}
              height={32}
              priority
            />
            <div className="flex items-center gap-2">
              {profile && (
                <Link
                  href={`/${locale}/profile`}
                  className="text-foreground hover:bg-secondary rounded-md px-2 py-1 text-sm font-medium"
                >
                  @{profile.username}
                </Link>
              )}
              <HeaderActions />
            </div>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
            <Image
              src="/onside-logo.svg"
              alt=""
              aria-hidden
              width={96}
              height={96}
              priority
            />
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {profile
                ? t("greeting", { name: profile.display_name })
                : t("title")}
            </h1>
            <p className="text-muted-foreground text-lg">{t("tagline")}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href={`/${locale}/events`}>{t("browseEvents")}</Link>
              </Button>
              {profile && (
                <Button asChild size="lg" variant="cta">
                  <Link href={`/${locale}/events/new`}>{t("createEvent")}</Link>
                </Button>
              )}
              <Button asChild size="lg" variant="outline">
                <Link href={`/${locale}/venues`}>{t("browseVenues")}</Link>
              </Button>
            </div>
            <p className="border-border text-muted-foreground rounded-md border border-dashed px-4 py-3 text-sm">
              {t("phase3Notice")}
            </p>
          </div>
        </main>

        {profile && myEvents.length > 0 && (
          <MyEventsList events={myEvents} locale={locale} />
        )}

        <footer className="border-border border-t">
          <div className="text-muted-foreground mx-auto max-w-6xl px-6 py-4 text-xs">
            © {new Date().getFullYear()} Onside
          </div>
        </footer>
      </div>
    </>
  );
}
