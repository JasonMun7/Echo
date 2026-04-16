"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Neutral “native” switch — fixed gray track/thumb only (`neutral-*`).
 * Does not use `--primary`, `--foreground`, or other semantic colors so every instance looks the same.
 */
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
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-border focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=unchecked]:bg-neutral-200 dark:data-[state=unchecked]:bg-neutral-600",
        "data-[state=checked]:bg-neutral-900 dark:data-[state=checked]:bg-neutral-300",
        "data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-out",
          "dark:group-data-[state=unchecked]/switch:bg-neutral-100",
          "dark:group-data-[state=checked]/switch:bg-neutral-900",
          "group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3",
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
