import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { apiFetch } from "@/lib/api";
import { colors } from "@echo/design-tokens";

interface Collaborator {
  uid: string;
  email: string;
  display_name: string;
}

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  workflowId: string;
}

export function ShareModal({ visible, onClose, workflowId }: ShareModalProps) {
  const [email, setEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCollaborators = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}/collaborators`);
      if (res.ok) {
        const data = await res.json();
        setCollaborators(data.collaborators ?? data ?? []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    if (visible) {
      loadCollaborators();
      setEmail("");
      setError(null);
    }
  }, [visible, loadCollaborators]);

  async function handleShare() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setSharing(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.ok) {
        setEmail("");
        await loadCollaborators();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? data.error ?? "Failed to share.");
      }
    } catch {
      setError("Failed to share workflow.");
    } finally {
      setSharing(false);
    }
  }

  async function handleRemove(uid: string) {
    setCollaborators((prev) => prev.filter((c) => c.uid !== uid));
    try {
      const res = await apiFetch(`/api/workflows/${workflowId}/share/${uid}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to remove collaborator.");
      }
    } catch {
      await loadCollaborators();
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Share Workflow</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {/* Email input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sharing}
            />
            <Pressable
              style={[styles.shareBtn, sharing && styles.shareBtnDisabled]}
              onPress={handleShare}
              disabled={sharing}
            >
              {sharing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.shareBtnText}>Share</Text>
              )}
            </Pressable>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {/* Collaborators */}
          <Text style={styles.sectionLabel}>Shared with</Text>
          {loading ? (
            <ActivityIndicator
              size="small"
              color={colors.lavender}
              style={{ marginTop: 12 }}
            />
          ) : collaborators.length === 0 ? (
            <Text style={styles.emptyText}>Not shared with anyone yet.</Text>
          ) : (
            <FlatList
              data={collaborators}
              keyExtractor={(c) => c.uid}
              style={styles.list}
              renderItem={({ item }) => (
                <View style={styles.collabRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(item.display_name || item.email)[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.collabInfo}>
                    <Text style={styles.collabName} numberOfLines={1}>
                      {item.display_name || "User"}
                    </Text>
                    <Text style={styles.collabEmail} numberOfLines={1}>
                      {item.email}
                    </Text>
                  </View>
                  <Pressable onPress={() => handleRemove(item.uid)} hitSlop={8}>
                    <Text style={styles.removeBtn}>✕</Text>
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  card: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 20,
    maxHeight: "70%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  closeBtn: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter",
    color: colors.text,
  },
  shareBtn: {
    backgroundColor: colors.lavender,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtnDisabled: { opacity: 0.6 },
  shareBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter-SemiBold",
  },
  error: {
    fontSize: 13,
    color: colors.error,
    fontFamily: "Inter",
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: "Inter",
  },
  list: { maxHeight: 200 },
  collabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(165, 119, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.lavender,
    fontFamily: "Inter-SemiBold",
  },
  collabInfo: { flex: 1 },
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
  removeBtn: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: "600",
    padding: 4,
  },
});
