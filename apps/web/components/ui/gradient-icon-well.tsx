"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type GradientIconWellProps = {
  children: ReactNode;
  /** Outer box, e.g. h-9 w-9 or h-10 w-10 */
  className?: string;
  /** Inner plate (default: theme card surface; radius = outer − 1px so the gradient ring stays visible at corners) */
  innerClassName?: string;
  /**
   * Outer corner radius. Inner uses outer − 1px (concentric) so the 1px gradient is not clipped at corners.
   * Avoid `overflow-hidden` on the outer wrapper — use `innerClassName` for clipping content.
   */
  corners?: "lg" | "xl" | "full";
};

const CORNER_SHELL: Record<NonNullable<GradientIconWellProps["corners"]>, string> = {
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

/** Inner radius = outer − 1px at each corner (Tailwind `lg` = 8px, `xl` = 12px). `full` = circular avatars. */
const CORNER_INSET: Record<NonNullable<GradientIconWellProps["corners"]>, string> = {
  lg: "rounded-[7px]",
  xl: "rounded-[11px]",
  full: "rounded-full",
};

/**
 * Use on Brandfetch (or other raster) `<img>` inside {@link GradientIconWell} so the asset follows the
 * inner plate radius (same as {@link CORNER_INSET}) and does not look cut off at the corners.
 * Pair with the same `corners` value as the well (`lg` vs `xl` vs `full`).
 */
export function gradientWellImageClass(corners: "lg" | "xl" | "full" = "xl"): string {
  return cn(
    "block h-full w-full min-h-0 min-w-0 object-contain",
    corners === "full" && "object-cover",
    CORNER_INSET[corners],
  );
}

/** Ring gradient — `var(--echo-icon-well-from|to)` in globals (light vs `.dark`). */
const WELL_GRADIENT =
  "bg-[linear-gradient(to_right,var(--echo-icon-well-from),var(--echo-icon-well-to))]";
const WELL_SHADOW = "shadow-sm dark:shadow-md dark:shadow-black/25";

/**
 * 1px ring using DESIGN_SYSTEM **Cyan → Lavender** (`--echo-icon-well-*`), inner plate follows **card** for theme.
 */
export function GradientIconWell({
  children,
  className,
  innerClassName,
  corners = "xl",
}: GradientIconWellProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center p-px",
        WELL_GRADIENT,
        WELL_SHADOW,
        CORNER_SHELL[corners],
        className,
      )}
    >
      <span
        className={cn(
          "flex size-full items-center justify-center overflow-hidden bg-card text-card-foreground",
          CORNER_INSET[corners],
          innerClassName,
        )}
      >
        {children}
      </span>
    </span>
  );
}

type GradientIconTagProps = {
  children: ReactNode;
  className?: string;
  /** Inner plate (default theme card + card foreground). */
  innerClassName?: string;
  size?: "sm" | "md";
};

const TAG_SIZE: Record<NonNullable<GradientIconTagProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-[10px] font-semibold leading-none tracking-tight",
  md: "px-2.5 py-1 text-xs font-semibold leading-none tracking-tight",
};

/**
 * Pill / tag with the same **Cyan → Lavender** ring as {@link GradientIconWell}.
 */
export function GradientIconTag({
  children,
  className,
  innerClassName,
  size = "md",
}: GradientIconTagProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-stretch rounded-full p-px",
        WELL_GRADIENT,
        WELL_SHADOW,
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex min-w-0 max-w-full items-center justify-center rounded-full bg-card text-card-foreground",
          TAG_SIZE[size],
          innerClassName,
        )}
      >
        {children}
      </span>
    </span>
  );
}
