import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-md bg-[#A577FF]/10 animate-pulse",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
