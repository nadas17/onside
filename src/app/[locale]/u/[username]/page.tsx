import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { HeaderActions } from "@/components/header-actions";
import { RatingChart } from "@/components/profile/rating-chart";
import { RecentMatches } from "@/components/profile/recent-matches";
import {
  getRecentMatchesAction,
  getSkillHistoryAction,
} from "@/lib/profile/stats-queries";

/**
 * Public profile — `/u/[username]`. Read-only.
 *
 * Privacy (spec §15.3): home_lat/lng asla expose edilmez. Sadece username,
 * display_name, bio, position, skill_level/rating, aggregate stats ve
 * skill_snapshot history. Bio user-controlled (spec §15.5).
 */

type PublicProfile = {
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
};

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ locale: string; username: string }>;
}) {
  const { locale, username } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  // Username regex sadeleştirilmiş; case-insensitive lookup ihtiyacı yok (DB lowercase enforced)
  const { data: profile } = await supabase
    .from("profile")
    .select(
      "id, username, display_name, bio, preferred_position, secondary_position, skill_level, skill_rating, matches_played, matches_won, goals_scored, mvp_count, home_city",
    )
    .eq("username", username.toLowerCase())
    .maybeSingle<PublicProfile>();

  if (!profile) notFound();

  const [historyResult, recentResult] = await Promise.all([
    getSkillHistoryAction(profile!.id, 50),
    getRecentMatchesAction(profile!.id, 10),
  ]);
  const history = historyResult.ok ? historyResult.data : [];
  const recent = recentResult.ok ? recentResult.data : [];

  const t = await getTranslations("Profile");
  const tStats = await getTranslations("Stats");

  const initial = profile!.display_name.charAt(0).toUpperCase();
  const positionLabel = (p: PublicProfile["preferred_position"]) =>
    p ? t(`positions.${p}`) : t("noPosition");

  const winRate =
    profile!.matches_played > 0
      ? Math.round((profile!.matches_won / profile!.matches_played) * 100)
      : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border h-16 border-b">
        <div className="mx-auto flex h-full max-w-3xl items-center justify-between px-6">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-1 text-sm font-medium hover:underline"
          >
            <ChevronLeft className="size-4" />
            Halısaha
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
              <h1 className="text-2xl font-semibold">
                {profile!.display_name}
              </h1>
              <p className="text-muted-foreground text-sm">
                @{profile!.username}
              </p>
              {profile!.bio && <p className="pt-2 text-sm">{profile!.bio}</p>}
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 pt-2 text-xs">
                {profile!.preferred_position && (
                  <span className="bg-secondary text-secondary-foreground rounded px-2 py-0.5 font-mono uppercase">
                    {profile!.preferred_position}
                  </span>
                )}
                <span>{t(`skillLevels.${profile!.skill_level}`)}</span>
                <span>· {profile!.skill_rating}</span>
                {profile!.home_city && <span>· {profile!.home_city}</span>}
              </div>
            </div>
          </div>

          <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={t("matchesPlayed")} value={profile!.matches_played} />
            <Stat label={t("matchesWon")} value={profile!.matches_won} />
            <Stat label={t("goalsScored")} value={profile!.goals_scored} />
            <Stat label={t("mvpCount")} value={profile!.mvp_count} />
          </section>

          {winRate !== null && (
            <div className="border-border rounded-md border px-4 py-2 text-sm">
              <span className="text-muted-foreground">
                {tStats("winRate")}:{" "}
              </span>
              <span className="font-semibold">{winRate}%</span>
              <span className="text-muted-foreground ml-3 text-xs">
                ({profile!.matches_won}/{profile!.matches_played})
              </span>
            </div>
          )}

          <RatingChart
            history={history}
            initialRating={profile!.skill_rating}
          />

          <RecentMatches matches={recent} />

          <section className="border-border grid gap-4 rounded-lg border p-6 sm:grid-cols-2">
            <Field
              label={t("preferredPosition")}
              value={positionLabel(profile!.preferred_position)}
            />
            <Field
              label={t("secondaryPosition")}
              value={positionLabel(profile!.secondary_position)}
            />
          </section>
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
