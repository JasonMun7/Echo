import { COMPOSIO_TOOL_CATALOG, type ComposioToolCatalogEntry } from "@/lib/composio-tool-catalog";

/** App buckets for the workflow editor: each maps to an Integrations catalog `id`. */
export const COMPOSIO_APP_GROUPS = [
  {
    key: "slack",
    label: "Slack",
    integrationId: "slack",
    categories: ["Slack"] as const,
  },
  {
    key: "gmail",
    label: "Gmail",
    integrationId: "gmail",
    categories: ["Gmail"] as const,
  },
  {
    key: "github",
    label: "GitHub",
    integrationId: "github",
    categories: ["GitHub"] as const,
  },
  {
    key: "google",
    label: "Google",
    integrationId: "google",
    categories: ["Google Calendar", "Google Drive", "Google"] as const,
  },
] as const;

export type ComposioAppGroupKey = (typeof COMPOSIO_APP_GROUPS)[number]["key"];

export function inferAppGroupKeyFromSlug(slug: string): ComposioAppGroupKey {
  const u = (slug || "").trim().toUpperCase();
  if (u.startsWith("SLACK")) return "slack";
  if (u.startsWith("GMAIL")) return "gmail";
  if (u.startsWith("GITHUB")) return "github";
  if (
    u.startsWith("GOOGLE") ||
    u.startsWith("GOOGLEDRIVE") ||
    u.startsWith("GOOGLECALENDAR") ||
    u.startsWith("GOOGLEGET")
  ) {
    return "google";
  }
  return "slack";
}

export function catalogEntriesForAppGroup(
  groupKey: ComposioAppGroupKey,
): ComposioToolCatalogEntry[] {
  const g = COMPOSIO_APP_GROUPS.find((x) => x.key === groupKey);
  if (!g) return [];
  const cats: readonly string[] = g.categories;
  return COMPOSIO_TOOL_CATALOG.filter((e) => cats.includes(e.category));
}
