import {
  RosterRowSkeleton,
  ChatMessageSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border h-16 border-b">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-8">
            {/* Title block */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>

            {/* Info grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="border-border space-y-2 rounded-md border p-3"
                >
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>

            {/* CTA bar */}
            <div className="border-border flex items-center justify-between rounded-md border p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-28 rounded-md" />
            </div>

            {/* Roster */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="border-border space-y-3 rounded-md border p-3">
                <RosterRowSkeleton />
                <RosterRowSkeleton />
                <RosterRowSkeleton />
              </div>
            </div>

            {/* Chat preview */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-24" />
              <div className="border-border space-y-4 rounded-md border p-4">
                <ChatMessageSkeleton align="left" />
                <ChatMessageSkeleton align="right" />
                <ChatMessageSkeleton align="left" />
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-3">
            <Skeleton className="h-64 w-full rounded-lg" />
            <div className="border-border space-y-2 rounded-md border p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
