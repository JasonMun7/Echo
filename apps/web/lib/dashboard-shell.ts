import { cn } from "@/lib/utils";

/**
 * Emphasized main column (card surface) next to the deemphasized sidebar rail.
 * Applied to `SidebarInset` in the root dashboard layout — do not repeat on individual pages.
 */
export const DASHBOARD_MAIN_SURFACE_CLASS = cn(
  "bg-card text-card-foreground",
  "min-h-0",
  "shadow-sm shadow-black/5 dark:shadow-black/35",
  "md:rounded-tl-2xl md:border-l md:border-border/60",
);

/**
 * Settings (profile) modal — emphasized main panel (right) beside the deemphasized `.echo-sidebar-inset` rail.
 * Same elevation as {@link DASHBOARD_MAIN_SURFACE_CLASS} (card + shadow); no `border-l` so the rail
 * meets the panel with shadow/tone only. Stacked mobile layout keeps a top border between rail and body.
 */
export const PROFILE_MODAL_MAIN_SURFACE_CLASS = cn(
  "bg-card text-card-foreground",
  "shadow-sm shadow-black/5 dark:shadow-black/35",
  "border-border/60 border-t md:rounded-tl-2xl md:border-t-0",
);

/** Top breathing room: reveals `bg-background` above the dashboard chrome (set on the shell in layout). */
export const DASHBOARD_SHELL_TOP_INSET_CLASS = "pt-2";

/** Horizontal inset — shared by `SiteHeader` and the main column so title/search align with page content. */
export const DASHBOARD_INSET_X_CLASS = "px-6 sm:px-8 md:px-11 lg:px-14";

/**
 * Vertical spacing for the main column body (below `SiteHeader`) using **margin**, not padding:
 * it sits outside the content box so route scroll regions keep a predictable flex height and
 * do not feel “clipped” the way layout-level `py-*` did. Keep in sync with
 * {@link DASHBOARD_MAIN_CONTENT_MY_NEGATE_CLASS} for full-bleed routes.
 */
export const DASHBOARD_MAIN_CONTENT_MY_CLASS = "my-4 sm:my-5 md:my-6";

/**
 * Padding for the dashboard main column (below `SiteHeader`), applied in
 * [`app/dashboard/layout.tsx`](../app/dashboard/layout.tsx).
 *
 * Horizontal inset only — combine with {@link DASHBOARD_MAIN_CONTENT_MY_CLASS} for the full
 * wrapper. Full-bleed routes use {@link dashboardMainBleedClass}.
 */
export const DASHBOARD_MAIN_PAD_CLASS = DASHBOARD_INSET_X_CLASS;

/** Negates {@link DASHBOARD_INSET_X_CLASS} (horizontal full-bleed). */
export const DASHBOARD_INSET_X_NEGATE_CLASS = "-mx-6 sm:-mx-8 md:-mx-11 lg:-mx-14";

/** Negates {@link DASHBOARD_MAIN_CONTENT_MY_CLASS} for full-bleed segments. */
export const DASHBOARD_MAIN_CONTENT_MY_NEGATE_CLASS = "-my-4 sm:-my-5 md:-my-6";

/**
 * Negates horizontal inset + vertical margin so a route can span edge-to-edge in the main column
 * (workflow canvas, chat). Keep in sync with {@link DASHBOARD_MAIN_PAD_CLASS} and
 * {@link DASHBOARD_MAIN_CONTENT_MY_CLASS}.
 */
export const DASHBOARD_MAIN_PAD_NEGATE_CLASS = cn(
  DASHBOARD_INSET_X_NEGATE_CLASS,
  DASHBOARD_MAIN_CONTENT_MY_NEGATE_CLASS,
);

/** Wrapper for full-bleed dashboard segments: breakout + fill height. */
export function dashboardMainBleedClass(className?: string) {
  return cn("flex min-h-0 min-w-0 flex-1 flex-col", DASHBOARD_MAIN_PAD_NEGATE_CLASS, className);
}
