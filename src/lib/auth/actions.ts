"use server";

/**
 * Auth & profile server actions — Phase 1 (ADR-0002 + Google upgrade).
 *
 * Anonymous Auth + nickname-only sign-up, plus Google OAuth for cross-device.
 *   - signInAnonymously: tarayıcı session'ı ilk ziyarette kurulur.
 *   - signInWithGoogle: yeni kullanıcı Google ile (cross-device).
 *   - linkGoogleAccount: mevcut anon kullanıcı Google'a bağlar (UUID korunur).
 *   - createProfile: nickname'i public.profile satırına yazar, RLS uygulanır.
 *   - updateProfile: kendi profilini partial update.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  nicknameSchema,
  profileUpdateSchema,
  type ProfileUpdate,
} from "@/lib/validation/profile";
import type { ActionResult } from "@/lib/types";

function resolveOrigin(headerList: Headers): string {
  return (
    headerList.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000"
  );
}

/**
 * Returns the Google consent URL — the client must navigate to it via
 * `window.location.href` (Next.js redirect() can't reliably hand off to
 * an external origin from a server action).
 */
export async function signInWithGoogleAction(): Promise<
  ActionResult<{ url: string }>
> {
  const headerList = await headers();
  const origin = resolveOrigin(headerList);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    return {
      ok: false,
      error: error?.message ?? "Google OAuth URL alınamadı.",
      code: "auth_failed",
    };
  }
  return { ok: true, data: { url: data.url } };
}

/**
 * Same flow as signInWithGoogleAction but for an existing anon user.
 * Supabase's linkIdentity preserves the UUID, so all match history /
 * Elo / profile data carries over once the user comes back through
 * /auth/callback.
 */
export async function linkGoogleAccountAction(): Promise<
  ActionResult<{ url: string }>
> {
  const headerList = await headers();
  const origin = resolveOrigin(headerList);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data?.url) {
    return {
      ok: false,
      error: error?.message ?? "Google link URL alınamadı.",
      code: "auth_failed",
    };
  }
  return { ok: true, data: { url: data.url } };
}

type CreateProfileSuccess = {
  id: string;
  username: string;
};
type CreateProfileFailure = ActionResult<never> & {
  ok: false;
  suggestions?: string[];
};

export async function createProfileAction(
  nicknameInput: string,
): Promise<ActionResult<CreateProfileSuccess> | CreateProfileFailure> {
  // 1. Rate limit (per-IP, 5/dakika)
  const headerList = await headers();
  const ip = getClientIp(headerList);
  const rl = await rateLimit(`signup:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Çok fazla istek geldi. Lütfen bir dakika sonra tekrar dene.",
      code: "rate_limited",
    };
  }

  // 2. Validate (zod parse trim + lowercase + regex)
  const parsed = nicknameSchema.safeParse(nicknameInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Geçersiz nickname.",
      code: "invalid_nickname",
    };
  }
  const username = parsed.data;

  const supabase = await createClient();

  // 3. Idempotent: if the current session already owns a profile, just return
  // it. The JoinModal can re-open in edge cases (stale UI, refresh races) and
  // a second create attempt would otherwise hit a primary-key violation on
  // profile.id — which shares Postgres error code 23505 with the unique
  // username constraint, getting mis-reported as "username taken" downstream.
  let userId: string | undefined;
  {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const { data: existingProfile } = await supabase
        .from("profile")
        .select("id, username")
        .eq("id", user.id)
        .maybeSingle();
      if (existingProfile) {
        return {
          ok: true,
          data: { id: existingProfile.id, username: existingProfile.username },
        };
      }
    }
  }

  // 4. Server-side username uniqueness check (race condition'a karşı insert
  //    sonrası tekrar kontrol var).
  {
    const { data: existing } = await supabase
      .from("profile")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) {
      const suggestions = await suggestUsernames(supabase, username);
      return {
        ok: false,
        error: "Bu nickname zaten alınmış.",
        code: "username_taken",
        suggestions,
      };
    }
  }

  // 5. Anonymous sign-in (only if step 3 didn't already give us a userId)
  if (!userId) {
    const { data: authData, error: authError } =
      await supabase.auth.signInAnonymously();
    if (authError || !authData.user) {
      return {
        ok: false,
        error: authError?.message ?? "Anonim oturum açılamadı.",
        code: "auth_failed",
      };
    }
    userId = authData.user.id;
  }

  // 6. Profile insert (RLS apply: auth.uid() = id check)
  const { error: insertError } = await supabase.from("profile").insert({
    id: userId,
    username,
    display_name: username,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      // 23505 covers both PK (id already has a profile) and UNIQUE (username
      // already taken) violations. Step 3 caught the PK case for the current
      // session, so anything reaching here on a fresh insert is a genuine
      // username collision (likely a race against a concurrent signup).
      const suggestions = await suggestUsernames(supabase, username);
      return {
        ok: false,
        error: "Bu nickname zaten alınmış.",
        code: "username_taken",
        suggestions,
      };
    }
    return {
      ok: false,
      error: insertError.message,
      code: "db_error",
    };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: { id: userId, username } };
}

export async function checkUsernameAvailabilityAction(
  nicknameInput: string,
): Promise<ActionResult<{ available: boolean; suggestions?: string[] }>> {
  const parsed = nicknameSchema.safeParse(nicknameInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Geçersiz nickname.",
      code: "invalid_nickname",
    };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile")
    .select("id")
    .eq("username", parsed.data)
    .maybeSingle();

  if (data) {
    const suggestions = await suggestUsernames(supabase, parsed.data);
    return { ok: true, data: { available: false, suggestions } };
  }
  return { ok: true, data: { available: true } };
}

export async function updateProfileAction(
  input: ProfileUpdate,
): Promise<ActionResult<ProfileUpdate>> {
  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Geçersiz girdi.",
      code: "invalid_input",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Oturum bulunamadı.",
      code: "auth_failed",
    };
  }

  // Map camelCase → snake_case (Supabase column adlarına)
  const update: Record<string, unknown> = {};
  if (parsed.data.bio !== undefined) update.bio = parsed.data.bio;
  if (parsed.data.homeCity !== undefined)
    update.home_city = parsed.data.homeCity;
  if (parsed.data.preferredPosition !== undefined)
    update.preferred_position = parsed.data.preferredPosition;
  if (parsed.data.secondaryPosition !== undefined)
    update.secondary_position = parsed.data.secondaryPosition;
  if (parsed.data.skillLevel !== undefined)
    update.skill_level = parsed.data.skillLevel;
  if (parsed.data.locale !== undefined) update.locale = parsed.data.locale;

  const { error } = await supabase
    .from("profile")
    .update(update)
    .eq("id", user.id);
  if (error) {
    return { ok: false, error: error.message, code: "db_error" };
  }

  revalidatePath("/", "layout");
  return { ok: true, data: parsed.data };
}

// --- Helpers ----------------------------------------------------------------

async function suggestUsernames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  base: string,
  count: number = 3,
): Promise<string[]> {
  const candidates: string[] = [];
  for (let i = 2; i <= 12; i++) {
    candidates.push(`${base}_${i}`);
  }
  const { data } = await supabase
    .from("profile")
    .select("username")
    .in("username", candidates);

  const taken = new Set((data ?? []).map((row) => row.username as string));
  const free = candidates.filter((c) => !taken.has(c));
  return free.slice(0, count);
}
