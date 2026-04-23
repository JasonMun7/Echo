import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Ghost icon-only hit target (32×32): muted glyph, `hover:bg-muted` only — **DESIGN_SYSTEM §4**.
 * Use on `Link` or native `button` when `Button`/`asChild` is awkward.
 */
export function echoIconButtonGhostClassName(className?: string) {
  return cn(
    buttonVariants({ variant: "ghost", size: "icon-sm" }),
    "shrink-0 text-muted-foreground",
    className,
  );
}

/**
 * Same as {@link echoIconButtonGhostClassName} with a circular hit target (kebab triggers).
 */
export function echoIconButtonGhostCircleClassName(className?: string) {
  return cn(echoIconButtonGhostClassName(), "rounded-full", className);
}

const echoIconButtonCardSurfaceClass = cn(
  "inline-flex size-8 shrink-0 items-center justify-center",
  "border border-border bg-card text-foreground shadow-sm",
  "transition-colors hover:bg-muted",
  "outline-none focus-visible:border-border focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  "disabled:pointer-events-none disabled:opacity-40",
);

/** Bordered icon control on card / editor chrome (square corners). */
export const ECHO_ICON_BUTTON_CARD_CLASS = cn(echoIconButtonCardSurfaceClass, "rounded-md");

/**
 * Circular, slightly lifted control for menus over imagery or busy tiles
 * (e.g. workflow grid cards).
 */
export const ECHO_ICON_BUTTON_CARD_FLOATING_CLASS = cn(
  echoIconButtonCardSurfaceClass,
  "rounded-full bg-card/95 backdrop-blur-sm",
);
