"use client";

import type { ComponentType, ReactNode } from "react";
import Threads from "@/components/threads";
import { cn } from "@/lib/utils";

type IconComp = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export type DashboardEmptyStateProps = {
  title: string;
  description?: string;
  icon?: IconComp;
  /** Optional actions (primary button, menus). */
  children?: ReactNode;
  /** Minimum height for the dashed region (default suits compact lists). */
  minHeightClass?: string;
  className?: string;
};

/**
 * Standard empty state: dashed border, muted Threads background, icon well, title + description.
 */
export function DashboardEmptyState({
  title,
  description,
  icon: Icon,
  minHeightClass = "min-h-[220px]",
  children,
  className,
}: DashboardEmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-dashed border-border bg-card/80",
        "shadow-md shadow-black/[0.06] backdrop-blur-[2px] dark:bg-card/60 dark:shadow-black/30",
        minHeightClass,
        className,
      )}
    >
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <Threads
          color={[165 / 255, 119 / 255, 255 / 255]}
          amplitude={1.3}
          distance={0.3}
          enableMouseInteraction={false}
        />
      </div>
      <div className="relative z-[1] flex flex-col items-center gap-3 px-6 py-10 text-center">
        {Icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Icon className="h-6 w-6 text-[#0891b2]" aria-hidden />
          </div>
        ) : null}
        <h2 className="font-medium text-foreground">{title}</h2>
        {description ? <p className="max-w-md text-sm text-foreground/70">{description}</p> : null}
        {children}
      </div>
    </div>
  );
}
