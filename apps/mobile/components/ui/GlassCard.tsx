import { View, type ViewProps, Platform, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";

const iosVersion = Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) : 0;
export const supportsLiquidGlass = Platform.OS === "ios" && iosVersion >= 26;

interface GlassCardProps extends ViewProps {
  /** Glass style for iOS 26+ Liquid Glass */
  glassStyle?: "regular" | "clear" | "prominent";
  /** Blur variant for iOS < 26 fallback */
  variant?: "light" | "dark";
  /** Blur intensity for iOS < 26 fallback */
  intensity?: number;
}

/**
 * Cross-platform glass card:
 *   iOS 26+  → native Liquid Glass (expo-glass-effect GlassView)
 *   iOS < 26 → BlurView + translucent backing
 *   Android  → solid semi-transparent card
 */
export function GlassCard({
  glassStyle = "regular",
  variant = "dark",
  intensity = 50,
  style,
  children,
  ...props
}: GlassCardProps) {
  // ── iOS 26+ Liquid Glass ──────────────────────────────
  if (supportsLiquidGlass) {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        style={[styles.card, style]}
        {...(props as object)}
      >
        {children}
      </GlassView>
    );
  }

  // ── iOS < 26 BlurView fallback ────────────────────────
  if (Platform.OS === "ios") {
    return (
      <View style={[styles.card, style]} {...props}>
        <View
          style={[
            StyleSheet.absoluteFill,
            variant === "light" ? styles.lightBacking : styles.darkBacking,
          ]}
        />
        <BlurView
          intensity={intensity}
          tint={variant === "light" ? "light" : "dark"}
          style={StyleSheet.absoluteFill}
        />
        {children}
      </View>
    );
  }

  // ── Android solid fallback ────────────────────────────
  return (
    <View
      style={[
        styles.card,
        variant === "light" ? styles.androidLight : styles.androidDark,
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
  },
  lightBacking: {
    backgroundColor: "rgba(255, 255, 255, 0.82)",
  },
  darkBacking: {
    backgroundColor: "rgba(255, 255, 255, 0.78)",
  },
  androidLight: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  androidDark: {
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(165, 119, 255, 0.15)",
  },
});
