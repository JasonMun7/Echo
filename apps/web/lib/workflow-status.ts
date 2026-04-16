import { cn } from "@/lib/utils";

/** Emphasized list / panel card — neutral border + shadow elevation (see DESIGN_SYSTEM; no tinted card borders). */
export const workflowShellClass = cn(
  "rounded-xl border border-border bg-card text-card-foreground",
  "shadow-md shadow-black/[0.08] dark:shadow-black/35",
);

export const workflowListCardClass = cn(
  "group relative flex h-full flex-col overflow-hidden transition-[box-shadow,border-color]",
  workflowShellClass,
  "hover:shadow-lg hover:shadow-black/[0.11] dark:hover:shadow-black/45",
);

const LABELS: Record<string, string> = {
  draft: "Draft",
  processing: "Building",
  ready: "Ready",
  active: "Enabled",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function workflowStatusLabel(status: string | undefined | null): string {
  if (!status) return "Unknown";
  return LABELS[status] ?? status.replace(/_/g, " ");
}

/** Violet pill for workflows shared with the current user (not owned by them). */
export const workflowSharedTagClass = cn(
  "inline-flex shrink-0 items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium leading-none text-violet-900 ring-1 ring-violet-600/15 dark:bg-violet-950/50 dark:text-violet-100 dark:ring-violet-500/25",
);

export function workflowStatusBadgeClass(status: string | undefined | null): string {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-none";
  switch (status) {
    case "ready":
    case "active":
      return cn(
        base,
        "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/15 dark:bg-emerald-950/55 dark:text-emerald-200 dark:ring-emerald-500/25",
      );
    case "processing":
      return cn(
        base,
        "bg-muted text-violet-800 ring-1 ring-cyan-500/25 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-cyan-400/20",
      );
    case "failed":
      return cn(
        base,
        "bg-red-50 text-red-800 ring-1 ring-red-600/15 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-500/25",
      );
    case "draft":
      return cn(base, "bg-muted text-muted-foreground ring-1 ring-border/60");
    case "cancelled":
      return cn(base, "bg-muted text-muted-foreground ring-1 ring-border/60");
    default:
      return cn(base, "bg-muted text-muted-foreground ring-1 ring-border/60");
  }
}
