"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/lib/i18n-errors";
import { toast } from "sonner";
import { Send, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  sendMessageAction,
  type ChatMessageRow,
} from "@/lib/event/chat-actions";
import { NicknameDialog } from "@/components/nickname-dialog";
import { useNickname } from "@/components/nickname-provider";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 1000;

type ClientMessage = {
  id: string;
  sender_nickname: string | null;
  content: string;
  kind: "text" | "system";
  is_deleted: boolean;
  created_at: string;
  optimistic?: boolean;
  failed?: boolean;
};

export function ChatRoom({
  eventId,
  initialMessages,
  chatLocked,
  eventStatus,
  locale,
}: {
  eventId: string;
  initialMessages: ChatMessageRow[];
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
  const tNick = useTranslations("Nickname");
  const errorMsg = useErrorMessage();
  const { nickname, setNickname } = useNickname();
  const [nicknameDialogOpen, setNicknameDialogOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ClientMessage[]>(() =>
    initialMessages.map((m) => ({
      id: m.id,
      sender_nickname: m.sender_nickname,
      content: m.content,
      kind: m.kind,
      is_deleted: m.is_deleted,
      created_at: m.created_at,
    })),
  );
  const [draft, setDraft] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // Realtime subscribe — chat_message INSERT/UPDATE on this event.
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
        (payload) => {
          const row = payload.new as {
            id: string;
            sender_nickname: string | null;
            content: string;
            kind: "text" | "system";
            is_deleted: boolean;
            created_at: string;
          };

          setMessages((prev) => {
            const idx = prev.findIndex(
              (m) =>
                m.id === row.id ||
                (m.optimistic &&
                  m.sender_nickname === row.sender_nickname &&
                  m.content === row.content &&
                  Math.abs(
                    new Date(m.created_at).getTime() -
                      new Date(row.created_at).getTime(),
                  ) < 30_000),
            );
            const incoming: ClientMessage = {
              id: row.id,
              sender_nickname: row.sender_nickname,
              content: row.content,
              kind: row.kind,
              is_deleted: row.is_deleted,
              created_at: row.created_at,
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
    };
  }, [eventId]);

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > MAX_LENGTH) return;
    if (!nickname) {
      setNicknameDialogOpen(true);
      return;
    }

    const tempId = `optimistic-${Date.now()}-${Math.random()}`;
    const optimistic: ClientMessage = {
      id: tempId,
      sender_nickname: nickname,
      content: trimmed,
      kind: "text",
      is_deleted: false,
      created_at: new Date().toISOString(),
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    startTransition(async () => {
      const result = await sendMessageAction(eventId, nickname, trimmed);
      if (!result.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, failed: true, optimistic: false } : m,
          ),
        );
        toast.error(t("sendError"), { description: errorMsg(result) });
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: result.data.messageId, optimistic: false }
            : m,
        ),
      );
    });
  };

  const composerDisabled =
    chatLocked || eventStatus === "cancelled" || eventStatus === "completed";

  const composerHint = chatLocked
    ? t("locked")
    : eventStatus === "cancelled"
      ? t("eventCancelled")
      : eventStatus === "completed"
        ? t("eventCompleted")
        : null;

  return (
    <div className="glass-card flex h-[480px] flex-col rounded-lg border shadow-md shadow-black/20">
      <header className="border-border flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <p className="text-muted-foreground text-xs">{t("scope")}</p>
        </div>
        {nickname ? (
          <button
            type="button"
            onClick={() => setNicknameDialogOpen(true)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            <Pencil className="size-3" />
            {tNick("current", { name: nickname })}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setNicknameDialogOpen(true)}
            className="text-brand text-xs hover:underline"
          >
            {tNick("change")}
          </button>
        )}
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
                myNickname={nickname}
                locale={locale}
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
            placeholder={nickname ? t("placeholder") : tNick("description")}
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

      <NicknameDialog
        open={nicknameDialogOpen}
        defaultValue={nickname ?? ""}
        onOpenChange={setNicknameDialogOpen}
        onSubmit={(next) => {
          setNickname(next);
          setNicknameDialogOpen(false);
        }}
      />
    </div>
  );
}

function MessageItem({
  message: m,
  myNickname,
  locale,
}: {
  message: ClientMessage;
  myNickname: string | null;
  locale: string;
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

  const senderNickname = m.sender_nickname ?? "?";
  const isMe =
    m.sender_nickname !== null &&
    myNickname !== null &&
    m.sender_nickname.toLowerCase() === myNickname.toLowerCase();

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
      <Avatar name={senderNickname} />
      <div
        className={cn(
          "group flex max-w-[80%] flex-col gap-0.5",
          isMe ? "items-end" : "items-start",
        )}
      >
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-medium">{senderNickname}</span>
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
      </div>
    </li>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className="from-brand flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br to-emerald-700 text-xs font-bold text-white"
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
