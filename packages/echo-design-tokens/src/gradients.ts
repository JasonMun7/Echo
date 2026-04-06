/**
 * Echo Design System — Gradient Definitions
 *
 * For React Native, use expo-linear-gradient with these color stops.
 * For web, these map to the .echo-gradient-* utility classes.
 */

export const gradients = {
  /** Cetacean Blue → mid purple — hero backgrounds, sidebar */
  dark: {
    colors: ["#150A35", "#2d1b69"] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },

  /** Dark sidebar variant (top → bottom) */
  darkVertical: {
    colors: ["#2d1b69", "#150A35"] as const,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },

  /** Near-black → Lavender — CTAs, highlights */
  dramatic: {
    colors: ["#0d0620", "#A577FF"] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },

  /** Cetacean Blue → Cyan — secondary CTAs, badges */
  secondary: {
    colors: ["#150A35", "#21C4DD"] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },

  /** Cyan → Lavender — dual-accent highlights, hover states */
  cyanLavender: {
    colors: ["#21C4DD", "#A577FF"] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },

  /** Lavender → Cetacean Blue — primary buttons */
  primary: {
    colors: ["#A577FF", "#150A35"] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
} as const;
