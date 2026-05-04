import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Supabase session refresh — Phase 1+ protected route gating burada eklenecek.
  await updateSession(request);

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Skip API routes, /auth (locale-agnostic OAuth callback), Next internals,
    // and *any* file with an extension (the trailing `\\..*` clause). Without
    // this, `/bg/foo.jpg` gets a locale prefix and Next/Image fails to fetch
    // the source (400). Without `auth`, Supabase's redirect to /auth/callback
    // gets rewritten to /pl/auth/callback (no such route → 404).
    "/((?!api|auth|_next|_vercel|.*\\..*).*)",
  ],
};
