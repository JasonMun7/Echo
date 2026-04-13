/**
 * Run terminal states: user cancel / disconnect should not read as a hard "failure"
 * (avoids showing WebSocket-closed strings as errors). See DESIGN_SYSTEM.md for surface styling.
 */

export function isCancellationLikeError(status: string | undefined, error: unknown): boolean {
  if (status === "cancelled") return true;
  const msg = String(error ?? "").toLowerCase();
  if (status !== "failed" || !msg) return false;
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

export type TerminalRunKind = "success" | "stopped" | "failed";

export function getTerminalRunPresentation(
  status: string | undefined,
  error: unknown,
): {
  kind: TerminalRunKind;
  headline: string;
  description?: string;
} {
  const s = status ?? "";
  if (s === "completed") {
    return { kind: "success", headline: "Completed" };
  }
  if (s === "cancelled") {
    return {
      kind: "stopped",
      headline: "Run stopped",
      description:
        "You cancelled this run. Nothing went wrong — EchoPrism simply stopped when you asked it to.",
    };
  }
  if (isCancellationLikeError(s, error)) {
    return {
      kind: "stopped",
      headline: "Run stopped",
      description:
        "This run ended before completion — for example after cancel or when the connection closed. It is not treated as a workflow failure.",
    };
  }
  return {
    kind: "failed",
    headline: "Run did not finish",
    description:
      error != null
        ? String(error)
        : "Something prevented this run from completing. You can retry below.",
  };
}

/** Badge label in tables (friendlier than raw Firestore status when we collapse cancel-like failures). */
export function getRunStatusBadgeLabel(status: string, error: unknown): string {
  if (status === "completed") return "Completed";
  if (status === "cancelled" || isCancellationLikeError(status, error)) return "Stopped";
  if (status === "failed") return "Needs attention";
  if (status === "running") return "Running";
  if (status === "pending") return "Pending";
  if (status === "awaiting_user") return "Needs you";
  return status;
}
