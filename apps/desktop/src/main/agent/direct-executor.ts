/**
 * Direct executor for deterministic steps — uses unified operator (NutJS/Playwright).
 *
 * Determinism rules:
 *   - navigate is NOT deterministic (EchoPrism handles visually)
 *   - Steps with explicit (x, y) coords, hotkeys, wait, press_key, scroll ARE deterministic
 *   - open_app / focus_app are deterministic
 */

import type { Step } from "@echo/types";
import type { OperatorAction } from "@echo/types";
import { execute } from "../operators/unified-operator";

export function isDeterministic(step: Step): boolean {
  const params = step.params || {};
  const action = (step.action || "").toLowerCase().replace(/_/g, "");

  // Click/pointer actions are NEVER deterministic — even when they carry
  // synthesised (x, y) coordinates the VLM should visually verify them.
  // Only purely mechanical / non-visual actions bypass VLM reasoning.

  if (action === "wait" && params.seconds != null) return true;
  if (action === "presskey" && params.key) return true;
  if (action === "scroll" && params.direction) return true;
  if (action === "hotkey" && Array.isArray(params.keys) && (params.keys as string[]).length > 0) return true;
  if (action === "openapp" && params.appName) return true;
  if (action === "focusapp" && params.appName) return true;

  // Everything else (click, doubleclick, rightclick, hover, drag, type_text_at,
  // navigate, etc.) goes through VLM reasoning so the agent can visually
  // verify the target before acting.
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
};

function toOperatorAction(step: Step): OperatorAction {
  const action = (step.action || "wait").toString().toLowerCase().replace(/_/g, "");
  const params = step.params || {};
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
  return base;
}

export async function executeStep(step: Step): Promise<boolean> {
  const action = (step.action || "wait").toString().toLowerCase().replace(/_/g, "");
  const params = step.params || {};

  try {
    if (action === "typetextat") {
      const text = String(params.text ?? "");
      if ("x" in params && "y" in params) {
        const clickResult = await execute({ action: "click", x: Number(params.x ?? 500), y: Number(params.y ?? 500) });
        if (clickResult !== true) return false;
        await new Promise((r) => setTimeout(r, 100));
      }
      const typeResult = await execute({ action: "type", content: text });
      return typeResult === true;
    }

    const op = toOperatorAction(step);
    const result = await execute(op);
    return result === true;
  } catch (e) {
    console.error("Direct executor failed:", e);
    return false;
  }
}
