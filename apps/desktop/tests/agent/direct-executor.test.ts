import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/main/operators/unified-operator", () => ({
  execute: vi.fn().mockResolvedValue(true),
}));

import { isDeterministic, executeStep } from "../../src/main/agent/direct-executor";

const mockStep = (
  action: string,
  params: Record<string, unknown> = {}
): { id: string; action: string; params: Record<string, unknown>; context: string; order: number } => ({
  id: "step-1",
  action,
  params,
  context: "test",
  order: 0,
});

describe("isDeterministic", () => {
  it("returns false for navigate", () => {
    expect(
      isDeterministic(mockStep("navigate", { url: "https://example.com" }) as never)
    ).toBe(false);
  });

  it("returns true for click_at with x,y coords", () => {
    expect(
      isDeterministic(mockStep("click_at", { x: 100, y: 200 }) as never)
    ).toBe(true);
  });

  it("returns true for right_click with coords", () => {
    expect(
      isDeterministic(mockStep("right_click", { x: 50, y: 75 }) as never)
    ).toBe(true);
  });

  it("returns true for double_click with coords", () => {
    expect(
      isDeterministic(mockStep("double_click", { x: 100, y: 100 }) as never)
    ).toBe(true);
  });

  it("returns true for wait with seconds", () => {
    expect(
      isDeterministic(mockStep("wait", { seconds: 3 }) as never)
    ).toBe(true);
  });

  it("returns true for press_key with key", () => {
    expect(
      isDeterministic(mockStep("press_key", { key: "enter" }) as never)
    ).toBe(true);
  });

  it("returns true for scroll with direction", () => {
    expect(
      isDeterministic(mockStep("scroll", { direction: "down" }) as never)
    ).toBe(true);
  });

  it("returns true for hotkey with keys array", () => {
    expect(
      isDeterministic(mockStep("hotkey", { keys: ["cmd", "c"] }) as never)
    ).toBe(true);
  });

  it("returns true for open_app with appName", () => {
    expect(
      isDeterministic(mockStep("open_app", { appName: "Safari" }) as never)
    ).toBe(true);
  });

  it("returns true for focus_app with appName", () => {
    expect(
      isDeterministic(mockStep("focus_app", { appName: "Chrome" }) as never)
    ).toBe(true);
  });

  it("returns true for type_text_at with coords and text", () => {
    expect(
      isDeterministic(mockStep("type_text_at", { x: 100, y: 200, text: "hi" }) as never)
    ).toBe(true);
  });

  it("returns true for drag with x,y and x2,y2 coords", () => {
    expect(
      isDeterministic(mockStep("drag", { x: 0, y: 0, x2: 100, y2: 100 }) as never)
    ).toBe(true);
  });

  it("returns false for click_at without coords", () => {
    expect(isDeterministic(mockStep("click_at", {}) as never)).toBe(false);
  });

  it("returns false for unknown action", () => {
    expect(isDeterministic(mockStep("unknown_action", { x: 1, y: 2 }) as never)).toBe(false);
  });
});

describe("executeStep", () => {
  it("returns true when execute succeeds for wait step", async () => {
    const step = mockStep("wait", { seconds: 2 }) as never;
    const result = await executeStep(step);
    expect(result).toBe(true);
  });

  it("calls execute with correct OperatorAction for wait step", async () => {
    const { execute } = await import("../../src/main/operators/unified-operator");
    const step = mockStep("wait", { seconds: 2 }) as never;
    await executeStep(step);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ action: "wait", seconds: 2 })
    );
  });
});
