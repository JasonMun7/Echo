"use client";

import type { RefObject } from "react";
import { useLayoutEffect, useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";

import { ECHO_FLOW_EDGE_STROKE, ECHO_FLOW_LAYOUT } from "@/lib/echo-flow-graph";

const FLOW_CARD_WIDTH = 300;

type GapRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function resolveTargetStepId(
  previewOrderedIds: string[],
  draggingStepId: string | null,
  canonicalIds: string[],
): string | null {
  if (draggingStepId && previewOrderedIds.includes(draggingStepId)) return draggingStepId;
  for (const id of canonicalIds) {
    const oi = canonicalIds.indexOf(id);
    const ni = previewOrderedIds.indexOf(id);
    if (oi >= 0 && ni >= 0 && oi !== ni) return id;
  }
  return null;
}

/**
 * Vertical gap where the dragged step will land, using **only** the two neighbors it sits between
 * in preview order (their on-screen tops/bottoms). E.g. order [2, 1, 3] → between card 2 and card 3.
 */
function flowInsertionGap(
  preview: string[],
  targetIndex: number,
  getNode: (id: string) => { position: { x: number; y: number } } | undefined,
): { top: number; bottom: number } | null {
  const { rowGap, nodeSlotHeight } = ECHO_FLOW_LAYOUT;
  const interRow = rowGap - nodeSlotHeight;
  const n = preview.length;

  const gridGapAfterPred = (i: number) => ({
    top: (i - 1) * rowGap + nodeSlotHeight,
    bottom: i * rowGap,
  });

  // Middle: between preview[i-1] and preview[i+1] — skip the dragged step at i (e.g. 1 between 2 and 3).
  if (n >= 3 && targetIndex > 0 && targetIndex < n - 1) {
    const aboveId = preview[targetIndex - 1]!;
    const belowId = preview[targetIndex + 1]!;
    const above = getNode(aboveId);
    const below = getNode(belowId);
    if (above && below) {
      const flowTop = above.position.y + nodeSlotHeight;
      const flowBottom = below.position.y;
      if (flowBottom > flowTop) return { top: flowTop, bottom: flowBottom };
    }
  }

  if (targetIndex === 0) {
    const firstId = preview[0];
    const first = firstId ? getNode(firstId) : undefined;
    const flowBottom = first ? first.position.y : 0;
    const flowTop = flowBottom - interRow;
    if (flowBottom > flowTop) return { top: flowTop, bottom: flowBottom };
    return { top: -interRow, bottom: 0 };
  }

  // Last slot: gap between penultimate and last card in preview.
  if (targetIndex === n - 1 && n >= 2) {
    const aboveId = preview[n - 2]!;
    const lastId = preview[n - 1]!;
    const above = getNode(aboveId);
    const last = getNode(lastId);
    if (above && last) {
      const flowTop = above.position.y + nodeSlotHeight;
      const flowBottom = last.position.y;
      if (flowBottom > flowTop) return { top: flowTop, bottom: flowBottom };
    }
    const g = gridGapAfterPred(targetIndex);
    if (g.bottom > g.top) return g;
    return null;
  }

  const g = gridGapAfterPred(targetIndex);
  if (g.bottom > g.top) return g;
  return null;
}

function useRemoteReorderGapGhostLayout(
  previewOrderedIds: string[] | null,
  draggingStepId: string | null,
  canonicalIds: string[],
  containerRef: RefObject<HTMLDivElement | null>,
  active: boolean,
): GapRect | null {
  const { flowToScreenPosition, getNode } = useReactFlow();
  const layoutSig = useStore((s) => {
    const t = s.transform;
    const tr = Array.isArray(t) ? t.join(",") : String(t);
    return `${s.width}x${s.height}x${tr}`;
  });
  /** Recompute when any node Y changes (matches on-screen card positions). */
  const nodeYSig = useStore((s) =>
    s.nodes.map((n) => `${n.id}:${Math.round(n.position.y * 10) / 10}`).join("|"),
  );
  const [rect, setRect] = useState<GapRect | null>(null);

  useLayoutEffect(() => {
    if (!active || !previewOrderedIds || previewOrderedIds.length === 0) {
      setRect(null);
      return;
    }
    const targetId = resolveTargetStepId(previewOrderedIds, draggingStepId, canonicalIds);
    if (!targetId) {
      setRect(null);
      return;
    }
    const targetIndex = previewOrderedIds.indexOf(targetId);
    if (targetIndex < 0) {
      setRect(null);
      return;
    }

    const root = containerRef.current;
    if (!root) return;
    const olR = root.getBoundingClientRect();

    const gap = flowInsertionGap(previewOrderedIds, targetIndex, getNode);
    if (!gap || gap.bottom <= gap.top) {
      setRect(null);
      return;
    }

    const tl = flowToScreenPosition({ x: ECHO_FLOW_LAYOUT.x, y: gap.top });
    const br = flowToScreenPosition({
      x: ECHO_FLOW_LAYOUT.x + FLOW_CARD_WIDTH,
      y: gap.bottom,
    });

    setRect({
      left: tl.x - olR.left,
      top: tl.y - olR.top,
      width: Math.max(0, br.x - tl.x),
      height: Math.max(0, br.y - tl.y),
    });
  }, [
    active,
    previewOrderedIds?.join("\u200c"),
    draggingStepId,
    canonicalIds.join("\u200c"),
    flowToScreenPosition,
    getNode,
    layoutSig,
    nodeYSig,
  ]);

  return rect;
}

/**
 * One text-free dashed strip in the **measured** gap between the two preview neighbors (above/below
 * the dragged step), e.g. between nodes 2 and 3 when moving 1 there.
 */
export function EchoRemoteReorderGhostOverlay({
  previewOrderedIds,
  draggingStepId,
  canonicalIds,
  containerRef,
  active,
}: {
  previewOrderedIds: string[] | null;
  draggingStepId: string | null;
  canonicalIds: string[];
  containerRef: RefObject<HTMLDivElement | null>;
  active: boolean;
}) {
  const rect = useRemoteReorderGapGhostLayout(
    previewOrderedIds,
    draggingStepId,
    canonicalIds,
    containerRef,
    active,
  );

  if (!active || !rect || rect.height < 1 || rect.width < 1) return null;

  return (
    <div
      className="pointer-events-none absolute z-[21] box-border rounded-md border-2 border-dashed"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: Math.max(rect.height, 6),
        borderColor: `${ECHO_FLOW_EDGE_STROKE}99`,
        backgroundColor: `${ECHO_FLOW_EDGE_STROKE}14`,
        boxShadow: `inset 0 0 0 1px ${ECHO_FLOW_EDGE_STROKE}22`,
      }}
      aria-hidden
    />
  );
}
