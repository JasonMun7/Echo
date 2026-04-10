/**
 * Pure routing rules: which backend executes a given operator action.
 * Used by unified-operator and unit-tested in isolation (no Playwright/NutJS).
 */

export const DESKTOP_ONLY_ACTIONS = new Set(["openapp", "focusapp"]);

export const BROWSER_ONLY_ACTIONS = new Set([
  "navigate",
  "waitforelement",
  "selectoption",
  "hover",
]);

/** Normalizes OperatorAction.action the same way unified-operator does. */
export function normalizeOperatorAction(action: string): string {
  return (action || "").toLowerCase().replace(/_/g, "");
}

/**
 * @param hasBrowserContext - true when a Playwright page is still open (shared actions may go to browser).
 */
export function resolveExecuteRoute(
  actionRaw: string,
  hasBrowserContext: boolean,
): "playwright" | "desktop" {
  const act = normalizeOperatorAction(actionRaw);
  if (DESKTOP_ONLY_ACTIONS.has(act)) return "desktop";
  if (BROWSER_ONLY_ACTIONS.has(act)) return "playwright";
  if (hasBrowserContext) return "playwright";
  return "desktop";
}

/** Stable reason token for debug logs (hypothesis H1). */
export function explainExecuteRoute(actionRaw: string, hasBrowserContext: boolean): string {
  const act = normalizeOperatorAction(actionRaw);
  if (DESKTOP_ONLY_ACTIONS.has(act)) return "desktop_only";
  if (BROWSER_ONLY_ACTIONS.has(act)) return "browser_only";
  if (hasBrowserContext) return "shared_routes_playwright_stale_browser";
  return "shared_routes_desktop";
}
