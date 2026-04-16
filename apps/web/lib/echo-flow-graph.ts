import type { Edge, Node } from "@xyflow/react";
import { formatContextForDisplay } from "@/lib/context-prompt-tokens";
import { formatAction } from "@/lib/workflow-action-labels";
import { normalizeContextAttachments } from "@/lib/workflow-step-context-attachments";

/**
 * Vertical stack layout for Echo Flow (center column).
 * `nodeSlotHeight` must match the Echo step card outer height so rowGap − height = even gap between cards (edges look uniform).
 */
export const ECHO_FLOW_LAYOUT = {
  x: 200,
  /** Distance between consecutive node top-left anchors. */
  rowGap: 200,
  /** Fixed card height (px) — keep in sync with `echo-step-node.tsx` outer wrapper. */
  nodeSlotHeight: 140,
} as const;

export type EchoPersistedFlow = {
  nodes?: Array<{ id: string; position?: { x: number; y: number }; type?: string }>;
  edges?: Array<{ id?: string; source: string; target: string }>;
  viewport?: Record<string, unknown>;
};

type StepLite = {
  id: string;
  order: number;
  action: string;
  context: string;
  params?: Record<string, unknown>;
  context_attachments?: unknown;
};

/** Primary line on the canvas card — optional `params.display_label`, else formatted action name. */
export function echoStepCardLabel(s: { action: string; params?: Record<string, unknown> }): string {
  const custom = String((s.params?.display_label as string) ?? "").trim();
  if (custom) return custom;
  return formatAction(s.action);
}

/** Build React Flow nodes/edges from steps + optional persisted Echo Flow graph. */
export function buildNodesAndEdges(
  steps: StepLite[],
  persisted: EchoPersistedFlow | null | undefined,
): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  void persisted;

  const nodes: Node[] = sorted.map((s, i) => {
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
      id: s.id,
      type: "echoStep",
      position: {
        x: ECHO_FLOW_LAYOUT.x,
        y: i * ECHO_FLOW_LAYOUT.rowGap,
      },
      data: {
        action: s.action,
        label: echoStepCardLabel(s),
        subtitle: formatContextForDisplay(
          s.context || "",
          normalizeContextAttachments(s.context_attachments),
        ).slice(0, 72),
        stepId: s.id,
        stepNumber: i + 1,
        isApiCall: s.action === "api_call",
        composioSlug,
        badgeLabel,
        openAppBrandDomain,
      },
    };
  });

  const edges = chainEdgesFromOrderedIds(sorted.map((s) => s.id));

  return { nodes, edges };
}

/** Stroke for vertical step chain edges (`echoInsert`) — reuse for reorder ghost, handles, etc. */
export const ECHO_FLOW_EDGE_STROKE = "#6366f1" as const;

const CHAIN_EDGE_STYLE = { stroke: ECHO_FLOW_EDGE_STROKE, strokeWidth: 2 } as const;

/** Linear chain edges for a vertical step list (order matches array order). */
export function chainEdgesFromOrderedIds(orderedIds: string[]): Edge[] {
  const edges: Edge[] = [];
  if (orderedIds.length < 2) return edges;
  for (let i = 0; i < orderedIds.length - 1; i++) {
    const a = orderedIds[i];
    const b = orderedIds[i + 1];
    edges.push({
      id: `e-${a}-${b}`,
      source: a,
      target: b,
      /** Custom edge: straight line + “insert step” control at midpoint. */
      type: "echoInsert",
      style: { ...CHAIN_EDGE_STYLE },
    });
  }
  return edges;
}
