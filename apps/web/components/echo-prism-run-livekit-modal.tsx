"use client";

/**
 * LiveKit EchoPrism session for workflow run interrupt — replaces WebSocket EchoPrismVoiceModal.
 * Passes participant_attributes (voice-interruption + workflow/run ids) on token issue.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RoomAudioRenderer,
  SessionProvider,
  useAgent,
  useSession,
} from "@livekit/components-react";
import { ParticipantEvent, RoomEvent, TokenSource } from "livekit-client";
import "@livekit/components-styles";
import { IconX } from "@tabler/icons-react";
import Link from "next/link";
import { toast } from "sonner";

import { AgentSessionView_01 } from "@/components/agents-ui/blocks/agent-session-view-01";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";
import { AGENT_URL } from "@/lib/api";
import { WORKFLOW_VIDEO_SYNTHESIS_STEPS } from "@/lib/workflow-synthesis-loader-states";
import { useAuthStore } from "@/stores";

const AGENT_NAME = "echoprism-agent";
const DATA_TOPIC = "echoprism";

const SANDBOX_ID = process.env.NEXT_PUBLIC_LIVEKIT_SANDBOX_ID?.trim() || undefined;

const BARGE_IN_DEBOUNCE_MS = 280;
const BARGE_IN_COOLDOWN_MS = 1500;

function BargeInEffect({ session }: { session: ReturnType<typeof useSession> }) {
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
              (p as { isAgent?: boolean; identity?: string }).isAgent ??
              p.identity?.includes("agent"),
          ) ?? Array.from(room.remoteParticipants.values())[0];
        if (!agentParticipant) return;
        const ident = (agentParticipant as { identity?: string }).identity ?? "";
        void room.localParticipant
          .performRpc({
            destinationIdentity: ident,
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

/** LiveKit data packets: tool_call, synthesis_complete, run_started (parity with WS modal). */
function EchoprismDataParity({ session }: { session: ReturnType<typeof useSession> }) {
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizedWorkflow, setSynthesizedWorkflow] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    const room = session.room;
    const onData = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== DATA_TOPIC) return;
      try {
        const str = new TextDecoder().decode(payload);
        const msg = JSON.parse(str) as Record<string, unknown>;
        if (msg.type === "tool_call" && typeof msg.name === "string") {
          if (msg.name === "synthesize_from_description") setIsSynthesizing(true);
        } else if (msg.type === "synthesis_complete") {
          setIsSynthesizing(false);
          const wid = msg.workflow_id as string | undefined;
          const wname = (msg.workflow_name as string) || "New workflow";
          if (wid) {
            setSynthesizedWorkflow({ id: wid, name: wname });
            toast.success("Workflow created", { description: wname });
          }
        } else if (msg.type === "run_started") {
          const wfId = (msg.workflowId as string) ?? (msg.workflow_id as string);
          const rId = (msg.runId as string) ?? (msg.run_id as string);
          if (wfId && rId) {
            toast.info("Run started", { description: `Workflow ${wfId.slice(0, 8)}…` });
          }
        } else if (msg.type === "turn_complete") {
          setIsSynthesizing(false);
        }
      } catch {
        /* ignore */
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => void room.off(RoomEvent.DataReceived, onData);
  }, [session.room]);

  return (
    <>
      <MultiStepLoader
        loadingStates={[...WORKFLOW_VIDEO_SYNTHESIS_STEPS]}
        loading={isSynthesizing}
        duration={1800}
        loop={false}
      />
      {synthesizedWorkflow ? (
        <div className="pointer-events-auto absolute bottom-24 left-0 right-0 z-[60] flex justify-center px-4">
          <div className="flex max-w-md flex-col items-center gap-2 rounded-xl border border-white/15 bg-[#150A35]/95 px-4 py-3 text-center shadow-lg backdrop-blur-sm">
            <p className="text-sm text-white/90">
              Workflow ready:{" "}
              <span className="font-medium text-white">{synthesizedWorkflow.name}</span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                href={`/dashboard/workflows/${synthesizedWorkflow.id}/edit`}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-[#150A35] hover:opacity-90"
              >
                Open in Echo Flow
              </Link>
              <Link
                href={`/dashboard/workflows/${synthesizedWorkflow.id}`}
                className="text-sm text-white/80 underline-offset-2 hover:underline"
              >
                View workflow
              </Link>
              <button
                type="button"
                className="text-xs text-white/50 hover:text-white/80"
                onClick={() => setSynthesizedWorkflow(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type EchoPrismRunLiveKitModalProps = {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string;
  runId: string;
  /** Optional short context for the agent (e.g. recent thought lines). */
  recentContext?: string;
};

function RunLiveKitSessionBody({
  onClose,
  workflowId,
  runId,
  recentContext,
}: Omit<EchoPrismRunLiveKitModalProps, "isOpen">) {
  const getIdToken = useAuthStore((s) => s.getIdToken);

  const participantAttributes = useMemo<Record<string, string>>(() => {
    const base: Record<string, string> = {
      mode: "voice-interruption",
      workflow_id: workflowId,
      run_id: runId,
    };
    if (recentContext?.trim()) {
      base.recent_context = recentContext.trim().slice(0, 400);
    }
    return base;
  }, [workflowId, runId, recentContext]);

  const tokenSource = useMemo(() => {
    if (SANDBOX_ID) return TokenSource.sandboxTokenServer(SANDBOX_ID);
    return TokenSource.custom(async (options) => {
      const t = await getIdToken();
      const res = await fetch(`${AGENT_URL.replace(/\/$/, "")}/api/livekit/token`, {
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
      });
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
  }, [getIdToken, participantAttributes]);

  const roomName = useMemo(() => `echoprism-interrupt-${Date.now()}`, []);
  const session = useSession(tokenSource, {
    roomName,
    agentName: AGENT_NAME,
  });

  useEffect(() => {
    void session.start().catch((err) => {
      console.error("[EchoPrism] Run modal session failed:", err);
      toast.error("Could not start EchoPrism session");
      onClose();
    });
    return () => void session.end();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one session per modal mount
  }, []);

  const handleLeave = useCallback(() => {
    void session.end();
    onClose();
  }, [session, onClose]);

  return (
    <SessionProvider session={session}>
      <div className="relative flex min-h-0 flex-1 flex-col bg-[#0A0A14]">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold tracking-wide text-white/90">Voice interrupt</span>
          <button
            type="button"
            onClick={handleLeave}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          <EchoprismDataParity session={session} />
          <BargeInEffect session={session} />
          <AgentSessionView_01
            connectingMessage="Connecting…"
            preConnectMessage="EchoPrism is listening. Describe how to redirect this run, or use chat to type."
            autoOpenChatOnUserTurn
            isPreConnectBufferEnabled={true}
            onAfterDisconnect={onClose}
            supportsChatInput={true}
            supportsVideoInput={false}
            supportsScreenShare={false}
            audioVisualizerType="aura"
            audioVisualizerColor={undefined}
            audioVisualizerColorShift={0.3}
            audioVisualizerBarCount={5}
            audioVisualizerGridRowCount={25}
            audioVisualizerGridColumnCount={25}
            audioVisualizerRadialRadius={100}
            audioVisualizerRadialBarCount={25}
            audioVisualizerWaveLineWidth={3}
            className="h-full min-h-[320px] bg-[#0A0A14] text-white [&_*]:text-inherit"
          />
        </div>
        <RoomAudioRenderer />
      </div>
    </SessionProvider>
  );
}

export function EchoPrismRunLiveKitModal({
  isOpen,
  onClose,
  workflowId,
  runId,
  recentContext,
}: EchoPrismRunLiveKitModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0A0A14]">
      <RunLiveKitSessionBody
        onClose={onClose}
        workflowId={workflowId}
        runId={runId}
        recentContext={recentContext}
      />
    </div>
  );
}
