/**
 * Client-side catalog categories for the integrations grid (toolbar tabs).
 * Backend `GET /api/integrations` has no category field yet — replace with API data when the catalog grows.
 */
export type IntegrationCategoryId = "all" | "alerting" | "logging_apm" | "infrastructure" | "ci_cd";

export const INTEGRATION_CATEGORY_TABS: { id: IntegrationCategoryId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "alerting", label: "Alerting" },
  { id: "logging_apm", label: "Logging & APM" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "ci_cd", label: "CI/CD" },
];

/** Non-"all" category for each Echo catalog id (`slack`, `github`, …). */
export function categoryForIntegrationId(id: string): Exclude<IntegrationCategoryId, "all"> {
  const k = id.trim().toLowerCase();
  switch (k) {
    case "slack":
      return "alerting";
    case "gmail":
      return "logging_apm";
    case "google":
      return "infrastructure";
    case "github":
      return "ci_cd";
    default:
      return "infrastructure";
  }
}

export function integrationMatchesCategoryTab(
  integrationId: string,
  tab: IntegrationCategoryId,
): boolean {
  if (tab === "all") return true;
  return categoryForIntegrationId(integrationId) === tab;
}
