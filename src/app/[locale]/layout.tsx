import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { routing } from "@/i18n/routing";
import { Providers } from "@/components/providers";
import { CookieBanner } from "@/components/cookie-banner";
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
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  icons: {
    icon: "/onside-logo.svg",
  },
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

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <NextIntlClientProvider locale={locale}>
          <Providers>
            <a
              href="#main-content"
              className="focus:bg-card focus-visible:outline-brand sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus-visible:outline focus-visible:outline-2"
            >
              {tA11y("skipToContent")}
            </a>
            <div id="main-content">{children}</div>
            <SiteFooter
              locale={locale}
              labels={{
                privacy: tFooter("privacy"),
                terms: tFooter("terms"),
                tagline: tFooter("tagline"),
              }}
            />
            <CookieBanner />
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
    <footer className="border-border text-muted-foreground mt-auto border-t py-4 text-xs">
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
