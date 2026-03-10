import { Skeleton } from "@/components/ui/skeleton";

export default function MarketingLoading() {
  return (
    <div className="min-h-[60vh] bg-[#F5F7FC] px-4 py-12 md:px-8 md:py-20">
      <div className="mx-auto max-w-7xl space-y-12">
        <div className="space-y-4">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-10 w-full max-w-xl rounded-lg md:h-12" />
          <Skeleton className="h-6 w-full max-w-2xl rounded-lg" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
