import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useLiveKitSession, type VoiceState } from "@/hooks/use-livekit-session";
import { colors } from "@echo/design-tokens";
import { randomUUID } from "expo-crypto";

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

/* ─── PulseOrb — Echo Ripple visualizer ─── */

function PulseOrb({ state }: { state: VoiceState }) {
  const mainScale = useSharedValue(1);
  const mainOpacity = useSharedValue(0.85);

  // Shared values for the two background ripples
  const ripple1Scale = useSharedValue(1);
  const ripple1Opacity = useSharedValue(0);
  const ripple2Scale = useSharedValue(1);
  const ripple2Opacity = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(mainScale);
    cancelAnimation(mainOpacity);
    cancelAnimation(ripple1Scale);
    cancelAnimation(ripple1Opacity);
    cancelAnimation(ripple2Scale);
    cancelAnimation(ripple2Opacity);

    if (state === "idle" || state === "muted" || state === "disconnected") {
      mainScale.value = withTiming(0.92, { duration: 500 });
      mainOpacity.value = withTiming(0.5, { duration: 500 });
      ripple1Opacity.value = withTiming(0, { duration: 300 });
      ripple2Opacity.value = withTiming(0, { duration: 300 });
    } else if (state === "listening") {
      // Gentle, expectant pulse
      mainScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.95, {
            duration: 800,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        true,
      );

      // Expanding ripples to show it's "absorbing" sound
      ripple1Scale.value = 0.8;
      ripple1Opacity.value = 0.5;
      ripple1Scale.value = withRepeat(withTiming(1.6, { duration: 1600 }), -1, false);
      ripple1Opacity.value = withRepeat(withTiming(0, { duration: 1600 }), -1, false);
    } else if (state === "thinking") {
      // Tight, fast processing throb
      mainScale.value = withRepeat(
        withSequence(
          withTiming(1.05, {
            duration: 400,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.98, {
            duration: 400,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        true,
      );
      mainOpacity.value = withRepeat(
        withSequence(withTiming(0.6, { duration: 400 }), withTiming(0.9, { duration: 400 })),
        -1,
        true,
      );
      ripple1Opacity.value = withTiming(0, { duration: 300 }); // Hide ripples
    } else if (state === "speaking") {
      // Energetic, outward projection
      mainScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 300, easing: Easing.out(Easing.ease) }),
          withTiming(0.95, { duration: 300, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        true,
      );

      // Fast staggered ripples
      ripple1Scale.value = 0.9;
      ripple1Opacity.value = 0.6;
      ripple1Scale.value = withRepeat(
        withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );
      ripple1Opacity.value = withRepeat(
        withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );

      setTimeout(() => {
        ripple2Scale.value = 0.9;
        ripple2Opacity.value = 0.6;
        ripple2Scale.value = withRepeat(
          withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }),
          -1,
          false,
        );
        ripple2Opacity.value = withRepeat(
          withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }),
          -1,
          false,
        );
      }, 600); // Stagger the second ripple
    }
  }, [state]);

  const mainAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mainScale.value }],
    opacity: mainOpacity.value,
  }));

  const ripple1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ripple1Scale.value }],
    opacity: ripple1Opacity.value,
  }));

  const ripple2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ripple2Scale.value }],
    opacity: ripple2Opacity.value,
  }));

  return (
    <View style={orbStyles.wrapper}>
      {/* Background Ripple 2 */}
      <Animated.View style={[orbStyles.ripple, ripple2Style]} />
      {/* Background Ripple 1 */}
      <Animated.View style={[orbStyles.ripple, ripple1Style]} />

      {/* Main Orb */}
      <Animated.View style={[orbStyles.orb, mainAnimStyle]}>
        <LinearGradient
          colors={["#A577FF", "#7C6CF8", "#21c4dd"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

const orbStyles = StyleSheet.create({
  wrapper: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  orb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
    shadowColor: "#A577FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 32,
    elevation: 20,
    position: "absolute",
    zIndex: 2,
  },
  ripple: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(165,119,255,0.4)",
    borderWidth: 1,
    borderColor: "rgba(33,196,221,0.5)",
    zIndex: 1,
  },
});

/* ─── transcript entry type ─── */

interface TranscriptEntry {
  id: string;
  role: "user" | "agent";
  text: string;
  ts: number;
}

/* ─── control bar content ─── */

function ControlBarContent({
  session,
  showHelp,
  setShowHelp,
  handleClose,
}: {
  session: ReturnType<typeof useLiveKitSession>;
  showHelp: boolean;
  setShowHelp: (v: boolean) => void;
  handleClose: () => void;
}) {
  return (
    <>
      <Pressable
        style={[styles.ctrlBtn, session.isMuted && styles.ctrlBtnMuted]}
        onPress={session.toggleMute}
      >
        <Ionicons
          name={session.isMuted ? "mic-off" : "mic"}
          size={22}
          color={session.isMuted ? "#ef4444" : "rgba(255,255,255,0.9)"}
        />
      </Pressable>
      <View style={styles.ctrlDivider} />
      <Pressable style={styles.ctrlEndBtn} onPress={handleClose}>
        <Ionicons name="call" size={20} color="#fff" />
      </Pressable>
      <View style={styles.ctrlDivider} />
      <Pressable
        style={[styles.ctrlBtn, showHelp && styles.ctrlBtnActive]}
        onPress={() => setShowHelp(!showHelp)}
      >
        <Ionicons name="help-circle-outline" size={22} color="rgba(255,255,255,0.7)" />
      </Pressable>
    </>
  );
}

/* ─── transcript contents ─── */

function TranscriptContents({
  transcript,
  synthResult,
  router,
}: {
  transcript: TranscriptEntry[];
  synthResult: { workflowId: string; name?: string } | null;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <>
      {transcript.length === 0 ? (
        <Text style={styles.transcriptEmpty}>Start speaking to begin a conversation...</Text>
      ) : (
        transcript.map((entry) => (
          <View
            key={entry.id}
            style={[styles.transcriptEntry, entry.role === "user" && styles.transcriptUser]}
          >
            <Text
              style={[styles.transcriptText, entry.role === "user" && styles.transcriptUserText]}
            >
              {entry.text}
            </Text>
          </View>
        ))
      )}
      {synthResult && (
        <Pressable
          style={styles.synthCta}
          onPress={() => router.replace(`/(tabs)/workflows/${synthResult.workflowId}`)}
        >
          <Ionicons name="sparkles-outline" size={18} color="#A577FF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.synthCtaTitle}>Workflow Created</Text>
            <Text style={styles.synthCtaName} numberOfLines={1}>
              {synthResult.name ?? "New workflow"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#A577FF" />
        </Pressable>
      )}
    </>
  );
}

/* ─── component ─── */

export default function VoiceScreen() {
  const router = useRouter();
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [synthResult, setSynthResult] = useState<{
    workflowId: string;
    name?: string;
  } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const session = useLiveKitSession({
    onTranscript: (text, role) => {
      setTranscript((prev) => [
        ...prev,
        {
          id: `t-${randomUUID()}`,
          role: role ?? "agent",
          text,
          ts: Date.now(),
        },
      ]);
    },
    onToolCall: (name) => setActiveTool(name),
    onSynthesisComplete: (workflowId, name) => {
      setActiveTool(null);
      setSynthResult({ workflowId, name });
    },
    onRunStarted: () => setActiveTool(null),
    onTurnComplete: () => setActiveTool(null),
  });

  useEffect(() => {
    session.connect();
    return () => session.disconnect();
  }, []);

  useEffect(() => {
    if (transcript.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [transcript.length]);

  function handleClose() {
    session.disconnect();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/chat");
    }
  }

  const statusLabel: Record<VoiceState, string> = {
    idle: "Tap to connect",
    connecting: "Connecting...",
    listening: "Listening",
    thinking: "Thinking...",
    speaking: "Speaking",
    muted: "Muted",
    disconnected: "Disconnected",
  };

  const agentStateDot =
    session.state === "listening"
      ? "#4ade80"
      : session.state === "speaking"
        ? "#A577FF"
        : session.state === "thinking"
          ? "#f59e0b"
          : "#6b7280";

  const iosVersion = Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) : 0;
  const supportsLiquidGlass = Platform.OS === "ios" && iosVersion >= 26;

  return (
    <LinearGradient colors={["#070314", "#0f0628", "#170A40"]} style={styles.container}>
      {/* Subtle ambient orbs */}
      <View style={styles.bgOrb1} pointerEvents="none">
        <LinearGradient colors={["rgba(165,119,255,0.1)", "transparent"]} style={{ flex: 1 }} />
      </View>
      <View style={styles.bgOrb2} pointerEvents="none">
        <LinearGradient colors={["rgba(33,196,221,0.08)", "transparent"]} style={{ flex: 1 }} />
      </View>

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable style={styles.topBtn} onPress={handleClose}>
          <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text style={styles.topTitle}>Echo Voice</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Disconnected/error banner */}
      {session.state === "disconnected" && (
        <Pressable style={styles.errorBanner} onPress={session.connect}>
          <Ionicons name="warning-outline" size={14} color="#ef4444" />
          <Text style={styles.errorBannerText}>Disconnected · Tap to reconnect</Text>
        </Pressable>
      )}

      {/* Help panel */}
      {showHelp && (
        <View style={styles.helpPanel}>
          <Text style={styles.helpTitle}>What can I say?</Text>
          {[
            "Run my [workflow name]",
            "Create a workflow for [description]",
            "Cancel the current run",
            "What workflows do I have?",
          ].map((ex) => (
            <Text key={ex} style={styles.helpExample}>
              "{ex}"
            </Text>
          ))}
        </View>
      )}

      {/* Agent status row */}
      <View style={styles.agentRow}>
        <View style={[styles.agentDot, { backgroundColor: agentStateDot }]} />
        <Text style={styles.agentLabel}>
          {activeTool ? (TOOL_META[activeTool]?.label ?? "Working...") : statusLabel[session.state]}
        </Text>
        {activeTool && (
          <View style={styles.toolPill}>
            <Ionicons
              name={TOOL_META[activeTool]?.icon ?? "cog-outline"}
              size={13}
              color="#A577FF"
            />
            <ActivityIndicator size="small" color="#A577FF" style={{ marginLeft: 4 }} />
          </View>
        )}
      </View>

      {/* Pulse orb visualizer */}
      <View style={styles.visualizerContainer}>
        {/* Soft glow behind orb */}
        <View style={styles.visualizerGlow} pointerEvents="none">
          <LinearGradient
            colors={["rgba(165,119,255,0.28)", "rgba(33,196,221,0.12)", "transparent"]}
            style={{ flex: 1, borderRadius: 120 }}
          />
        </View>
        <PulseOrb state={session.state} />
      </View>

      {/* Transcript panel — liquid glass on iOS 26+, blur on older iOS, solid on Android */}
      {supportsLiquidGlass ? (
        <GlassView
          style={[styles.transcriptPanel, styles.glassDarken, { overflow: "hidden" }]}
          glassEffectStyle="regular"
          colorScheme="dark"
        >
          <ScrollView
            ref={scrollRef}
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptContent}
            showsVerticalScrollIndicator={false}
          >
            <TranscriptContents transcript={transcript} synthResult={synthResult} router={router} />
          </ScrollView>
        </GlassView>
      ) : Platform.OS === "ios" ? (
        <BlurView intensity={25} tint="dark" style={[styles.transcriptPanel, styles.glassDarken]}>
          <ScrollView
            ref={scrollRef}
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptContent}
            showsVerticalScrollIndicator={false}
          >
            <TranscriptContents transcript={transcript} synthResult={synthResult} router={router} />
          </ScrollView>
        </BlurView>
      ) : (
        <View style={[styles.transcriptPanel, styles.transcriptPanelAndroid]}>
          <ScrollView
            ref={scrollRef}
            style={styles.transcriptScroll}
            contentContainerStyle={styles.transcriptContent}
            showsVerticalScrollIndicator={false}
          >
            <TranscriptContents transcript={transcript} synthResult={synthResult} router={router} />
          </ScrollView>
        </View>
      )}

      {/* Control bar — liquid glass on iOS 26+, blur on older iOS, solid on Android */}
      <View style={styles.controlBarOuter}>
        {supportsLiquidGlass ? (
          <GlassView
            style={[styles.controlBarGlass, { overflow: "hidden" }]}
            glassEffectStyle="regular"
            colorScheme="dark"
          >
            <ControlBarContent
              session={session}
              showHelp={showHelp}
              setShowHelp={setShowHelp}
              handleClose={handleClose}
            />
          </GlassView>
        ) : Platform.OS === "ios" ? (
          <BlurView intensity={30} tint="dark" style={styles.controlBarBlur}>
            <ControlBarContent
              session={session}
              showHelp={showHelp}
              setShowHelp={setShowHelp}
              handleClose={handleClose}
            />
          </BlurView>
        ) : (
          <View style={styles.controlBar}>
            <ControlBarContent
              session={session}
              showHelp={showHelp}
              setShowHelp={setShowHelp}
              handleClose={handleClose}
            />
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* ambient background orbs */
  bgOrb1: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: 190,
    top: -80,
    right: -100,
    overflow: "hidden",
  },
  bgOrb2: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    bottom: 120,
    left: -120,
    overflow: "hidden",
  },

  /* top bar */
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 12,
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Inter-SemiBold",
  },

  /* error banner */
  errorBanner: {
    marginHorizontal: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
    marginBottom: 8,
  },
  errorBannerText: {
    color: "#ef4444",
    fontSize: 13,
    fontFamily: "Inter-Medium",
    fontWeight: "500",
  },

  /* help panel */
  helpPanel: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  helpTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter-SemiBold",
    marginBottom: 6,
  },
  helpExample: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    fontFamily: "Inter",
    marginBottom: 3,
    fontStyle: "italic",
  },

  /* agent status row */
  agentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 8,
  },
  agentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  agentLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.55)",
    fontFamily: "Inter",
    flex: 1,
  },
  toolPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(165, 119, 255, 0.4)",
    backgroundColor: "rgba(165, 119, 255, 0.12)",
  },
  toolPillIcon: { fontSize: 12 },
  toolPillLabel: {
    fontSize: 12,
    color: "#A577FF",
    fontFamily: "Inter-Medium",
    fontWeight: "500",
  },

  /* visualizer */
  visualizerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  visualizerGlow: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    overflow: "hidden",
  },

  /* NEW: Reusable dark tint for glass elements */
  glassDarken: {
    backgroundColor: "rgba(0, 0, 0, 0.15)",
  },

  /* transcript panel */
  transcriptPanel: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  transcriptPanelAndroid: {
    backgroundColor: "rgba(20, 10, 45, 0.6)",
    borderColor: "rgba(255,255,255,0.04)",
  },
  transcriptScroll: { flex: 1 },
  transcriptContent: {
    padding: 16,
    gap: 10,
  },
  transcriptEmpty: {
    textAlign: "center",
    color: "rgba(255,255,255,0.25)",
    fontSize: 14,
    fontFamily: "Inter",
    marginTop: 20,
    fontStyle: "italic",
  },
  transcriptEntry: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  transcriptUser: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(165, 119, 255, 0.18)",
    borderColor: "rgba(165, 119, 255, 0.3)",
  },
  transcriptText: {
    fontSize: 15,
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter",
    lineHeight: 21,
  },
  transcriptUserText: { color: "rgba(255,255,255,0.9)" },

  /* synthesis CTA */
  synthCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(165, 119, 255, 0.35)",
    backgroundColor: "rgba(165, 119, 255, 0.1)",
    marginTop: 6,
  },
  synthCtaTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "Inter-SemiBold",
  },
  synthCtaName: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter",
    marginTop: 1,
  },

  /* control bar */
  controlBarOuter: {
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 44 : 24,
    paddingTop: 12,
  },
  controlBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20, 10, 45, 0.8)",
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  controlBarBlur: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    overflow: "hidden",
  },
  controlBarGlass: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    borderRadius: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  ctrlBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlBtnMuted: { backgroundColor: "rgba(239,68,68,0.18)" },
  ctrlBtnActive: { backgroundColor: "rgba(165,119,255,0.2)" },
  ctrlEndBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "135deg" }],
  },
  ctrlDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginHorizontal: 4,
  },
});
