import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { HeaderActions } from "@/components/header-actions";

/**
 * Gizlilik Politikası — placeholder (RODO/GDPR uyumlu iskelet, MVP scope §15.1).
 *
 * Production öncesi hukuk danışmanlığı zorunlu. Bu sayfa veri işleme prensiplerini
 * dürüstçe açıklıyor: hangi veriler toplanıyor, neden, nereye gidiyor, ne kadar
 * süreyle tutuluyor, kullanıcı hakları nasıl kullanılır.
 */

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal.privacy");
  const tCommon = await getTranslations("Legal.common");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border h-16 border-b">
        <div className="mx-auto flex h-full max-w-3xl items-center justify-between px-6">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-1 text-sm font-medium hover:underline"
          >
            <ChevronLeft className="size-4" />
            Halısaha
          </Link>
          <HeaderActions />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-xs">
            {tCommon("lastUpdated")}: 2026-04-30 ·{" "}
            <Link
              href={`/${locale}/legal/terms`}
              className="text-brand hover:underline"
            >
              {tCommon("seeTerms")}
            </Link>
          </p>

          <p className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
            <strong>{tCommon("draftNotice")}:</strong> {t("draftBody")}
          </p>

          <Section title={t("collected.title")}>
            <p>{t("collected.intro")}</p>
            <ul>
              <li>{t("collected.item1")}</li>
              <li>{t("collected.item2")}</li>
              <li>{t("collected.item3")}</li>
              <li>{t("collected.item4")}</li>
            </ul>
            <p>
              <strong>{t("collected.notCollected")}:</strong>{" "}
              {t("collected.notCollectedList")}
            </p>
          </Section>

          <Section title={t("purpose.title")}>
            <p>{t("purpose.body")}</p>
          </Section>

          <Section title={t("storage.title")}>
            <p>{t("storage.body")}</p>
          </Section>

          <Section title={t("retention.title")}>
            <p>{t("retention.body")}</p>
          </Section>

          <Section title={t("rights.title")}>
            <p>{t("rights.intro")}</p>
            <ul>
              <li>{t("rights.access")}</li>
              <li>{t("rights.rectify")}</li>
              <li>{t("rights.erase")}</li>
              <li>{t("rights.export")}</li>
              <li>{t("rights.complaint")}</li>
            </ul>
          </Section>

          <Section title={t("contact.title")}>
            <p>{t("contact.body")}</p>
          </Section>
        </article>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="text-muted-foreground text-sm">{children}</div>
    </section>
  );
}
