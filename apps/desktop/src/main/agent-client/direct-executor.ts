/**
 * Direct executor for deterministic steps — uses unified operator (NutJS/Playwright).
 *
 * Determinism rules (aligned with `echo_prism_agent.execution.operator.is_deterministic`):
 * - api_call, navigate+url, wait, press_key, hotkey, scroll, open_app, focus_app,
 *   select_option+selector+value, wait_for_element+selector
 * - type_text_at + non-empty text + x/y (norm 0–1000) → single clickandtype (no VLM)
 * - Clicks and pointer actions without the above remain ambiguous (VLM).
 */

import type { Step } from "@echo/types";
import type { OperatorAction } from "@echo/types";
import { execute } from "../operators/unified-operator";

/** Must match Python `is_deterministic` in `execution/operator.py`. */
export function isDeterministic(step: Step): boolean {
  const params = step.params || {};
  const action = (step.action || "").toLowerCase().replace(/_/g, "");

  if (action === "apicall" || step.action === "api_call") return true;
  if (action === "navigate" && params.url) return true;
  if (action === "wait") return true;
  if (action === "presskey" && params.key) return true;
  if (action === "hotkey") return true;
  if (action === "scroll" && params.direction) return true;
  if (action === "openapp" && params.appName) return true;
  if (action === "focusapp" && params.appName) return true;
  if (action === "selectoption" && params.selector && params.value != null && params.value !== "") return true;
  if (action === "waitforelement" && params.selector) return true;
  if (action === "typetextat") {
    const text = String(params.text ?? params.content ?? "").trim();
    if (text && params.x != null && params.y != null) return true;
  }

  return false;
}

const STEP_TO_OP: Record<string, string> = {
  clickat: "click",
  rightclick: "rightclick",
  doubleclick: "doubleclick",
  hotkey: "hotkey",
  wait: "wait",
  presskey: "presskey",
  scroll: "scroll",
  openapp: "openapp",
  focusapp: "focusapp",
  navigate: "navigate",
  selectoption: "selectoption",
  waitforelement: "waitforelement",
  apicall: "apicall",
};

/**
 * Map workflow step → operator action. Kept in sync with Python `step_to_action`.
 */
export function stepToOperatorAction(step: Step): OperatorAction {
  const action = (step.action || "wait").toString().toLowerCase().replace(/_/g, "");
  const params = step.params || {};

  if (action === "typetextat") {
    const text = String(params.text ?? params.content ?? "").trim();
    if (text && params.x != null && params.y != null) {
      const base: OperatorAction & Record<string, unknown> = {
        action: "clickandtype",
        x: Number(params.x),
        y: Number(params.y),
        content: text,
      };
      if ("distance" in params || "amount" in params) {
        base.distance = Number(params.distance ?? params.amount ?? 800);
      }
      return base as OperatorAction;
    }
    if (text) {
      return { action: "type", content: text } as OperatorAction;
    }
  }

  const opAction = STEP_TO_OP[action] ?? action;
  const base: OperatorAction & Record<string, unknown> = { action: opAction };
  if ("x" in params && params.x != null) base.x = Number(params.x);
  if ("y" in params && params.y != null) base.y = Number(params.y);
  if ("x1" in params && params.x1 != null) base.x1 = Number(params.x1);
  if ("y1" in params && params.y1 != null) base.y1 = Number(params.y1);
  if ("x2" in params && params.x2 != null) base.x2 = Number(params.x2);
  if ("y2" in params && params.y2 != null) base.y2 = Number(params.y2);
  if ("content" in params || "text" in params) base.content = String(params.text ?? params.content ?? "");
  if ("keys" in params) base.keys = params.keys;
  if ("key" in params) base.key = params.key;
  if ("seconds" in params) base.seconds = Number(params.seconds);
  if ("direction" in params) base.direction = params.direction;
  if ("distance" in params || "amount" in params) base.distance = Number(params.distance ?? params.amount ?? 300);
  if ("url" in params) base.url = params.url;
  if ("appName" in params) base.appName = params.appName;
  if ("value" in params) base.value = params.value;
  if ("selector" in params && params.selector != null) base.selector = String(params.selector);
  if ("integration" in params && params.integration != null) base.integration = String(params.integration);
  if ("method" in params && params.method != null) base.method = String(params.method);
  if ("args" in params && params.args != null) base.args = params.args as Record<string, unknown>;
  return base as OperatorAction;
}

/**
 * After VLM inference, merge workflow `type_text_at` literal text (or `typingOverride`)
 * into the operator action: pointer-only actions become `clickandtype`; `type`/`clickandtype`
 * content is forced to the workflow string. Mirrors Python `merge_type_text_at_workflow_literal`.
 */
export function mergeTypeTextAtWorkflowLiteral(
  step: Step,
  action: OperatorAction,
  typingOverride?: string,
): OperatorAction {
  const sa = (step.action || "").toLowerCase().replace(/_/g, "");
  if (sa !== "typetextat") return action;
  const params = step.params || {};
  if (params.x != null && params.y != null) return action;
  const wf = (
    typingOverride?.trim() ||
    String(params.text ?? params.content ?? "").trim()
  );
  if (!wf) return action;

  const act = (action.action || "").toLowerCase().replace(/_/g, "");
  const ax = (action as Record<string, unknown>).x;
  const ay = (action as Record<string, unknown>).y;
  const pointerActs = ["click", "rightclick", "doubleclick", "hover", "longpress"];
  if (pointerActs.includes(act) && ax != null && ay != null) {
    const dist =
      params.distance != null || params.amount != null
        ? Number(params.distance ?? params.amount ?? 800)
        : 800;
    return {
      ...action,
      action: "clickandtype",
      x: Number(ax),
      y: Number(ay),
      content: wf,
      distance: Number.isFinite(dist) ? dist : 800,
    } as OperatorAction;
  }
  if (act === "clickandtype" || act === "type") {
    return { ...action, content: wf } as OperatorAction;
  }
  return action;
}

export async function executeStep(step: Step): Promise<boolean> {
  try {
    const op = stepToOperatorAction(step);
    const result = await execute(op);
    return result === true;
  } catch (e) {
    console.error("Direct executor failed:", e);
    return false;
  }
}
