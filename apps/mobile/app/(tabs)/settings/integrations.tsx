import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { apiFetch, apiErrorMessage } from "@/lib/api";
import { colors } from "@echo/design-tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Integration {
  /** Composio toolkit slug from ``GET /api/integrations`` (e.g. ``slack``, ``gmail``). */
  id: string;
  name: string;
  display_name: string;
  description?: string;
  connected: boolean;
  composio_account_active?: boolean | null;
  auto_connected?: boolean;
  account_name?: string;
  team_name?: string;
  icon?: string;
  note?: string;
}

type IoniconsName = keyof typeof Ionicons.glyphMap;

const INTEGRATION_META: Record<
  string,
  {
    icon: IoniconsName;
    bgColor: string;
    iconColor: string;
    description: string;
  }
> = {
  slack: {
    icon: "logo-slack",
    bgColor: "#4A154B",
    iconColor: "#fff",
    description: "Send messages, list channels, manage workspace",
  },
  gmail: {
    icon: "mail-outline",
    bgColor: "#EA4335",
    iconColor: "#fff",
    description: "Send emails, read inbox, manage labels",
  },
  google_sheets: {
    icon: "logo-google",
    bgColor: "#0F9D58",
    iconColor: "#fff",
    description: "Read and write spreadsheet data",
  },
  google_calendar: {
    icon: "logo-google",
    bgColor: "#4285F4",
    iconColor: "#fff",
    description: "Create events, list schedules",
  },
  notion: {
    icon: "document-text-outline",
    bgColor: "#191919",
    iconColor: "#fff",
    description: "Create pages, query databases",
  },
  github: {
    icon: "logo-github",
    bgColor: "#24292e",
    iconColor: "#fff",
    description: "Create issues, list PRs, manage repos",
  },
  linear: {
    icon: "layers-outline",
    bgColor: "#5E6AD2",
    iconColor: "#fff",
    description: "Create and update issues, manage projects",
  },
};

export default function IntegrationsScreen() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [composioConfigured, setComposioConfigured] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/integrations");
      if (res.ok) {
        const data = (await res.json()) as {
          integrations?: Integration[];
          composio_configured?: boolean;
          composio_account_active?: boolean | null;
        };
        const rawList = (data.integrations ?? (Array.isArray(data) ? data : [])) as Integration[];
        const list = rawList.map((row) => ({
          ...row,
          connected:
            typeof row.composio_account_active === "boolean"
              ? row.composio_account_active
              : row.connected,
        }));
        setIntegrations(list);
        setComposioConfigured(
          Boolean(data.composio_account_active ?? data.composio_configured ?? true),
        );
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

  async function handleConnect(integration: Integration) {
    if (!composioConfigured) {
      Alert.alert(
        "Composio not configured",
        "The API server needs COMPOSIO_API_KEY set for Composio OAuth.",
      );
      return;
    }
    setConnecting(integration.id);
    try {
      const res = await apiFetch(
        `/api/composio/link?toolkit=${encodeURIComponent(integration.id)}`,
      );
      if (!res.ok) {
        const msg = await apiErrorMessage(res, "Failed to initiate connection.");
        Alert.alert("Could not connect", msg);
        return;
      }
      const data = (await res.json()) as { url?: string };
      const authUrl = data.url;
      if (!authUrl) {
        Alert.alert("Error", "No authorization URL returned.");
        return;
      }
      // Open OAuth page in browser — returns when user closes or redirects back
      await WebBrowser.openAuthSessionAsync(authUrl, "echo-mobile://auth");
      // Refresh list after OAuth flow completes
      await load();
    } catch {
      Alert.alert("Error", "Failed to connect integration.");
    } finally {
      setConnecting(null);
    }
  }

  async function handleDisconnect(integration: Integration) {
    const name = integration.display_name || integration.name;
    Alert.alert("Disconnect", `Disconnect ${name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          await apiFetch(`/api/integrations/${integration.id}`, {
            method: "DELETE",
          });
          load();
        },
      },
    ]);
  }

  function renderItem({ item }: { item: Integration }) {
    const meta = INTEGRATION_META[item.id] ?? {
      icon: "ellipse-outline" as IoniconsName,
      bgColor: "#6b7280",
      iconColor: "#fff",
      description: item.description ?? "",
    };
    const accountLabel = item.team_name || item.account_name || null;
    const isConnecting = connecting === item.id;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconContainer, { backgroundColor: meta.bgColor }]}>
            <Ionicons name={meta.icon} size={22} color={meta.iconColor} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{item.display_name || item.name}</Text>
            <Text style={styles.cardDescription} numberOfLines={2}>
              {item.description || meta.description}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.statusRow}>
            {item.connected ? (
              <View
                style={[
                  styles.statusBadge,
                  item.auto_connected ? styles.statusAuto : styles.statusConnected,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    item.auto_connected ? styles.statusAutoText : styles.statusConnectedText,
                  ]}
                >
                  {item.auto_connected ? "Auto" : "Connected"}
                </Text>
              </View>
            ) : (
              <View style={[styles.statusBadge, styles.statusDisconnected]}>
                <Text style={[styles.statusText, styles.statusDisconnectedText]}>
                  Not connected
                </Text>
              </View>
            )}
            {accountLabel && (
              <Text style={styles.accountName} numberOfLines={1}>
                {accountLabel}
              </Text>
            )}
          </View>

          {item.connected ? (
            item.auto_connected ? (
              <Text style={styles.autoNote}>{item.note || "Via Google sign-in"}</Text>
            ) : (
              <Pressable style={styles.disconnectBtn} onPress={() => handleDisconnect(item)}>
                <Text style={styles.disconnectText}>Disconnect</Text>
              </Pressable>
            )
          ) : (
            <Pressable
              style={[styles.connectBtn, isConnecting && styles.connectBtnDisabled]}
              onPress={() => handleConnect(item)}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.connectText}>Connect</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Info banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Connect integrations to use them in workflow api_call steps and via voice/chat commands.
        </Text>
      </View>
      <FlatList
        data={integrations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 64 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Loading integrations...</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ghost },
  banner: {
    backgroundColor: "rgba(165, 119, 255, 0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(165, 119, 255, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bannerText: {
    fontSize: 13,
    color: colors.lavender,
    fontFamily: "Inter",
    lineHeight: 18,
  },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: "Inter",
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusConnected: {
    backgroundColor: "rgba(34, 197, 94, 0.1)",
  },
  statusAuto: {
    backgroundColor: "rgba(165, 119, 255, 0.1)",
  },
  statusDisconnected: {
    backgroundColor: "rgba(107, 114, 128, 0.1)",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Inter-Medium",
  },
  statusConnectedText: { color: "#16a34a" },
  statusAutoText: { color: colors.lavender },
  statusDisconnectedText: { color: "#6b7280" },
  accountName: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    flex: 1,
  },
  autoNote: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    fontStyle: "italic",
  },
  connectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.lavender,
    minWidth: 80,
    alignItems: "center",
  },
  connectBtnDisabled: { opacity: 0.6 },
  connectText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter-SemiBold",
  },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  disconnectText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "500",
    fontFamily: "Inter-Medium",
  },
  empty: { padding: 24, alignItems: "center" },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: "Inter",
  },
});
