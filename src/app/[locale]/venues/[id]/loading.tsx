import { Skeleton, EventCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border h-16 border-b">
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div>
              <Skeleton className="mb-3 h-5 w-32" />
              <div className="grid gap-3">
                <EventCardSkeleton />
                <EventCardSkeleton />
              </div>
            </div>
          </div>
          <aside>
            <Skeleton className="h-64 w-full rounded-lg" />
          </aside>
        </div>
      </main>
    </div>
  );
}
