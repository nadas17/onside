import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createIntlMiddleware(routing);

export const config = {
  matcher: [
    // Skip API routes, Next internals, and any file with an extension. Without
    // the trailing `\\..*` clause, `/bg/foo.jpg` would get a locale prefix and
    // Next/Image would fail to fetch the source (400).
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
