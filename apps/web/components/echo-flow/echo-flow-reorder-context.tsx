"use client";

import { createContext, useContext } from "react";

export type EchoReorderPreviewState = {
  /** Projected 1-based order by step id while dragging (Y-sort). */
  orderByStepId: Map<string, number> | null;
  draggingStepId: string | null;
};

const defaultState: EchoReorderPreviewState = {
  orderByStepId: null,
  draggingStepId: null,
};

export const EchoReorderPreviewContext = createContext<EchoReorderPreviewState>(defaultState);

export function useEchoReorderPreview(stepId: string) {
  const { orderByStepId, draggingStepId } = useContext(EchoReorderPreviewContext);
  return {
    previewOrder: orderByStepId?.get(stepId),
    reorderActive: orderByStepId != null,
    isDragTarget: draggingStepId === stepId,
  };
}
