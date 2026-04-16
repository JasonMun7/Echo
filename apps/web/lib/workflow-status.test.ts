import { describe, expect, it } from "vitest";
import { workflowStatusBadgeClass, workflowStatusLabel } from "@/lib/workflow-status";

describe("workflowStatusLabel", () => {
  it("maps known statuses", () => {
    expect(workflowStatusLabel("draft")).toBe("Draft");
    expect(workflowStatusLabel("processing")).toBe("Building");
    expect(workflowStatusLabel("ready")).toBe("Ready");
  });

  it("replaces underscores with spaces for unknown statuses", () => {
    expect(workflowStatusLabel("in_review")).toBe("in review");
  });

  it("handles empty", () => {
    expect(workflowStatusLabel(null)).toBe("Unknown");
    expect(workflowStatusLabel(undefined)).toBe("Unknown");
  });
});

describe("workflowStatusBadgeClass", () => {
  it("returns distinct classes for terminal vs active states", () => {
    expect(workflowStatusBadgeClass("failed")).toContain("red");
    expect(workflowStatusBadgeClass("ready")).toContain("emerald");
    expect(workflowStatusBadgeClass("unknown")).toContain("muted");
  });
});
