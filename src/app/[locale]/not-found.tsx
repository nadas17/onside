import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("NotFound");
  const locale = useLocale();
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-xl">{t("title")}</p>
      <p className="text-muted-foreground max-w-md">{t("description")}</p>
      <Button asChild>
        <Link href={`/${locale}`}>{t("home")}</Link>
      </Button>
    </main>
  );
}
