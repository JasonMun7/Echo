/**
 * VoiceInterruptionOverlay — panel shown when the user interrupts a running workflow.
 *
 * Opens a LiveKit voice session with the echoprism-agent so the user can discuss
 * and redirect the active run. The agent can call resume_run (publishes a data
 * packet) or cancel_run (existing tool). On window close the run auto-resumes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useSession, SessionProvider } from "@livekit/components-react";
import { TokenSource, RoomEvent, ParticipantEvent } from "livekit-client";
import { RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentSessionView_01 } from "@/components/agents-ui/blocks/agent-session-view-01";
import { useAgent } from "@livekit/components-react";
import { Button } from "@/components/ui/button";
import {
  IconMicrophone,
  IconPlayerPlay,
  IconX,
  IconBrain,
} from "@tabler/icons-react";

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

const BARGE_IN_DEBOUNCE_MS = 280;
const BARGE_IN_COOLDOWN_MS = 1500;

interface RunContext {
  workflowId: string;
  runId: string;
  recentThoughts: Array<{ thought: string; action: string; step: number }>;
}

/** Barge-in effect — same pattern as EchoPrismLiveKitSession */
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

    localParticipant.on(ParticipantEvent.IsSpeakingChanged, onSpeakingChanged);
    return () => {
      localParticipant.off(ParticipantEvent.IsSpeakingChanged, onSpeakingChanged);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [session.room, agent?.state]);

  return null;
}

/** Listens for resume_run / cancel_run data packets from the LiveKit agent */
function RunControlPacketEffect({
  session,
  onResumeRun,
  onCancelRun,
}: {
  session: ReturnType<typeof useSession>;
  onResumeRun: () => void;
  onCancelRun: () => void;
}) {
  useEffect(() => {
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
        const data = JSON.parse(new TextDecoder().decode(payload)) as Record<
          string,
          unknown
        >;
        if (data?.type === "resume_run") onResumeRun();
        if (data?.type === "cancel_run") onCancelRun();
      } catch {}
    };

    room.on(RoomEvent.DataReceived, handler);
    return () => void room.off(RoomEvent.DataReceived, handler);
  }, [session.room, onResumeRun, onCancelRun]);

  return null;
}

function VoiceSession({
  runCtx,
  onResumeRun,
  onCancelRun,
}: {
  runCtx: RunContext | null;
  onResumeRun: () => void;
  onCancelRun: () => void;
}) {
  const getToken = async () =>
    (await window.electronAPI?.authGetToken?.()) ?? null;

  // Read workflowId / runId from URL params synchronously — they are embedded in
  // the window URL by the main process before the window loads, so they are always
  // available before session.start() is called (unlike the IPC-delivered runCtx).
  const urlWorkflowId = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("workflowId") ?? "";
  }, []);
  const urlRunId = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get("runId") ?? "";
  }, []);

  const participantAttributes = useMemo<Record<string, string>>(() => {
    const recentContext = (runCtx?.recentThoughts ?? [])
      .slice(-3)
      .map((t) => `Step ${t.step + 1}: ${t.thought}`)
      .join(" | ")
      .slice(0, 400);
    return {
      mode: "voice-interruption",
      workflow_id: urlWorkflowId,
      run_id: urlRunId,
      recent_context: recentContext,
    };
    // participantAttributes only needs the URL-derived IDs — these never change.
    // recentContext from runCtx is best-effort display context only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlWorkflowId, urlRunId]);

  const tokenSource = useMemo(
    () => {
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
              participant_attributes: participantAttributes,
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participantAttributes],
  );

  const roomName = useMemo(
    () => `echoprism-interrupt-${Date.now()}`,
    [],
  );

  const session = useSession(tokenSource, {
    roomName,
    agentName: AGENT_NAME,
  });

  useEffect(() => {
    void session.start().catch(() => {});
    return () => void session.end();
  }, []);

  useEffect(() => {
    const room = session.room;
    if (!room) return;
    const handler = () => window.electronAPI?.closeVoiceInterruption?.();
    room.on(RoomEvent.Disconnected, handler);
    return () => void room.off(RoomEvent.Disconnected, handler);
  }, [session.room]);

  return (
    <SessionProvider session={session}>
      <BargeInEffect session={session} />
      <RunControlPacketEffect
        session={session}
        onResumeRun={onResumeRun}
        onCancelRun={onCancelRun}
      />
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <AgentSessionView_01
          connectingMessage="Connecting…"
          preConnectMessage="Speak to guide EchoPrism, or press Resume to continue."
          isPreConnectBufferEnabled={true}
          supportsChatInput={true}
          supportsVideoInput={false}
          supportsScreenShare={false}
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
      <RoomAudioRenderer />
    </SessionProvider>
  );
}

export default function VoiceInterruptionOverlay() {
  const [runCtx, setRunCtx] = useState<RunContext | null>(null);

  useEffect(() => {
    document.body.style.background = "transparent";
    return () => { document.body.style.background = ""; };
  }, []);

  useEffect(() => {
    window.electronAPI?.onVoiceInterruptionContext?.(setRunCtx);
    return () => window.electronAPI?.removeVoiceInterruptionContextListener?.();
  }, []);

  const handleResumeRun = () => {
    window.electronAPI?.resumeRunFromVoice?.();
  };

  const handleCancelRun = async () => {
    await window.electronAPI?.cancelRun?.();
    window.electronAPI?.exitRunMode?.();
  };

  const handleClose = () => {
    window.electronAPI?.closeVoiceInterruption?.();
  };

  const lastThought = runCtx?.recentThoughts.at(-1);

  return (
    <TooltipProvider>
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRadius: 14,
          background: "var(--echo-surface-solid)",
          border: "1px solid rgba(165, 119, 255, 0.25)",
          boxShadow: "var(--echo-card-shadow)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="echo-hud-grab-handle"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: "1px solid rgba(165, 119, 255, 0.15)",
            background: "rgba(165, 119, 255, 0.06)",
            WebkitAppRegion: "drag",
            appRegion: "drag",
          } as CSSProperties}
        >
          <IconMicrophone size={15} style={{ color: "#A577FF", flexShrink: 0 }} />
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--echo-text)",
            }}
          >
            Voice Interruption
          </span>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--echo-text-secondary)",
              padding: 2,
              display: "flex",
              alignItems: "center",
              WebkitAppRegion: "no-drag",
              appRegion: "no-drag",
            } as CSSProperties}
          >
            <IconX size={14} />
          </button>
        </div>

        {/* Run context strip */}
        {lastThought && (
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(165, 119, 255, 0.1)",
              background: "rgba(165, 119, 255, 0.03)",
              WebkitAppRegion: "no-drag",
              appRegion: "no-drag",
            } as CSSProperties}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                fontWeight: 600,
                color: "#A577FF",
                marginBottom: 3,
              }}
            >
              <IconBrain size={11} />
              Paused at Step {lastThought.step + 1}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--echo-text-secondary)",
                lineHeight: 1.4,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              } as CSSProperties}
            >
              {lastThought.thought}
            </div>
          </div>
        )}

        {/* LiveKit voice session — fills available space */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <VoiceSession
            runCtx={runCtx}
            onResumeRun={handleResumeRun}
            onCancelRun={handleCancelRun}
          />
        </div>

        {/* Footer action buttons */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 14px",
            borderTop: "1px solid rgba(165, 119, 255, 0.15)",
            WebkitAppRegion: "no-drag",
            appRegion: "no-drag",
          } as CSSProperties}
        >
          <Button
            className="echo-btn-primary"
            style={{ flex: 1, gap: 6, fontSize: 12, height: 34 }}
            onClick={handleResumeRun}
          >
            <IconPlayerPlay size={14} />
            Resume workflow
          </Button>
          <Button
            variant="outline"
            style={{
              flex: 1,
              gap: 6,
              fontSize: 12,
              height: 34,
              borderColor: "rgba(239,68,68,0.5)",
              background: "rgba(239,68,68,0.08)",
              color: "#ef4444",
            }}
            onClick={handleCancelRun}
          >
            <IconX size={14} />
            Cancel run
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
