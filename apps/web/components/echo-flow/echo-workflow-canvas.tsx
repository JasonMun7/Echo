"use client";

import type { MouseEvent, PointerEvent, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node as RFNode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  EchoFlowCanvasActionsContext,
  type EchoFlowCanvasActionsContextValue,
} from "@/components/echo-flow/echo-flow-canvas-actions-context";
import {
  EchoStepNodeActionsContext,
  type EchoStepNodeActionsContextValue,
} from "@/components/echo-flow/echo-step-node-actions-context";
import {
  EchoReorderPreviewContext,
  type EchoReorderPreviewState,
} from "@/components/echo-flow/echo-flow-reorder-context";
import { EchoInsertStepEdge } from "@/components/echo-flow/echo-insert-step-edge";
import { EchoRemoteReorderGhostOverlay } from "@/components/echo-flow/echo-remote-reorder-ghosts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EchoStepNode, type EchoStepNodeData } from "./echo-step-node";
import type { EchoPersistedFlow } from "@/lib/echo-flow-graph";
import {
  buildNodesAndEdges,
  chainEdgesFromOrderedIds,
  echoStepCardLabel,
  ECHO_FLOW_EDGE_STROKE,
  ECHO_FLOW_LAYOUT,
} from "@/lib/echo-flow-graph";
import { formatAction } from "@/lib/workflow-action-labels";
import { formatContextForDisplay } from "@/lib/context-prompt-tokens";
import { normalizeContextAttachments } from "@/lib/workflow-step-context-attachments";
import type { PeerPresenceAccent } from "@/lib/peer-presence-color";
import type {
  CanvasPointerReport,
  ReorderPresenceState,
} from "@/hooks/use-workflow-presence-pointers";

const nodeTypes = { echoStep: EchoStepNode };
const edgeTypes = { echoInsert: EchoInsertStepEdge };

const EMPTY_STEP_ID_SET = new Set<string>();

function isEchoStepNode(n: RFNode): boolean {
  return Boolean((n.data as EchoStepNodeData | undefined)?.stepId);
}

function omitReorderPreviewFields(data: EchoStepNodeData): EchoStepNodeData {
  const copy = { ...data };
  delete copy.previewOrder;
  delete copy.reorderPreviewActive;
  delete copy.isReorderDragTarget;
  return copy;
}

type Step = {
  id: string;
  order: number;
  action: string;
  context: string;
  params?: Record<string, unknown>;
  context_attachments?: unknown;
};

export type EchoWorkflowCanvasHandle = {
  fitViewToStep: (stepId: string) => void;
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Pan/zoom the canvas so the given graph coordinates are centered (e.g. follow a collaborator). */
  centerOnFlowCoordinates: (flowX: number, flowY: number) => void;
};

type InnerProps = {
  workflowId: string;
  steps: Step[];
  persistedGraph: EchoPersistedFlow | null;
  /** @deprecated No longer used — canvas layout is not persisted via API. */
  onGraphChange?: (g: EchoPersistedFlow) => void;
  /** Persist new step order after the user drags nodes vertically (API should update `order`). */
  onReorderSteps?: (orderedStepIds: string[]) => void | Promise<unknown>;
  /** Add a step on the connector between two steps (opens action picker in parent). */
  onInsertStepBetween?: EchoFlowCanvasActionsContextValue["onInsertStepBetween"];
  onSelectStep: (id: string | null) => void;
  lockedStepId?: string | null;
  lockOwnerLabel?: string | null;
  /** Rendered inside the canvas frame, bottom-centered (e.g. floating dock). */
  dock?: ReactNode;
  /** Optional layer above the graph, below the dock (e.g. remote pointers). */
  collaborationOverlay?: ReactNode;
  /** Step inspector / editor anchored inside the canvas frame (e.g. docked panel). */
  stepInspector?: ReactNode;
  /** Pointer position: card-normalized + React Flow graph coords (for peers’ viewports). */
  onCanvasPointerMove?: (report: CanvasPointerReport) => void;
  /** Broadcast live reorder drag to peers (Firestore presence). */
  onReorderPresence?: (state: ReorderPresenceState) => void;
  /** Steps that fail publish validation — red treatment on nodes. */
  invalidStepIds?: Set<string>;
  /** Recently created steps — highlight until configured. */
  newStepIds?: Set<string>;
  /** Canvas card ⋯ menu: delete / copy / duplicate / rename. */
  stepNodeActions?: EchoStepNodeActionsContextValue;
  /** stepId → accent for steps another editor has locked or is dragging. */
  peerStepAccents?: ReadonlyMap<string, PeerPresenceAccent>;
  /** Peers currently dragging the stack (compact banner). */
  remoteReorderPeers?: ReadonlyArray<{
    uid: string;
    displayName: string;
    photoURL?: string | null;
  }>;
  /**
   * Primary peer’s in-progress order — dotted gap hint only (real nodes stay on saved order).
   */
  remoteReorderOrderedIds?: string[] | null;
  /** Step id the primary remote editor is placing (drives the single insertion-gap ghost). */
  remoteReorderDraggingStepId?: string | null;
  className?: string;
};

function EchoWorkflowCanvasInner(
  {
    workflowId: _workflowId,
    steps,
    persistedGraph,
    onGraphChange: _onGraphChange,
    onReorderSteps,
    onInsertStepBetween,
    onSelectStep,
    lockedStepId,
    lockOwnerLabel,
    dock,
    collaborationOverlay,
    stepInspector,
    onCanvasPointerMove,
    onReorderPresence,
    invalidStepIds,
    newStepIds,
    stepNodeActions,
    peerStepAccents,
    remoteReorderPeers = [],
    remoteReorderOrderedIds = null,
    remoteReorderDraggingStepId = null,
    className,
  }: InnerProps,
  ref: React.ForwardedRef<EchoWorkflowCanvasHandle>,
) {
  void _workflowId;
  void _onGraphChange;
  const { fitView, zoomIn, zoomOut, getNodes, screenToFlowPosition, setCenter, getViewport } =
    useReactFlow();
  /** Graph host only — pointer / flow coords ignore header chrome outside this region. */
  const canvasHostRef = useRef<HTMLDivElement>(null);

  const handleCanvasPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!onCanvasPointerMove || !canvasHostRef.current) return;
      const r = canvasHostRef.current.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onCanvasPointerMove({
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
        flowX: flow.x,
        flowY: flow.y,
      });
    },
    [onCanvasPointerMove, screenToFlowPosition],
  );

  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const stepSig = useMemo(
    () =>
      [...steps]
        .sort((a, b) => a.order - b.order)
        .map((s) => `${s.id}:${s.order}`)
        .join("|"),
    [steps],
  );
  const prevSig = useRef<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const reorderDraggingRef = useRef(false);
  const draggingStepIdRef = useRef<string | null>(null);
  const dragPreviewRafRef = useRef<number | null>(null);
  const [reorderPreview, setReorderPreview] = useState<EchoReorderPreviewState>({
    orderByStepId: null,
    draggingStepId: null,
  });

  const canvasActions = useMemo<EchoFlowCanvasActionsContextValue>(
    () => ({ onInsertStepBetween }),
    [onInsertStepBetween],
  );

  const stepActions = useMemo<EchoStepNodeActionsContextValue>(
    () => stepNodeActions ?? {},
    [stepNodeActions],
  );

  const invalidSet = invalidStepIds ?? EMPTY_STEP_ID_SET;
  const newSet = newStepIds ?? EMPTY_STEP_ID_SET;
  const decorationSig = useMemo(
    () => `${[...invalidSet].sort().join(",")}|${[...newSet].sort().join(",")}`,
    [invalidSet, newSet],
  );

  const peerAccentSig = useMemo(() => {
    if (!peerStepAccents || peerStepAccents.size === 0) return "";
    return [...peerStepAccents.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, a]) => `${id}:${a.stroke}:${a.pillBg}`)
      .join("|");
  }, [peerStepAccents]);

  /** Validated preview order from a peer (same id set as `steps`) — drives dotted ghost slots. */
  const remoteGhostPreviewIds = useMemo(() => {
    if (!remoteReorderOrderedIds || remoteReorderOrderedIds.length === 0) return null;
    const sorted = [...steps].sort((a, b) => a.order - b.order);
    const canonicalIds = sorted.map((s) => s.id);
    if (remoteReorderOrderedIds.length !== canonicalIds.length) return null;
    const canonSet = new Set(canonicalIds);
    if (remoteReorderOrderedIds.some((id) => !canonSet.has(id))) return null;
    const rSet = new Set(remoteReorderOrderedIds);
    if (canonicalIds.some((id) => !rSet.has(id))) return null;
    return remoteReorderOrderedIds;
  }, [remoteReorderOrderedIds, steps]);

  const previewDiffersFromSaved = useMemo(() => {
    if (!remoteGhostPreviewIds) return false;
    const canonicalIds = [...steps].sort((a, b) => a.order - b.order).map((s) => s.id);
    if (canonicalIds.length !== remoteGhostPreviewIds.length) return true;
    return canonicalIds.some((id, i) => id !== remoteGhostPreviewIds[i]);
  }, [remoteGhostPreviewIds, steps]);

  const canonicalStepIds = useMemo(
    () => [...steps].sort((a, b) => a.order - b.order).map((s) => s.id),
    [steps],
  );

  const showRemoteReorderGhosts = Boolean(
    remoteGhostPreviewIds &&
    previewDiffersFromSaved &&
    reorderPreview.draggingStepId == null &&
    onReorderSteps,
  );

  const remoteGhostOverlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /** Don’t replace the graph mid–drag — React Flow needs a stable node list while dragging. */
    if (reorderDraggingRef.current) return;
    if (prevSig.current === stepSig && prevSig.current !== null) return;
    prevSig.current = stepSig;
    const b = buildNodesAndEdges(steps, persistedGraph);
    setNodes(b.nodes);
    setEdges(b.edges);
  }, [stepSig, steps, persistedGraph, setNodes, setEdges]);

  useEffect(() => {
    if (reorderDraggingRef.current) return;
    const sorted = [...steps].sort((a, b) => a.order - b.order);
    const canonicalIds = sorted.map((s) => s.id);

    setNodes((nds) =>
      nds.map((n) => {
        const s = sorted.find((x) => x.id === n.id) ?? steps.find((x) => x.id === n.id);
        if (!s) return n;
        const p = s.params ?? {};
        const openAppBrandDomain =
          s.action === "open_app" || s.action === "focus_app"
            ? String((p.brand_domain as string) || "").trim() || null
            : null;
        const composioSlug =
          s.action === "api_call" ? String((p.slug as string) || "").trim() || null : null;
        const badgeLabel =
          s.action === "api_call"
            ? composioSlug
              ? composioSlug.replace(/_/g, " ").slice(0, 22)
              : "App integration"
            : "Echo step";
        const idx = canonicalIds.indexOf(n.id);
        return {
          ...n,
          data: {
            ...n.data,
            action: s.action,
            label: echoStepCardLabel(s),
            subtitle: formatContextForDisplay(
              s.context || "",
              normalizeContextAttachments(s.context_attachments),
            ).slice(0, 72),
            stepId: s.id,
            stepNumber: idx >= 0 ? idx + 1 : ((n.data as { stepNumber?: number }).stepNumber ?? 1),
            isApiCall: s.action === "api_call",
            composioSlug,
            badgeLabel,
            openAppBrandDomain,
            invalidForPublish: invalidSet.has(s.id),
            isNewStep: newSet.has(s.id),
            remotePeerAccent: peerStepAccents?.get(s.id),
          },
        };
      }),
    );
  }, [steps, setNodes, decorationSig, peerAccentSig, invalidSet, newSet, peerStepAccents]);

  useImperativeHandle(
    ref,
    () => ({
      fitView: () => fitView({ padding: 0.2, duration: 300 }),
      /**
       * Waits until the step exists in props and React Flow has laid it out at the correct Y
       * (needed after insert-between: Firestore + RF update async; immediate fit targets wrong coords).
       */
      fitViewToStep: (stepId: string) => {
        let attempts = 0;
        const maxAttempts = 90;

        const tick = () => {
          attempts += 1;
          const sorted = [...stepsRef.current].sort((a, b) => a.order - b.order);
          const index = sorted.findIndex((s) => s.id === stepId);
          const node = getNodes().find((n) => n.id === stepId);
          const wantY = index >= 0 ? index * ECHO_FLOW_LAYOUT.rowGap : null;
          const aligned =
            node != null &&
            index >= 0 &&
            wantY != null &&
            Math.abs((node.position?.y ?? -99999) - wantY) < 1;

          if (aligned) {
            fitView({ padding: 0.35, duration: 350, nodes: [{ id: stepId }] });
            return;
          }

          if (attempts < maxAttempts) {
            requestAnimationFrame(tick);
            return;
          }

          if (node) {
            fitView({ padding: 0.35, duration: 350, nodes: [{ id: stepId }] });
          } else {
            fitView({ padding: 0.2, duration: 300 });
          }
        };

        queueMicrotask(() => requestAnimationFrame(tick));
      },
      zoomIn: () => zoomIn({ duration: 200 }),
      zoomOut: () => zoomOut({ duration: 200 }),
      centerOnFlowCoordinates: (flowX: number, flowY: number) => {
        const z = getViewport().zoom;
        setCenter(flowX, flowY, {
          zoom: Math.min(1.35, Math.max(0.45, z)),
          duration: 400,
        });
      },
    }),
    [fitView, zoomIn, zoomOut, getNodes, setCenter, getViewport],
  );

  /** Preview + edges only — never call setNodes here (fights React Flow’s drag position updates). */
  const flushReorderDragPreview = useCallback(() => {
    if (!onReorderSteps) return;
    const real = getNodes().filter(isEchoStepNode);
    if (real.length === 0) return;
    const sorted = [...real].sort((a, b) => a.position.y - b.position.y);
    const ids = sorted.map((n) => n.id);
    const orderByStepId = new Map(ids.map((id, i) => [id, i + 1]));
    setReorderPreview({
      orderByStepId,
      draggingStepId: draggingStepIdRef.current,
    });
    setEdges(chainEdgesFromOrderedIds(ids));
    onReorderPresence?.({
      draggingStepId: draggingStepIdRef.current,
      orderedStepIds: ids,
    });
  }, [getNodes, onReorderSteps, setEdges, onReorderPresence]);

  const onNodeDragStart = useCallback(
    (_event: MouseEvent, node: RFNode) => {
      if (!onReorderSteps) return;
      reorderDraggingRef.current = true;
      draggingStepIdRef.current = node.id;
      flushReorderDragPreview();
    },
    [onReorderSteps, flushReorderDragPreview],
  );

  const onNodeDrag = useCallback(() => {
    if (!onReorderSteps) return;
    if (dragPreviewRafRef.current != null) return;
    dragPreviewRafRef.current = window.requestAnimationFrame(() => {
      dragPreviewRafRef.current = null;
      flushReorderDragPreview();
    });
  }, [onReorderSteps, flushReorderDragPreview]);

  const onNodeDragStop = useCallback(() => {
    if (dragPreviewRafRef.current != null) {
      cancelAnimationFrame(dragPreviewRafRef.current);
      dragPreviewRafRef.current = null;
    }
    onReorderPresence?.({ draggingStepId: null, orderedStepIds: null });
    draggingStepIdRef.current = null;
    setReorderPreview({ orderByStepId: null, draggingStepId: null });

    if (!onReorderSteps) {
      reorderDraggingRef.current = false;
      return;
    }
    const sorted = [...getNodes().filter(isEchoStepNode)].sort(
      (a, b) => a.position.y - b.position.y,
    );
    const ids = sorted.map((n) => n.id);
    const prevOrder = [...steps].sort((a, b) => a.order - b.order).map((s) => s.id);
    const changed = ids.length !== prevOrder.length || ids.some((id, i) => id !== prevOrder[i]);
    if (changed) {
      void Promise.resolve(onReorderSteps(ids));
    }
    setNodes(
      sorted.map((n, idx) => ({
        ...n,
        zIndex: 0,
        position: {
          x: ECHO_FLOW_LAYOUT.x,
          y: idx * ECHO_FLOW_LAYOUT.rowGap,
        },
        data: omitReorderPreviewFields(n.data as EchoStepNodeData),
      })),
    );
    setEdges(chainEdgesFromOrderedIds(ids));
    reorderDraggingRef.current = false;
  }, [getNodes, setNodes, setEdges, onReorderSteps, steps, onReorderPresence]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[420px] w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_4px_24px_-4px_rgba(21,10,53,0.08)] [background-image:radial-gradient(circle_at_center,rgba(165,119,255,0.14)_1px,transparent_1px)] [background-size:14px_14px] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      {lockedStepId && lockOwnerLabel ? (
        <div className="absolute left-3 top-3 z-10 max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow-sm">
          {lockOwnerLabel} is editing a step.
        </div>
      ) : null}
      <div
        ref={canvasHostRef}
        onPointerMove={handleCanvasPointerMove}
        className={cn(
          "echo-flow-canvas-host relative min-h-0 flex-1 transition-[box-shadow] duration-200",
          onReorderSteps &&
            reorderPreview.draggingStepId != null &&
            "echo-flow-canvas-host--reordering",
          showRemoteReorderGhosts && "echo-flow-canvas-host--remote-reorder-ghost",
        )}
      >
        {remoteReorderPeers.length > 0 ? (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[25] w-full max-w-[min(100%-2rem,560px)] -translate-x-1/2 px-3">
            <div className="rounded-2xl border border-sky-300/60 bg-white/95 px-3 py-2 shadow-md backdrop-blur-sm dark:border-sky-500/30 dark:bg-card/95">
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/80 dark:text-sky-200/90">
                  Live reorder
                </span>
                {remoteReorderPeers.map((p) => {
                  const initials = p.displayName
                    .split(/\s+/)
                    .map((x) => x[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <span
                      key={p.uid}
                      className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border border-sky-200/80 bg-sky-50/90 py-0.5 pl-0.5 pr-2 text-[11px] font-medium text-sky-950 dark:border-sky-500/25 dark:bg-sky-950/40 dark:text-sky-50"
                    >
                      <Avatar className="h-5 w-5 shrink-0 border border-white/80 shadow-sm">
                        {p.photoURL ? <AvatarImage src={p.photoURL} alt="" /> : null}
                        <AvatarFallback className="text-[8px] font-bold">
                          {initials || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{p.displayName}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
        <EchoFlowCanvasActionsContext.Provider value={canvasActions}>
          <EchoStepNodeActionsContext.Provider value={stepActions}>
            <EchoReorderPreviewContext.Provider value={reorderPreview}>
              <ReactFlow
                className="h-full w-full"
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStart={onNodeDragStart}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                onNodeClick={(_e, node) => {
                  if (isEchoStepNode(node)) onSelectStep(node.id);
                }}
                onPaneClick={() => onSelectStep(null)}
                nodesConnectable={false}
                nodesDraggable={Boolean(onReorderSteps)}
                elevateNodesOnSelect={false}
                defaultEdgeOptions={{
                  style: { stroke: ECHO_FLOW_EDGE_STROKE, strokeWidth: 2 },
                  type: "echoInsert",
                }}
                fitView
                minZoom={0.35}
                maxZoom={1.6}
                proOptions={{ hideAttribution: true }}
              />
            </EchoReorderPreviewContext.Provider>
          </EchoStepNodeActionsContext.Provider>
        </EchoFlowCanvasActionsContext.Provider>
        <div
          ref={remoteGhostOverlayRef}
          className="pointer-events-none absolute inset-0 z-[21] overflow-hidden"
          aria-hidden
        >
          <EchoRemoteReorderGhostOverlay
            previewOrderedIds={remoteGhostPreviewIds}
            draggingStepId={remoteReorderDraggingStepId}
            canonicalIds={canonicalStepIds}
            containerRef={remoteGhostOverlayRef}
            active={Boolean(showRemoteReorderGhosts)}
          />
        </div>
        {collaborationOverlay ? (
          <div className="echo-flow-remote-pointers pointer-events-none absolute inset-0 z-[30] overflow-hidden">
            {collaborationOverlay}
          </div>
        ) : null}
        {stepInspector ? (
          <div className="pointer-events-none absolute inset-0 z-[35] overflow-hidden">
            {stepInspector}
          </div>
        ) : null}
      </div>
      {dock ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[40] flex justify-center px-3 pb-3 pt-1">
          <div className="pointer-events-auto w-max max-w-[calc(100%-1.5rem)]">{dock}</div>
        </div>
      ) : null}
    </div>
  );
}

const EchoWorkflowCanvasInnerWithRef = forwardRef(EchoWorkflowCanvasInner);

export const EchoWorkflowCanvas = forwardRef<
  EchoWorkflowCanvasHandle,
  InnerProps & { className?: string }
>(function EchoWorkflowCanvas(props, ref) {
  return (
    <ReactFlowProvider key={props.workflowId}>
      <EchoWorkflowCanvasInnerWithRef {...props} ref={ref} />
    </ReactFlowProvider>
  );
});
