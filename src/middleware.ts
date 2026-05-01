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
    // Statik asset, API ve dahili Next.js path'lerini hariç tut.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.ico$|.*\\.webp$).*)",
  ],
};
