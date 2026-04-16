import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { randomUUID } from "expo-crypto";
import { colors } from "@echo/design-tokens";
import {
  createConversation,
  useConversationMessages,
  addMessageToFirestore,
  updateConversationMeta,
} from "@/hooks/use-chat-persistence";
import { useRunStatus } from "@/hooks/use-firestore-listener";
import { useLiveKitSession } from "@/hooks/use-livekit-session";

const iosVersion = Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) : 0;
const supportsLiquidGlass = Platform.OS === "ios" && iosVersion >= 26;

/* ─── types ─── */

type MessageType = "text" | "tool_call" | "synthesis_complete" | "run_started" | "error";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  type: MessageType;
  content: string;
  timestamp: number;
  /** For tool_call messages */
  toolName?: string;
  /** For run_started / synthesis_complete */
  workflowId?: string;
  runId?: string;
  workflowName?: string;
  ephemeral?: boolean;
}

/* ─── tool metadata ─── */

type IoniconsName = keyof typeof Ionicons.glyphMap;

const TOOL_META: Record<string, { icon: IoniconsName; label: string }> = {
  list_workflows: { icon: "list-outline", label: "Listing workflows" },
  run_workflow: { icon: "play-circle-outline", label: "Starting workflow" },
  synthesize_from_description: {
    icon: "sparkles-outline",
    label: "Creating workflow",
  },
  run_adhoc: { icon: "sparkles-outline", label: "Running workflow" },
  cancel_run: { icon: "stop-circle-outline", label: "Cancelling run" },
  redirect_run: { icon: "refresh-outline", label: "Redirecting agent" },
  dismiss_calluser: {
    icon: "notifications-off-outline",
    label: "Dismissing alert",
  },
  list_integrations: { icon: "apps-outline", label: "Listing integrations" },
  call_integration: { icon: "flash-outline", label: "Calling integration" },
};

const SYNTHESIS_STEPS = [
  "Understanding your request",
  "Identifying workflow steps",
  "Generating step parameters",
  "Saving workflow",
];

const QUICK_CHIPS = [
  "List my workflows",
  "What can you do?",
  "Create a new workflow",
  "Show active runs",
];

/* ─── run status helpers ─── */

const RUN_STATUS_CONFIG: Record<string, { icon: IoniconsName; color: string; label: string }> = {
  pending: { icon: "time-outline", color: "#f59e0b", label: "Queued" },
  running: {
    icon: "play-circle-outline",
    color: "#3b82f6",
    label: "Running...",
  },
  completed: { icon: "checkmark-circle", color: "#22c55e", label: "Completed" },
  failed: { icon: "close-circle", color: "#ef4444", label: "Failed" },
  cancelled: {
    icon: "stop-circle-outline",
    color: "#6b7280",
    label: "Cancelled",
  },
  awaiting_user: {
    icon: "alert-circle-outline",
    color: "#f59e0b",
    label: "Awaiting Input",
  },
};

function RunCard({ item, router }: { item: Message; router: ReturnType<typeof useRouter> }) {
  const status = useRunStatus(item.workflowId ?? null, item.runId ?? null);
  const config = RUN_STATUS_CONFIG[status ?? "pending"] ?? RUN_STATUS_CONFIG.pending;

  return (
    <Pressable
      style={styles.runCard}
      onPress={() => {
        if (item.workflowId && item.runId) {
          router.push(`/(tabs)/workflows/${item.workflowId}/runs/${item.runId}`);
        }
      }}
    >
      {status === "running" ? (
        <ActivityIndicator size="small" color={config.color} />
      ) : (
        <Ionicons name={config.icon} size={20} color={config.color} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.runCardTitle}>{config.label}</Text>
        {item.workflowName && (
          <Text style={styles.runCardName} numberOfLines={1}>
            {item.workflowName}
          </Text>
        )}
        {(status === "pending" || !status) && (
          <Text style={styles.runCardDesktopNote}>Requires Echo Desktop to be running</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
    </Pressable>
  );
}

/* ─── component ─── */

export default function ChatScreen() {
  const { conversationId: paramConvId } = useLocalSearchParams<{
    conversationId?: string;
  }>();
  const [conversationId, setConversationId] = useState<string | null>(paramConvId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthStep, setSynthStep] = useState(0);
  const [adhocWorkflow, setAdhocWorkflow] = useState<{
    workflowId: string;
    runId: string;
    name: string;
  } | null>(null);
  const [savingAdhoc, setSavingAdhoc] = useState(false);
  const [inputHeight, setInputHeight] = useState(36);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const synthTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const user = useAuthStore((s) => s.user);
  const uid = user?.uid ?? null;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Load existing messages from Firestore when opening an existing conversation
  const { data: savedMessages } = useConversationMessages(
    uid,
    historyLoaded ? null : conversationId,
  );

  useEffect(() => {
    if (savedMessages.length > 0 && !historyLoaded) {
      setMessages(
        savedMessages.map((m) => ({
          id: m.id,
          role: m.role,
          type: m.type as MessageType,
          content: m.content,
          timestamp: m.timestamp,
          toolName: m.toolName,
          workflowId: m.workflowId,
          runId: m.runId,
          workflowName: m.workflowName,
          ephemeral: m.ephemeral,
        })),
      );
      setHistoryLoaded(true);
    }
  }, [savedMessages, historyLoaded]);
  // Track keyboard visibility to reduce bottom padding when keyboard is open
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Tab bar: height=64 at bottom=32 → pill top at 96px from screen edge. Add 12px gap.
  // When keyboard is open, KeyboardAvoidingView handles positioning so no extra offset needed.
  const tabBarOffset = keyboardVisible ? 0 : Platform.OS === "ios" ? 108 : 16;

  /* ─── synthesis step animation ─── */
  function startSynthesis() {
    setSynthesizing(true);
    setSynthStep(0);
    let step = 0;
    synthTimer.current = setInterval(() => {
      step++;
      if (step >= SYNTHESIS_STEPS.length) {
        // Stay on last step until synthesis_complete arrives
        return;
      }
      setSynthStep(step);
    }, 1800);
  }

  function stopSynthesis() {
    setSynthesizing(false);
    setSynthStep(0);
    if (synthTimer.current) {
      clearInterval(synthTimer.current);
      synthTimer.current = null;
    }
  }

  /* ─── persistence helper (before LiveKit callbacks) ─── */

  const persistMsgRef = useRef<(msg: Message) => void>(() => {});
  const conversationIdRef = useRef<string | null>(conversationId);
  conversationIdRef.current = conversationId;
  const creatingConversationRef = useRef<Promise<string> | null>(null);

  /** Ensure a conversation exists, persist a message, and update the preview. */
  async function persistMsg(msg: Message) {
    if (!uid) return;
    try {
      let convId = conversationIdRef.current;
      if (!convId) {
        if (!creatingConversationRef.current) {
          creatingConversationRef.current = createConversation(
            uid,
            msg.role === "user" ? msg.content.slice(0, 40) : "New Chat",
          );
        }
        try {
          convId = await creatingConversationRef.current;
        } finally {
          creatingConversationRef.current = null;
        }
        conversationIdRef.current = convId;
        setConversationId(convId);
      }
      addMessageToFirestore(uid, convId, {
        id: msg.id,
        role: msg.role,
        type: msg.type,
        content: msg.content,
        timestamp: msg.timestamp,
        toolName: msg.toolName,
        workflowId: msg.workflowId,
        runId: msg.runId,
        workflowName: msg.workflowName,
        ephemeral: msg.ephemeral,
      }).catch(() => {});
      if (msg.type === "text") {
        updateConversationMeta(uid, convId, msg.content).catch(() => {});
      }
    } catch {
      // Persistence is best-effort; chat still works without it
    }
  }
  persistMsgRef.current = persistMsg;

  const session = useLiveKitSession(
    {
      onTranscript: (text, role) => {
        const ts = Date.now();
        const trim = text.trim();
        if (!trim) return;
        const msg: Message =
          role === "user"
            ? {
                id: `user-t-${randomUUID()}`,
                role: "user",
                type: "text",
                content: trim,
                timestamp: ts,
              }
            : {
                id: `asst-t-${randomUUID()}`,
                role: "assistant",
                type: "text",
                content: trim,
                timestamp: ts,
              };
        setThinking(false);
        setMessages((prev) => [...prev, msg]);
        persistMsgRef.current(msg);
      },
      onToolCall: (name) => {
        const ts = Date.now();
        if (name === "synthesize_from_description" || name === "run_adhoc") {
          startSynthesis();
        }
        const meta = TOOL_META[name];
        const msg: Message = {
          id: `tool-${randomUUID()}`,
          role: "system",
          type: "tool_call",
          content: meta?.label ?? `Running: ${name}`,
          toolName: name,
          timestamp: ts,
        };
        setMessages((prev) => [...prev, msg]);
        persistMsgRef.current(msg);
      },
      onSynthesisComplete: (workflowId, wfName) => {
        stopSynthesis();
        setThinking(false);
        const msg: Message = {
          id: `synth-${randomUUID()}`,
          role: "system",
          type: "synthesis_complete",
          content: `Workflow "${wfName ?? "New"}" created!`,
          workflowId,
          workflowName: wfName,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, msg]);
        persistMsgRef.current(msg);
      },
      onRunStarted: (wfId, runId, meta) => {
        setThinking(false);
        const ts = Date.now();
        if (meta?.ephemeral) {
          setAdhocWorkflow({
            workflowId: wfId,
            runId,
            name: meta?.name ?? "Ad-hoc workflow",
          });
        }
        const msg: Message = {
          id: `run-${randomUUID()}`,
          role: "system",
          type: "run_started",
          content: "Run started",
          workflowId: wfId,
          runId,
          workflowName: meta?.name,
          ephemeral: meta?.ephemeral,
          timestamp: ts,
        };
        setMessages((prev) => [...prev, msg]);
        persistMsgRef.current(msg);
      },
      onTurnComplete: () => {
        setThinking(false);
      },
    },
    { enableMicOnConnect: false },
  );

  useEffect(() => {
    void session.connect();
    return () => {
      session.disconnect();
      if (synthTimer.current) clearInterval(synthTimer.current);
    };
  }, [session.connect, session.disconnect]);

  /* ─── actions ─── */

  async function sendMessage(text: string) {
    if (!text.trim() || !session.connected) return;
    const msg: Message = {
      id: `user-${randomUUID()}`,
      role: "user",
      type: "text",
      content: text.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    persistMsg(msg);
    setInput("");
    setThinking(true);
    setAdhocWorkflow(null);
    try {
      await session.sendChatText(text.trim());
    } catch {
      setThinking(false);
      const errMsg: Message = {
        id: `err-${randomUUID()}`,
        role: "assistant",
        type: "error",
        content: "Could not send message. Check your connection and try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  }

  async function handleSaveAdhoc() {
    if (!adhocWorkflow) return;
    setSavingAdhoc(true);
    try {
      await apiFetch(`/api/workflows/${adhocWorkflow.workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ephemeral: false }),
      });
      setAdhocWorkflow(null);
    } catch {
    } finally {
      setSavingAdhoc(false);
    }
  }

  async function handleDiscardAdhoc() {
    if (!adhocWorkflow) return;
    setSavingAdhoc(true);
    try {
      await apiFetch(`/api/workflows/${adhocWorkflow.workflowId}`, {
        method: "DELETE",
      });
      setAdhocWorkflow(null);
    } catch {
    } finally {
      setSavingAdhoc(false);
    }
  }

  /* ─── render helpers ─── */

  function renderMessage({ item, index }: { item: Message; index: number }) {
    // Tool call card — show spinner only if this is the last message (still in progress)
    if (item.type === "tool_call") {
      const meta = TOOL_META[item.toolName ?? ""] ?? {
        icon: "cog-outline" as IoniconsName,
        label: item.content,
      };
      const isLatest = index === messages.length - 1;
      return (
        <View style={styles.toolCard}>
          <Ionicons name={meta.icon} size={14} color={colors.lavender} />
          <Text style={styles.toolLabel}>{meta.label}</Text>
          {isLatest && thinking ? (
            <ActivityIndicator size="small" color={colors.lavender} />
          ) : (
            <Ionicons name="checkmark-circle" size={14} color="#4ade80" />
          )}
        </View>
      );
    }

    // Synthesis complete card (tappable)
    if (item.type === "synthesis_complete") {
      return (
        <Pressable
          style={styles.synthCard}
          onPress={() => {
            if (item.workflowId) router.push(`/(tabs)/workflows/${item.workflowId}`);
          }}
        >
          <View style={styles.synthCardInner}>
            <Ionicons name="sparkles-outline" size={20} color={colors.lavender} />
            <View style={{ flex: 1 }}>
              <Text style={styles.synthTitle}>Workflow Ready</Text>
              <Text style={styles.synthName} numberOfLines={1}>
                {item.workflowName ?? "New workflow"}
              </Text>
            </View>
            <View style={styles.synthRunBtn}>
              <Text style={styles.synthRunText}>View</Text>
            </View>
          </View>
        </Pressable>
      );
    }

    // Run started card (tappable, with live status)
    if (item.type === "run_started") {
      return <RunCard item={item} router={router} />;
    }

    // User / assistant / error bubbles
    const isUser = item.role === "user";
    const isError = item.type === "error";

    if (isUser) {
      return (
        <LinearGradient
          colors={["#A577FF", "#21c4dd"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, styles.userBubble]}
        >
          <Text style={[styles.bubbleText, styles.userBubbleText]}>{item.content}</Text>
          <Text style={[styles.timestamp, styles.userTimestamp]}>
            {new Date(item.timestamp).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </LinearGradient>
      );
    }

    return (
      <View style={[styles.bubble, styles.assistantBubble, isError && styles.errorBubble]}>
        <Text style={[styles.bubbleText, isError && styles.errorText]}>{item.content}</Text>
        <Text style={styles.timestamp}>
          {new Date(item.timestamp).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      </View>
    );
  }

  // ─── Shared input pill contents ───
  const inputPillContents = (
    <>
      <Pressable style={styles.voiceBtn} onPress={() => session.toggleMute()}>
        <Ionicons
          name={session.isMuted ? "mic-off" : "mic"}
          size={20}
          color={session.isMuted ? "#ef4444" : "#8B6CF7"}
        />
      </Pressable>
      <TextInput
        multiline
        style={[styles.input, { height: Math.min(Math.max(inputHeight, 36), 100) }]}
        placeholder={session.connected ? "Message Echo..." : "Connecting..."}
        placeholderTextColor={colors.textLight}
        value={input}
        onChangeText={setInput}
        editable={session.connected}
        onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={() => sendMessage(input)}
      />
      <Pressable
        style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
        onPress={() => sendMessage(input)}
        disabled={!input.trim()}
      >
        {input.trim() ? (
          <LinearGradient
            colors={["#A577FF", "#21c4dd"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sendBtnGrad}
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </LinearGradient>
        ) : (
          <View style={styles.sendBtnGrad}>
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </View>
        )}
      </Pressable>
    </>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 32 : 0}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/(tabs)/chat/conversations")}
              style={{ paddingHorizontal: 8 }}
            >
              <Ionicons name="chatbubbles-outline" size={22} color={colors.lavender} />
            </Pressable>
          ),
        }}
      />
      {/* Subtle gradient background */}
      <LinearGradient
        colors={["#F4F0FF", "#EBF4FF", "#F8F9FE"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Connection banner */}
      {!session.connected && (
        <Pressable
          style={[
            styles.connectionBanner,
            session.state === "disconnected" && styles.connectionBannerError,
          ]}
          onPress={session.state === "disconnected" ? () => void session.connect() : undefined}
        >
          {session.state === "disconnected" ? (
            <>
              <Text style={styles.connectionTextError}>⚠ Failed to connect</Text>
              <Text style={styles.connectionRetry}>Tap to retry</Text>
            </>
          ) : (
            <>
              <ActivityIndicator size="small" color={colors.lavender} />
              <Text style={styles.connectionText}>Connecting to Echo agent...</Text>
            </>
          )}
        </Pressable>
      )}

      {/* Synthesis overlay */}
      {synthesizing && (
        <View style={styles.synthOverlay}>
          {supportsLiquidGlass ? (
            <GlassView glassEffectStyle="regular" style={StyleSheet.absoluteFill} />
          ) : Platform.OS === "ios" ? (
            <>
              <View
                style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(250,249,255,0.88)" }]}
              />
              <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
            </>
          ) : (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(245,247,252,0.92)" }]}
            />
          )}
          <View style={styles.synthOverlayCard}>
            <Text style={styles.synthOverlayTitle}>Echo is working</Text>
            {SYNTHESIS_STEPS.map((step, i) => (
              <View key={step} style={styles.synthStepRow}>
                <View
                  style={[
                    styles.synthStepDot,
                    i <= synthStep && styles.synthStepDotActive,
                    i < synthStep && styles.synthStepDotDone,
                  ]}
                >
                  {i < synthStep && <Text style={styles.synthCheck}>✓</Text>}
                </View>
                <Text style={[styles.synthStepText, i <= synthStep && styles.synthStepTextActive]}>
                  {step}
                </Text>
                {i === synthStep && (
                  <ActivityIndicator
                    size="small"
                    color={colors.lavender}
                    style={{ marginLeft: 8 }}
                  />
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.messages, { paddingBottom: tabBarOffset + 80 }]}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatTitle}>Echo Agent</Text>
            <Text style={styles.emptyChatSub}>
              Ask me to create workflows, run automations, or manage your integrations.
            </Text>
          </View>
        }
        renderItem={renderMessage}
      />

      {thinking && (
        <View style={styles.thinkingRow}>
          <View style={styles.thinkingDots}>
            <View style={[styles.dot, styles.dot1]} />
            <View style={[styles.dot, styles.dot2]} />
            <View style={[styles.dot, styles.dot3]} />
          </View>
          <Text style={styles.thinkingText}>Thinking...</Text>
        </View>
      )}

      {/* Ad-hoc workflow save/discard CTA */}
      {adhocWorkflow && (
        <View style={styles.adhocBar}>
          <Text style={styles.adhocText} numberOfLines={1}>
            {adhocWorkflow.name}
          </Text>
          <View style={styles.adhocActions}>
            <Pressable style={styles.adhocSaveBtn} onPress={handleSaveAdhoc} disabled={savingAdhoc}>
              <Text style={styles.adhocSaveText}>Save</Text>
            </Pressable>
            <Pressable
              style={styles.adhocDiscardBtn}
              onPress={handleDiscardAdhoc}
              disabled={savingAdhoc}
            >
              <Text style={styles.adhocDiscardText}>Discard</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Quick chips */}
      {messages.length === 0 && (
        <View style={styles.chips}>
          {QUICK_CHIPS.map((chip) => (
            <Pressable key={chip} style={styles.chip} onPress={() => sendMessage(chip)}>
              <Text style={styles.chipText}>{chip}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Floating glass pill input */}
      <View style={[styles.inputWrap, { paddingBottom: tabBarOffset }]}>
        {supportsLiquidGlass ? (
          <GlassView glassEffectStyle="regular" style={styles.inputPill}>
            {inputPillContents}
          </GlassView>
        ) : Platform.OS === "ios" ? (
          <View style={[styles.inputPill, { overflow: "hidden" }]}>
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(250,249,255,0.92)" }]}
            />
            <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFill} />
            {inputPillContents}
          </View>
        ) : (
          <View style={[styles.inputPill, styles.inputPillAndroid]}>{inputPillContents}</View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* connection banner */
  connectionBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(165, 119, 255, 0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(165, 119, 255, 0.15)",
  },
  connectionBannerError: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderBottomColor: "rgba(239, 68, 68, 0.2)",
    flexDirection: "column",
    gap: 2,
  },
  connectionText: {
    fontSize: 13,
    color: colors.lavender,
    fontFamily: "Inter-Medium",
    fontWeight: "500",
  },
  connectionTextError: {
    fontSize: 13,
    color: colors.error,
    fontFamily: "Inter-Medium",
    fontWeight: "500",
  },
  connectionRetry: {
    fontSize: 11,
    color: colors.error,
    fontFamily: "Inter",
    opacity: 0.7,
  },

  /* messages */
  messages: { padding: 16, paddingBottom: 8 },
  emptyChat: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyChatTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    fontFamily: "Inter-Bold",
    marginBottom: 8,
  },
  emptyChatSub: {
    fontSize: 15,
    color: colors.textMuted,
    fontFamily: "Inter",
    textAlign: "center",
    lineHeight: 22,
  },

  /* bubbles */
  bubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
    overflow: "hidden",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorBubble: {
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  bubbleText: {
    fontSize: 15,
    color: colors.text,
    fontFamily: "Inter",
    lineHeight: 21,
  },
  userBubbleText: { color: "#fff" },
  errorText: { color: colors.error },
  timestamp: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 4,
    opacity: 0.7,
  },
  userTimestamp: { color: "rgba(255,255,255,0.7)" },

  /* tool call cards */
  toolCard: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(165, 119, 255, 0.3)",
    backgroundColor: "rgba(165, 119, 255, 0.06)",
    marginBottom: 8,
  },
  toolLabel: {
    fontSize: 13,
    color: colors.lavender,
    fontFamily: "Inter-Medium",
    fontWeight: "500",
  },
  toolDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.lavender,
    opacity: 0.6,
  },

  /* synthesis complete card */
  synthCard: {
    alignSelf: "center",
    width: "90%",
    marginBottom: 8,
  },
  synthCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(165, 119, 255, 0.3)",
    backgroundColor: "rgba(165, 119, 255, 0.06)",
  },
  synthIcon: { fontSize: 20 },
  synthTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  synthName: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 1,
  },
  synthRunBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.lavender,
  },
  synthRunText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter-SemiBold",
  },

  /* run started card */
  runCard: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    width: "90%",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    backgroundColor: "rgba(34, 197, 94, 0.06)",
    marginBottom: 8,
  },
  runCardIcon: { fontSize: 16 },
  runCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  runCardName: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 1,
  },
  runCardDesktopNote: {
    fontSize: 11,
    color: colors.textLight,
    fontFamily: "Inter",
    fontStyle: "italic" as const,
    marginTop: 2,
  },

  /* thinking indicator */
  thinkingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
  },
  thinkingDots: {
    flexDirection: "row",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.lavender,
    opacity: 0.4,
  },
  dot1: { opacity: 0.8 },
  dot2: { opacity: 0.5 },
  dot3: { opacity: 0.3 },
  thinkingText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: "Inter",
    fontStyle: "italic",
  },

  /* adhoc save/discard */
  adhocBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: "rgba(165, 119, 255, 0.15)",
  },
  adhocText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    fontFamily: "Inter-Medium",
    fontWeight: "500",
    marginRight: 12,
  },
  adhocActions: { flexDirection: "row", gap: 8 },
  adhocSaveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.lavender,
  },
  adhocSaveText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter-SemiBold",
  },
  adhocDiscardBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  adhocDiscardText: {
    color: colors.error,
    fontSize: 13,
    fontWeight: "500",
    fontFamily: "Inter-Medium",
  },

  /* quick chips */
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.lavender40,
    backgroundColor: colors.white,
  },
  chipText: {
    fontSize: 13,
    color: colors.lavender,
    fontFamily: "Inter-Medium",
    fontWeight: "500",
  },

  /* floating pill input */
  inputWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  inputPill: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  inputPillAndroid: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(165,119,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    fontFamily: "Inter",
    paddingVertical: 8,
    paddingHorizontal: 4,
    lineHeight: 20,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.lavender,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnGrad: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },

  /* synthesis overlay */
  synthOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  synthOverlayCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    width: "80%",
    maxWidth: 320,
    borderWidth: 1,
    borderColor: colors.border,
  },
  synthOverlayTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
    textAlign: "center",
    marginBottom: 20,
  },
  synthStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  synthStepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  synthStepDotActive: {
    borderColor: colors.lavender,
  },
  synthStepDotDone: {
    backgroundColor: colors.lavender,
    borderColor: colors.lavender,
  },
  synthCheck: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  synthStepText: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: "Inter",
    flex: 1,
  },
  synthStepTextActive: {
    color: colors.text,
    fontWeight: "500",
    fontFamily: "Inter-Medium",
  },
});
