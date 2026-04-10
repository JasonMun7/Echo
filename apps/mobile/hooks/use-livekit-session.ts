import { useRef, useState, useCallback, useEffect } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import {
  Room,
  RoomEvent,
  ParticipantEvent,
  RemoteParticipant,
  type RemoteTrackPublication,
  type TranscriptionSegment,
  Participant,
  TrackPublication,
} from "livekit-client";
import {
  AudioSession,
  AndroidAudioTypePresets,
  useIOSAudioManagement,
} from "@livekit/react-native";
import { useAuthStore } from "@/stores/auth-store";
import { AGENT_URL } from "@/constants";

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "disconnected";

interface LiveKitSessionCallbacks {
  onTranscript?: (text: string, role?: "user" | "agent") => void;
  onToolCall?: (name: string) => void;
  onSynthesisComplete?: (workflowId: string, name?: string) => void;
  onRunStarted?: (workflowId: string, runId: string) => void;
  onTurnComplete?: () => void;
}

const AGENT_NAME = "echoprism-agent";
const BARGE_IN_DEBOUNCE_MS = 280;
const BARGE_IN_COOLDOWN_MS = 1500;

export function useLiveKitSession(callbacks: LiveKitSessionCallbacks) {
  const [state, setState] = useState<VoiceState>("idle");
  const [connected, setConnected] = useState(false);

  // Create Room eagerly so useIOSAudioManagement has a stable reference
  const [room] = useState(() => new Room());

  const intentionalClose = useRef(false);
  const agentSpeakingRef = useRef(false);
  const bargeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bargeCooldownUntilRef = useRef(0);
  const eventsAttachedRef = useRef(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const getIdToken = useAuthStore((s) => s.getIdToken);

  // iOS audio management — dynamically configures AVAudioSession as tracks publish/unpublish
  useIOSAudioManagement(room, true);

  const findAgentParticipant = useCallback((): RemoteParticipant | undefined => {
    if (!room) return undefined;
    return (
      Array.from(room.remoteParticipants.values()).find((p) => p.identity?.includes("agent")) ??
      Array.from(room.remoteParticipants.values())[0]
    );
  }, [room]);

  const connect = useCallback(async () => {
    if (room.state === "connected") return;

    setState("connecting");
    intentionalClose.current = false;

    const token = await getIdToken();
    if (!token) {
      setState("disconnected");
      return;
    }

    const roomName = `echoprism-${Date.now()}`;

    try {
      const res = await fetch(`${AGENT_URL.replace(/\/$/, "")}/api/livekit/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          room_name: roomName,
          room_config: { agents: [{ agent_name: AGENT_NAME }] },
        }),
      });
      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);

      const data = (await res.json()) as {
        server_url: string;
        participant_token: string;
      };

      // Configure audio for bidirectional communication before starting
      await AudioSession.configureAudio({
        android: {
          audioTypeOptions: AndroidAudioTypePresets.communication,
        },
      });
      await AudioSession.startAudioSession();

      // --- Attach room events (only once) ---

      if (!eventsAttachedRef.current) {
        eventsAttachedRef.current = true;

        room.on(RoomEvent.Connected, () => {
          setConnected(true);
          setState("listening");
          room.localParticipant.setMicrophoneEnabled(true);
        });

        room.on(RoomEvent.Disconnected, () => {
          setConnected(false);
          if (!intentionalClose.current) {
            setState("disconnected");
          }
        });

        room.on(RoomEvent.Reconnecting, () => {
          setState("connecting");
        });

        room.on(RoomEvent.Reconnected, () => {
          setState("listening");
        });

        // --- Agent speaking detection ---

        const onAgentSpeaking = (speaking: boolean) => {
          agentSpeakingRef.current = speaking;
          if (speaking) {
            setState("speaking");
          } else {
            setState((s) => (s === "muted" ? "muted" : "listening"));
          }
        };

        room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
          participant.on(ParticipantEvent.IsSpeakingChanged, onAgentSpeaking);
        });

        // Also attach to participants already in the room
        room.on(RoomEvent.TrackSubscribed, () => {
          const agent = findAgentParticipant();
          if (agent) {
            agent.off(ParticipantEvent.IsSpeakingChanged, onAgentSpeaking);
            agent.on(ParticipantEvent.IsSpeakingChanged, onAgentSpeaking);
          }
        });

        // --- Barge-in: interrupt agent when user speaks ---

        room.localParticipant.on(ParticipantEvent.IsSpeakingChanged, (speaking: boolean) => {
          if (!speaking) {
            if (bargeDebounceRef.current) {
              clearTimeout(bargeDebounceRef.current);
              bargeDebounceRef.current = null;
            }
            return;
          }
          if (!agentSpeakingRef.current) return;
          if (Date.now() < bargeCooldownUntilRef.current) return;

          bargeDebounceRef.current = setTimeout(() => {
            bargeDebounceRef.current = null;
            if (Date.now() < bargeCooldownUntilRef.current) return;
            bargeCooldownUntilRef.current = Date.now() + BARGE_IN_COOLDOWN_MS;

            const agent = findAgentParticipant();
            if (!agent) return;
            room.localParticipant
              .performRpc({
                destinationIdentity: agent.identity,
                method: "interrupt",
                payload: "",
                responseTimeout: 5000,
              })
              .catch(() => {});
          }, BARGE_IN_DEBOUNCE_MS);
        });

        // --- Data packets (run_started, tool_call, synthesis_complete, etc.) ---

        room.on(
          RoomEvent.DataReceived,
          (
            payload: Uint8Array,
            _participant?: RemoteParticipant,
            _kind?: unknown,
            topic?: string,
          ) => {
            if (topic !== "echoprism") return;
            try {
              const str = new TextDecoder().decode(payload);
              const msg = JSON.parse(str) as Record<string, unknown>;

              switch (msg.type) {
                case "tool_call":
                  setState("thinking");
                  callbacksRef.current.onToolCall?.((msg.name as string) ?? "tool");
                  break;
                case "synthesis_complete":
                  callbacksRef.current.onSynthesisComplete?.(
                    msg.workflow_id as string,
                    msg.workflow_name as string | undefined,
                  );
                  break;
                case "run_started": {
                  callbacksRef.current.onRunStarted?.(
                    (msg.workflowId as string) ?? (msg.workflow_id as string),
                    (msg.runId as string) ?? (msg.run_id as string),
                  );
                  break;
                }
                case "turn_complete":
                  callbacksRef.current.onTurnComplete?.();
                  setState((s) => (s === "muted" ? "muted" : "listening"));
                  break;
              }
            } catch {}
          },
        );

        // --- Transcription events ---

        room.on(
          RoomEvent.TranscriptionReceived,
          (
            segments: TranscriptionSegment[],
            participant?: Participant,
            _publication?: TrackPublication,
          ) => {
            for (const seg of segments) {
              if (!seg.final) continue;
              const role = participant instanceof RemoteParticipant ? "agent" : "user";
              callbacksRef.current.onTranscript?.(seg.text, role);
            }
          },
        );
      }

      // --- Connect ---

      await room.connect(data.server_url, data.participant_token);
    } catch (err) {
      console.error("[LiveKit] Connection failed:", err);
      setState("disconnected");
    }
  }, [room, getIdToken, findAgentParticipant]);

  const disconnect = useCallback(() => {
    intentionalClose.current = true;
    if (bargeDebounceRef.current) {
      clearTimeout(bargeDebounceRef.current);
      bargeDebounceRef.current = null;
    }
    room.disconnect();
    AudioSession.stopAudioSession();
    setConnected(false);
    setState("idle");
  }, [room]);

  const toggleMute = useCallback(() => {
    const mic = room.localParticipant.isMicrophoneEnabled;
    room.localParticipant.setMicrophoneEnabled(!mic);
    setState((s) => {
      if (mic) return "muted"; // was enabled, now muting
      // was muted, now unmuting — return to listening unless agent is speaking
      return agentSpeakingRef.current ? "speaking" : "listening";
    });
  }, [room]);

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
    toggleMute,
    isMuted: state === "muted",
  };
}
