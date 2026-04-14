"use client";

import { useId } from "react";
import { EchoWorkflowCanvas } from "@/components/echo-flow/echo-workflow-canvas";

type Step = {
  id: string;
  order: number;
  action: string;
  context: string;
  params: Record<string, unknown>;
  expected_outcome?: string;
};

/** Legacy wrapper — Echo Flow editor uses `EchoWorkflowCanvas` directly with persistence. */
export function WorkflowStepGraph({
  steps,
  onNodeSelect,
}: {
  steps: Step[];
  onNodeSelect?: (stepId: string | null) => void;
}) {
  const rid = useId();
  return (
    <EchoWorkflowCanvas
      workflowId={`legacy-${rid}`}
      steps={steps}
      persistedGraph={null}
      onSelectStep={onNodeSelect ?? (() => {})}
    />
  );
}
