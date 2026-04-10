import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { apiFetch } from "@/lib/api";
import { colors } from "@echo/design-tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  workflow_id?: string;
  createdAt?: unknown;
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function markRead(id: string, workflowId?: string) {
    try {
      await apiFetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      if (workflowId) {
        router.push(`/(tabs)/workflows/${workflowId}`);
      }
    } catch {}
  }

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 100 },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No notifications</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.item, !item.read && styles.itemUnread]}
            onPress={() => markRead(item.id, item.workflow_id)}
          >
            {!item.read && <View style={styles.unreadDot} />}
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemBody} numberOfLines={2}>
                {item.body}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ghost },
  list: { padding: 16, paddingBottom: 40 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { fontSize: 15, color: colors.textMuted, fontFamily: "Inter" },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
    gap: 10,
  },
  itemUnread: {
    borderColor: colors.lavender40,
    backgroundColor: "rgba(165, 119, 255, 0.03)",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lavender,
    marginTop: 6,
  },
  itemContent: { flex: 1 },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  itemBody: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 2,
  },
});
