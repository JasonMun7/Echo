/**
 * Echo Design System — Typography Scale
 *
 * Maps to Tailwind text-* classes used in the web app.
 * Values are [fontSize, lineHeight] tuples.
 */

export const fontFamily = {
  sans: "Inter",
} as const;

export const fontSize = {
  xs: { size: 12, lineHeight: 16 },
  sm: { size: 14, lineHeight: 20 },
  base: { size: 16, lineHeight: 24 },
  lg: { size: 18, lineHeight: 28 },
  xl: { size: 20, lineHeight: 28 },
  "2xl": { size: 24, lineHeight: 32 },
  "3xl": { size: 30, lineHeight: 36 },
  "4xl": { size: 36, lineHeight: 40 },
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};

/**
 * Pre-composed text styles matching the design system spec.
 */
export const textStyles = {
  pageTitle: { fontSize: 30, lineHeight: 36, fontWeight: "700" as const },
  sectionTitle: { fontSize: 24, lineHeight: 32, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  muted: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  small: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" as const },
} as const;
