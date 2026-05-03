"use client";

import { useTranslations } from "next-intl";

/**
 * Server-side error code translation.
 *
 * Server actions return `{ ok: false, code: "...", error: "..." }`. The
 * `error` string is hardcoded Turkish (server-side, not request-locale aware).
 * This hook resolves the `code` into a localized message via the `Errors`
 * i18n namespace, falling back to `result.error` for codes we haven't
 * catalogued (e.g. raw Postgres `db_error` messages).
 *
 * Usage:
 *   const errorMsg = useErrorMessage();
 *   if (!result.ok) toast.error(t("title"), { description: errorMsg(result) });
 */

const KNOWN_ERROR_CODES = new Set([
  "rate_limited",
  "invalid_nickname",
  "username_taken",
  "auth_failed",
  "db_error",
  "invalid_input",
  "not_found",
  "forbidden",
  "balance_error",
  "not_enough_players",
]);

export type ErrorCode =
  | "rate_limited"
  | "invalid_nickname"
  | "username_taken"
  | "auth_failed"
  | "db_error"
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "balance_error"
  | "not_enough_players";

interface ErrorResult {
  ok: false;
  code?: string;
  error: string;
}

export function useErrorMessage() {
  const t = useTranslations("Errors");
  return (result: ErrorResult): string => {
    if (result.code && KNOWN_ERROR_CODES.has(result.code)) {
      return t(result.code as ErrorCode);
    }
    return result.error;
  };
}
