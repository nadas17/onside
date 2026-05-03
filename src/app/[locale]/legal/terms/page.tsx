import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";

/**
 * Kullanım Koşulları — placeholder (MVP §15.1).
 *
 * Production öncesi hukuk danışmanlığı zorunlu. Yaş limiti (16+), davranış
 * kuralları, anonim hesap riski (cihaz değişikliğinde kayıp), platform sorumsuzluk
 * (saha rezervasyonu yapmaz, ödeme almaz), abuse → ban.
 */

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Legal.terms");
  const tCommon = await getTranslations("Legal.common");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        back={{ href: "/", label: "Onside" }}
        title={t("title")}
        maxWidth="3xl"
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-12">
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-xs">
            {tCommon("lastUpdated")}: 2026-04-30 ·{" "}
            <Link
              href={`/${locale}/legal/privacy`}
              className="text-brand hover:underline"
            >
              {tCommon("seePrivacy")}
            </Link>
          </p>

          <p className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
            <strong>{tCommon("draftNotice")}:</strong> {t("draftBody")}
          </p>

          <Section title={t("eligibility.title")}>
            <p>{t("eligibility.body")}</p>
          </Section>

          <Section title={t("account.title")}>
            <p>{t("account.body")}</p>
          </Section>

          <Section title={t("conduct.title")}>
            <p>{t("conduct.intro")}</p>
            <ul>
              <li>{t("conduct.item1")}</li>
              <li>{t("conduct.item2")}</li>
              <li>{t("conduct.item3")}</li>
              <li>{t("conduct.item4")}</li>
            </ul>
          </Section>

          <Section title={t("liability.title")}>
            <p>{t("liability.body")}</p>
          </Section>

          <Section title={t("changes.title")}>
            <p>{t("changes.body")}</p>
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
