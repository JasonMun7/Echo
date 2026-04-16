import { describe, it, expect } from "vitest";
import { orderStepsByFlowGraph, type Step } from "@echo/types";

describe("orderStepsByFlowGraph", () => {
  const steps: Step[] = [
    { id: "a", order: 0, action: "wait", params: {}, context: "" },
    { id: "b", order: 1, action: "wait", params: {}, context: "" },
    { id: "c", order: 2, action: "wait", params: {}, context: "" },
  ];

  it("falls back to order when no edges", () => {
    const out = orderStepsByFlowGraph(steps, null);
    expect(out.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("orders by DAG edges when provided", () => {
    const out = orderStepsByFlowGraph(steps, {
      edges: [
        { source: "c", target: "a" },
        { source: "a", target: "b" },
      ],
    });
    expect(out.map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});
