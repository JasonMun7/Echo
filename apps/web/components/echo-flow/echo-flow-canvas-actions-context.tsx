"use client";

import { createContext, useContext } from "react";

export type EchoFlowCanvasActionsContextValue = {
  /** Add a new step between `sourceStepId` and `targetStepId` (opens action picker in parent). */
  onInsertStepBetween?: (sourceStepId: string, targetStepId: string) => void;
};

export const EchoFlowCanvasActionsContext = createContext<EchoFlowCanvasActionsContextValue>({});

export function useEchoFlowCanvasActions() {
  return useContext(EchoFlowCanvasActionsContext);
}
