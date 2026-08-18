import { Skeleton } from "@/components/ui/skeleton";

export default function RepoLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid h-[28rem] gap-4 lg:grid-cols-[280px_1fr]">
        <Skeleton className="h-full" />
        <Skeleton className="h-full" />
      </div>
    </main>
  );
}
