/**
 * Workflow actions from the editor (browser ∪ desktop) vs `isDeterministic` / `stepToOperatorAction`.
 * Parity with `agent/tests/workflow_actions/test_step_determinism.py`.
 */
import { describe, expect, it } from "vitest";
import {
  isDeterministic,
  mergeTypeTextAtWorkflowLiteral,
  stepToOperatorAction,
} from "../direct-executor";

const baseStep = {
  id: "1",
  context: "",
  expected_outcome: "",
  order: 0,
};

describe("workflow step mapping (all editor actions)", () => {
  const cases: Array<{
    action: string;
    params: Record<string, unknown>;
    expectDeterministic: boolean;
  }> = [
    { action: "api_call", params: { integration: "x", method: "m", args: {} }, expectDeterministic: true },
    { action: "navigate", params: { url: "https://example.com" }, expectDeterministic: true },
    { action: "navigate", params: {}, expectDeterministic: false },
    { action: "wait", params: {}, expectDeterministic: true },
    { action: "press_key", params: { key: "Enter" }, expectDeterministic: true },
    { action: "press_key", params: {}, expectDeterministic: false },
    { action: "hotkey", params: { keys: ["a"] }, expectDeterministic: true },
    { action: "hotkey", params: {}, expectDeterministic: true },
    { action: "scroll", params: { direction: "down" }, expectDeterministic: true },
    { action: "scroll", params: {}, expectDeterministic: false },
    { action: "open_app", params: { appName: "Notes" }, expectDeterministic: true },
    { action: "open_app", params: {}, expectDeterministic: false },
    { action: "focus_app", params: { appName: "Notes" }, expectDeterministic: true },
    { action: "focus_app", params: {}, expectDeterministic: false },
    { action: "select_option", params: { selector: "#s", value: "1" }, expectDeterministic: true },
    { action: "select_option", params: { selector: "#s" }, expectDeterministic: false },
    { action: "select_option", params: { value: "1" }, expectDeterministic: false },
    { action: "wait_for_element", params: { selector: "body" }, expectDeterministic: true },
    { action: "wait_for_element", params: {}, expectDeterministic: false },
    {
      action: "type_text_at",
      params: { text: "hi", x: 10, y: 20 },
      expectDeterministic: true,
    },
    { action: "type_text_at", params: { text: "hi" }, expectDeterministic: false },
    { action: "type_text_at", params: { x: 1, y: 2 }, expectDeterministic: false },
    { action: "click_at", params: { description: "x" }, expectDeterministic: false },
    { action: "right_click", params: {}, expectDeterministic: false },
    { action: "double_click", params: {}, expectDeterministic: false },
    { action: "hover", params: {}, expectDeterministic: false },
    { action: "drag", params: {}, expectDeterministic: false },
    { action: "drag_drop", params: {}, expectDeterministic: false },
    { action: "take_screenshot", params: {}, expectDeterministic: false },
    { action: "open_web_browser", params: {}, expectDeterministic: false },
    { action: "close_web_browser", params: {}, expectDeterministic: false },
  ];

  it.each(cases)(
    "isDeterministic($action) === $expectDeterministic",
    ({ action, params, expectDeterministic }) => {
      expect(
        isDeterministic({
          ...baseStep,
          action,
          params,
        }),
      ).toBe(expectDeterministic);
    },
  );

  it("stepToOperatorAction: navigate, press_key, click_at, scroll, open_app, select_option, api_call", () => {
    expect(
      stepToOperatorAction({
        ...baseStep,
        action: "navigate",
        params: { url: "https://a.com" },
      }),
    ).toMatchObject({ action: "navigate", url: "https://a.com" });

    expect(
      stepToOperatorAction({
        ...baseStep,
        action: "press_key",
        params: { key: "Tab" },
      }),
    ).toMatchObject({ action: "presskey", key: "Tab" });

    expect(
      stepToOperatorAction({
        ...baseStep,
        action: "click_at",
        params: { x: 100, y: 200 },
      }),
    ).toMatchObject({ action: "click", x: 100, y: 200 });

    expect(
      stepToOperatorAction({
        ...baseStep,
        action: "scroll",
        params: { direction: "up", amount: 400 },
      }),
    ).toMatchObject({ action: "scroll", direction: "up", distance: 400 });

    expect(
      stepToOperatorAction({
        ...baseStep,
        action: "open_app",
        params: { appName: "Calc" },
      }),
    ).toMatchObject({ action: "openapp", appName: "Calc" });

    expect(
      stepToOperatorAction({
        ...baseStep,
        action: "select_option",
        params: { selector: "#m", value: "v" },
      }),
    ).toMatchObject({ action: "selectoption", selector: "#m", value: "v" });

    expect(
      stepToOperatorAction({
        ...baseStep,
        action: "api_call",
        params: { integration: "slack", method: "post", args: { c: 1 } },
      }),
    ).toMatchObject({
      action: "apicall",
      integration: "slack",
      method: "post",
      args: { c: 1 },
    });
  });

  it("stepToOperatorAction: take_screenshot passes through action name", () => {
    expect(
      stepToOperatorAction({
        ...baseStep,
        action: "take_screenshot",
        params: {},
      }).action,
    ).toBe("takescreenshot");
  });
});

describe("type_text_at merge (VLM parity)", () => {
  it("grounded type_text_at → clickandtype", () => {
    const op = stepToOperatorAction({
      ...baseStep,
      action: "type_text_at",
      params: { text: "hi", x: 10, y: 20 },
    });
    expect(op.action).toBe("clickandtype");
    expect(op.content).toBe("hi");
    expect(op.x).toBe(10);
    expect(op.y).toBe(20);
  });

  it("type_text_at text only → type", () => {
    const op = stepToOperatorAction({
      ...baseStep,
      action: "type_text_at",
      params: { text: "only", description: "box" },
    });
    expect(op.action).toBe("type");
    expect(op.content).toBe("only");
  });

  it("mergeTypeTextAtWorkflowLiteral upgrades VLM click to clickandtype", () => {
    const merged = mergeTypeTextAtWorkflowLiteral(
      {
        ...baseStep,
        action: "type_text_at",
        params: { text: "hi", description: "f" },
      },
      { action: "click", x: 10, y: 20 },
    );
    expect(merged.action).toBe("clickandtype");
    expect(merged.content).toBe("hi");
    expect(merged.x).toBe(10);
    expect(merged.y).toBe(20);
  });

  it("mergeTypeTextAtWorkflowLiteral respects typingOverride", () => {
    const merged = mergeTypeTextAtWorkflowLiteral(
      {
        ...baseStep,
        action: "type_text_at",
        params: { text: "x" },
      },
      { action: "click", x: 1, y: 2 },
      "override",
    );
    expect(merged.content).toBe("override");
  });
});
