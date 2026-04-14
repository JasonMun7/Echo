"use client";

import type { MouseEvent, ReactNode } from "react";
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
import { EchoStepNode, type EchoStepNodeData } from "./echo-step-node";
import type { EchoPersistedFlow } from "@/lib/echo-flow-graph";
import {
  buildNodesAndEdges,
  chainEdgesFromOrderedIds,
  echoStepCardLabel,
  ECHO_FLOW_LAYOUT,
} from "@/lib/echo-flow-graph";
import { formatAction } from "@/lib/workflow-action-labels";

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
};

export type EchoWorkflowCanvasHandle = {
  fitViewToStep: (stepId: string) => void;
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type InnerProps = {
  workflowId: string;
  steps: Step[];
  persistedGraph: EchoPersistedFlow | null;
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
  /** Steps that fail publish validation — red treatment on nodes. */
  invalidStepIds?: Set<string>;
  /** Recently created steps — highlight until configured. */
  newStepIds?: Set<string>;
  /** Canvas card ⋯ menu: delete / copy / duplicate / rename. */
  stepNodeActions?: EchoStepNodeActionsContextValue;
  className?: string;
};

function EchoWorkflowCanvasInner(
  {
    workflowId: _workflowId,
    steps,
    persistedGraph,
    onGraphChange,
    onReorderSteps,
    onInsertStepBetween,
    onSelectStep,
    lockedStepId,
    lockOwnerLabel,
    dock,
    collaborationOverlay,
    invalidStepIds,
    newStepIds,
    stepNodeActions,
    className,
  }: InnerProps,
  ref: React.ForwardedRef<EchoWorkflowCanvasHandle>,
) {
  void _workflowId;
  const { fitView, zoomIn, zoomOut, getNodes } = useReactFlow();

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

  useEffect(() => {
    /** Don’t replace the graph mid–drag (ghosts removed; RF still needs a stable list while dragging). */
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
    setNodes((nds) =>
      nds.map((n) => {
        const idx = sorted.findIndex((x) => x.id === n.id);
        const s = idx >= 0 ? sorted[idx] : steps.find((x) => x.id === n.id);
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
        return {
          ...n,
          data: {
            ...n.data,
            action: s.action,
            label: echoStepCardLabel(s),
            subtitle: (s.context || "").slice(0, 72),
            stepId: s.id,
            stepNumber: idx >= 0 ? idx + 1 : ((n.data as { stepNumber?: number }).stepNumber ?? 1),
            isApiCall: s.action === "api_call",
            composioSlug,
            badgeLabel,
            openAppBrandDomain,
            invalidForPublish: invalidSet.has(s.id),
            isNewStep: newSet.has(s.id),
          },
        };
      }),
    );
  }, [steps, setNodes, decorationSig, invalidSet, newSet]);

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
    }),
    [fitView, zoomIn, zoomOut, getNodes],
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
  }, [getNodes, onReorderSteps, setEdges]);

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
  }, [getNodes, setNodes, setEdges, onReorderSteps, steps]);

  useEffect(() => {
    if (!onGraphChange) return;
    const t = window.setTimeout(() => {
      if (reorderDraggingRef.current) return;
      onGraphChange({
        nodes: nodes
          .filter((n) => n.type === "echoStep")
          .map((n) => ({ id: n.id, position: n.position, type: n.type ?? "echoStep" })),
        edges: edges
          .filter((e) => !e.id.startsWith("__reorder-ghost-"))
          .map((e) => ({ id: e.id, source: e.source, target: e.target })),
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [nodes, edges, onGraphChange]);

  return (
    <div
      className={cn(
        "relative flex h-full min-h-[420px] w-full flex-1 flex-col overflow-hidden rounded-xl bg-[#F5F7FC] shadow-[0_4px_24px_-4px_rgba(21,10,53,0.08)] [background-image:radial-gradient(circle_at_center,rgba(165,119,255,0.14)_1px,transparent_1px)] [background-size:14px_14px]",
        className,
      )}
    >
      {lockedStepId && lockOwnerLabel ? (
        <div className="absolute left-3 top-3 z-10 max-w-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 shadow-sm">
          {lockOwnerLabel} is editing a step.
        </div>
      ) : null}
      <div
        className={cn(
          "echo-flow-canvas-host relative min-h-0 flex-1 transition-[box-shadow] duration-200",
          onReorderSteps &&
            reorderPreview.draggingStepId != null &&
            "echo-flow-canvas-host--reordering",
        )}
      >
        {onReorderSteps && reorderPreview.draggingStepId != null ? (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[25] max-w-[min(100%-2rem,420px)] -translate-x-1/2 px-3 text-center">
            <div className="rounded-full border border-violet-300/70 bg-white/95 px-4 py-2 text-xs font-medium text-violet-900 shadow-md backdrop-blur-sm ring-1 ring-violet-400/25">
              Reordering steps — drag up or down, release to place
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
                  style: { stroke: "#6366f1", strokeWidth: 2 },
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
      </div>
      {collaborationOverlay ? (
        <div className="pointer-events-none absolute inset-0 z-[30] overflow-hidden rounded-xl">
          {collaborationOverlay}
        </div>
      ) : null}
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
