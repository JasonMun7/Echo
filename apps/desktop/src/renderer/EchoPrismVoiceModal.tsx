/**
 * EchoPrism Voice fullscreen modal — matches web UX.
 * Orb, listening/speaking/thinking states, transcript.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { IconWaveSine } from "@tabler/icons-react";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

interface EchoPrismVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  onStartVoice: () => Promise<{ ok: boolean; error?: string }>;
  onStopVoice: () => void;
  onChatText: (cb: (msg: { role: string; text: string }) => void) => void;
  onChatAudio: (cb: (chunk: ArrayBuffer) => void) => void;
  onRemoveChatListeners: () => void;
  playPcm: (chunk: ArrayBuffer) => void;
  startMic: () => Promise<void>;
  stopMic: () => void;
}

export function EchoPrismVoiceModal({
  isOpen,
  onClose,
  token,
  onStartVoice,
  onStopVoice,
  onChatText,
  onChatAudio,
  onRemoveChatListeners,
  playPcm,
  startMic,
  stopMic,
}: EchoPrismVoiceModalProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const transcriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextPlayTimeRef = useRef(0);
  const playbackCtxRef = useRef<AudioContext | null>(null);

  const playPcmWithState = useCallback(
    (chunk: ArrayBuffer) => {
      setVoiceState("speaking");
      playPcm(chunk);
    },
    [playPcm],
  );

  useEffect(() => {
    if (!isOpen || !token) return;
    setError(null);
    setTranscript("");
    setVoiceState("idle");
    const run = async () => {
      const result = await onStartVoice();
      if (!result.ok) {
        setError(result.error || "Failed to connect");
        return;
      }
      setVoiceState("listening");
      onChatText((msg) => {
        if (msg.role === "assistant") {
          setTranscript(msg.text);
          setVoiceState("thinking");
          if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
          transcriptTimerRef.current = setTimeout(() => setTranscript(""), 4000);
        }
      });
      onChatAudio(playPcmWithState);
      startMic().catch(() => setError("Microphone access denied"));
    };
    run();
    return () => {
      if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
      stopMic();
      onRemoveChatListeners();
      onStopVoice();
    };
  }, [isOpen, token]);

  const handleClose = () => {
    stopMic();
    onRemoveChatListeners();
    onStopVoice();
    onClose();
  };

  if (!isOpen) return null;

  const statusLabel = {
    idle: "",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
  }[voiceState];

  const orbPx =
    voiceState === "listening" ? 144 : voiceState === "speaking" ? 176 : voiceState === "thinking" ? 112 : 96;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#0A0A14",
        padding: "40px 32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
        <IconWaveSine style={{ width: 20, height: 20, color: "#A577FF" }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "white", letterSpacing: "0.02em" }}>
          EchoPrismVoice
        </span>
        <button
          onClick={handleClose}
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.6)",
            fontSize: 20,
            cursor: "pointer",
            padding: "0 8px",
          }}
        >
          ×
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        {error && (
          <p style={{ color: "#ef4444", fontSize: 14 }}>{error}</p>
        )}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {voiceState === "speaking" && (
            <div
              style={{
                position: "absolute",
                width: 256,
                height: 256,
                borderRadius: "50%",
                background: "rgba(165,119,255,0.2)",
                animation: "echo-voice-ping 1s ease-out infinite",
              }}
            />
          )}
          {voiceState === "listening" && (
            <div
              style={{
                position: "absolute",
                width: 208,
                height: 208,
                borderRadius: "50%",
                background: "rgba(165,119,255,0.3)",
                animation: "echo-voice-pulse 1.5s ease-in-out infinite",
              }}
            />
          )}
          <div
            style={{
              position: "relative",
              width: orbPx,
              height: orbPx,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #A577FF, #7C3AED)",
              boxShadow: "0 0 40px rgba(165,119,255,0.5)",
              transition: "width 0.3s, height 0.3s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "inherit",
                background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 50%)",
              }}
            />
          </div>
        </div>
        <div style={{ textAlign: "center", minHeight: 80 }}>
          {statusLabel && (
            <p
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              {statusLabel}
              {(voiceState === "thinking" || voiceState === "speaking") && "..."}
            </p>
          )}
          {transcript && (
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", maxWidth: 400, lineHeight: 1.5 }}>
              {transcript}
            </p>
          )}
        </div>
      </div>
      <div />
    </div>
  );
}
