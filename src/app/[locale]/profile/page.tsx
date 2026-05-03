import Link from "next/link";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { PageBackground } from "@/components/page-background";
import { RatingChart } from "@/components/profile/rating-chart";
import { RecentMatches } from "@/components/profile/recent-matches";
import {
  getRecentMatchesAction,
  getSkillHistoryAction,
  type RecentMatch,
  type SkillPoint,
} from "@/lib/profile/stats-queries";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  preferred_position: "GK" | "DEF" | "MID" | "FWD" | null;
  secondary_position: "GK" | "DEF" | "MID" | "FWD" | null;
  skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  skill_rating: number;
  matches_played: number;
  matches_won: number;
  goals_scored: number;
  mvp_count: number;
  home_city: string | null;
  locale: string;
};

export default async function ProfilePage({
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
  if (!user) {
    redirect({ href: "/", locale });
  }

  const { data: profile } = await supabase
    .from("profile")
    .select(
      "id, username, display_name, bio, preferred_position, secondary_position, skill_level, skill_rating, matches_played, matches_won, goals_scored, mvp_count, home_city, locale",
    )
    .eq("id", user!.id)
    .maybeSingle<Profile>();

  if (!profile) {
    redirect({ href: "/", locale });
  }

  const [historyResult, recentResult] = await Promise.all([
    getSkillHistoryAction(profile!.id, 50),
    getRecentMatchesAction(profile!.id, 10),
  ]);
  const history = historyResult.ok ? historyResult.data : [];
  const recent = recentResult.ok ? recentResult.data : [];

  return (
    <ProfileView
      profile={profile!}
      locale={locale}
      history={history}
      recent={recent}
    />
  );
}

function ProfileView({
  profile,
  locale,
  history,
  recent,
}: {
  profile: Profile;
  locale: string;
  history: SkillPoint[];
  recent: RecentMatch[];
}) {
  const t = useTranslations("Profile");

  const initial = profile.display_name.charAt(0).toUpperCase();
  const positionLabel = (p: Profile["preferred_position"]) =>
    p ? t(`positions.${p}`) : t("noPosition");

  return (
    <>
      <PageBackground variant="profile" intensity="heavy" />
      <div className="flex min-h-screen flex-col">
        <AppHeader maxWidth="3xl" />
        <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-6 sm:gap-8">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
              <div
                aria-hidden
                className="from-brand to-accent-cta flex size-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-2xl font-bold text-white sm:size-24 sm:text-3xl"
              >
                {initial}
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <h1 className="text-xl font-semibold sm:text-2xl">
                  {profile.display_name}
                </h1>
                <p className="text-muted-foreground text-sm">
                  @{profile.username}
                </p>
                {profile.bio && (
                  <p className="pt-2 text-sm leading-relaxed">{profile.bio}</p>
                )}
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="sm:size-default"
              >
                <Link href={`/${locale}/profile/edit`}>{t("edit")}</Link>
              </Button>
            </div>

            {/* 2x2 mobile, 4x1 desktop — KPI grid */}
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
              <Stat label={t("matchesPlayed")} value={profile.matches_played} />
              <Stat label={t("matchesWon")} value={profile.matches_won} />
              <Stat label={t("goalsScored")} value={profile.goals_scored} />
              <Stat label={t("mvpCount")} value={profile.mvp_count} />
            </section>

            <RatingChart
              history={history}
              initialRating={profile.skill_rating}
            />

            <RecentMatches matches={recent} />

            <section className="glass-card grid gap-4 rounded-lg border p-4 shadow-md shadow-black/20 sm:grid-cols-2 sm:p-6">
              <Field
                label={t("preferredPosition")}
                value={positionLabel(profile.preferred_position)}
              />
              <Field
                label={t("secondaryPosition")}
                value={positionLabel(profile.secondary_position)}
              />
              <Field
                label={t("skillLevel")}
                value={t(`skillLevels.${profile.skill_level}`)}
              />
              <Field
                label={t("skillRating")}
                value={String(profile.skill_rating)}
              />
              <Field label={t("homeCity")} value={profile.home_city ?? "—"} />
              <Field
                label={t("languageSetting")}
                value={profile.locale.toUpperCase()}
              />
            </section>
          </div>
        </main>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-lg border p-3 text-center sm:p-4">
      <div className="text-xl font-bold tabular-nums sm:text-2xl">{value}</div>
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase sm:text-xs">
        {label}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
