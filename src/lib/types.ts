/**
 * Server Action contract (spec §3.10): tüm server action'lar bu tipte response döner.
 * UI tarafında type-narrow ile error/success branş'ı ayrılır.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export type ActionErrorCode =
  | "invalid_input"
  | "invalid_nickname"
  | "username_taken"
  | "rate_limited"
  | "auth_failed"
  | "not_found"
  | "forbidden"
  | "db_error"
  | "unknown";
