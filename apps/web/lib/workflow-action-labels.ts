/**
 * Single source of truth for human-readable workflow step action labels in the UI.
 * Persist snake_case in API/Firestore; display Title Case here.
 */
export function formatAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Picker / node titles — never surface raw `api_call` without context. */
export function formatActionPickerLabel(action: string): string {
  if (action === "api_call") {
    return `⚡ ${formatAction(action)} (App Integration)`;
  }
  return formatAction(action);
}
