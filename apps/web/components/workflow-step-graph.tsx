"use client";

import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type Step = {
  id: string;
  order: number;
  action: string;
  context: string;
  params: Record<string, unknown>;
  expected_outcome?: string;
};

function formatAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function stepsToNodes(steps: Step[]): Node[] {
  return steps.map((s, i) => ({
    id: s.id,
    type: "default",
    position: { x: 100, y: i * 100 },
    data: {
      label: `${i + 1}. ${formatAction(s.action)}${s.context ? ": " + s.context.slice(0, 30) : ""}`,
    },
  }));
}

function stepsToEdges(steps: Step[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    edges.push({ id: "e-" + i, source: steps[i].id, target: steps[i + 1].id });
  }
  return edges;
}

export function WorkflowStepGraph({
  steps,
  onNodeSelect,
}: {
  steps: Step[];
  onNodeSelect?: (stepId: string | null) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(stepsToNodes(steps));
  const [edges, setEdges, onEdgesChange] = useEdgesState(stepsToEdges(steps));

  useEffect(() => {
    setNodes(stepsToNodes(steps));
    setEdges(stepsToEdges(steps));
  }, [steps, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="flex-1 min-h-[400px] w-full rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_evt, node) => onNodeSelect?.(node.id)}
        onPaneClick={() => onNodeSelect?.(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
