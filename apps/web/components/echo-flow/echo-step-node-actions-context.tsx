"use client";

import { createContext, useContext } from "react";

export type EchoStepNodeActionsContextValue = {
  onDeleteStep?: (stepId: string) => void;
  onCopyStep?: (stepId: string) => void;
  onDuplicateStep?: (stepId: string) => void;
  onRenameStep?: (stepId: string) => void;
  /** When true, hide the ⋯ menu (e.g. read-only workflow). */
  menuDisabled?: boolean;
};

export const EchoStepNodeActionsContext = createContext<EchoStepNodeActionsContextValue>({});

export function useEchoStepNodeActions() {
  return useContext(EchoStepNodeActionsContext);
}
