import Link from "next/link";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { HeaderActions } from "@/components/header-actions";
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
  const tHome = useTranslations("Home");

  const initial = profile.display_name.charAt(0).toUpperCase();
  const positionLabel = (p: Profile["preferred_position"]) =>
    p ? t(`positions.${p}`) : t("noPosition");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href={`/${locale}`}
            className="text-lg font-bold tracking-tight"
          >
            Onside
          </Link>
          <HeaderActions />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div
              aria-hidden
              className="from-brand to-accent-cta flex size-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-bold text-white"
            >
              {initial}
            </div>
            <div className="flex flex-1 flex-col items-center gap-1 sm:items-start">
              <h1 className="text-2xl font-semibold">{profile.display_name}</h1>
              <p className="text-muted-foreground text-sm">
                @{profile.username}
              </p>
              {profile.bio && <p className="pt-2 text-sm">{profile.bio}</p>}
            </div>
            <Button asChild variant="outline">
              <Link href={`/${locale}/profile/edit`}>{t("edit")}</Link>
            </Button>
          </div>

          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t("matchesPlayed")} value={profile.matches_played} />
            <Stat label={t("matchesWon")} value={profile.matches_won} />
            <Stat label={t("goalsScored")} value={profile.goals_scored} />
            <Stat label={t("mvpCount")} value={profile.mvp_count} />
          </section>

          <RatingChart history={history} initialRating={profile.skill_rating} />

          <RecentMatches matches={recent} />

          <section className="border-border grid gap-4 rounded-lg border p-6 sm:grid-cols-2">
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

          <Link
            href={`/${locale}`}
            className="text-muted-foreground self-start text-sm hover:underline"
          >
            ← {tHome("title")}
          </Link>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border rounded-lg border p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
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
