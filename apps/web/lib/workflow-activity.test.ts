import { describe, expect, it } from "vitest";
import { featuredWorkflowId, getWorkflowTimeMs, workflowActivityMs } from "@/lib/workflow-activity";

describe("getWorkflowTimeMs", () => {
  it("reads Firestore-style seconds", () => {
    expect(getWorkflowTimeMs({ seconds: 1 })).toBe(1000);
    expect(getWorkflowTimeMs({ _seconds: 2 })).toBe(2000);
  });

  it("treats large numbers as ms", () => {
    expect(getWorkflowTimeMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("treats small numbers as seconds", () => {
    expect(getWorkflowTimeMs(1_700_000_000)).toBe(1_700_000_000_000);
  });
});

describe("workflowActivityMs", () => {
  it("returns max of created and updated", () => {
    expect(
      workflowActivityMs({
        createdAt: { seconds: 1 },
        updatedAt: { seconds: 10 },
      }),
    ).toBe(10_000);
  });
});

describe("featuredWorkflowId", () => {
  it("returns null for empty list", () => {
    expect(featuredWorkflowId([])).toBeNull();
  });

  it("picks highest activity; tie-break by id", () => {
    expect(
      featuredWorkflowId([
        { id: "a", createdAt: { seconds: 1 }, updatedAt: { seconds: 1 } },
        { id: "b", createdAt: { seconds: 2 }, updatedAt: { seconds: 2 } },
      ]),
    ).toBe("b");
    expect(
      featuredWorkflowId([
        { id: "a", createdAt: { seconds: 1 }, updatedAt: { seconds: 5 } },
        { id: "b", createdAt: { seconds: 1 }, updatedAt: { seconds: 5 } },
      ]),
    ).toBe("b");
  });
});
