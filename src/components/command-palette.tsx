"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useLocale, useTranslations } from "next-intl";
import {
  Calendar,
  Home,
  MapPin,
  Plus,
  Search,
  FileText,
  Globe,
  Check,
} from "lucide-react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";

/**
 * Global Command Palette.
 *
 * Trigger:
 *   - Cmd/Ctrl + K (or "/" outside an input)
 *   - The header button rendered alongside the dialog
 *
 * Surface:
 *   - Mobile (< 768px): Vaul bottom-sheet, large 44px tap rows, scrollable list
 *   - Desktop: centered overlay with full keyboard navigation + footer hints
 */

type ItemGroup = "pages" | "actions" | "language" | "legal";

type Item = {
  id: string;
  label: string;
  hint?: string;
  group: ItemGroup;
  icon: React.ReactNode;
  keywords?: string[];
  onSelect: () => void;
  trailing?: React.ReactNode;
};

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as Locale;
  const t = useTranslations("CommandPalette");

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !isEditable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (href: any) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const switchLocale = React.useCallback(
    (loc: Locale) => {
      setOpen(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.replace(pathname as any, { locale: loc });
    },
    [router, pathname],
  );

  const items: Item[] = React.useMemo(() => {
    const list: Item[] = [
      {
        id: "home",
        label: t("home"),
        group: "pages",
        icon: <Home className="size-4" />,
        keywords: ["anasayfa", "home", "start", "główna"],
        onSelect: () => navigate("/"),
      },
      {
        id: "events",
        label: t("events"),
        group: "pages",
        icon: <Calendar className="size-4" />,
        keywords: ["matches", "maç", "etkinlik", "fixture", "mecz"],
        onSelect: () => navigate("/events"),
      },
      {
        id: "venues",
        label: t("venues"),
        group: "pages",
        icon: <MapPin className="size-4" />,
        keywords: ["saha", "halisaha", "pitch", "boisko"],
        onSelect: () => navigate("/venues"),
      },
    ];

    list.push({
      id: "new-event",
      label: t("newEvent"),
      group: "actions",
      icon: <Plus className="size-4" />,
      keywords: ["create", "oluştur", "stwórz"],
      onSelect: () => navigate("/events/new"),
    });

    const NATIVE: Record<Locale, string> = {
      tr: "Türkçe",
      en: "English",
      pl: "Polski",
    };
    for (const loc of routing.locales) {
      list.push({
        id: `lang-${loc}`,
        label: NATIVE[loc],
        hint: loc.toUpperCase(),
        group: "language",
        icon: <Globe className="size-4" />,
        keywords: [loc, NATIVE[loc].toLowerCase()],
        onSelect: () => switchLocale(loc),
        trailing: loc === locale ? <Check className="size-3.5" /> : null,
      });
    }

    list.push(
      {
        id: "privacy",
        label: t("privacy"),
        group: "legal",
        icon: <FileText className="size-4" />,
        keywords: ["gizlilik", "privacy", "prywatność"],
        onSelect: () => navigate("/legal/privacy"),
      },
      {
        id: "terms",
        label: t("terms"),
        group: "legal",
        icon: <FileText className="size-4" />,
        keywords: ["koşullar", "terms", "warunki"],
        onSelect: () => navigate("/legal/terms"),
      },
    );

    return list;
  }, [t, locale, navigate, switchLocale]);

  const groups: Array<{ key: ItemGroup; heading: string }> = [
    { key: "pages", heading: t("pages") },
    { key: "actions", heading: t("actions") },
    { key: "language", heading: t("language") },
    { key: "legal", heading: t("legal") },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("triggerLabel")}
        className="glass-strong hover:bg-accent/50 hover:text-foreground tap-target text-muted-foreground inline-flex items-center gap-2 rounded-md border px-2 py-2 text-sm transition-colors sm:px-3"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">{t("triggerLabel")}</span>
        <kbd className="bg-muted border-border/60 text-muted-foreground hidden rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent className="overflow-hidden p-0 sm:max-w-2xl sm:p-0">
          <ResponsiveDialogTitle className="sr-only">
            {t("title")}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t("description")}
          </ResponsiveDialogDescription>
          <Command
            label={t("title")}
            className="flex flex-col"
            loop
            filter={(value, search, keywords) => {
              if (!search) return 1;
              const haystack =
                `${value} ${keywords?.join(" ") ?? ""}`.toLowerCase();
              const needle = search.toLowerCase();
              return haystack.includes(needle) ? 1 : 0;
            }}
          >
            <div className="border-border flex items-center gap-2 border-b px-3">
              <Search className="text-muted-foreground size-4 shrink-0" />
              <Command.Input
                autoFocus
                placeholder={t("placeholder")}
                className="placeholder:text-muted-foreground flex h-12 w-full bg-transparent text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:text-sm"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto overscroll-contain p-2 sm:max-h-[420px]">
              <Command.Empty className="text-muted-foreground py-6 text-center text-sm">
                {t("noResults")}
              </Command.Empty>
              {groups.map((group) => {
                const groupItems = items.filter((i) => i.group === group.key);
                if (groupItems.length === 0) return null;
                return (
                  <Command.Group
                    key={group.key}
                    heading={group.heading}
                    className="text-muted-foreground [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase"
                  >
                    {groupItems.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${item.label} ${item.id}`}
                        keywords={item.keywords}
                        onSelect={item.onSelect}
                        className="aria-selected:bg-accent aria-selected:text-accent-foreground flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm outline-none data-[disabled]:opacity-50 sm:min-h-[36px]"
                      >
                        <span className="text-muted-foreground">
                          {item.icon}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && (
                          <span className="text-muted-foreground font-mono text-[10px] uppercase">
                            {item.hint}
                          </span>
                        )}
                        {item.trailing && (
                          <span className="text-brand">{item.trailing}</span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}
            </Command.List>
            <div className="border-border text-muted-foreground hidden items-center justify-between border-t px-3 py-2 text-xs sm:flex">
              <span>{t("footerHint")}</span>
              <span className="flex items-center gap-1">
                <kbd className="bg-muted border-border/60 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                  ↑
                </kbd>
                <kbd className="bg-muted border-border/60 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                  ↓
                </kbd>
                <span>{t("navigate")}</span>
                <kbd className="bg-muted border-border/60 ml-2 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                  ⏎
                </kbd>
                <span>{t("select")}</span>
                <kbd className="bg-muted border-border/60 ml-2 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                  Esc
                </kbd>
                <span>{t("close")}</span>
              </span>
            </div>
          </Command>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
