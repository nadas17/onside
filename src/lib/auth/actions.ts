"use server";

/**
 * Auth & profile server actions — Phase 1 (ADR-0002).
 *
 * Anonymous Auth + nickname-only sign-up.
 *   - signInAnonymously: tarayıcı session'ı ilk ziyarette kurulur.
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
  const rl = rateLimit(`signup:${ip}`, 5, 60_000);
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

  // 3. Server-side uniqueness check (race condition'a karşı insert sonrası tekrar kontrol var)
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

  // 4. Anonymous sign-in (mevcut session yoksa)
  let userId: string | undefined;
  {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else {
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
  }

  // 5. Profile insert (RLS apply: auth.uid() = id check)
  const { error: insertError } = await supabase.from("profile").insert({
    id: userId,
    username,
    display_name: username,
  });
  if (insertError) {
    if (insertError.code === "23505") {
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
