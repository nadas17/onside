import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  images: {
    remotePatterns: [
      // Supabase Storage avatar bucket — Phase 1'de aktive olacak
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
