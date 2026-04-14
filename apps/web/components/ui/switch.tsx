"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background ring-0 transition-transform duration-200 ease-out",
          "group-data-[state=checked]/switch:bg-white dark:group-data-[state=checked]/switch:bg-primary-foreground",
          "dark:data-[state=unchecked]:bg-foreground",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
          /* Root carries `data-state`; thumb follows via `group/switch` (thumb often has no data-state). */
          "translate-x-[3px] group-data-[state=unchecked]/switch:translate-x-[3px]",
          size === "sm"
            ? "group-data-[state=checked]/switch:translate-x-[11px]"
            : "group-data-[state=checked]/switch:translate-x-[15px]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
