import { Pressable, Text, ActivityIndicator, StyleSheet, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { gradients, borderRadius } from "@echo/design-tokens";

type GradientKey = keyof typeof gradients;

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  gradient?: GradientKey;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function GradientButton({
  title,
  onPress,
  gradient = "primary",
  loading = false,
  disabled = false,
  style,
}: GradientButtonProps) {
  const g = gradients[gradient];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.wrapper, { opacity: pressed || disabled ? 0.85 : 1 }, style]}
    >
      <LinearGradient colors={[...g.colors]} start={g.start} end={g.end} style={styles.gradient}>
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.text}>{title}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: borderRadius.DEFAULT,
    overflow: "hidden",
  },
  gradient: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.DEFAULT,
  },
  text: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Inter",
  },
});
