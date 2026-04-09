/**
 * Echo Design System — Color Palette
 *
 * Source of truth for all color values across web & mobile.
 * Extracted from apps/web/app/globals.css and DESIGN_SYSTEM.md.
 */

export const colors = {
  // ── Primary ──────────────────────────────────────────────
  cetacean: "#150A35",
  lavender: "#A577FF",
  ghost: "#F5F7FC",

  // ── Secondary ────────────────────────────────────────────
  cyan: "#21C4DD",

  // ── Lavender shades (opacity tints) ──────────────────────
  lavender80: "rgba(165, 119, 255, 0.8)",
  lavender60: "rgba(165, 119, 255, 0.6)",
  lavender40: "rgba(165, 119, 255, 0.4)",
  lavender20: "rgba(165, 119, 255, 0.2)",

  // ── Cyan shades (opacity tints) ──────────────────────────
  cyan80: "rgba(33, 196, 221, 0.8)",
  cyan60: "rgba(33, 196, 221, 0.6)",
  cyan40: "rgba(33, 196, 221, 0.4)",
  cyan20: "rgba(33, 196, 221, 0.2)",

  // ── Semantic ─────────────────────────────────────────────
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",

  // ── Text ─────────────────────────────────────────────────
  text: "#150A35",
  textMuted: "#6b7280",
  textLight: "#9ca3af",

  // ── Surface / borders ────────────────────────────────────
  surface: "#F5F7FC",
  card: "#ffffff",
  border: "#e5e7eb",
  borderAccent: "rgba(165, 119, 255, 0.2)",

  // ── Misc ─────────────────────────────────────────────────
  white: "#ffffff",
  black: "#000000",
} as const;

export type ColorToken = keyof typeof colors;
