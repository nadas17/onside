import { z } from "zod";

export const nicknameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, {
    message: "3-20 karakter, sadece küçük harf, rakam ve alt çizgi (_) kullan.",
  });

export type Nickname = z.infer<typeof nicknameSchema>;

export const profileUpdateSchema = z.object({
  bio: z.string().max(280).nullable().optional(),
  homeCity: z.string().max(80).nullable().optional(),
  preferredPosition: z.enum(["GK", "DEF", "MID", "FWD"]).nullable().optional(),
  secondaryPosition: z.enum(["GK", "DEF", "MID", "FWD"]).nullable().optional(),
  skillLevel: z
    .enum(["beginner", "intermediate", "advanced", "pro"])
    .optional(),
  locale: z.enum(["tr", "en", "pl"]).optional(),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
