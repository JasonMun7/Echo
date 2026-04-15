import { cn } from "@/lib/utils";

/** Horizontal inset — shared by `SiteHeader` and the main column so title/search align with page content. */
export const DASHBOARD_INSET_X_CLASS = "px-6 sm:px-8 md:px-11 lg:px-14";

/** Vertical padding for the scrollable main column only (below the header). */
export const DASHBOARD_MAIN_PAD_Y_CLASS = "py-8 sm:py-9 md:py-10 lg:py-12";

/**
 * Padding for the dashboard main column (below `SiteHeader`), applied in
 * [`app/dashboard/layout.tsx`](../app/dashboard/layout.tsx).
 *
 * Do not repeat these values on individual pages — use vertical `gap-*` only.
 * Full-bleed routes use {@link dashboardMainBleedClass} in a segment `layout.tsx`.
 */
export const DASHBOARD_MAIN_PAD_CLASS = cn(DASHBOARD_INSET_X_CLASS, DASHBOARD_MAIN_PAD_Y_CLASS);

/** Negates {@link DASHBOARD_INSET_X_CLASS} (horizontal full-bleed). */
export const DASHBOARD_INSET_X_NEGATE_CLASS = "-mx-6 sm:-mx-8 md:-mx-11 lg:-mx-14";

/** Negates {@link DASHBOARD_MAIN_PAD_Y_CLASS}. */
export const DASHBOARD_MAIN_PAD_Y_NEGATE_CLASS = "-my-8 sm:-my-9 md:-my-10 lg:-my-12";

/**
 * Negates {@link DASHBOARD_MAIN_PAD_CLASS} so a route can span edge-to-edge in the main column
 * (workflow canvas, chat). Keep in sync with the pad classes above.
 */
export const DASHBOARD_MAIN_PAD_NEGATE_CLASS = cn(
  DASHBOARD_INSET_X_NEGATE_CLASS,
  DASHBOARD_MAIN_PAD_Y_NEGATE_CLASS,
);

/** Wrapper for full-bleed dashboard segments: breakout + fill height. */
export function dashboardMainBleedClass(className?: string) {
  return cn("flex min-h-0 min-w-0 flex-1 flex-col", DASHBOARD_MAIN_PAD_NEGATE_CLASS, className);
}
