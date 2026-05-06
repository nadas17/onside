import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { PageBackground } from "@/components/page-background";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <HomeView locale={locale} isAuthed={!!user} />;
}

function HomeView({ locale, isAuthed }: { locale: string; isAuthed: boolean }) {
  const t = useTranslations("Home");

  return (
    <>
      <PageBackground variant="home" intensity="balanced" />
      <div className="flex min-h-screen flex-col">
        <AppHeader maxWidth="6xl" />
        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-16">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-5 text-center sm:gap-8">
            <Image
              src="/onside-logo.svg"
              alt=""
              aria-hidden
              width={96}
              height={96}
              className="size-16 sm:size-24"
              priority
            />
            <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-4xl md:text-5xl">
              {t("title")}
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed text-balance sm:text-lg">
              {t("tagline")}
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href={`/${locale}/events`}>{t("browseEvents")}</Link>
              </Button>
              {isAuthed && (
                <Button
                  asChild
                  size="lg"
                  variant="cta"
                  className="w-full sm:w-auto"
                >
                  <Link href={`/${locale}/events/new`}>{t("createEvent")}</Link>
                </Button>
              )}
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Link href={`/${locale}/venues`}>{t("browseVenues")}</Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
