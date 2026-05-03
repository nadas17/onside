import { cn } from "@/lib/utils";

/**
 * Base skeleton — animated pulse rectangle.
 *
 * Uses Tailwind's `animate-pulse` which respects `prefers-reduced-motion`
 * via the global override in globals.css.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-muted/70 animate-pulse rounded-md motion-reduce:animate-none",
        className,
      )}
      aria-hidden
      {...props}
    />
  );
}

/** Skeleton matching <EventCard> layout. */
function EventCardSkeleton() {
  return (
    <div className="border-border block rounded-md border p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <div className="space-y-1.5 pt-1">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Skeleton matching <RosterList> position-grouped row layout. */
function RosterRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="hidden h-3 w-16 sm:block" />
      </div>
      <Skeleton className="h-3 w-10" />
    </div>
  );
}

/** Skeleton matching a chat message bubble. */
function ChatMessageSkeleton({ align = "left" }: { align?: "left" | "right" }) {
  return (
    <div
      className={cn(
        "flex gap-2",
        align === "right" ? "justify-end" : "justify-start",
      )}
    >
      {align === "left" && (
        <Skeleton className="size-8 shrink-0 rounded-full" />
      )}
      <div className="flex max-w-[70%] flex-col gap-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-48 rounded-2xl" />
      </div>
    </div>
  );
}

/** Skeleton block for an event-feed page (homepage, /events). */
function EventFeedSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Skeleton for a venue card (used in /venues). */
function VenueCardSkeleton() {
  return (
    <div className="border-border rounded-md border p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-1.5 pt-1">
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export {
  Skeleton,
  EventCardSkeleton,
  RosterRowSkeleton,
  ChatMessageSkeleton,
  EventFeedSkeleton,
  VenueCardSkeleton,
};
