import { useRef, useState, useCallback, useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuthStore } from "@/stores/auth-store";
import { AGENT_URL } from "@/lib/api";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "disconnected";

interface VoiceSessionCallbacks {
  /** Called with 24kHz 16-bit PCM binary data for playback */
  onAudioData?: (data: ArrayBuffer) => void;
  /** Called when agent sends transcript text */
  onTranscript?: (text: string) => void;
  /** Called on tool_call events */
  onToolCall?: (name: string) => void;
  /** Called when synthesis is complete */
  onSynthesisComplete?: (workflowId: string, name?: string) => void;
  /** Called when a run starts */
  onRunStarted?: (workflowId: string, runId: string) => void;
  /** Called when the agent turn is complete */
  onTurnComplete?: () => void;
}

export function useVoiceSession(callbacks: VoiceSessionCallbacks) {
  const [state, setState] = useState<VoiceState>("idle");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(1000);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalClose = useRef(false);
  const getIdToken = useAuthStore((s) => s.getIdToken);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setState("connecting");
    const token = await getIdToken();
    if (!token) {
      setState("disconnected");
      return;
    }

    const wsUrl = `${AGENT_URL.replace(/^http/, "ws")}/ws/chat?token=${encodeURIComponent(token)}&mode=voice`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setConnected(true);
      setState("listening");
      reconnectDelay.current = 1000;
    };

    ws.onmessage = (event) => {
      // Binary = audio PCM data from agent
      if (event.data instanceof ArrayBuffer) {
        setState("speaking");
        callbacksRef.current.onAudioData?.(event.data);
        return;
      }

      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "text":
          case "response":
            callbacksRef.current.onTranscript?.(
              data.text ?? data.content ?? "",
            );
            break;

          case "tool_call":
            setState("thinking");
            callbacksRef.current.onToolCall?.(data.name ?? "tool");
            break;

          case "synthesis_complete":
            callbacksRef.current.onSynthesisComplete?.(
              data.workflow_id,
              data.workflow_name,
            );
            break;

          case "run_started": {
            const link = data.runLink ?? data;
            callbacksRef.current.onRunStarted?.(
              link.workflowId ?? link.workflow_id,
              link.runId ?? link.run_id,
            );
            break;
          }

          case "turn_complete":
            callbacksRef.current.onTurnComplete?.();
            // Return to listening after turn completes
            setState((s) => (s === "muted" ? "muted" : "listening"));
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      if (!intentionalClose.current) {
        setState("disconnected");
        const delay = Math.min(reconnectDelay.current, 30000);
        reconnectTimer.current = setTimeout(() => connect(), delay);
        reconnectDelay.current = delay * 2;
      }
    };

    ws.onerror = () => ws.close();
    wsRef.current = ws;
  }, [getIdToken]);

  /** Send binary PCM audio data */
  const sendAudio = useCallback((pcmData: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmData);
    }
  }, []);

  /** Send text message */
  const sendText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "text", text }));
      setState("thinking");
    }
  }, []);

  /** Toggle mute */
  const toggleMute = useCallback(() => {
    setState((s) => {
      if (s === "muted") return "listening";
      if (s === "listening") return "muted";
      return s;
    });
  }, []);

  /** Disconnect intentionally */
  const disconnect = useCallback(() => {
    intentionalClose.current = true;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    setState("idle");
  }, []);

  // Reconnect on app foreground
  useEffect(() => {
    const handler = (nextState: AppStateStatus) => {
      if (nextState === "active" && !connected && !intentionalClose.current) {
        connect();
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [connected, connect]);

  return {
    state,
    connected,
    connect,
    disconnect,
    sendAudio,
    sendText,
    toggleMute,
    isMuted: state === "muted",
  };
}
