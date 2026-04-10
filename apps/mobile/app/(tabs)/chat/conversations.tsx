import { View, Text, FlatList, Pressable, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/stores/auth-store";
import {
  useConversations,
  createConversation,
  deleteConversation,
  type Conversation,
} from "@/hooks/use-chat-persistence";
import { colors } from "@echo/design-tokens";

function getTime(x: unknown): number {
  if (typeof (x as { toMillis?: () => number })?.toMillis === "function") {
    return (x as { toMillis: () => number }).toMillis();
  }
  if (typeof x === "number") return x > 1e12 ? x : x * 1000;
  const o = x as { seconds?: number; _seconds?: number };
  const sec = o?.seconds ?? o?._seconds;
  return typeof sec === "number" ? sec * 1000 : 0;
}

function timeAgo(ts: unknown): string {
  const ms = getTime(ts);
  if (!ms) return "";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ConversationsScreen() {
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid ?? null;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: conversations, loading } = useConversations(uid);

  async function handleNewChat() {
    if (!uid) return;
    const id = await createConversation(uid);
    router.push({ pathname: "/(tabs)/chat", params: { conversationId: id } });
  }

  function handleDelete(conv: Conversation) {
    if (!uid) return;
    Alert.alert("Delete Chat", `Delete "${conv.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteConversation(uid, conv.id),
      },
    ]);
  }

  function renderItem({ item }: { item: Conversation }) {
    return (
      <Pressable
        style={styles.card}
        onPress={() =>
          router.push({
            pathname: "/(tabs)/chat",
            params: { conversationId: item.id },
          })
        }
        onLongPress={() => handleDelete(item)}
      >
        <View style={styles.cardIcon}>
          <Ionicons name="chatbubble-outline" size={20} color={colors.lavender} />
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title || "New Chat"}
          </Text>
          {item.lastMessage ? (
            <Text style={styles.cardPreview} numberOfLines={1}>
              {item.lastMessage}
            </Text>
          ) : null}
        </View>
        <Text style={styles.cardTime}>{timeAgo(item.updatedAt)}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 72 }]}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>No conversations yet</Text>
              <Text style={styles.emptySubtext}>Start a new chat to get going</Text>
            </View>
          )
        }
      />

      <Pressable style={styles.newChatButton} onPress={handleNewChat}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.newChatLabel}>New Chat</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ghost,
  },
  list: {
    padding: 16,
    gap: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(165,119,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter-SemiBold",
    color: colors.text,
  },
  cardPreview: {
    fontSize: 13,
    fontFamily: "Inter",
    color: colors.textMuted,
  },
  cardTime: {
    fontSize: 12,
    fontFamily: "Inter",
    color: colors.textLight,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: colors.text,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter",
    color: colors.textMuted,
  },
  newChatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.lavender,
  },
  newChatLabel: {
    fontSize: 15,
    fontFamily: "Inter-SemiBold",
    color: "#fff",
  },
});
