import { useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Alert, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { useRunLogs } from "@/hooks/use-firestore-listener";
import { StatusBadge } from "@/components/echo/StatusBadge";
import { GradientButton } from "@/components/ui/GradientButton";
import { colors } from "@echo/design-tokens";
import type { Run } from "@echo/types";

export default function RunDetailScreen() {
  const { id, runId } = useLocalSearchParams<{ id: string; runId: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [feedback, setFeedback] = useState("");

  // Real-time listener on the run document
  useEffect(() => {
    if (!db || !id || !runId) return;
    const runRef = doc(db, "workflows", id, "runs", runId);
    const unsub = onSnapshot(
      runRef,
      (snap) => {
        if (snap.exists()) {
          setRun({ id: snap.id, ...snap.data() } as Run);
        }
      },
      () => {},
    );
    return unsub;
  }, [id, runId]);

  // Real-time logs via Firestore listener
  const { data: logs } = useRunLogs(id, runId);

  async function handleCancel() {
    Alert.alert("Cancel Run", "Are you sure?", [
      { text: "No", style: "cancel" },
      {
        text: "Cancel Run",
        style: "destructive",
        onPress: async () => {
          await apiFetch(`/api/run/${id}/${runId}`, { method: "DELETE" });
        },
      },
    ]);
  }

  async function handleFeedback() {
    if (!feedback.trim()) return;
    try {
      await apiFetch(`/api/run/${id}/${runId}/calluser-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      setFeedback("");
    } catch {
      Alert.alert("Error", "Failed to send feedback.");
    }
  }

  if (!run) {
    return (
      <View style={styles.loading}>
        <Stack.Screen
          options={{
            headerLeft: () => (
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Ionicons name="arrow-back" size={22} color="#1a1a2e" />
              </Pressable>
            ),
          }}
        />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const isActive = run.status === "running" || run.status === "pending";
  const needsInput = run.status === "awaiting_user";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8} style={{ marginRight: 8 }}>
              <Ionicons name="arrow-back" size={22} color="#1a1a2e" />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={() => router.navigate("/(tabs)/workflows")}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: colors.textMuted,
                  fontFamily: "Inter-Medium",
                  fontWeight: "500",
                }}
              >
                All Workflows
              </Text>
            </Pressable>
          ),
          title: `Run ${runId?.slice(0, 8) ?? ""}`,
        }}
      />
      {/* Status header */}
      <View style={styles.header}>
        <StatusBadge status={run.status} />
        <Text style={styles.runIdText}>Run {run.id.slice(0, 8)}</Text>
      </View>

      {/* Screenshot */}
      {run.lastScreenshotUrl && (
        <Image
          source={{ uri: run.lastScreenshotUrl }}
          style={styles.screenshot}
          contentFit="contain"
        />
      )}

      {/* Awaiting user input banner */}
      {needsInput && (
        <View style={styles.inputBanner}>
          <Text style={styles.inputBannerTitle}>Input Required</Text>
          <Text style={styles.inputBannerReason}>
            {run.callUserReason || "The workflow needs your input to continue."}
          </Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Type your response..."
            placeholderTextColor={colors.textLight}
            value={feedback}
            onChangeText={setFeedback}
            multiline
          />
          <GradientButton title="Send" gradient="cyanLavender" onPress={handleFeedback} />
        </View>
      )}

      {/* Actions */}
      {isActive && (
        <Pressable style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelBtnText}>Cancel Run</Text>
        </Pressable>
      )}

      {/* Error */}
      {run.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{run.error}</Text>
        </View>
      )}

      {/* Logs — real-time from Firestore */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Execution Log</Text>
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>
            {isActive ? "Waiting for logs..." : "No logs recorded."}
          </Text>
        ) : (
          logs.map((log: any, i: number) => (
            <View key={log.id || i} style={styles.logItem}>
              <View style={styles.logDot} />
              <View style={styles.logContent}>
                <Text style={styles.logAction}>{log.action ?? `Step ${log.step_index ?? i}`}</Text>
                {log.message && <Text style={styles.logMessage}>{log.message}</Text>}
              </View>
              {log.status && <StatusBadge status={log.status} />}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ghost },
  content: { padding: 16, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: colors.textMuted, fontFamily: "Inter" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  runIdText: { fontSize: 14, color: colors.textMuted, fontFamily: "Inter" },
  screenshot: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    marginBottom: 16,
    backgroundColor: colors.white,
  },
  inputBanner: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  inputBannerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.warning,
    fontFamily: "Inter-SemiBold",
  },
  inputBannerReason: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: "Inter",
  },
  feedbackInput: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    fontFamily: "Inter",
    minHeight: 60,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  cancelBtnText: { color: colors.error, fontWeight: "500", fontFamily: "Inter-Medium" },
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.error,
    fontFamily: "Inter-SemiBold",
  },
  errorText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 4,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
    marginBottom: 12,
  },
  emptyText: { fontSize: 14, color: colors.textMuted, fontFamily: "Inter" },
  logItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lavender,
    marginTop: 6,
  },
  logContent: { flex: 1 },
  logAction: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
    fontFamily: "Inter-Medium",
  },
  logMessage: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 2,
  },
});
