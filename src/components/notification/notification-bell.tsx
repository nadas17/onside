"use client";

/**
 * Notification Bell — Phase 9.
 *
 * Header'a yerleşen bell ikonu + unread badge. Tıklayınca dropdown panel.
 * Realtime: notification INSERT'lerini dinler → unread sayısı + dropdown sync.
 */

import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  type NotificationView,
} from "@/lib/notification/actions";

export function NotificationBell({
  initialItems,
  myUserId,
}: {
  initialItems: NotificationView[];
  myUserId: string;
}) {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const [items, setItems] = React.useState<NotificationView[]>(initialItems);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const unreadCount = items.filter((i) => !i.readAt).length;

  // Outside click close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  // Realtime subscribe
  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${myUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification",
          filter: `recipient_id=eq.${myUserId}`,
        },
        async () => {
          // Yeni satır geldi → tam listeyi yeniden çek (event title vs için)
          const r = await getNotificationsAction(30);
          if (r.ok) setItems(r.data);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notification",
          filter: `recipient_id=eq.${myUserId}`,
        },
        (payload) => {
          const newRow = payload.new as { id: string; read_at: string | null };
          setItems((prev) =>
            prev.map((it) =>
              it.id === newRow.id ? { ...it, readAt: newRow.read_at } : it,
            ),
          );
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || err) {
          console.error("[notifications] channel", status, err);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myUserId]);

  const handleClick = async (id: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id && !i.readAt
          ? { ...i, readAt: new Date().toISOString() }
          : i,
      ),
    );
    await markNotificationReadAction(id);
  };

  const handleMarkAll = async () => {
    setItems((prev) =>
      prev.map((i) =>
        i.readAt ? i : { ...i, readAt: new Date().toISOString() },
      ),
    );
    await markAllNotificationsReadAction();
  };

  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        aria-label={t("toggle")}
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span
            aria-label={t("unreadCount", { count: unreadCount })}
            className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label={t("title")}
          className="glass-strong absolute top-full right-0 z-50 mt-2 flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border shadow-xl shadow-black/40"
        >
          <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="text-sm font-semibold">{t("title")}</span>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAll}
                title={t("markAllRead")}
              >
                <CheckCheck className="size-3.5" />
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="text-muted-foreground px-4 py-6 text-center text-sm">
              {t("empty")}
            </div>
          ) : (
            <ul className="divide-border max-h-[60vh] divide-y overflow-y-auto">
              {items.map((it) => {
                const href = it.eventId
                  ? `/${locale}/events/${it.eventId}`
                  : `/${locale}`;
                return (
                  <li
                    key={it.id}
                    className={`px-3 py-2 ${
                      !it.readAt ? "bg-brand/5" : ""
                    } hover:bg-muted/30`}
                  >
                    <a
                      href={href}
                      onClick={() => {
                        handleClick(it.id);
                        setOpen(false);
                      }}
                      className="flex flex-col gap-0.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">
                          {t(`kinds.${it.kind}.title`)}
                        </span>
                        {!it.readAt && (
                          <span
                            aria-hidden
                            className="bg-brand mt-1 size-1.5 shrink-0 rounded-full"
                          />
                        )}
                      </div>
                      {it.eventTitle && (
                        <span className="text-muted-foreground truncate text-xs">
                          {it.eventTitle}
                        </span>
                      )}
                      <span className="text-muted-foreground text-[10px]">
                        {dateFmt.format(new Date(it.createdAt))}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
