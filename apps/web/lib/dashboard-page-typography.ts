/**
 * Canonical dashboard page title + description typography (body font / Inter via `layout`).
 * Use in {@link SiteHeader} and in-page hero rows so every route matches.
 */
export const DASHBOARD_PAGE_TITLE_CLASS =
  "text-xl font-semibold tracking-tight text-foreground sm:text-2xl";

/** In-card titles (workflow header, toolbars) — smaller than {@link DASHBOARD_PAGE_TITLE_CLASS}. */
export const DASHBOARD_PAGE_TITLE_SM_CLASS =
  "text-base font-semibold tracking-tight text-foreground sm:text-lg";

export const DASHBOARD_PAGE_DESCRIPTION_CLASS =
  "text-sm text-muted-foreground leading-relaxed sm:text-base";
