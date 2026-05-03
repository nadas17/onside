import { Skeleton, VenueCardSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass-bar h-14 border-b sm:h-16">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-10 w-28 rounded-md" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <VenueCardSkeleton key={i} />
          ))}
        </div>
      </main>
    </div>
  );
}
