import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { routing } from "@/i18n/routing";
import { Providers } from "@/components/providers";
import { CookieBanner } from "@/components/cookie-banner";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { FabCreate } from "@/components/fab-create";
import { AuthGateProvider } from "@/components/auth/auth-gate-provider";
import { createClient } from "@/lib/supabase/server";
import "../globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Onside",
    template: "%s — Onside",
  },
  description:
    "Yakındaki pickup futbol maçını bul, katıl, dengeli takımlarda oyna.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  icons: {
    icon: "/onside-logo.svg",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const tA11y = await getTranslations("A11y");
  const tFooter = await getTranslations("Footer");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthed = !!user;

  // hasProfile gates whether AuthGateProvider should pop the JoinModal.
  // An authed-but-no-profile user (Google login mid-flight, or session
  // restored without a profile row) still needs the onboarding flow.
  let hasProfile = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profile")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    hasProfile = !!profile;
  }

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <NextIntlClientProvider locale={locale}>
          <Providers>
            <AuthGateProvider hasProfile={hasProfile}>
              <a
                href="#main-content"
                className="focus:bg-card focus-visible:outline-brand sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus-visible:outline focus-visible:outline-2"
              >
                {tA11y("skipToContent")}
              </a>
              {/* Bottom-padding leaves room for the mobile bottom nav (~64px + safe area). */}
              <div
                id="main-content"
                className="pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"
              >
                {children}
              </div>
              <SiteFooter
                locale={locale}
                labels={{
                  privacy: tFooter("privacy"),
                  terms: tFooter("terms"),
                  tagline: tFooter("tagline"),
                }}
              />
              <MobileBottomNav isAuthed={isAuthed} />
              <FabCreate isAuthed={isAuthed} />
              <CookieBanner />
            </AuthGateProvider>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function SiteFooter({
  locale,
  labels,
}: {
  locale: string;
  labels: { privacy: string; terms: string; tagline: string };
}) {
  return (
    <footer className="border-border text-muted-foreground mt-auto hidden border-t py-4 text-xs lg:block">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-6">
        <span>{labels.tagline}</span>
        <nav aria-label="Legal" className="flex items-center gap-3">
          <Link
            href={`/${locale}/legal/privacy`}
            className="focus-visible:outline-brand hover:underline focus-visible:outline focus-visible:outline-2"
          >
            {labels.privacy}
          </Link>
          <Link
            href={`/${locale}/legal/terms`}
            className="focus-visible:outline-brand hover:underline focus-visible:outline focus-visible:outline-2"
          >
            {labels.terms}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
