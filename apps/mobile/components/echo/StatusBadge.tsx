import { View, Text, StyleSheet } from "react-native";
import { colors } from "@echo/design-tokens";

const statusConfig: Record<
  string,
  { bg: string; text: string; label?: string }
> = {
  draft: { bg: colors.lavender20, text: colors.lavender },
  processing: { bg: "rgba(245, 158, 11, 0.15)", text: colors.warning },
  ready: { bg: "rgba(34, 197, 94, 0.15)", text: colors.success },
  active: { bg: "rgba(34, 197, 94, 0.15)", text: colors.success },
  failed: { bg: "rgba(239, 68, 68, 0.15)", text: colors.error },
  cancelled: { bg: "rgba(107, 114, 128, 0.15)", text: colors.textMuted },
  running: { bg: "rgba(33, 196, 221, 0.15)", text: colors.cyan },
  pending: { bg: colors.lavender20, text: colors.lavender },
  completed: { bg: "rgba(34, 197, 94, 0.15)", text: colors.success },
  awaiting_user: { bg: "rgba(245, 158, 11, 0.15)", text: colors.warning, label: "Needs Input" },
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.draft;
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.text }]}>
        {config.label ?? status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter",
  },
});
