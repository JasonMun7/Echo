import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkflowRuns } from "@/hooks/use-firestore-listener";
import { GradientButton } from "@/components/ui/GradientButton";
import { StatusBadge } from "@/components/echo/StatusBadge";
import { ShareModal } from "@/components/echo/ShareModal";
import { colors } from "@echo/design-tokens";
import type { Workflow, Step, Run } from "@echo/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ─── helpers ─── */

function getTime(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "object" && v !== null && "toMillis" in v) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  if (typeof v === "string") return new Date(v).getTime() || 0;
  return 0;
}

function formatDuration(startMs: number, endMs: number): string {
  if (!startMs || !endMs || endMs <= startMs) return "—";
  const secs = Math.round((endMs - startMs) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function formatDate(v: unknown): string {
  const ms = getTime(v);
  if (!ms) return "—";
  const d = new Date(ms);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${month} ${day}, ${time}`;
}

/* ─── component ─── */

interface Collaborator {
  uid: string;
  email: string;
  display_name: string;
}

export default function WorkflowDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [forkLoading, setForkLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { data: runs } = useWorkflowRuns(id ?? null) as unknown as {
    data: Run[];
  };
  const insets = useSafeAreaInsets();

  const isOwner = workflow?.owner_uid === user?.uid;

  const load = useCallback(async () => {
    try {
      const [wfRes, collabRes] = await Promise.all([
        apiFetch(`/api/workflows/${id}`),
        apiFetch(`/api/workflows/${id}/collaborators`),
      ]);
      if (wfRes.ok) {
        const data = await wfRes.json();
        setWorkflow(data.workflow ?? data);
        setSteps(data.steps ?? []);
      }
      if (collabRes.ok) {
        const data = await collabRes.json();
        setCollaborators(data.collaborators ?? data ?? []);
      }
    } catch {}
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleRun() {
    setRunLoading(true);
    try {
      const res = await apiFetch(`/api/run/${id}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        router.push(`/(tabs)/workflows/${id}/runs/${data.run_id ?? data.id}`);
      } else {
        Alert.alert("Error", "Failed to start run.");
      }
    } catch {
      Alert.alert("Error", "Failed to start run.");
    } finally {
      setRunLoading(false);
    }
  }

  async function handleFork() {
    setForkLoading(true);
    try {
      const res = await apiFetch(`/api/workflows/${id}/fork`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        const newId = data.id ?? data.workflow_id;
        Alert.alert("Forked", "Workflow forked successfully.", [
          {
            text: "View",
            onPress: () => router.replace(`/(tabs)/workflows/${newId}`),
          },
        ]);
      } else {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Error", data.detail ?? "Failed to fork workflow.");
      }
    } catch {
      Alert.alert("Error", "Failed to fork workflow.");
    } finally {
      setForkLoading(false);
    }
  }

  async function handleDelete() {
    Alert.alert("Delete Workflow", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await apiFetch(`/api/workflows/${id}`, { method: "DELETE" });
          router.back();
        },
      },
    ]);
  }

  if (!workflow) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.lavender} />
      </View>
    );
  }

  const sortedRuns = [...runs].sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + 112,
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{workflow.name || "Untitled"}</Text>
            {!isOwner && (
              <Text style={styles.sharedNote}>Shared with you · Fork to edit your own copy</Text>
            )}
          </View>
          <StatusBadge status={workflow.status} />
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <GradientButton
            title="Run"
            gradient="primary"
            onPress={handleRun}
            loading={runLoading}
            style={{ flex: 1 }}
          />
          {isOwner ? (
            <>
              <Pressable style={styles.actionBtn} onPress={() => setShareOpen(true)}>
                <Text style={styles.actionBtnText}>Share</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={handleDelete}>
                <Text style={styles.dangerBtnText}>Delete</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={[styles.actionBtn, styles.forkBtn, forkLoading && { opacity: 0.6 }]}
              onPress={handleFork}
              disabled={forkLoading}
            >
              {forkLoading ? (
                <ActivityIndicator size="small" color={colors.lavender} />
              ) : (
                <Text style={styles.forkBtnText}>Fork</Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Collaborators (owner only) */}
        {isOwner && collaborators.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Shared with ({collaborators.length})</Text>
              <Pressable onPress={() => setShareOpen(true)}>
                <Text style={styles.addPeopleText}>Add people</Text>
              </Pressable>
            </View>
            {collaborators.map((c) => (
              <View key={c.uid} style={styles.collabRow}>
                <View style={styles.collabAvatar}>
                  <Text style={styles.collabAvatarText}>
                    {(c.display_name || c.email)[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.collabName} numberOfLines={1}>
                    {c.display_name || "User"}
                  </Text>
                  <Text style={styles.collabEmail} numberOfLines={1}>
                    {c.email}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Steps Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Steps ({steps.length})</Text>
          {steps.length === 0 ? (
            <Text style={styles.emptyText}>No steps defined yet.</Text>
          ) : (
            steps
              .sort((a, b) => a.order - b.order)
              .map((step, i) => (
                <View key={step.id} style={styles.stepItem}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepAction}>{step.action}</Text>
                    {step.context ? (
                      <Text style={styles.stepContext} numberOfLines={2}>
                        {step.context}
                      </Text>
                    ) : null}
                    {step.params?.url && (
                      <Text style={styles.stepParam} numberOfLines={1}>
                        {step.params.url}
                      </Text>
                    )}
                    {step.params?.text && (
                      <Text style={styles.stepParam} numberOfLines={1}>
                        "{step.params.text}"
                      </Text>
                    )}
                  </View>
                </View>
              ))
          )}
        </View>

        {/* Recent Runs — single card shell, row dividers only */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Runs</Text>
          {sortedRuns.length === 0 ? (
            <Text style={styles.emptyText}>No runs yet.</Text>
          ) : (
            <View style={styles.runsCard}>
              {sortedRuns.slice(0, 10).map((run, idx, arr) => {
                const startMs = getTime(run.startedAt ?? run.createdAt);
                const endMs = getTime(run.completedAt);
                const duration = formatDuration(startMs, endMs);
                const started = formatDate(run.startedAt ?? run.createdAt);
                const isLast = idx === arr.length - 1;

                return (
                  <Pressable
                    key={run.id}
                    style={[styles.runRow, !isLast && styles.runRowDivider]}
                    onPress={() => router.push(`/(tabs)/workflows/${id}/runs/${run.id}`)}
                  >
                    <View style={styles.runLeft}>
                      <StatusBadge status={run.status} />
                      <View style={styles.runInfo}>
                        <Text style={styles.runDate}>{started}</Text>
                        <Text style={styles.runMeta}>
                          {duration !== "—" ? `Duration: ${duration}` : ""}
                          {run.error ? ` · Error` : ""}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.runChevron}>›</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <ShareModal
        visible={shareOpen}
        onClose={() => {
          setShareOpen(false);
          load();
        }}
        workflowId={id!}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ghost },
  content: { padding: 16, paddingBottom: 40 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    fontFamily: "Inter-Bold",
    marginRight: 12,
  },
  sharedNote: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.lavender40,
    backgroundColor: colors.ghost,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    color: colors.text,
    fontWeight: "500",
    fontFamily: "Inter-Medium",
    fontSize: 14,
  },
  forkBtn: {
    borderColor: "rgba(165, 119, 255, 0.4)",
    backgroundColor: "rgba(165, 119, 255, 0.08)",
  },
  forkBtnText: {
    color: colors.lavender,
    fontWeight: "600",
    fontFamily: "Inter-SemiBold",
    fontSize: 14,
  },
  dangerBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerBtnText: {
    color: colors.error,
    fontWeight: "500",
    fontFamily: "Inter-Medium",
    fontSize: 14,
  },

  /* sections */
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
    marginBottom: 12,
  },
  addPeopleText: {
    fontSize: 13,
    color: colors.lavender,
    fontWeight: "500",
    fontFamily: "Inter-Medium",
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: "Inter",
  },

  /* collaborators */
  collabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  collabAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(165, 119, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  collabAvatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.lavender,
    fontFamily: "Inter-SemiBold",
  },
  collabName: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
    fontFamily: "Inter-Medium",
  },
  collabEmail: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
  },

  /* steps */
  stepItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.lavender20,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.lavender,
    fontFamily: "Inter-SemiBold",
  },
  stepContent: { flex: 1 },
  stepAction: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  stepContext: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 2,
  },
  stepParam: {
    fontSize: 12,
    color: colors.lavender,
    fontFamily: "Inter",
    marginTop: 2,
  },

  /* runs */
  runsCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  runRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.white,
  },
  runRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  runLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  runInfo: { flex: 1 },
  runDate: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
    fontFamily: "Inter-Medium",
  },
  runMeta: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 2,
  },
  runChevron: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: "600",
  },
});
