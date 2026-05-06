"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { toast } from "sonner";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FORMAT_TEAM_SIZE,
  FORMATS,
  SKILL_LEVELS,
} from "@/lib/validation/event";
import { isValidNickname } from "@/lib/validation/nickname";
import { createEventAction } from "@/lib/event/actions";
import { useNickname } from "@/components/nickname-provider";

/** All matches happen in Europe/Warsaw — store + display times in that TZ. */
const VENUE_TZ = "Europe/Warsaw";

type VenueOption = {
  id: string;
  name: string;
  city: string;
  address_line: string;
};

type Step = 1 | 2 | 3;
const TOTAL_STEPS = 3;

/**
 * EventForm renders even when the curated `venues` list is empty —
 * organisers can always fall back to the manual venue mode, where they
 * type the location name (and optionally a Maps URL) by hand.
 *
 * UI is a 3-step wizard so it works on mobile screens without a
 * scroll-and-pray experience:
 *   1. Temel — title, format, capacity, min players
 *   2. Zaman + Yer — start/end + curated venue or manual one-off
 *   3. Detay + Özet — skill range, description, notes, then a summary
 *      card and the final create button
 */
export function EventForm({
  venues,
  locale,
}: {
  venues: VenueOption[];
  locale: string;
}) {
  return <EventFormInner venues={venues} locale={locale} />;
}

function EventFormInner({
  venues,
  locale,
}: {
  venues: VenueOption[];
  locale: string;
}) {
  const t = useTranslations("Events");
  const tNick = useTranslations("Nickname");
  const errorMsg = useErrorMessage();
  const router = useRouter();
  const { nickname: storedNickname, setNickname } = useNickname();
  const [pending, startTransition] = React.useTransition();
  const [organizerNickname, setOrganizerNickname] = React.useState(
    storedNickname ?? "",
  );

  React.useEffect(() => {
    if (storedNickname && !organizerNickname) {
      setOrganizerNickname(storedNickname);
    }
  }, [storedNickname, organizerNickname]);

  // Defaults expressed in Warsaw time (regardless of user's browser timezone),
  // since matches always happen there. `toZonedTime` projects the current
  // instant into Warsaw's local clock; we then offset by 24/26 hours.
  const defaultStart = React.useMemo(() => {
    const warsawNow = toZonedTime(new Date(), VENUE_TZ);
    warsawNow.setHours(warsawNow.getHours() + 24, 0, 0, 0);
    return formatLocalDateTime(warsawNow);
  }, []);
  const defaultEnd = React.useMemo(() => {
    const warsawNow = toZonedTime(new Date(), VENUE_TZ);
    warsawNow.setHours(warsawNow.getHours() + 26, 0, 0, 0);
    return formatLocalDateTime(warsawNow);
  }, []);

  // Venue selection — either pick from the curated list or enter a one-off
  // location with a free-text name and optional Google Maps URL.
  const [venueMode, setVenueMode] = React.useState<"list" | "manual">(
    venues.length > 0 ? "list" : "manual",
  );
  const [venueId, setVenueId] = React.useState(venues[0]?.id ?? "");
  const [customVenueName, setCustomVenueName] = React.useState("");
  const [customVenueUrl, setCustomVenueUrl] = React.useState("");
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
  const [step, setStep] = React.useState<Step>(1);

  // Format değiştiğinde capacity / minPlayers'ı sadece "user-touched değilse" auto-set.
  const userTouchedCapacity = React.useRef(false);
  const userTouchedMinPlayers = React.useRef(false);

  React.useEffect(() => {
    const teamSize = FORMAT_TEAM_SIZE[format];
    const cap = teamSize * 2;
    if (!userTouchedCapacity.current) setCapacity(cap);
    if (!userTouchedMinPlayers.current) setMinPlayers(Math.max(2, cap - 2));
  }, [format]);

  // Per-step validators. Returning a string short-circuits navigation and
  // surfaces the message in the form-level error region. Returning null
  // means "ok, move on".
  const validateStep = (current: Step): string | null => {
    if (current === 1) {
      if (!isValidNickname(organizerNickname)) return tNick("rules");
      if (title.trim().length < 3) return t("errTitleShort");
      if (capacity < 4 || capacity > 30) return t("errCapacityRange");
      if (minPlayers < 2 || minPlayers > capacity)
        return t("errMinPlayersRange");
      return null;
    }
    if (current === 2) {
      // Date inputs are HTML datetime-local; basic non-empty check + future +
      // ordering. The server-side Zod schema does the strict check on submit.
      if (!startAt || !endAt) return t("invalidDate");
      const startMs = new Date(startAt).getTime();
      const endMs = new Date(endAt).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) return t("invalidDate");
      if (endMs <= startMs) return t("errEndBeforeStart");
      if (venueMode === "list" && !venueId) return t("errVenueRequired");
      if (venueMode === "manual" && customVenueName.trim().length === 0)
        return t("errVenueRequired");
      return null;
    }
    return null;
  };

  const goNext = () => {
    setError(null);
    const msg = validateStep(step);
    if (msg) {
      setError(msg);
      return;
    }
    if (step < TOTAL_STEPS) setStep((step + 1) as Step);
  };

  const goPrev = () => {
    setError(null);
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Inputs are typed as "YYYY-MM-DDTHH:mm" without a timezone. Interpret
    // them as Europe/Warsaw local time (where matches happen), regardless of
    // the user's browser timezone — so an Istanbul user typing "19:00" stores
    // the same instant as a Warsaw user typing "19:00".
    let startIso: string;
    let endIso: string;
    try {
      startIso = fromZonedTime(startAt, VENUE_TZ).toISOString();
      endIso = fromZonedTime(endAt, VENUE_TZ).toISOString();
      if (Number.isNaN(new Date(startIso).getTime())) throw new Error("nan");
    } catch {
      setError(t("invalidDate"));
      return;
    }

    startTransition(async () => {
      const trimmedNickname = organizerNickname.trim();
      setNickname(trimmedNickname);
      const result = await createEventAction({
        organizerNickname: trimmedNickname,
        venueId: venueMode === "list" ? venueId : "",
        customVenueName: venueMode === "manual" ? customVenueName : "",
        customVenueUrl: venueMode === "manual" ? customVenueUrl : "",
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
        toast.error(t("createError"), { description: errorMsg(result) });
        return;
      }

      toast.success(t("createSuccess"));
      router.push(`/${locale}/events/${result.data.id}`);
    });
  };

  const stepLabel = (s: Step) =>
    s === 1 ? t("step1Title") : s === 2 ? t("step2Title") : t("step3Title");

  const venueDisplay =
    venueMode === "list"
      ? (venues.find((v) => v.id === venueId)?.name ?? "—")
      : customVenueName || "—";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <StepIndicator
        current={step}
        total={TOTAL_STEPS}
        label={stepLabel(step)}
      />

      {step === 1 && (
        <fieldset className="flex flex-col gap-6">
          <Field label={tNick("label")}>
            <Input
              value={organizerNickname}
              onChange={(e) => setOrganizerNickname(e.target.value)}
              placeholder={tNick("placeholder")}
              maxLength={24}
              required
              minLength={3}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <p className="text-muted-foreground text-xs">{tNick("rules")}</p>
          </Field>

          <Field label={t("title")}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              maxLength={80}
              required
              minLength={3}
              autoFocus
            />
          </Field>

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
              <p className="text-muted-foreground text-xs">
                {t("minPlayersHint")}
              </p>
            </Field>
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset className="flex flex-col gap-6">
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
          <p className="text-muted-foreground -mt-2 text-xs">
            {t("timezoneHint")}
          </p>

          <Field label={t("venue")}>
            <div
              role="tablist"
              aria-label={t("venue")}
              className="border-input bg-background mb-2 inline-flex rounded-md border p-0.5 text-xs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={venueMode === "list"}
                onClick={() => setVenueMode("list")}
                disabled={venues.length === 0}
                className={
                  "rounded px-3 py-1 transition-colors " +
                  (venueMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {t("venueModeList")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={venueMode === "manual"}
                onClick={() => setVenueMode("manual")}
                className={
                  "rounded px-3 py-1 transition-colors " +
                  (venueMode === "manual"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {t("venueModeManual")}
              </button>
            </div>

            {venueMode === "list" ? (
              <Select value={venueId} onChange={(v) => setVenueId(v)} required>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {v.city}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="grid gap-2">
                <Input
                  type="text"
                  value={customVenueName}
                  onChange={(e) => setCustomVenueName(e.target.value)}
                  placeholder={t("customVenueNamePlaceholder")}
                  maxLength={200}
                  required
                />
                <Input
                  type="url"
                  value={customVenueUrl}
                  onChange={(e) => setCustomVenueUrl(e.target.value)}
                  placeholder={t("customVenueUrlPlaceholder")}
                  maxLength={500}
                  inputMode="url"
                />
                <p className="text-muted-foreground text-xs">
                  {t("customVenueHint")}
                </p>
              </div>
            )}
          </Field>
        </fieldset>
      )}

      {step === 3 && (
        <fieldset className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("minSkill")}>
              <Select
                value={minSkill}
                onChange={(v) =>
                  setMinSkill(v as (typeof SKILL_LEVELS)[number])
                }
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
                onChange={(v) =>
                  setMaxSkill(v as (typeof SKILL_LEVELS)[number])
                }
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

          <SummaryCard
            title={title || "—"}
            format={format}
            capacity={capacity}
            minPlayers={minPlayers}
            startAt={startAt}
            endAt={endAt}
            venue={venueDisplay}
            customVenueUrl={
              venueMode === "manual" ? customVenueUrl || null : null
            }
            minSkill={t(`skillLevels.${minSkill}`)}
            maxSkill={t(`skillLevels.${maxSkill}`)}
            t={t}
          />
        </fieldset>
      )}

      {error && (
        <p
          className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Sticky-ish bottom CTA bar — works on mobile (the form sits inside a
          regular page, so a true `sticky` would obscure the last input on
          small screens). Keeping it inline keeps the layout predictable. */}
      <div className="flex items-center justify-between gap-2">
        {step === 1 ? (
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            {t("cancel")}
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={goPrev}>
            <ChevronLeft className="mr-1 size-4" />
            {t("back")}
          </Button>
        )}

        {step < TOTAL_STEPS ? (
          <Button type="button" onClick={goNext}>
            {t("next")}
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? t("creating") : t("create")}
          </Button>
        )}
      </div>
    </form>
  );
}

function StepIndicator({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {`${current} / ${total}`}
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
        <div
          className="bg-brand h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${(current / total) * 100}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  format,
  capacity,
  minPlayers,
  startAt,
  endAt,
  venue,
  customVenueUrl,
  minSkill,
  maxSkill,
  t,
}: {
  title: string;
  format: string;
  capacity: number;
  minPlayers: number;
  startAt: string;
  endAt: string;
  venue: string;
  customVenueUrl: string | null;
  minSkill: string;
  maxSkill: string;
  t: ReturnType<typeof useTranslations<"Events">>;
}) {
  return (
    <div className="border-brand/30 bg-brand/5 flex flex-col gap-2 rounded-lg border p-4 text-sm">
      <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {t("summaryTitle")}
      </div>
      <SummaryRow label={t("title")} value={title} />
      <SummaryRow label={t("format")} value={`${format} · ${capacity}`} />
      <SummaryRow label={t("minPlayers")} value={String(minPlayers)} />
      <SummaryRow
        label={t("startAt")}
        value={`${formatHuman(startAt)} → ${formatHuman(endAt)}`}
      />
      <SummaryRow
        label={t("venue")}
        value={
          customVenueUrl ? (
            <a
              href={customVenueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              {venue}
            </a>
          ) : (
            venue
          )
        }
      />
      <SummaryRow label={t("minSkill")} value={`${minSkill} – ${maxSkill}`} />
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

function formatHuman(dt: string): string {
  // dt is "YYYY-MM-DDTHH:mm" — present without seconds, with locale-agnostic
  // ISO-ish form. The detail page reformats per-locale; here we just need a
  // human-readable preview.
  if (!dt) return "—";
  return dt.replace("T", " ");
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
