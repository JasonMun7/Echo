import { cn } from "@/lib/utils";

/** Matches integration-card elevated surface */
export const workflowShellClass =
  "echo-card rounded-xl border border-[#A577FF]/20 bg-white shadow-sm shadow-[0_1px_0_0_rgba(165,119,255,0.12)] ring-1 ring-[#A577FF]/8";

export const workflowListCardClass = cn(
  "group relative flex h-full flex-col overflow-hidden transition-all",
  workflowShellClass,
  "hover:border-[#A577FF]/32 hover:shadow-[0_2px_8px_-2px_rgba(165,119,255,0.18)]",
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

export function workflowStatusBadgeClass(status: string | undefined | null): string {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-none";
  switch (status) {
    case "ready":
    case "active":
      return cn(base, "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/15");
    case "processing":
      return cn(base, "bg-[#F5F3FF] text-[#6d28d9] ring-1 ring-[#A577FF]/25");
    case "failed":
      return cn(base, "bg-red-50 text-red-800 ring-1 ring-red-600/15");
    case "draft":
      return cn(base, "bg-[#f3f4f6] text-[#6b7280]");
    case "cancelled":
      return cn(base, "bg-[#f3f4f6] text-[#6b7280]");
    default:
      return cn(base, "bg-[#f3f4f6] text-[#6b7280]");
  }
}
