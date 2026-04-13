/**
 * Desktop run results use { success, error? } only — treat user cancel / benign disconnect
 * like the web dashboard (no red "Failed" + raw WebSocket copy).
 */

export function isCancellationLikeRunError(error: unknown): boolean {
  const msg = String(error ?? "").toLowerCase();
  if (!msg) return false;
  const needles = [
    "websocket closed",
    "websocket error",
    "connection closed",
    "run cancelled",
    "cancelled by user",
    "canceled by user",
    "user aborted",
    "going away",
    "abnormal closure",
  ];
  return needles.some((n) => msg.includes(n));
}

export type DesktopRunOutcome = "success" | "stopped" | "failed";

export function getDesktopRunOutcome(success: boolean, error?: string): DesktopRunOutcome {
  if (success) return "success";
  if (isCancellationLikeRunError(error)) return "stopped";
  return "failed";
}

export function getRunStoppedDescription(error?: string): string {
  const msg = String(error ?? "").toLowerCase();
  if (msg.includes("cancelled") || msg.includes("canceled") || msg.includes("user aborted")) {
    return "You stopped this run. Nothing went wrong — EchoPrism ended when you asked it to.";
  }
  return "This run ended before completion — for example after cancel or when the connection closed. It is not a workflow failure.";
}
