"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Workflow } from "lucide-react";
import {
  IconCopy,
  IconDots,
  IconList,
  IconLoader,
  IconLogout,
  IconPencil,
  IconPlayerPlay,
  IconTrash,
  IconX,
} from "@tabler/icons-react";

import { brandfetchLogoUrlForDomain } from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GradientIconWell, gradientWellImageClass } from "@/components/ui/gradient-icon-well";
import { ECHO_ICON_BUTTON_CARD_FLOATING_CLASS } from "@/lib/echo-icon-button";
import {
  DASHBOARD_PAGE_DESCRIPTION_CLASS,
  DASHBOARD_PAGE_TITLE_CLASS,
} from "@/lib/dashboard-page-typography";
import { formatWorkflowAbsoluteTime, formatWorkflowListTime } from "@/lib/workflow-timestamps";
import {
  workflowListCardClass,
  workflowSharedTagClass,
  workflowStatusBadgeClass,
  workflowStatusLabel,
} from "@/lib/workflow-status";
import { cn } from "@/lib/utils";

/** Shape used by `/dashboard/workflows` and home “Recent workflows” cards. */
export type DashboardWorkflowListCardModel = {
  id: string;
  name?: string;
  status: string;
  owner_uid?: string;
  thumbnail_gcs_path?: string;
  brand_domain?: string;
  createdAt: unknown;
  updatedAt: unknown;
  shared_with?: string[];
  collaborator_roles?: Record<string, string>;
};

export function canEditSharedWorkflow(
  w: DashboardWorkflowListCardModel,
  uid: string | null | undefined,
): boolean {
  if (!uid) return false;
  if (w.owner_uid === uid) return true;
  if (!Array.isArray(w.shared_with) || !w.shared_with.includes(uid)) return false;
  return w.collaborator_roles?.[uid] !== "viewer";
}

/**
 * List cards use Brandfetch (workflow `brand_domain`) only — no workflow thumbnail hero,
 * so the grid stays consistent and thumbnails remain for detail/editor surfaces.
 */
function WorkflowCardMedia({ brand_domain }: { brand_domain?: string }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const onLogoError = useCallback(() => setLogoFailed(true), []);

  const mediaShell = "relative h-28 w-full shrink-0 overflow-hidden rounded-t-xl";

  const domain = typeof brand_domain === "string" ? brand_domain.trim() : "";
  const logoUrl = domain && !logoFailed ? brandfetchLogoUrlForDomain(domain) : null;

  if (logoUrl) {
    return (
      <div
        className={cn(
          mediaShell,
          "flex items-center justify-center bg-linear-to-br from-muted/70 to-muted/25 dark:from-muted/40 dark:to-muted/15",
        )}
      >
        <GradientIconWell corners="xl" className="h-16 w-16">
          {/* eslint-disable-next-line @next/next/no-img-element -- Brandfetch CDN */}
          <img
            src={logoUrl}
            alt=""
            className={gradientWellImageClass("xl")}
            onError={onLogoError}
          />
        </GradientIconWell>
      </div>
    );
  }

  return (
    <div
      className={cn(
        mediaShell,
        "flex items-center justify-center bg-linear-to-br from-muted/70 to-muted/25 dark:from-muted/40 dark:to-muted/15",
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Workflow className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} />
      </div>
    </div>
  );
}

export type DashboardWorkflowListCardProps = {
  workflow: DashboardWorkflowListCardModel;
  authUid: string | null;
  isFeatured: boolean;
  activeWorkflowId: string | null;
  onRun: (e: React.MouseEvent, workflowId: string) => void;
  runBusyWorkflowId: string | null;
  onRequestDelete: (e: React.MouseEvent, workflowId: string) => void;
  deleteBusyWorkflowId: string | null;
  onFork: (e: React.MouseEvent, workflowId: string) => void;
  forkBusyWorkflowId: string | null;
  onLeave: (e: React.MouseEvent, workflowId: string) => void;
  leaveBusyWorkflowId: string | null;
};

/**
 * Workflow tile used on `/dashboard/workflows` and the dashboard home “Recent workflows” grid
 * so layout, media, status row, time, kebab, and running/featured chrome stay identical.
 */
export function DashboardWorkflowListCard({
  workflow: w,
  authUid,
  isFeatured,
  activeWorkflowId,
  onRun,
  runBusyWorkflowId,
  onRequestDelete,
  deleteBusyWorkflowId,
  onFork,
  forkBusyWorkflowId,
  onLeave,
  leaveBusyWorkflowId,
}: DashboardWorkflowListCardProps) {
  const isOwner = Boolean(authUid && String(w.owner_uid ?? "") === authUid);
  const couldEdit = canEditSharedWorkflow(w, authUid);
  const isRunning = activeWorkflowId === w.id;
  const activityLabel = formatWorkflowListTime(w.updatedAt, w.createdAt);
  const activityTitle = formatWorkflowAbsoluteTime(w.updatedAt, w.createdAt);

  return (
    <div
      className={`relative rounded-xl transition-all ${isRunning ? "bg-linear-to-r from-[#21C4DD] to-[#A577FF] p-[2px] shadow-lg shadow-[#A577FF]/25" : ""}`}
    >
      {isFeatured ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="absolute -right-1 -top-1 z-10 echo-indicator-flash-dot"
              onClick={(e) => e.preventDefault()}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom">Most recently updated workflow</TooltipContent>
        </Tooltip>
      ) : null}
      <div
        className={cn(
          workflowListCardClass,
          "overflow-visible",
          isFeatured && !isRunning && "shadow-xl shadow-black/[0.12] dark:shadow-black/50",
        )}
      >
        <div
          className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.preventDefault()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(ECHO_ICON_BUTTON_CARD_FLOATING_CLASS, "cursor-pointer")}
                aria-label="Workflow actions"
              >
                <IconDots className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem
                onClick={(e) => onRun(e, w.id)}
                disabled={
                  runBusyWorkflowId === w.id || (w.status !== "ready" && w.status !== "active")
                }
              >
                <IconPlayerPlay className="h-4 w-4" />
                {runBusyWorkflowId === w.id ? "Starting…" : "Run"}
              </DropdownMenuItem>
              {couldEdit ? (
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/workflows/${w.id}/edit`}>
                    <IconPencil className="h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/workflows/${w.id}`}>
                  <IconList className="h-4 w-4" />
                  {isOwner ? "Details and share" : "Details"}
                </Link>
              </DropdownMenuItem>
              {isOwner ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => onRequestDelete(e, w.id)}
                  disabled={deleteBusyWorkflowId === w.id}
                >
                  <IconTrash className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem
                    onClick={(e) => onFork(e, w.id)}
                    disabled={forkBusyWorkflowId === w.id}
                  >
                    <IconCopy className="h-4 w-4" />
                    {forkBusyWorkflowId === w.id ? "Copying…" : "Make a copy"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={(e) => onLeave(e, w.id)}
                    disabled={leaveBusyWorkflowId === w.id}
                  >
                    <IconLogout className="h-4 w-4" />
                    {leaveBusyWorkflowId === w.id ? "Leaving…" : "Leave"}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Link
          href={
            w.status === "draft" || w.status === "processing"
              ? `/dashboard/workflows/${w.id}/edit`
              : `/dashboard/workflows/${w.id}`
          }
          className="flex flex-1 cursor-pointer flex-col"
        >
          <WorkflowCardMedia brand_domain={w.brand_domain} />

          <div className="flex flex-1 flex-col gap-2 px-4 pt-4 pb-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {!isOwner ? (
                <span className={workflowSharedTagClass} title="This workflow was shared with you">
                  Shared
                </span>
              ) : null}
              <span className={workflowStatusBadgeClass(w.status)}>
                {workflowStatusLabel(w.status)}
              </span>
            </div>
            <span className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-foreground">
              {w.name ?? "Untitled workflow"}
            </span>
            {activityLabel ? (
              <span
                className="text-xs tabular-nums leading-snug text-muted-foreground"
                title={activityTitle || undefined}
              >
                {activityLabel}
              </span>
            ) : null}
          </div>
        </Link>
      </div>
      {isRunning ? (
        <div className="absolute -right-1 -top-1 z-10 flex items-center gap-1 rounded-full bg-linear-to-r from-[#21C4DD] to-[#A577FF] px-2 py-0.5 text-[10px] font-medium text-white shadow-sm ring-2 ring-card">
          Running
        </div>
      ) : null}
    </div>
  );
}

export function DeleteWorkflowConfirmDialog({
  open,
  onOpenChange,
  workflowDisplayName,
  deleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowDisplayName: string;
  deleting: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-xl sm:max-w-md",
        )}
      >
        <div className="border-b border-border/60 px-6 pt-6 pb-5">
          <div className="flex gap-3">
            <GradientIconWell corners="lg" className="size-10 shrink-0">
              <IconTrash className="size-5 text-card-foreground" stroke={1.5} aria-hidden />
            </GradientIconWell>
            <div className="min-w-0 flex-1 space-y-2 text-left">
              <DialogTitle className={cn(DASHBOARD_PAGE_TITLE_CLASS, "text-card-foreground")}>
                Delete this workflow?
              </DialogTitle>
              <DialogDescription className={cn(DASHBOARD_PAGE_DESCRIPTION_CLASS, "text-left")}>
                This permanently removes &quot;{workflowDisplayName}&quot; and its steps. You cannot
                undo this action.
              </DialogDescription>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 border-t border-border/60 bg-card px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="border-border"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            <IconX className="size-4 shrink-0" stroke={1.5} />
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={() => void onConfirm()}
          >
            {deleting ? (
              <>
                <IconLoader className="size-4 shrink-0 animate-spin" stroke={1.5} aria-hidden />
                Deleting…
              </>
            ) : (
              <>
                <IconTrash className="size-4 shrink-0" stroke={1.5} aria-hidden />
                Delete workflow
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
