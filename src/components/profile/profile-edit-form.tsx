"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "@/lib/auth/actions";

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

const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;
const LOCALES = ["tr", "en", "pl"] as const;

export function ProfileEditForm({ initial }: { initial: EditableProfile }) {
  const t = useTranslations("Profile");
  const errorMsg = useErrorMessage();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [bio, setBio] = React.useState(initial.bio ?? "");
  const [homeCity, setHomeCity] = React.useState(initial.home_city ?? "");
  const [preferredPosition, setPreferredPosition] = React.useState<
    "" | "GK" | "DEF" | "MID" | "FWD"
  >(initial.preferred_position ?? "");
  const [secondaryPosition, setSecondaryPosition] = React.useState<
    "" | "GK" | "DEF" | "MID" | "FWD"
  >(initial.secondary_position ?? "");
  const [skillLevel, setSkillLevel] = React.useState(initial.skill_level);
  const [locale, setLocale] = React.useState(initial.locale);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateProfileAction({
        bio: bio.trim() || null,
        homeCity: homeCity.trim() || null,
        preferredPosition: preferredPosition || null,
        secondaryPosition: secondaryPosition || null,
        skillLevel,
        locale,
      });
      if (!result.ok) {
        toast.error(t("saveError"), { description: errorMsg(result) });
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 pb-24 sm:gap-6 sm:pb-0"
    >
      <Section title={t("displayName")}>
        <Input value={initial.display_name} disabled readOnly />
        <p className="text-muted-foreground text-xs">
          @{initial.username}{" "}
          <span className="text-muted-foreground/70">
            · {t("usernamePermanent")}
          </span>
        </p>
      </Section>

      <Section title={t("bio")}>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder={t("bioPlaceholder")}
          className="glass-strong border-input ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-muted-foreground text-xs">{bio.length} / 280</p>
      </Section>

      <Section title={t("homeCity")}>
        <Input
          value={homeCity}
          onChange={(e) => setHomeCity(e.target.value)}
          placeholder={t("homeCityPlaceholder")}
          maxLength={80}
        />
      </Section>

      <div className="grid gap-6 sm:grid-cols-2">
        <Section title={t("preferredPosition")}>
          <Select
            value={preferredPosition}
            onChange={(v) =>
              setPreferredPosition(v as "" | "GK" | "DEF" | "MID" | "FWD")
            }
          >
            <option value="">{t("noPosition")}</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(`positions.${p}`)}
              </option>
            ))}
          </Select>
        </Section>

        <Section title={t("secondaryPosition")}>
          <Select
            value={secondaryPosition}
            onChange={(v) =>
              setSecondaryPosition(v as "" | "GK" | "DEF" | "MID" | "FWD")
            }
          >
            <option value="">{t("noPosition")}</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(`positions.${p}`)}
              </option>
            ))}
          </Select>
        </Section>

        <Section title={t("skillLevel")}>
          <Select
            value={skillLevel}
            onChange={(v) =>
              setSkillLevel(
                v as "beginner" | "intermediate" | "advanced" | "pro",
              )
            }
          >
            {SKILL_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {t(`skillLevels.${lvl}`)}
              </option>
            ))}
          </Select>
        </Section>

        <Section title={t("languageSetting")}>
          <Select
            value={locale}
            onChange={(v) => setLocale(v as "tr" | "en" | "pl")}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </Select>
        </Section>
      </div>

      {/* Desktop: inline save button */}
      <div className="hidden justify-end sm:flex">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>

      {/* Mobile: sticky save bar above the bottom nav */}
      <div
        className="glass-bar fixed right-0 left-0 z-20 flex gap-2 border-t px-4 py-3 sm:hidden"
        style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
      >
        <Button
          type="submit"
          disabled={pending}
          className="h-11 flex-1 text-base"
        >
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{title}</Label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="glass-strong border-input ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </select>
  );
}
