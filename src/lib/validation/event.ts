import { z } from "zod";

export const FORMATS = ["5v5", "6v6", "7v7", "8v8", "11v11"] as const;
export const SKILL_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
  "pro",
] as const;

export const FORMAT_TEAM_SIZE: Record<(typeof FORMATS)[number], number> = {
  "5v5": 5,
  "6v6": 6,
  "7v7": 7,
  "8v8": 8,
  "11v11": 11,
};

const SKILL_RANK: Record<(typeof SKILL_LEVELS)[number], number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  pro: 3,
};

const MAX_FUTURE_DAYS = 30;
const MIN_FUTURE_MINUTES = 30;

const isoDateTime = z
  .string()
  .min(1, "Tarih zorunlu")
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "Geçersiz tarih/saat",
  });

// http(s):// only — disallow javascript:, data:, etc. so we can safely
// render the link in event detail without escaping.
const HTTP_URL_REGEX = /^https?:\/\/[^\s]{1,499}$/i;

export const createEventSchema = z
  .object({
    // Either a curated venueId is picked OR a custom name is provided.
    // Validated together in superRefine below.
    venueId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    customVenueName: z
      .string()
      .trim()
      .max(200)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
    customVenueUrl: z
      .string()
      .trim()
      .max(500)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || HTTP_URL_REGEX.test(v), {
        message: "URL http:// veya https:// ile başlamalı",
      }),
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    format: z.enum(FORMATS),
    capacity: z.coerce.number().int().min(4).max(30),
    minPlayersToConfirm: z.coerce.number().int().min(2).max(30),
    minSkillLevel: z.enum(SKILL_LEVELS).default("beginner"),
    maxSkillLevel: z.enum(SKILL_LEVELS).default("pro"),
    startAt: isoDateTime,
    endAt: isoDateTime,
    notes: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    const hasVenueId = data.venueId !== undefined;
    const hasCustomName = data.customVenueName !== undefined;
    if (hasVenueId === hasCustomName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customVenueName"],
        message: hasVenueId
          ? "Listeden saha seçtiyseniz manuel ad girmeyin"
          : "Saha seçin veya manuel olarak ad girin",
      });
    }
    if (!hasCustomName && data.customVenueUrl !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customVenueUrl"],
        message: "Maps linki sadece manuel ad ile birlikte verilebilir",
      });
    }
    const start = new Date(data.startAt);
    const end = new Date(data.endAt);
    const now = new Date();

    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Bitiş, başlangıçtan sonra olmalı",
      });
    }

    if (start.getTime() < now.getTime() + MIN_FUTURE_MINUTES * 60 * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startAt"],
        message: `Başlangıç en az ${MIN_FUTURE_MINUTES} dk sonrası olmalı`,
      });
    }

    const maxFuture = new Date();
    maxFuture.setDate(maxFuture.getDate() + MAX_FUTURE_DAYS);
    if (start > maxFuture) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startAt"],
        message: `En fazla ${MAX_FUTURE_DAYS} gün ileriye etkinlik açılabilir`,
      });
    }

    if (data.minPlayersToConfirm > data.capacity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minPlayersToConfirm"],
        message: "Min oyuncu kapasiteden büyük olamaz",
      });
    }

    if (SKILL_RANK[data.minSkillLevel] > SKILL_RANK[data.maxSkillLevel]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxSkillLevel"],
        message: "Maksimum seviye, minimumdan düşük olamaz",
      });
    }

    const teamSize = FORMAT_TEAM_SIZE[data.format];
    if (data.capacity < teamSize * 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["capacity"],
        message: `${data.format} için kapasite en az ${teamSize * 2} olmalı`,
      });
    }
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const cancelEventSchema = z.object({
  reason: z.string().trim().min(3, "Neden gerekli").max(200),
});
export type CancelEventInput = z.infer<typeof cancelEventSchema>;

export const eventFiltersSchema = z.object({
  city: z.string().optional(),
  bbox: z
    .object({
      west: z.number(),
      south: z.number(),
      east: z.number(),
      north: z.number(),
    })
    .optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  format: z.enum(FORMATS).optional(),
  minSkill: z.enum(SKILL_LEVELS).optional(),
  maxSkill: z.enum(SKILL_LEVELS).optional(),
  status: z.array(z.enum(["open", "full", "locked", "in_progress"])).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export type EventFilters = z.infer<typeof eventFiltersSchema>;
