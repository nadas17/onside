"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { toast } from "sonner";
import { Send, Trash2, Flag, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { createClient } from "@/lib/supabase/client";
import {
  deleteMessageAction,
  reportMessageAction,
  sendMessageAction,
  type ChatMessageRow,
} from "@/lib/event/chat-actions";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 1000;

type SenderInfo = { id: string; username: string; display_name: string };

type ClientMessage = {
  id: string;
  sender_id: string | null;
  content: string;
  kind: "text" | "system";
  is_deleted: boolean;
  created_at: string;
  sender: SenderInfo | null;
  optimistic?: boolean;
  failed?: boolean;
};

export function ChatRoom({
  eventId,
  initialMessages,
  canPost,
  myUserId,
  organizerId,
  chatLocked,
  eventStatus,
  locale,
}: {
  eventId: string;
  initialMessages: ChatMessageRow[];
  canPost: boolean;
  myUserId: string | null;
  organizerId: string;
  chatLocked: boolean;
  eventStatus:
    | "draft"
    | "open"
    | "full"
    | "locked"
    | "in_progress"
    | "completed"
    | "cancelled";
  locale: string;
}) {
  const t = useTranslations("Chat");
  const errorMsg = useErrorMessage();
  const [messages, setMessages] = React.useState<ClientMessage[]>(() =>
    initialMessages.map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      content: m.content,
      kind: m.kind,
      is_deleted: m.is_deleted,
      created_at: m.created_at,
      sender: m.sender,
    })),
  );
  const [draft, setDraft] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const profileCacheRef = React.useRef<Map<string, SenderInfo>>(new Map());
  // Pending profile fetches queued for batched lookup. We coalesce all
  // sender_ids that arrive within 50ms into a single `.in("id", ids)` query
  // instead of N round-trips. After the batch resolves, messages whose
  // sender was unknown re-render with the loaded profile info.
  const pendingProfileIdsRef = React.useRef<Set<string>>(new Set());
  const profileFlushTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const queueProfileFetch = React.useCallback((profileId: string) => {
    if (profileCacheRef.current.has(profileId)) return;
    pendingProfileIdsRef.current.add(profileId);
    if (profileFlushTimerRef.current) return;
    profileFlushTimerRef.current = setTimeout(async () => {
      const ids = Array.from(pendingProfileIdsRef.current);
      pendingProfileIdsRef.current.clear();
      profileFlushTimerRef.current = null;
      if (ids.length === 0) return;
      const supabase = createClient();
      const { data } = await supabase
        .from("profile")
        .select("id, username, display_name")
        .in("id", ids)
        .returns<SenderInfo[]>();
      for (const row of data ?? []) {
        profileCacheRef.current.set(row.id, row);
      }
      // Patch messages whose sender was previously unknown.
      setMessages((prev) =>
        prev.map((m) => {
          if (m.sender || !m.sender_id) return m;
          const cached = profileCacheRef.current.get(m.sender_id);
          return cached ? { ...m, sender: cached } : m;
        }),
      );
    }, 50);
  }, []);

  // Initial profile cache build
  React.useEffect(() => {
    for (const m of initialMessages) {
      if (m.sender) profileCacheRef.current.set(m.sender.id, m.sender);
    }
  }, [initialMessages]);

  // Realtime subscribe
  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`event:${eventId}:chat`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_message",
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            sender_id: string | null;
            content: string;
            kind: "text" | "system";
            is_deleted: boolean;
            created_at: string;
          };

          // Sender — cache hit returns immediately; cache miss queues a
          // batched fetch and renders the message without sender info now.
          // Once the batch resolves, the message re-renders with the profile.
          let sender: SenderInfo | null = null;
          if (row.sender_id) {
            sender = profileCacheRef.current.get(row.sender_id) ?? null;
            if (!sender) queueProfileFetch(row.sender_id);
          }

          setMessages((prev) => {
            // Aynı id veya optimistic eşleşmesi varsa replace
            const idx = prev.findIndex(
              (m) =>
                m.id === row.id ||
                (m.optimistic &&
                  m.sender_id === row.sender_id &&
                  m.content === row.content &&
                  Math.abs(
                    new Date(m.created_at).getTime() -
                      new Date(row.created_at).getTime(),
                  ) < 30_000),
            );
            const incoming: ClientMessage = {
              id: row.id,
              sender_id: row.sender_id,
              content: row.content,
              kind: row.kind,
              is_deleted: row.is_deleted,
              created_at: row.created_at,
              sender,
            };
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = incoming;
              return next;
            }
            return [...prev, incoming];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_message",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; is_deleted: boolean };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === row.id ? { ...m, is_deleted: row.is_deleted } : m,
            ),
          );
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || err) {
          console.error("[chat] channel", status, err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      // Cancel any pending profile fetch on unmount
      if (profileFlushTimerRef.current) {
        clearTimeout(profileFlushTimerRef.current);
        profileFlushTimerRef.current = null;
      }
    };
  }, [eventId, queueProfileFetch]);

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > MAX_LENGTH || !myUserId) return;

    const tempId = `optimistic-${Date.now()}-${Math.random()}`;
    const myProfile = profileCacheRef.current.get(myUserId);
    const optimistic: ClientMessage = {
      id: tempId,
      sender_id: myUserId,
      content: trimmed,
      kind: "text",
      is_deleted: false,
      created_at: new Date().toISOString(),
      sender: myProfile ?? null,
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    startTransition(async () => {
      const result = await sendMessageAction(eventId, trimmed);
      if (!result.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, failed: true, optimistic: false } : m,
          ),
        );
        toast.error(t("sendError"), { description: errorMsg(result) });
        return;
      }
      // Realtime INSERT olayı zaten replace edecek; optimistic flag'i temizle
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: result.data.messageId, optimistic: false }
            : m,
        ),
      );
    });
  };

  const handleDelete = async (messageId: string) => {
    if (!confirm(t("confirmDelete"))) return;
    const result = await deleteMessageAction(messageId);
    if (!result.ok) {
      toast.error(t("deleteError"), { description: errorMsg(result) });
      return;
    }
    toast.success(t("deleted"));
  };

  const [reportingId, setReportingId] = React.useState<string | null>(null);

  const submitReport = async (
    messageId: string,
    reason: "spam" | "harassment" | "inappropriate" | "other",
  ) => {
    const result = await reportMessageAction(messageId, reason);
    setReportingId(null);
    if (!result.ok) {
      toast.error(t("reportError"), { description: errorMsg(result) });
      return;
    }
    toast.success(
      result.data.alreadyReported ? t("alreadyReported") : t("reported"),
    );
  };

  const composerDisabled =
    !canPost ||
    chatLocked ||
    eventStatus === "cancelled" ||
    eventStatus === "completed";

  const composerHint = !canPost
    ? t("notInRoster")
    : chatLocked
      ? t("locked")
      : eventStatus === "cancelled"
        ? t("eventCancelled")
        : eventStatus === "completed"
          ? t("eventCompleted")
          : null;

  return (
    <div className="glass-card flex h-[480px] flex-col rounded-lg border shadow-md shadow-black/20">
      <header className="border-border border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-muted-foreground text-xs">{t("scope")}</p>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-center text-sm">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                myUserId={myUserId}
                organizerId={organizerId}
                locale={locale}
                onDelete={() => handleDelete(m.id)}
                onReport={() => setReportingId(m.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-border border-t p-3">
        {composerHint && (
          <p className="bg-secondary text-secondary-foreground mb-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs">
            <Lock className="size-3" />
            {composerHint}
          </p>
        )}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={composerDisabled || pending}
            placeholder={t("placeholder")}
            maxLength={MAX_LENGTH}
            rows={1}
            className="glass-strong border-input placeholder:text-muted-foreground focus-visible:ring-ring flex max-h-32 min-h-10 flex-1 resize-none rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            onClick={handleSend}
            disabled={composerDisabled || pending || draft.trim().length === 0}
            size="default"
            aria-label={t("send")}
          >
            <Send className="size-4" />
          </Button>
        </div>
        <div className="mt-1 flex justify-end">
          <span
            className={cn(
              "text-xs",
              draft.length > MAX_LENGTH - 50
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {draft.length} / {MAX_LENGTH}
          </span>
        </div>
      </div>

      <ReportReasonDialog
        open={reportingId !== null}
        onOpenChange={(o) => !o && setReportingId(null)}
        onSubmit={(reason) => {
          if (reportingId) submitReport(reportingId, reason);
        }}
      />
    </div>
  );
}

type ReportReason = "spam" | "harassment" | "inappropriate" | "other";

function ReportReasonDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: ReportReason) => void;
}) {
  const t = useTranslations("Chat");
  const [reason, setReason] = React.useState<ReportReason>("spam");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) setSubmitting(false);
  }, [open]);

  const reasons: ReportReason[] = [
    "spam",
    "harassment",
    "inappropriate",
    "other",
  ];

  const handleSubmit = () => {
    setSubmitting(true);
    onSubmit(reason);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("reportTitle")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t("reportDescription")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <fieldset className="mt-4 flex flex-col gap-2" disabled={submitting}>
          <legend className="sr-only">{t("reportReason")}</legend>
          {reasons.map((r) => (
            <label
              key={r}
              className={cn(
                "glass-card hover:border-foreground/30 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors",
                reason === r && "border-brand bg-brand/10",
              )}
            >
              <input
                type="radio"
                name="report-reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-brand size-4"
              />
              <span>{t(`reportReasons.${r}`)}</span>
            </label>
          ))}
        </fieldset>
        <ResponsiveDialogFooter className="mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-12 sm:h-10"
          >
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-12 sm:h-10"
          >
            {submitting ? t("reporting") : t("report")}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function MessageItem({
  message: m,
  myUserId,
  organizerId,
  locale,
  onDelete,
  onReport,
}: {
  message: ClientMessage;
  myUserId: string | null;
  organizerId: string;
  locale: string;
  onDelete: () => void;
  onReport: () => void;
}) {
  const t = useTranslations("Chat");
  const tFmt = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
    timeZone: "Europe/Warsaw",
  });

  if (m.kind === "system") {
    return (
      <li className="flex justify-center">
        <span className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs italic">
          {m.content}
        </span>
      </li>
    );
  }

  const isMe = m.sender_id === myUserId;
  const isOrganizer = m.sender_id === organizerId;
  const canDelete =
    !m.is_deleted &&
    !!myUserId &&
    (myUserId === organizerId ||
      (isMe && Date.now() - new Date(m.created_at).getTime() < 5 * 60 * 1000));
  const canReport =
    !m.is_deleted && !!myUserId && !isMe && m.sender_id !== null;

  const timeStr = tFmt.format(new Date(m.created_at));

  return (
    <li
      className={cn(
        "flex gap-2",
        isMe && "flex-row-reverse",
        m.optimistic && "opacity-60",
        m.failed && "opacity-60",
      )}
    >
      <Avatar name={m.sender?.display_name ?? "?"} organizer={isOrganizer} />
      <div
        className={cn(
          "group flex max-w-[80%] flex-col gap-0.5",
          isMe ? "items-end" : "items-start",
        )}
      >
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-medium">
            {m.sender?.display_name ?? t("unknownUser")}
          </span>
          {isOrganizer && (
            <span className="text-[10px] tracking-wide text-amber-600 uppercase dark:text-amber-400">
              {t("organizer")}
            </span>
          )}
          <span className="text-muted-foreground">{timeStr}</span>
        </div>
        <div
          className={cn(
            "rounded-2xl px-3 py-2 text-sm",
            m.is_deleted
              ? "bg-muted text-muted-foreground italic"
              : isMe
                ? "bg-brand text-brand-foreground"
                : "bg-secondary text-secondary-foreground",
          )}
        >
          {m.is_deleted ? t("messageDeleted") : <AutoLink text={m.content} />}
          {m.failed && (
            <span className="text-destructive ml-2 text-xs">
              {t("sendFailed")}
            </span>
          )}
        </div>
        {!m.is_deleted && (canDelete || canReport) && (
          <div className="hidden gap-1 group-hover:flex">
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive text-[10px]"
                aria-label={t("delete")}
              >
                <Trash2 className="size-3" />
              </button>
            )}
            {canReport && (
              <button
                type="button"
                onClick={onReport}
                className="text-muted-foreground text-[10px] hover:text-amber-600"
                aria-label={t("report")}
              >
                <Flag className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Avatar({ name, organizer }: { name: string; organizer: boolean }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
        organizer
          ? "bg-gradient-to-br from-amber-500 to-amber-600"
          : "from-brand bg-gradient-to-br to-emerald-700",
      )}
    >
      {initial}
    </span>
  );
}

const URL_REGEX = /\b(https?:\/\/[^\s<>"'()]+)/g;

function AutoLink({ text }: { text: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}
