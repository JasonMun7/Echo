import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { useOwnedWorkflows, usePendingInvites } from "@/hooks/use-firestore-listener";
import { WorkflowCard } from "@/components/echo/WorkflowCard";
import { GradientButton } from "@/components/ui/GradientButton";
import { colors } from "@echo/design-tokens";
import type { Workflow } from "@echo/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface WorkflowInvite {
  id: string;
  workflow_id: string;
  workflow_name: string;
  from_name: string;
}

function getTime(x: unknown): number {
  if (typeof (x as { toMillis?: () => number })?.toMillis === "function") {
    return (x as { toMillis: () => number }).toMillis();
  }
  if (typeof x === "number") return x > 1e12 ? x : x * 1000;
  const o = x as { seconds?: number; _seconds?: number };
  const sec = o?.seconds ?? o?._seconds;
  return typeof sec === "number" ? sec * 1000 : 0;
}

export default function WorkflowListScreen() {
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid ?? null;
  const router = useRouter();

  // Real-time Firestore listeners
  const { data: firestoreWorkflows, loading: fsLoading } = useOwnedWorkflows(uid);
  const { data: invites } = usePendingInvites(uid) as unknown as {
    data: WorkflowInvite[];
  };

  // Also fetch from API to include shared/forked workflows
  const [apiWorkflows, setApiWorkflows] = useState<Workflow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadApi = useCallback(async () => {
    try {
      const res = await apiFetch("/api/workflows");
      if (res.ok) {
        const data = await res.json();
        setApiWorkflows(data.workflows ?? data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadApi();
  }, [loadApi]);

  async function onRefresh() {
    setRefreshing(true);
    await loadApi();
    setRefreshing(false);
  }

  // Merge: Firestore owned data takes precedence, API fills in shared/forked
  const workflows = useMemo(() => {
    const map = new Map<string, Workflow>();
    for (const w of apiWorkflows) map.set(w.id, w);
    for (const w of firestoreWorkflows as Workflow[]) map.set(w.id, w);
    return Array.from(map.values())
      .filter((w) => (w as Workflow & { ephemeral?: boolean }).ephemeral !== true)
      .sort((a, b) => getTime(b.createdAt ?? b.updatedAt) - getTime(a.createdAt ?? a.updatedAt));
  }, [firestoreWorkflows, apiWorkflows]);

  const [search, setSearch] = useState("");
  const filtered = search
    ? workflows.filter((w) => (w.name || "").toLowerCase().includes(search.toLowerCase()))
    : workflows;

  const loading = fsLoading && apiWorkflows.length === 0;

  async function handleAcceptInvite(invite: WorkflowInvite) {
    try {
      const res = await apiFetch(`/api/workflows/${invite.workflow_id}/invite/accept`, {
        method: "POST",
      });
      if (res.ok) {
        const data = (await res.json()) as { workflow_id?: string };
        const wid = data.workflow_id ?? invite.workflow_id;
        router.push(`/(tabs)/workflows/${wid}`);
        loadApi();
      }
    } catch {
      Alert.alert("Error", "Failed to accept invite.");
    }
  }

  async function handleCopyInvite(invite: WorkflowInvite) {
    try {
      const acceptRes = await apiFetch(`/api/workflows/${invite.workflow_id}/invite/accept`, {
        method: "POST",
      });
      if (!acceptRes.ok) {
        const err = (await acceptRes.json().catch(() => ({}))) as { detail?: string };
        Alert.alert("Error", err.detail ?? "Could not join shared workflow.");
        return;
      }
      const forkRes = await apiFetch(`/api/workflows/${invite.workflow_id}/fork`, {
        method: "POST",
      });
      const forkData = (await forkRes.json().catch(() => ({}))) as { id?: string; detail?: string };
      if (!forkRes.ok) {
        Alert.alert("Error", forkData.detail ?? "Joined the shared workflow, but copy failed.");
        loadApi();
        return;
      }
      if (forkData.id) {
        router.push(`/(tabs)/workflows/${forkData.id}`);
      }
      loadApi();
    } catch {
      Alert.alert("Error", "Failed to copy workflow.");
    }
  }

  async function handleDeclineInvite(invite: WorkflowInvite) {
    try {
      await apiFetch(`/api/workflows/${invite.workflow_id}/invite/decline`, {
        method: "POST",
      });
    } catch {}
  }

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search workflows..."
        placeholderTextColor={colors.textLight}
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          {
            paddingBottom: insets.bottom + 112,
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          invites.length > 0 ? (
            <View style={styles.invitesSection}>
              {invites.map((invite) => (
                <View key={invite.id} style={styles.inviteCard}>
                  <View style={styles.inviteInfo}>
                    <Text style={styles.inviteText}>
                      <Text style={styles.inviteBold}>{invite.from_name}</Text>
                      {" invited you to "}
                      <Text style={styles.inviteBold}>"{invite.workflow_name}"</Text>
                    </Text>
                  </View>
                  <View style={styles.inviteActions}>
                    <Pressable
                      style={styles.declineBtn}
                      onPress={() => handleDeclineInvite(invite)}
                    >
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </Pressable>
                    <Pressable style={styles.copyBtn} onPress={() => handleCopyInvite(invite)}>
                      <Text style={styles.copyBtnText}>Copy</Text>
                    </Pressable>
                    <Pressable style={styles.acceptBtn} onPress={() => handleAcceptInvite(invite)}>
                      <Text style={styles.acceptBtnText}>Join</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <WorkflowCard
            workflow={item}
            onPress={() => router.push(`/(tabs)/workflows/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{loading ? "Loading..." : "No workflows found"}</Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable style={styles.fab} onPress={() => router.push("/(tabs)/workflows/new")}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ghost },
  searchInput: {
    margin: 16,
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    color: colors.text,
    fontFamily: "Inter",
  },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  invitesSection: { marginBottom: 12 },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(165, 119, 255, 0.05)",
    borderWidth: 1,
    borderColor: colors.lavender40,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  inviteInfo: { flex: 1 },
  inviteText: {
    fontSize: 13,
    color: colors.text,
    fontFamily: "Inter",
    lineHeight: 18,
  },
  inviteBold: { fontWeight: "600", fontFamily: "Inter-SemiBold" },
  inviteActions: { flexDirection: "row", gap: 6 },
  declineBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  declineBtnText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
  },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  copyBtnText: {
    fontSize: 12,
    color: colors.text,
    fontFamily: "Inter",
  },
  acceptBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: colors.lavender,
  },
  acceptBtnText: {
    fontSize: 12,
    color: "#fff",
    fontWeight: "600",
    fontFamily: "Inter-SemiBold",
  },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { fontSize: 15, color: colors.textMuted, fontFamily: "Inter" },
  fab: {
    position: "absolute",
    bottom: 120,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.lavender,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: { fontSize: 28, color: "#fff", fontWeight: "300", lineHeight: 30 },
});
