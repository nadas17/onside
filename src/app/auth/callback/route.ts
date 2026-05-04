import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * OAuth callback for Supabase providers (currently Google).
 *
 * Flow:
 *   1. Supabase redirects browser to /auth/callback?code=...
 *   2. We exchange the code for a session (sets HTTP-only auth cookies).
 *   3. Redirect home — root layout decides whether to show JoinModal
 *      (no profile yet) or the app (profile exists).
 *
 * Profile creation happens in createProfileAction — kept separate so the
 * user always picks their own nickname, regardless of OAuth provider.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/?auth_error=oauth`);
}
