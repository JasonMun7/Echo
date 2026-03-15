import { cn } from "@/lib/utils";

/**
 * Echo skeleton: primary (Lavender) → secondary (Cyan) shimmer per DESIGN_SYSTEM.md.
 * Use for all loadable content so skeletons are consistent.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md animate-echo-skeleton-shimmer", className)}
      {...props}
    />
  );
}

export { Skeleton };
