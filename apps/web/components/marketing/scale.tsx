import { cn } from "@/lib/utils";

export const Scale = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 m-auto h-full w-full rounded-lg border border-[#A577FF]/20 bg-white bg-[image:repeating-linear-gradient(315deg,_rgba(165,119,255,0.15)_0,_rgba(165,119,255,0.15)_1px,_transparent_0,_transparent_50%)] bg-[length:10px_10px]",
        className
      )}
    />
  );
};
