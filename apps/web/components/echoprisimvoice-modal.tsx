"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconX,
  IconWaveSine,
  IconList,
  IconPlayerPlay,
  IconWand,
  IconAlertCircle,
  IconRefresh,
  IconTool,
  IconBrandSlack,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_URL = API_URL.replace(/^http/, "ws");

interface EchoPrismVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
}

type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "muted";

const SYNTHESIS_STEPS = [
  { text: "Understanding your request" },
  { text: "Identifying workflow steps" },
  { text: "Generating step parameters" },
  { text: "Saving workflow" },
];

const TOOL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  list_workflows: {
    label: "Listing workflows",
    icon: <IconList className="h-3.5 w-3.5 text-[#A577FF]" />,
  },
  run_workflow: {
    label: "Starting workflow",
    icon: <IconPlayerPlay className="h-3.5 w-3.5 text-[#A577FF]" />,
  },
  synthesize_from_description: {
    label: "Creating workflow",
    icon: <IconWand className="h-3.5 w-3.5 text-[#A577FF]" />,
  },
  cancel_run: {
    label: "Cancelling run",
    icon: <IconAlertCircle className="h-3.5 w-3.5 text-[#A577FF]" />,
  },
  redirect_run: {
    label: "Redirecting agent",
    icon: <IconRefresh className="h-3.5 w-3.5 text-[#A577FF]" />,
  },
  dismiss_calluser: {
    label: "Dismissing alert",
    icon: <IconAlertCircle className="h-3.5 w-3.5 text-[#A577FF]" />,
  },
  list_integrations: {
    label: "Listing integrations",
    icon: <IconBrandSlack className="h-3.5 w-3.5 text-[#A577FF]" />,
  },
  call_integration: {
    label: "Calling integration",
    icon: <IconBrandSlack className="h-3.5 w-3.5 text-[#A577FF]" />,
  },
};

function getToolMeta(name: string) {
  return TOOL_META[name] ?? { label: name, icon: <IconTool className="h-3.5 w-3.5 text-[#A577FF]" /> };
}

export function EchoPrismVoiceModal({ isOpen, onClose, token }: EchoPrismVoiceModalProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizedWorkflow, setSynthesizedWorkflow] = useState<{ id: string; name: string } | null>(null);

  // Audio refs — own WS, own AudioContext for mic (16kHz) and playback (24kHz)
  const wsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const isMutedRef = useRef(false);
  const transcriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep isMutedRef in sync
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const stopAudioCheck = useCallback(() => {
    if (audioCheckTimerRef.current) {
      clearInterval(audioCheckTimerRef.current);
      audioCheckTimerRef.current = null;
    }
  }, []);

  // After turn_complete, poll until audio queue drains, then flip to listening
  const waitForAudioThenListen = useCallback(() => {
    stopAudioCheck();
    audioCheckTimerRef.current = setInterval(() => {
      const ctx = playbackCtxRef.current;
      if (!ctx || ctx.currentTime >= nextPlayTimeRef.current - 0.05) {
        stopAudioCheck();
        nextPlayTimeRef.current = 0;
        setVoiceState((s) => (s === "speaking" ? "listening" : s));
      }
    }, 150);
  }, [stopAudioCheck]);

  const playPcmAudio = useCallback((arrayBuffer: ArrayBuffer) => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )({ sampleRate: 24000 });
      nextPlayTimeRef.current = 0;
    }
    const ctx = playbackCtxRef.current;
    const pcmData = new Int16Array(arrayBuffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768;
    }
    const buffer = ctx.createBuffer(1, floatData.length, 24000);
    buffer.copyToChannel(floatData, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  }, []);

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    micCtxRef.current?.close().catch(() => {});
    micCtxRef.current = null;
  }, []);

  const startMic = useCallback(async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )({ sampleRate: 16000 });
      micCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        if (isMutedRef.current) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
        }
        ws.send(int16.buffer);
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    } catch (err) {
      console.error("EchoPrismVoice: mic access denied", err);
    }
  }, []);

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (event.data instanceof Blob) {
        setVoiceState("speaking");
        stopAudioCheck();
        const ab = await event.data.arrayBuffer();
        playPcmAudio(ab);
        return;
      }
      try {
        const data = JSON.parse(event.data as string) as Record<string, unknown>;

        if (data.type === "transcript" && typeof data.text === "string" && data.text) {
          setTranscript(data.text);
          // Auto-clear transcript 4s after last update
          if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
          transcriptTimerRef.current = setTimeout(() => setTranscript(""), 4000);
        } else if (data.type === "tool_call" && typeof data.name === "string") {
          setActiveTool(data.name);
          if (data.name === "synthesize_from_description") {
            setIsSynthesizing(true);
          }
        } else if (data.type === "synthesis_complete") {
          setIsSynthesizing(false);
          setActiveTool(null);
          setSynthesizedWorkflow({
            id: data.workflow_id as string,
            name: (data.workflow_name as string) || "New Workflow",
          });
        } else if (data.type === "text") {
          // Text precedes audio — show thinking briefly
          setVoiceState("thinking");
        } else if (data.type === "turn_complete") {
          setActiveTool(null);
          waitForAudioThenListen();
        }
      } catch {
        // ignore non-JSON
      }
    },
    [playPcmAudio, stopAudioCheck, waitForAudioThenListen],
  );

  // Open/close own WebSocket when modal opens/closes
  useEffect(() => {
    if (!isOpen || !token) return;

    // Reset state
    setVoiceState("listening");
    setIsMuted(false);
    setTranscript("");
    setActiveTool(null);
    setIsSynthesizing(false);
    setSynthesizedWorkflow(null);
    nextPlayTimeRef.current = 0;

    const ws = new WebSocket(`${WS_URL}/ws/chat?token=${encodeURIComponent(token)}&mode=voice`);
    wsRef.current = ws;

    ws.onopen = () => {
      startMic(ws);
    };
    ws.onmessage = handleMessage;
    ws.onerror = () => console.error("EchoPrismVoice WS error");
    ws.onclose = () => {
      setVoiceState("idle");
    };

    return () => {
      stopAudioCheck();
      if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
      stopMic();
      playbackCtxRef.current?.close().catch(() => {});
      playbackCtxRef.current = null;
      ws.close();
      wsRef.current = null;
    };
  }, [isOpen, token, startMic, stopMic, handleMessage, stopAudioCheck]);

  function toggleMute() {
    const next = !isMuted;
    setIsMuted(next);
    setVoiceState(next ? "muted" : "listening");
  }

  function handleClose() {
    stopMic();
    onClose();
  }

  if (!isOpen) return null;

  const orbSize = {
    idle: "h-24 w-24",
    listening: "h-36 w-36",
    thinking: "h-28 w-28",
    speaking: "h-44 w-44",
    muted: "h-24 w-24",
  }[voiceState];

  const statusLabel = {
    idle: "",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking",
    muted: "Muted",
  }[voiceState];

  const showDots = voiceState === "thinking" || voiceState === "speaking";

  return (
    <>
      {/* MultiStepLoader sits on top during synthesis */}
      <MultiStepLoader
        loadingStates={SYNTHESIS_STEPS}
        loading={isSynthesizing}
        duration={1800}
        loop={false}
      />

      <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#0A0A14] px-8 py-10">
        {/* Header — just branding, no X */}
        <div className="flex w-full items-center justify-start gap-2">
          <IconWaveSine className="h-5 w-5 text-[#A577FF]" />
          <span className="text-sm font-semibold text-white tracking-wide">EchoPrismVoice</span>
        </div>

        {/* Orb + status + transcript + tool pill */}
        <div className="flex flex-col items-center">
          {/* Animated orb */}
          <div className="relative flex items-center justify-center">
            {/* Outer glow — only when speaking */}
            <div
              className={cn(
                "absolute rounded-full bg-[#A577FF]/20 transition-all duration-700",
                voiceState === "speaking" ? "h-64 w-64 animate-ping opacity-30" : "h-52 w-52 opacity-0",
              )}
            />
            {/* Mid ring — pulses when listening */}
            <div
              className={cn(
                "absolute rounded-full bg-[#A577FF]/30 transition-all duration-500",
                voiceState === "listening"
                  ? "h-52 w-52 animate-pulse"
                  : voiceState === "speaking"
                    ? "h-56 w-56"
                    : voiceState === "muted" || voiceState === "idle"
                      ? "h-36 w-36"
                      : "h-44 w-44",
              )}
            />
            {/* Core orb */}
            <div
              className={cn(
                "relative rounded-full bg-linear-to-br from-[#A577FF] to-[#7C3AED] shadow-2xl shadow-[#A577FF]/50 transition-all duration-300",
                orbSize,
                (voiceState === "muted" || voiceState === "idle") && "opacity-50 saturate-50",
              )}
            >
              <div className="absolute inset-0 rounded-full bg-linear-to-tr from-white/10 to-transparent" />
            </div>
          </div>

          {/* Status + transcript + tool pill — pushed down with top margin */}
          <div className="mt-10 flex flex-col items-center gap-5">
            {/* Status label — only show when there's something meaningful */}
            {statusLabel && (
              <p className="text-sm font-medium text-white/60 tracking-wider uppercase">
                {statusLabel}
                {showDots && (
                  <span className="inline-flex gap-0.5 ml-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                  </span>
                )}
              </p>
            )}

            {/* Transcript */}
            {transcript && !isSynthesizing && (
              <div className="w-full max-w-sm text-center">
                <p className="text-sm text-white/70 leading-relaxed font-light">{transcript}</p>
              </div>
            )}

            {/* Active tool pill */}
            {activeTool && !isSynthesizing && (
              <div className="flex items-center gap-1.5 rounded-full border border-[#A577FF]/40 bg-[#A577FF]/10 px-3 py-1.5">
                {getToolMeta(activeTool).icon}
                <span className="text-xs text-[#A577FF] font-medium">
                  {getToolMeta(activeTool).label}
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#A577FF] animate-pulse" />
              </div>
            )}

            {/* Synthesized workflow CTA */}
            {synthesizedWorkflow && !isSynthesizing && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-white/70 text-center">
                  Workflow ready:{" "}
                  <span className="text-white font-medium">{synthesizedWorkflow.name}</span>
                </p>
                <a
                  href={`/dashboard/workflows/${synthesizedWorkflow.id}`}
                  className="flex items-center gap-2 rounded-full bg-[#A577FF] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                  <IconPlayerPlay className="h-4 w-4" />
                  Run it
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Controls: X (close) left of mute — both h-14 w-14 */}
        <div className="flex items-center gap-6">
          {/* Close */}
          <button
            onClick={handleClose}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 transition-all"
            title="Close"
          >
            <IconX className="h-6 w-6" />
          </button>
          {/* Mute / unmute */}
          <button
            onClick={toggleMute}
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full transition-all",
              isMuted
                ? "bg-white/10 text-white/40 hover:bg-white/20"
                : "bg-[#A577FF]/20 text-[#A577FF] hover:bg-[#A577FF]/30",
            )}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <IconMicrophoneOff className="h-6 w-6" /> : <IconMicrophone className="h-6 w-6" />}
          </button>
        </div>
      </div>
    </>
  );
}
