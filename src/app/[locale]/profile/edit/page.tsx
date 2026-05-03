import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { PageBackground } from "@/components/page-background";
import { ProfileEditForm } from "@/components/profile/profile-edit-form";

type EditableProfile = {
  username: string;
  display_name: string;
  bio: string | null;
  preferred_position: "GK" | "DEF" | "MID" | "FWD" | null;
  secondary_position: "GK" | "DEF" | "MID" | "FWD" | null;
  skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  home_city: string | null;
  locale: "tr" | "en" | "pl";
};

export default async function ProfileEditPage({
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

  const { data: profile } = await supabase
    .from("profile")
    .select(
      "username, display_name, bio, preferred_position, secondary_position, skill_level, home_city, locale",
    )
    .eq("id", user!.id)
    .maybeSingle<EditableProfile>();

  if (!profile) redirect({ href: "/", locale });

  const t = await getTranslations("Profile");

  return (
    <>
      <PageBackground variant="profile" intensity="heavy" />
      <div className="flex min-h-screen flex-col">
        <AppHeader
          back={{ href: "/profile", label: `@${profile!.username}` }}
          title={t("edit")}
          maxWidth="3xl"
        />
        <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
          <ProfileEditForm initial={profile!} />
        </main>
      </div>
    </>
  );
}
