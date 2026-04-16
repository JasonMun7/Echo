/** Firestore Timestamp / number / ISO string → epoch ms. */
export function getWorkflowTimeMs(x: unknown): number {
  if (typeof (x as { toMillis?: () => number })?.toMillis === "function") {
    return (x as { toMillis: () => number }).toMillis();
  }
  if (typeof x === "number") return x > 1e12 ? x : x * 1000;
  if (typeof x === "string") return new Date(x).getTime() || 0;
  const o = x as { seconds?: number; _seconds?: number };
  const sec = o?.seconds ?? (o as { _seconds?: number })._seconds;
  return typeof sec === "number" ? sec * 1000 : 0;
}

export function workflowActivityMs(w: { createdAt?: unknown; updatedAt?: unknown }): number {
  return Math.max(getWorkflowTimeMs(w.createdAt), getWorkflowTimeMs(w.updatedAt));
}

/**
 * Single “most recently touched” workflow id (max activity time; tie-break by id).
 */
export function featuredWorkflowId(
  all: Array<{ id: string; createdAt?: unknown; updatedAt?: unknown }>,
): string | null {
  if (all.length === 0) return null;
  let best = all[0];
  let bestMs = workflowActivityMs(best);
  for (let i = 1; i < all.length; i++) {
    const w = all[i];
    const ms = workflowActivityMs(w);
    if (ms > bestMs || (ms === bestMs && w.id.localeCompare(best.id) > 0)) {
      best = w;
      bestMs = ms;
    }
  }
  return best.id;
}
