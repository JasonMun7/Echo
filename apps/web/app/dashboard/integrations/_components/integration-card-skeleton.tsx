import { Skeleton } from "@/components/ui/skeleton";

/** Matches the layout of `IntegrationCard` (avatar row + footer). */
export function IntegrationCardSkeleton() {
  return (
    <div className="echo-card flex flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-4 w-28 max-w-[70%]" />
            <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full max-w-[92%]" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-2.5">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
      </div>
    </div>
  );
}
