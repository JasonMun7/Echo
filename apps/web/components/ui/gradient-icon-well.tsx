"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type GradientIconWellProps = {
  children: ReactNode;
  /** Outer box, e.g. h-9 w-9 or h-10 w-10 */
  className?: string;
  /** Inner white plate (default: flex center, rounded slightly smaller than outer) */
  innerClassName?: string;
};

/**
 * 1px cyan → lavender → ink gradient ring around icon wells (add-step picker, etc.).
 */
export function GradientIconWell({ children, className, innerClassName }: GradientIconWellProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-[#21C4DD] from-10% via-[#A577FF] to-[#150A35] p-px shadow-sm",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-full items-center justify-center rounded-[7px] bg-white",
          innerClassName,
        )}
      >
        {children}
      </span>
    </span>
  );
}
