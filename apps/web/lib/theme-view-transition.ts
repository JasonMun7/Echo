"use client";

/**
 * Apply a theme change inside document.startViewTransition when supported
 * so the root gets a smooth cross-fade (see globals.css ::view-transition-*).
 */
export function setThemeWithViewTransition(apply: () => void): void {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(apply);
  } else {
    apply();
  }
}

/** Cycle: system → light → dark → system (stored preference, not resolved). */
export function nextThemePreference(current: string | undefined): "system" | "light" | "dark" {
  const t = current ?? "system";
  if (t === "system") return "light";
  if (t === "light") return "dark";
  return "system";
}
