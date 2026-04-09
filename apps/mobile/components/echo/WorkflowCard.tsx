import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, borderRadius, shadows } from "@echo/design-tokens";
import { StatusBadge } from "./StatusBadge";
import type { Workflow } from "@echo/types";

interface WorkflowCardProps {
  workflow: Workflow & { thumbnailUrl?: string };
  onPress: () => void;
}

export function WorkflowCard({ workflow, onPress }: WorkflowCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.95 : 1 },
      ]}
    >
      {workflow.thumbnailUrl && (
        <Image
          source={{ uri: workflow.thumbnailUrl }}
          style={styles.thumbnail}
          contentFit="cover"
        />
      )}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name} numberOfLines={1}>
            {workflow.name || "Untitled workflow"}
          </Text>
          <StatusBadge status={workflow.status} />
        </View>
        <View style={styles.meta}>
          <Text style={styles.type}>
            {workflow.workflow_type === "desktop" ? "Desktop" : "Browser"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    marginBottom: 12,
    overflow: "hidden",
  },
  thumbnail: {
    width: "100%",
    height: 120,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter",
    flex: 1,
    marginRight: 8,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  type: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
  },
});
