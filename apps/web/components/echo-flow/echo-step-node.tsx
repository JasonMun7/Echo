"use client";

import { memo, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertCircle, CopyPlus, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { useEchoStepNodeActions } from "@/components/echo-flow/echo-step-node-actions-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { brandfetchLogoUrlForDomain } from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import { WorkflowActionIcon } from "@/lib/workflow-action-icons";
import { GradientIconWell, gradientWellImageClass } from "@/components/ui/gradient-icon-well";
import { useEchoReorderPreview } from "@/components/echo-flow/echo-flow-reorder-context";
import { ECHO_FLOW_LAYOUT } from "@/lib/echo-flow-graph";
import type { PeerPresenceAccent } from "@/lib/peer-presence-color";
import { cn } from "@/lib/utils";

export type EchoStepNodeData = {
  action: string;
  label: string;
  subtitle?: string;
  stepId: string;
  stepNumber: number;
  badgeLabel: string;
  isApiCall?: boolean;
  composioSlug?: string | null;
  /** Persisted website domain for Brandfetch logo (open_app / focus_app). */
  openAppBrandDomain?: string | null;
  /** While dragging to reorder: projected 1-based position (Y-sort). */
  previewOrder?: number;
  reorderPreviewActive?: boolean;
  isReorderDragTarget?: boolean;
  /** Missing required fields for publish */
  invalidForPublish?: boolean;
  /** Recently added step — subtle highlight until configured */
  isNewStep?: boolean;
  /** Local edits not yet persisted */
  isDirtyStep?: boolean;
  /** Another collaborator is focused on / locking / dragging this step — matches their cursor hue. */
  remotePeerAccent?: PeerPresenceAccent;
};

function EchoStepNodeInner({ data, selected }: NodeProps) {
  const d = data as EchoStepNodeData;
  const [openAppLogoFailed, setOpenAppLogoFailed] = useState(false);
  const openAppLogoUrl =
    (d.action === "open_app" || d.action === "focus_app") && d.openAppBrandDomain
      ? brandfetchLogoUrlForDomain(d.openAppBrandDomain)
      : null;
  useEffect(() => {
    setOpenAppLogoFailed(false);
  }, [d.openAppBrandDomain]);
  const stepActions = useEchoStepNodeActions();
  const {
    previewOrder: ctxPreview,
    reorderActive,
    isDragTarget: ctxDragTarget,
  } = useEchoReorderPreview(d.stepId);
  const displayStep = ctxPreview ?? d.previewOrder ?? d.stepNumber;
  const orderWillChange = Boolean(
    reorderActive && ctxPreview != null && ctxPreview !== d.stepNumber,
  );
  const showDragStyle = ctxDragTarget || d.isReorderDragTarget;
  const peerAccent = !d.invalidForPublish ? d.remotePeerAccent : undefined;

  return (
    <div
      style={{
        height: ECHO_FLOW_LAYOUT.nodeSlotHeight,
        ...(peerAccent && !showDragStyle
          ? {
              borderColor: peerAccent.stroke,
              backgroundImage: `linear-gradient(180deg, #ffffff 0%, ${peerAccent.pillBg} 95%)`,
              boxShadow: `0 0 0 2px ${peerAccent.stroke}, 0 10px 28px -8px ${peerAccent.softRing}`,
            }
          : undefined),
      }}
      className={cn(
        "box-border flex w-[min(100vw-2rem,300px)] max-w-[300px] flex-col rounded-[10px] border bg-white px-4 py-3 shadow-[0_2px_12px_-2px_rgba(15,23,42,0.12)] transition-[box-shadow,border-color,transform,opacity,background-image]",
        reorderActive && !showDragStyle && "opacity-[0.92]",
        peerAccent && !showDragStyle && "z-[6]",
        d.invalidForPublish
          ? "z-[5] border-red-400/90 shadow-[0_4px_20px_-4px_rgba(239,68,68,0.25)] ring-2 ring-red-400/30"
          : showDragStyle
            ? "z-10 scale-[1.02] border-violet-400/90 shadow-[0_8px_28px_-6px_rgba(124,58,237,0.35)] ring-2 ring-violet-400/25"
            : d.isNewStep || d.isDirtyStep
              ? "border-amber-300/90 shadow-[0_4px_18px_-4px_rgba(245,158,11,0.2)] ring-2 ring-amber-300/35"
              : selected
                ? "border-[#6366f1] shadow-[0_4px_20px_-4px_rgba(99,102,241,0.35)] ring-2 ring-[#6366f1]/20"
                : "border-slate-200/90 shadow-sm hover:border-slate-300/90",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!h-2 !w-2 !border-0 !bg-[#6366f1]"
      />
      <div className="flex min-h-0 flex-1 items-start justify-between gap-2">
        <div className="flex min-h-0 min-w-0 flex-1 items-start gap-2">
          {d.invalidForPublish ? (
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
              strokeWidth={2}
              aria-hidden
            />
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <GradientIconWell
                corners="lg"
                className="h-8 w-8 shrink-0"
                innerClassName="overflow-hidden"
              >
                {openAppLogoUrl && !openAppLogoFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Brandfetch Logo API hotlink
                  <img
                    src={openAppLogoUrl}
                    alt=""
                    width={32}
                    height={32}
                    className={gradientWellImageClass("lg")}
                    onError={() => setOpenAppLogoFailed(true)}
                  />
                ) : (
                  <WorkflowActionIcon
                    action={d.action}
                    composioSlug={d.composioSlug}
                    className="h-5 w-5 text-card-foreground"
                  />
                )}
              </GradientIconWell>
              <span
                className={cn(
                  "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-none tracking-tight",
                  d.isApiCall
                    ? "border-amber-200/90 bg-amber-50/90 text-amber-950"
                    : "border-slate-200/90 bg-slate-50 text-slate-800",
                )}
              >
                <span className="truncate">{d.badgeLabel}</span>
              </span>
              {d.isNewStep && !d.invalidForPublish ? (
                <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                  New
                </span>
              ) : null}
              {d.isDirtyStep && !d.invalidForPublish ? (
                <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                  Unsaved
                </span>
              ) : null}
            </div>
            <div className="mt-3 min-h-0 flex-1 border-t border-slate-100 pt-2.5">
              <p className="text-[15px] font-semibold leading-snug tracking-tight text-slate-900">
                <span
                  className={cn(
                    "tabular-nums transition-colors",
                    orderWillChange ? "font-bold text-violet-600" : "text-slate-400",
                  )}
                >
                  {displayStep}.
                </span>{" "}
                <span>{d.label}</span>
              </p>
              {d.subtitle?.trim() ? (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {d.subtitle}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {!stepActions.menuDisabled &&
        (stepActions.onRenameStep || stepActions.onDuplicateStep || stepActions.onDeleteStep) ? (
          <div className="flex shrink-0 items-start">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "nodrag nopan -m-0.5 rounded-md p-1 text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#21C4DD]/40",
                    reorderActive && "text-violet-500 hover:text-violet-600",
                  )}
                  aria-label="Step actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="nodrag nopan min-w-[10rem]"
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                {stepActions.onRenameStep ? (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => stepActions.onRenameStep?.(d.stepId)}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                    Rename
                  </DropdownMenuItem>
                ) : null}
                {stepActions.onDuplicateStep ? (
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => stepActions.onDuplicateStep?.(d.stepId)}
                  >
                    <CopyPlus className="h-4 w-4" aria-hidden />
                    Duplicate
                  </DropdownMenuItem>
                ) : null}
                {stepActions.onDeleteStep ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      className="cursor-pointer"
                      onSelect={() => stepActions.onDeleteStep?.(d.stepId)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Delete
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!h-2 !w-2 !border-0 !bg-[#6366f1]"
      />
    </div>
  );
}

export const EchoStepNode = memo(EchoStepNodeInner);
