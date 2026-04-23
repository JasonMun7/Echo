/** Parse Firestore Timestamp, ISO string, seconds, or millis to epoch ms. */
export function workflowTimestampMillis(x: unknown): number {
  if (typeof (x as { toMillis?: () => number })?.toMillis === "function") {
    return (x as { toMillis: () => number }).toMillis();
  }
  if (typeof x === "number") return x > 1e12 ? x : x * 1000;
  if (typeof x === "string") return new Date(x).getTime() || 0;
  const o = x as { seconds?: number; _seconds?: number };
  const sec = o?.seconds ?? o?._seconds;
  return typeof sec === "number" ? sec * 1000 : 0;
}

/** Latest activity for sorting / display — max of updated vs created when both exist. */
export function workflowActivityMillis(updatedAt: unknown, createdAt: unknown): number {
  const u = workflowTimestampMillis(updatedAt);
  const c = workflowTimestampMillis(createdAt);
  if (u && c) return Math.max(u, c);
  return u || c || 0;
}

/** Full date/time for `title` tooltips. */
export function formatWorkflowAbsoluteTime(updatedAt: unknown, createdAt: unknown): string {
  const ts = workflowActivityMillis(updatedAt, createdAt);
  if (!ts) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(ts));
}

/**
 * Compact relative / absolute label for workflow list cards (neutral dashboard copy).
 */
export function formatWorkflowListTime(updatedAt: unknown, createdAt: unknown): string {
  const ts = workflowActivityMillis(updatedAt, createdAt);
  if (!ts) return "";
  const now = Date.now();
  const diff = now - ts;
  if (diff < 0) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(ts),
    );
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(ts),
  );
}
