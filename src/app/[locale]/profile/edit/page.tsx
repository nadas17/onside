import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
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
    <div className="flex min-h-screen flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href={`/${locale}/profile`} className="text-sm font-medium">
            ← @{profile!.username}
          </Link>
          <h1 className="text-base font-semibold">{t("edit")}</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-6 py-8">
        <ProfileEditForm initial={profile!} />
      </main>
    </div>
  );
}
