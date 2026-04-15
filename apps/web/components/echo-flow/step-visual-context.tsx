"use client";

import { useCallback, useState } from "react";
import type { WorkflowStepEditorStep } from "@/app/dashboard/workflows/[id]/edit/step-editor-panel";

type NormBox = { x: number; y: number; w: number; h: number };

function parseNormOverlay(raw: Record<string, unknown> | undefined): NormBox | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const norm = n.norm as Record<string, unknown> | undefined;
  if (norm && typeof norm.x === "number" && typeof norm.y === "number") {
    const w = typeof norm.w === "number" ? norm.w : 0.1;
    const h = typeof norm.h === "number" ? norm.h : 0.05;
    return { x: norm.x, y: norm.y, w, h };
  }
  return null;
}

function parsePixelOverlay(
  raw: Record<string, unknown> | undefined,
  nw: number,
  nh: number,
): NormBox | null {
  if (!raw || nw <= 0 || nh <= 0) return null;
  const pixel = raw.pixel as Record<string, unknown> | undefined;
  if (
    pixel &&
    typeof pixel.x === "number" &&
    typeof pixel.y === "number" &&
    typeof pixel.w === "number" &&
    typeof pixel.h === "number"
  ) {
    return {
      x: pixel.x / nw,
      y: pixel.y / nh,
      w: pixel.w / nw,
      h: pixel.h / nh,
    };
  }
  return null;
}

/** Scribe-like static frame + highlight when synthesis stored `frame_image_url` + `click_overlay`. */
export function StepVisualContext({ step }: { step: WorkflowStepEditorStep }) {
  const url = step.frame_image_url?.trim();
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    setDims({ w: el.naturalWidth || el.width, h: el.naturalHeight || el.height });
  }, []);

  if (!url) return null;

  const overlayRaw =
    step.click_overlay && typeof step.click_overlay === "object"
      ? (step.click_overlay as Record<string, unknown>)
      : undefined;

  const box =
    parseNormOverlay(overlayRaw) ?? (dims ? parsePixelOverlay(overlayRaw, dims.w, dims.h) : null);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-[#150A35]/70">Screen context</p>
      <div className="relative overflow-hidden rounded-lg border border-[#150A35]/15 bg-[#150A35]/5">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary synthesis / GCS URLs */}
        <img
          src={url}
          alt={step.context?.trim() || "Workflow step screen context"}
          className="h-auto w-full object-contain"
          onLoad={onImgLoad}
        />
        {box ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <rect
              x={box.x * 100}
              y={box.y * 100}
              width={box.w * 100}
              height={box.h * 100}
              fill="none"
              stroke="#21C4DD"
              strokeOpacity={0.65}
              strokeWidth={0.9}
              rx={1}
            />
          </svg>
        ) : null}
      </div>
    </div>
  );
}
