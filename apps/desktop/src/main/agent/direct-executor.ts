/**
 * Direct executor for deterministic steps — Desktop context (nut-js).
 *
 * Determinism rules for desktop:
 *   - navigate is NOT deterministic (classified as VLM/EchoPrism — URL alone doesn't guarantee we land on the right page)
 *   - Steps with explicit (x, y) coords, hotkeys, wait, press_key, scroll ARE deterministic
 *   - right_click / double_click with coords are deterministic
 *   - hotkey with keys[] is deterministic
 *   - open_app / focus_app with appName are deterministic
 */

import type { Step } from "@echo/types";
import * as operator from "../operators/desktop-operator";

export function isDeterministic(step: Step): boolean {
  const params = step.params || {};
  const action = (step.action || "").toLowerCase().replace(/_/g, "");

  // navigate is non-deterministic — let EchoPrism handle URL navigation visually
  if (action === "navigate") return false;

  // Coord-based pointer actions
  if ("x" in params && "y" in params) {
    if (["clickat", "rightclick", "doubleclick", "drag"].includes(action)) return true;
    if (action === "typetextat" && params.text) return true;
  }

  if (action === "wait" && params.seconds != null) return true;
  if (action === "presskey" && params.key) return true;
  if (action === "scroll" && params.direction) return true;
  if (action === "hotkey" && Array.isArray(params.keys) && (params.keys as string[]).length > 0) return true;
  if (action === "openapp" && params.appName) return true;
  if (action === "focusapp" && params.appName) return true;

  return false;
}

export async function executeStep(step: Step): Promise<boolean> {
  const action = (step.action || "wait").toString().toLowerCase().replace(/_/g, "");
  const params = step.params || {};

  try {
    if (action === "clickat") {
      await operator.click(Number(params.x ?? 500), Number(params.y ?? 500));
      return true;
    }

    if (action === "rightclick") {
      await operator.rightClick(Number(params.x ?? 500), Number(params.y ?? 500));
      return true;
    }

    if (action === "doubleclick") {
      await operator.doubleClick(Number(params.x ?? 500), Number(params.y ?? 500));
      return true;
    }

    if (action === "typetextat") {
      const text = String(params.text ?? "");
      // Click to focus the field first (even without coords)
      if ("x" in params && "y" in params) {
        await operator.click(Number(params.x), Number(params.y));
        // 100ms delay to allow the field to receive focus before typing
        await new Promise((r) => setTimeout(r, 100));
      }
      await operator.typeText(text);
      return true;
    }

    if (action === "hotkey") {
      const keys = Array.isArray(params.keys) ? (params.keys as string[]) : [];
      await operator.hotkey(keys);
      return true;
    }

    if (action === "wait") {
      await operator.wait(Number(params.seconds ?? 2));
      return true;
    }

    if (action === "presskey") {
      await operator.pressKey(String(params.key ?? "Enter"));
      return true;
    }

    if (action === "scroll") {
      const distance = Number((params as Record<string, unknown>).distance ?? params.amount ?? 300);
      const steps = Math.min(Math.max(1, Math.floor(distance / 100)), 20);
      await operator.scroll(
        Number(params.x ?? 500),
        Number(params.y ?? 500),
        String(params.direction ?? "down"),
        steps
      );
      return true;
    }

    if (action === "openapp") {
      await operator.openApp(String(params.appName ?? ""));
      return true;
    }

    if (action === "focusapp") {
      await operator.focusApp(String(params.appName ?? ""));
      return true;
    }

    console.warn("[direct-executor] Unknown action — not executing:", action);
    return false;
  } catch (e) {
    console.error("Direct executor failed:", e);
    return false;
  }
}
