import { Skeleton } from "@/components/ui/skeleton";

/** Matches the layout of `IntegrationCard` (avatar + text + footer with link row + switch). */
export function IntegrationCardSkeleton() {
  return (
    <div className="echo-card flex flex-col rounded-xl p-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-4 w-28 max-w-[70%]" />
          <Skeleton className="h-3 w-full max-w-[92%]" />
          <Skeleton className="h-3 w-full max-w-[88%]" />
        </div>
      </div>
      <div className="mt-3 flex min-h-9 items-center justify-between gap-2 border-t border-border pt-2.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
      </div>
    </div>
  );
}
