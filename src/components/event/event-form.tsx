"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FORMAT_TEAM_SIZE,
  FORMATS,
  SKILL_LEVELS,
} from "@/lib/validation/event";
import { createEventAction } from "@/lib/event/actions";

type VenueOption = {
  id: string;
  name: string;
  city: string;
  address_line: string;
};

export function EventForm({
  venues,
  locale,
}: {
  venues: VenueOption[];
  locale: string;
}) {
  const t = useTranslations("Events");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const defaultStart = React.useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 24, 0, 0, 0);
    return formatLocalDateTime(d);
  }, []);
  const defaultEnd = React.useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 26, 0, 0, 0);
    return formatLocalDateTime(d);
  }, []);

  const [venueId, setVenueId] = React.useState(venues[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [format, setFormat] = React.useState<(typeof FORMATS)[number]>("7v7");
  const [capacity, setCapacity] = React.useState<number>(14);
  const [minPlayers, setMinPlayers] = React.useState<number>(12);
  const [minSkill, setMinSkill] =
    React.useState<(typeof SKILL_LEVELS)[number]>("beginner");
  const [maxSkill, setMaxSkill] =
    React.useState<(typeof SKILL_LEVELS)[number]>("pro");
  const [startAt, setStartAt] = React.useState(defaultStart);
  const [endAt, setEndAt] = React.useState(defaultEnd);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Format değiştiğinde capacity / minPlayers'ı sadece "user-touched değilse" auto-set.
  const userTouchedCapacity = React.useRef(false);
  const userTouchedMinPlayers = React.useRef(false);

  React.useEffect(() => {
    const teamSize = FORMAT_TEAM_SIZE[format];
    const cap = teamSize * 2;
    if (!userTouchedCapacity.current) setCapacity(cap);
    if (!userTouchedMinPlayers.current) setMinPlayers(Math.max(2, cap - 2));
  }, [format]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let startIso: string;
    let endIso: string;
    try {
      startIso = new Date(startAt).toISOString();
      endIso = new Date(endAt).toISOString();
    } catch {
      setError(t("invalidDate"));
      return;
    }

    startTransition(async () => {
      const result = await createEventAction({
        venueId,
        title,
        description,
        format,
        capacity,
        minPlayersToConfirm: minPlayers,
        minSkillLevel: minSkill,
        maxSkillLevel: maxSkill,
        startAt: startIso,
        endAt: endIso,
        notes,
      });

      if (!result.ok) {
        setError(result.error);
        toast.error(t("createError"), { description: result.error });
        return;
      }

      toast.success(t("createSuccess"));
      router.push(`/${locale}/events/${result.data.id}`);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Field label={t("title")}>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("titlePlaceholder")}
          maxLength={80}
          required
          minLength={3}
        />
      </Field>

      <Field label={t("venue")}>
        <Select value={venueId} onChange={(v) => setVenueId(v)} required>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.city}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("startAt")}>
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
        </Field>
        <Field label={t("endAt")}>
          <Input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            required
          />
        </Field>
      </div>

      <Field label={t("format")}>
        <Select
          value={format}
          onChange={(v) => setFormat(v as (typeof FORMATS)[number])}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("capacity")}>
          <Input
            type="number"
            min={4}
            max={30}
            value={capacity}
            onChange={(e) => {
              userTouchedCapacity.current = true;
              setCapacity(Number(e.target.value));
            }}
            required
          />
          <p className="text-muted-foreground text-xs">
            {t("capacityHint", {
              format,
              size: FORMAT_TEAM_SIZE[format],
              suggested: FORMAT_TEAM_SIZE[format] * 2,
            })}
          </p>
        </Field>
        <Field label={t("minPlayers")}>
          <Input
            type="number"
            min={2}
            max={30}
            value={minPlayers}
            onChange={(e) => {
              userTouchedMinPlayers.current = true;
              setMinPlayers(Number(e.target.value));
            }}
            required
          />
          <p className="text-muted-foreground text-xs">{t("minPlayersHint")}</p>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("minSkill")}>
          <Select
            value={minSkill}
            onChange={(v) => setMinSkill(v as (typeof SKILL_LEVELS)[number])}
          >
            {SKILL_LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`skillLevels.${l}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("maxSkill")}>
          <Select
            value={maxSkill}
            onChange={(v) => setMaxSkill(v as (typeof SKILL_LEVELS)[number])}
          >
            {SKILL_LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`skillLevels.${l}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t("description")}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder={t("descriptionPlaceholder")}
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </Field>

      <Field label={t("notes")}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={t("notesPlaceholder")}
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </Field>

      {error && (
        <p
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("creating") : t("create")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  required,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </select>
  );
}

function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
