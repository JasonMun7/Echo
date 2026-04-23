"use client";

import Link from "next/link";
import {
  IconArrowLeft,
  IconCopy,
  IconDots,
  IconList,
  IconPencil,
  IconPlayerPlay,
  IconShare,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  workflowSharedTagClass,
  workflowShellClass,
  workflowStatusBadgeClass,
  workflowStatusLabel,
} from "@/lib/workflow-status";
import { DASHBOARD_PAGE_TITLE_SM_CLASS } from "@/lib/dashboard-page-typography";
import {
  echoIconButtonGhostCircleClassName,
  echoIconButtonGhostClassName,
} from "@/lib/echo-icon-button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type WorkflowPageHeaderVariant = "detail" | "edit" | "run";

export type WorkflowPageHeaderProps = {
  workflowId: string;
  /** Resolved display title (usually `name` or id fallback). */
  workflowTitle: string;
  workflowStatus: string | undefined;
  isOwner: boolean;
  canEditWorkflow: boolean;
  variant: WorkflowPageHeaderVariant;
  backHref: string;
  backTooltip: string;
  /** When true, main title uses in-card heading typography (`DASHBOARD_PAGE_TITLE_SM_CLASS`). */
  titleAsPageHeading?: boolean;
  /** Optional one line under the title (e.g. run page context). */
  subtitle?: string;
  /** Optional content below the main header row (badges, alerts). */
  belowRow?: ReactNode;
  className?: string;
  /** Persist workflow display name on blur / Enter (same pattern as step rename). */
  onSaveWorkflowTitle?: (trimmed: string) => void | Promise<void>;
  titleSaveDisabled?: boolean;
  onRunWorkflow?: () => void;
  runWorkflowDisabled?: boolean;
  runWorkflowPending?: boolean;
  onOpenShare?: () => void;
  onFork?: () => void;
  forking?: boolean;
  onRequestDeleteWorkflow?: () => void;
  deleteWorkflowPending?: boolean;
  /** Accessible label for the kebab trigger. */
  menuAriaLabel?: string;
};

/** Same rounded shell as the workflow detail hero card (`workflowShellClass` + padding). */
export function WorkflowPageHeaderShell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn(workflowShellClass, "p-2 sm:p-3", className)}>{children}</div>;
}

export type WorkflowPageHeaderSkeletonProps = {
  className?: string;
  /** Run / detail line under the title row. */
  showSubtitle?: boolean;
  /** Block where alerts / `belowRow` content appears when loaded. */
  showBelowRow?: boolean;
  /** Extra pill next to status (e.g. “Shared”). */
  showSharedPill?: boolean;
};

/**
 * Placeholder that mirrors {@link WorkflowPageHeader} layout (back, title + pencil, status, menu).
 * Wrap with {@link WorkflowPageHeaderShell} the same way as the real header.
 */
export function WorkflowPageHeaderSkeleton({
  className,
  showSubtitle = false,
  showBelowRow = false,
  showSharedPill = false,
}: WorkflowPageHeaderSkeletonProps) {
  return (
    <div className={cn(className)} aria-busy aria-label="Loading workflow header">
      <div className="flex items-center gap-2 md:gap-3">
        <Skeleton className="size-8 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3 md:gap-5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Skeleton className="h-8 w-[clamp(10rem,38vw,18rem)] max-w-[min(100%,20rem)] min-w-0 shrink rounded-md sm:h-9" />
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Skeleton className="h-6 w-[5.5rem] shrink-0 rounded-full" />
              {showSharedPill ? (
                <Skeleton className="h-6 w-[3.25rem] shrink-0 rounded-full" />
              ) : null}
              <Skeleton className="size-8 shrink-0 rounded-full" />
            </div>
          </div>
          {showSubtitle ? (
            <Skeleton className="mt-2 h-4 w-[min(100%,18rem)] max-w-md rounded-md" />
          ) : null}
        </div>
      </div>
      {showBelowRow ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-40 rounded-md" />
          <Skeleton className="h-3 w-full max-w-xl rounded-md" />
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowPageHeader({
  workflowId,
  workflowTitle,
  workflowStatus,
  isOwner,
  canEditWorkflow,
  variant,
  backHref,
  backTooltip,
  titleAsPageHeading = false,
  subtitle,
  belowRow,
  className,
  onSaveWorkflowTitle,
  titleSaveDisabled,
  onRunWorkflow,
  runWorkflowDisabled,
  runWorkflowPending,
  onOpenShare,
  onFork,
  forking,
  onRequestDeleteWorkflow,
  deleteWorkflowPending,
  menuAriaLabel = "Workflow actions",
}: WorkflowPageHeaderProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(workflowTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editingTitle) {
      queueMicrotask(() => setDraftTitle(workflowTitle));
    }
  }, [workflowTitle, editingTitle]);

  const commitTitle = async () => {
    if (!onSaveWorkflowTitle || titleSaveDisabled) {
      setEditingTitle(false);
      return;
    }
    const trimmed = draftTitle.trim();
    const prev = (workflowTitle || "").trim();
    if (trimmed !== prev) {
      await onSaveWorkflowTitle(trimmed);
    }
    setEditingTitle(false);
  };

  const cancelTitleEdit = () => {
    setDraftTitle(workflowTitle);
    setEditingTitle(false);
  };

  const status = workflowStatus ?? "unknown";
  const showViewWorkflow = variant !== "detail";
  const showEditLink = variant !== "edit" && canEditWorkflow;
  const headingTypographyOnly = cn(
    "min-w-0 break-words leading-snug",
    DASHBOARD_PAGE_TITLE_SM_CLASS,
  );
  const headingTitleClass = cn(headingTypographyOnly, "min-w-0");
  const compactTitleTextClass =
    "min-w-0 max-w-full cursor-default truncate py-0.5 text-left text-sm font-semibold leading-snug tracking-tight text-foreground hover:cursor-text md:text-[15px]";

  const titleEditPencil =
    onSaveWorkflowTitle && canEditWorkflow && !editingTitle ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={echoIconButtonGhostClassName("shrink-0")}
            aria-label="Rename workflow"
            onClick={(e) => {
              e.preventDefault();
              setDraftTitle(workflowTitle);
              setEditingTitle(true);
              queueMicrotask(() => inputRef.current?.focus());
            }}
          >
            <IconPencil className="h-3.5 w-3.5" stroke={1.5} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Rename workflow</TooltipContent>
      </Tooltip>
    ) : null;

  const titleOnly =
    onSaveWorkflowTitle && canEditWorkflow ? (
      editingTitle ? (
        <input
          ref={inputRef}
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={() => void commitTitle()}
          disabled={titleSaveDisabled}
          className={cn(
            "field-sizing-content max-w-full min-w-[12ch] rounded-md border border-border bg-background px-2 py-1 outline-none focus:ring-2 focus:ring-ring/35",
            titleAsPageHeading ? headingTypographyOnly : compactTitleTextClass,
          )}
          placeholder={workflowId}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelTitleEdit();
            }
          }}
          autoFocus
        />
      ) : titleAsPageHeading ? (
        <h1 className="flex w-fit max-w-full min-w-0 items-center gap-1">
          <button
            type="button"
            className={cn(
              headingTypographyOnly,
              "max-w-full shrink truncate bg-transparent text-left hover:cursor-text",
            )}
            title="Double-click to rename"
            onDoubleClick={(e) => {
              e.preventDefault();
              setDraftTitle(workflowTitle);
              setEditingTitle(true);
              queueMicrotask(() => inputRef.current?.focus());
            }}
          >
            {workflowTitle || workflowId}
          </button>
          {titleEditPencil}
        </h1>
      ) : (
        <div className="flex w-fit max-w-full min-w-0 items-center gap-1">
          <button
            type="button"
            className={compactTitleTextClass}
            title="Double-click to rename"
            onDoubleClick={(e) => {
              e.preventDefault();
              setDraftTitle(workflowTitle);
              setEditingTitle(true);
              queueMicrotask(() => inputRef.current?.focus());
            }}
          >
            {workflowTitle || workflowId}
          </button>
          {titleEditPencil}
        </div>
      )
    ) : titleAsPageHeading ? (
      <h1
        className={cn(headingTitleClass, "w-fit max-w-full truncate")}
        title={String(workflowTitle || workflowId)}
      >
        {workflowTitle || workflowId}
      </h1>
    ) : (
      <p
        className="w-fit max-w-full min-w-0 truncate py-0.5 text-sm font-semibold leading-snug tracking-tight text-foreground md:text-[15px]"
        title={String(workflowTitle || workflowId)}
      >
        {workflowTitle || workflowId}
      </p>
    );

  return (
    <div className={cn(className)}>
      <div className="flex items-center gap-2 md:gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={backHref}
              className={echoIconButtonGhostClassName()}
              aria-label={backTooltip}
            >
              <IconArrowLeft className="h-4 w-4" stroke={1.5} aria-hidden />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">{backTooltip}</TooltipContent>
        </Tooltip>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3 md:gap-5">
            <div className="flex min-w-0 flex-1 items-center">{titleOnly}</div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(workflowStatusBadgeClass(status), "shrink-0")}
                title="Workflow status"
              >
                {workflowStatusLabel(status)}
              </span>
              {!isOwner ? (
                <span className={workflowSharedTagClass} title="This workflow was shared with you">
                  Shared
                </span>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={echoIconButtonGhostCircleClassName()}
                    aria-label={menuAriaLabel}
                  >
                    <IconDots className="h-4 w-4" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  {showViewWorkflow ? (
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/workflows/${workflowId}`}>
                        <IconList className="h-4 w-4" />
                        View workflow
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {showEditLink ? (
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/workflows/${workflowId}/edit`}>
                        <IconPencil className="h-4 w-4" />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {onRunWorkflow ? (
                    <DropdownMenuItem
                      onClick={() => onRunWorkflow()}
                      disabled={runWorkflowDisabled}
                    >
                      <IconPlayerPlay className="h-4 w-4" />
                      {runWorkflowPending ? "Starting…" : "Run workflow"}
                    </DropdownMenuItem>
                  ) : null}
                  {canEditWorkflow && onOpenShare ? (
                    <DropdownMenuItem onClick={() => onOpenShare()}>
                      <IconShare className="h-4 w-4" />
                      Share
                    </DropdownMenuItem>
                  ) : null}
                  {!isOwner && onFork ? (
                    <DropdownMenuItem onClick={() => onFork()} disabled={forking}>
                      <IconCopy className="h-4 w-4" />
                      {forking ? "Copying…" : "Make a copy"}
                    </DropdownMenuItem>
                  ) : null}
                  {isOwner && onRequestDeleteWorkflow ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onRequestDeleteWorkflow()}
                      disabled={deleteWorkflowPending}
                    >
                      <IconTrash className="h-4 w-4" />
                      {deleteWorkflowPending ? "Deleting…" : "Delete"}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground md:text-sm">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {belowRow ? <div className="mt-2">{belowRow}</div> : null}
    </div>
  );
}
