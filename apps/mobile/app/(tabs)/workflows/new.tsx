import { useState } from "react";
import { View, Text, TextInput, Alert, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { GradientButton } from "@/components/ui/GradientButton";
import { colors } from "@echo/design-tokens";

export default function NewWorkflowScreen() {
  const [name, setName] = useState("");
  const [workflowType, setWorkflowType] = useState<"browser" | "desktop">("browser");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || "Untitled workflow",
          workflow_type: workflowType,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.replace(`/(tabs)/workflows/${data.id}`);
      } else {
        Alert.alert("Error", "Failed to create workflow.");
      }
    } catch {
      Alert.alert("Error", "Failed to create workflow.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Describe to create — primary method */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create with AI</Text>
        <Text style={styles.sectionDesc}>
          Describe what you want to automate and our agent will build the workflow for you.
        </Text>
        <GradientButton
          title="Describe to Agent"
          gradient="cyanLavender"
          onPress={() => router.push("/(tabs)/chat")}
        />
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or build manually</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Manual creation */}
      <View style={styles.section}>
        <Text style={styles.label}>Workflow Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Daily report automation"
          placeholderTextColor={colors.textLight}
          value={name}
          onChangeText={setName}
        />

        <Text style={[styles.label, { marginTop: 16 }]}>Type</Text>
        <View style={styles.typeRow}>
          {(["browser", "desktop"] as const).map((t) => (
            <Pressable
              key={t}
              style={[styles.typeBtn, workflowType === t && styles.typeBtnActive]}
              onPress={() => setWorkflowType(t)}
            >
              <Text style={[styles.typeBtnText, workflowType === t && styles.typeBtnTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>

        <GradientButton
          title="Create Workflow"
          gradient="primary"
          onPress={handleCreate}
          loading={loading}
          style={{ marginTop: 24 }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ghost,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  sectionDesc: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: "Inter",
    lineHeight: 20,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: "Inter",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
    fontFamily: "Inter-Medium",
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: colors.text,
    fontFamily: "Inter",
  },
  typeRow: {
    flexDirection: "row",
    gap: 12,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
  },
  typeBtnActive: {
    borderColor: colors.lavender,
    backgroundColor: colors.lavender20,
  },
  typeBtnText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: "500",
    fontFamily: "Inter-Medium",
  },
  typeBtnTextActive: {
    color: colors.lavender,
  },
});
