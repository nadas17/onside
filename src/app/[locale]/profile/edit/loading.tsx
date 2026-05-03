import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border h-16 border-b">
        <div className="mx-auto flex h-full max-w-2xl items-center justify-between px-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="size-9 rounded-full" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
          ))}
          <div className="flex gap-2">
            <Skeleton className="h-11 w-24 rounded-md" />
            <Skeleton className="h-11 w-32 rounded-md" />
          </div>
        </div>
      </main>
    </div>
  );
}
