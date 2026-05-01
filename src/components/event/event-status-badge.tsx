import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EventStatus } from "@/lib/event/state";

const STATUS_STYLES: Record<EventStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  open: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  full: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  locked: "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100",
  in_progress:
    "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-100",
  completed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  cancelled: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const t = useTranslations("Events.statuses");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {t(status)}
    </span>
  );
}
