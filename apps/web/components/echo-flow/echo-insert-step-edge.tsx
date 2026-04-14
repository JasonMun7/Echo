"use client";

import { memo, useCallback, type MouseEvent } from "react";
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { Plus } from "lucide-react";

import { useEchoFlowCanvasActions } from "@/components/echo-flow/echo-flow-canvas-actions-context";
import { cn } from "@/lib/utils";

function EchoInsertStepEdgeInner(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, source, target, style, markerEnd } = props;
  const { onInsertStepBetween } = useEchoFlowCanvasActions();
  const path = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = (sourceY + targetY) / 2;

  const onClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      if (!onInsertStepBetween || !source || !target) return;
      onInsertStepBetween(source, target);
    },
    [onInsertStepBetween, source, target],
  );

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {onInsertStepBetween ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            <button
              type="button"
              onClick={onClick}
              title="Add step here"
              aria-label="Add step between these steps"
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#6366f1] bg-white text-[#6366f1] shadow-md",
                "transition-transform hover:scale-105 hover:bg-[#6366f1] hover:text-white",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6366f1]",
              )}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const EchoInsertStepEdge = memo(EchoInsertStepEdgeInner);
