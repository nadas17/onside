import { z } from "zod";

/**
 * Nickname format must match the Postgres CHECK constraint in
 * `0019_drop_auth_profile.sql` byte-for-byte. Any drift here lands as a
 * confusing "passes client validation but DB rejects" failure.
 *
 *   ^[A-Za-z0-9_ -]{3,24}$
 *
 * Allowed: ASCII letters, digits, underscore, space, hyphen. 3–24 chars.
 */
export const NICKNAME_REGEX = /^[A-Za-z0-9_ -]{3,24}$/;

export const nicknameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(NICKNAME_REGEX);

export type Nickname = z.infer<typeof nicknameSchema>;

export function isValidNickname(value: string): boolean {
  return nicknameSchema.safeParse(value).success;
}
