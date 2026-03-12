/**
 * EchoPrism LiveKit Session — unified Voice + Chat via AgentSessionView.
 *
 * Uses LiveKit AgentSessionView block (transcript, audio visualizer, chat toggle).
 * Chat toggle switches to text input — same agent, same session.
 */
import { useEffect, useMemo, useRef } from "react";
import { useSession, SessionProvider } from "@livekit/components-react";
import { TokenSource, RoomEvent, ParticipantEvent } from "livekit-client";
import { RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentSessionView_01 } from "@/components/agents-ui/blocks/agent-session-view-01";
import { useAgent } from "@livekit/components-react";

const AGENT_NAME = "echoprism-agent";

const API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  "http://localhost:8000";
const ECHO_AGENT_URL =
  (import.meta as { env?: { VITE_ECHO_AGENT_URL?: string } }).env
    ?.VITE_ECHO_AGENT_URL ?? API_URL;
const SANDBOX_ID = (
  import.meta as { env?: { VITE_LIVEKIT_SANDBOX_ID?: string } }
).env?.VITE_LIVEKIT_SANDBOX_ID;

interface EchoPrismLiveKitSessionProps {
  onClose: () => void;
  getToken: () => Promise<string | null>;
  onRunStarted?: (arg: { workflowId: string; runId: string }) => void;
}

const BARGE_IN_DEBOUNCE_MS = 280;
const BARGE_IN_COOLDOWN_MS = 1500;

/** Barge-in: when user speaks while agent is speaking, call interrupt RPC.
 * Debounce + cooldown to avoid spurious/interrupted interrupts that can leave
 * the agent stuck (voice not resuming after interrupt). */
function BargeInEffect({
  session,
}: {
  session: ReturnType<typeof useSession>;
}) {
  const agent = useAgent();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownUntilRef = useRef<number>(0);

  useEffect(() => {
    const room = session.room;
    const localParticipant = room.localParticipant;

    const onSpeakingChanged = (speaking: boolean) => {
      if (!speaking) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        return;
      }
      if (agent?.state !== "speaking") return;
      if (Date.now() < cooldownUntilRef.current) return;

      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        if (Date.now() < cooldownUntilRef.current) return;
        cooldownUntilRef.current = Date.now() + BARGE_IN_COOLDOWN_MS;

        const agentParticipant =
          Array.from(room.remoteParticipants.values()).find(
            (p) =>
              (p as { isAgent?: boolean }).isAgent ??
              p.identity?.includes("agent"),
          ) ?? Array.from(room.remoteParticipants.values())[0];
        if (!agentParticipant) return;
        void room.localParticipant
          .performRpc({
            destinationIdentity: agentParticipant.identity,
            method: "interrupt",
            payload: "",
            responseTimeout: 5000,
          })
          .catch(() => {});
      }, BARGE_IN_DEBOUNCE_MS);
    };

    const handler = (speaking: boolean) => onSpeakingChanged(speaking);
    localParticipant.on(ParticipantEvent.IsSpeakingChanged, handler);
    return () => {
      localParticipant.off(ParticipantEvent.IsSpeakingChanged, handler);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [session.room, agent?.state]);
  return null;
}

export function EchoPrismLiveKitSession({
  onClose,
  getToken,
  onRunStarted,
}: EchoPrismLiveKitSessionProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const tokenSource = useMemo(() => {
    if (SANDBOX_ID) return TokenSource.sandboxTokenServer(SANDBOX_ID);
    return TokenSource.custom(async (options) => {
      const t = await getToken();
      const res = await fetch(
        `${ECHO_AGENT_URL.replace(/\/$/, "")}/api/livekit/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(t ? { Authorization: `Bearer ${t}` } : {}),
          },
          body: JSON.stringify({
            room_name: options.roomName,
            participant_identity: options.participantIdentity,
            participant_name: options.participantName,
            room_config: options.agentName
              ? { agents: [{ agent_name: options.agentName }] }
              : undefined,
          }),
        },
      );
      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
      const data = (await res.json()) as {
        server_url: string;
        participant_token: string;
      };
      return {
        serverUrl: data.server_url,
        participantToken: data.participant_token,
      };
    });
  }, [getToken]);

  const roomName = useMemo(() => `echoprism-${Date.now()}`, []);
  const session = useSession(tokenSource, {
    roomName,
    agentName: AGENT_NAME,
  });

  // Start session on mount; end on unmount
  useEffect(() => {
    void session
      .start()
      .catch((err) => {
        console.error("[EchoPrism] Failed to start session:", err);
        onCloseRef.current();
      });
    return () => void session.end();
  }, []);

  // Close modal when session disconnects (e.g. user clicked Leave)
  useEffect(() => {
    const room = session.room;
    if (!room) return;
    const handler = () => onCloseRef.current();
    room.on(RoomEvent.Disconnected, handler);
    return () => void room.off(RoomEvent.Disconnected, handler);
  }, [session.room]);

  // Listen for run_started data packets
  useEffect(() => {
    if (!onRunStarted) return;
    const room = session.room;
    if (!room) return;
    const handler = (
      payload: Uint8Array,
      _p: unknown,
      _k: unknown,
      topic?: string,
    ) => {
      if (topic !== "echoprism") return;
      try {
        const str = new TextDecoder().decode(payload);
        const data = JSON.parse(str) as Record<string, unknown>;
        if (
          data?.type === "run_started" &&
          typeof data.workflowId === "string" &&
          typeof data.runId === "string"
        ) {
          onRunStarted({ workflowId: data.workflowId, runId: data.runId });
        }
      } catch {}
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
    };
  }, [session.room, onRunStarted]);

  useEffect(() => {
    document.body.setAttribute("data-echo-prism-open", "true");
    return () => document.body.removeAttribute("data-echo-prism-open");
  }, []);

  return (
    <SessionProvider session={session}>
      <TooltipProvider>
        <div
          data-echo-prism
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            background: "var(--echo-bg)",
          }}
        >
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <BargeInEffect session={session} />
            <AgentSessionView_01
              connectingMessage="Connecting..."
              preConnectMessage="EchoPrism is listening. Ask a question or press the chat button to type."
              isPreConnectBufferEnabled={true}
              supportsChatInput={true}
              supportsVideoInput={true}
              supportsScreenShare={true}
              audioVisualizerType="aura"
              audioVisualizerColor={undefined}
              audioVisualizerColorShift={0.3}
              audioVisualizerBarCount={5}
              audioVisualizerGridRowCount={25}
              audioVisualizerGridColumnCount={25}
              audioVisualizerRadialBarCount={25}
              audioVisualizerRadialRadius={100}
              audioVisualizerWaveLineWidth={3}
            />
          </div>
        </div>
        <RoomAudioRenderer />
      </TooltipProvider>
    </SessionProvider>
  );
}
