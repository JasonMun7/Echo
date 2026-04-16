"use client";

/**
 * EchoPrism LiveKit session for the web dashboard — parity with desktop EchoPrismLiveKitSession.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  RoomAudioRenderer,
  SessionProvider,
  useAgent,
  useSession,
} from "@livekit/components-react";
import { ParticipantEvent, TokenSource } from "livekit-client";
import "@livekit/components-styles";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentSessionView_01 } from "@/components/agents-ui/blocks/agent-session-view-01";
import { AGENT_URL } from "@/lib/api";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";

const AGENT_NAME = "echoprism-agent";

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
            (p) => (p as { isAgent?: boolean }).isAgent ?? p.identity?.includes("agent"),
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

const CHAT_PATH = "/dashboard/chat";

export function EchoPrismLiveKitSession({ className }: { className?: string }) {
  const getIdToken = useAuthStore((s) => s.getIdToken);
  const router = useRouter();
  const pathname = usePathname();

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
  }, [getIdToken]);

  const [roomName] = useState(() => `echoprism-${Date.now()}`);
  const session = useSession(tokenSource, {
    roomName,
    agentName: AGENT_NAME,
  });

  // `useSession` returns a new object whenever connectionState changes (e.g. connecting → connected).
  // Do not list `session` in effect deps — that would run cleanup (disconnect) on every transition and
  // thrash the room ("Client initiated disconnect", ConnectionError in console).
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (pathname !== CHAT_PATH) {
      void sessionRef.current.end();
      return;
    }
    void sessionRef.current.start().catch((err) => {
      console.error("[EchoPrism] Failed to start session:", err);
    });
    return () => void sessionRef.current.end();
  }, [pathname]);

  return (
    <SessionProvider session={session}>
      <TooltipProvider>
        <div
          data-echo-prism
          className={cn("flex min-h-0 flex-1 flex-col bg-background", className)}
        >
          <div className="relative min-h-0 flex-1">
            <BargeInEffect session={session} />
            <AgentSessionView_01
              connectingMessage="Connecting..."
              preConnectMessage="EchoPrism is listening. Ask a question or press the chat button to type."
              autoOpenChatOnUserTurn
              isPreConnectBufferEnabled
              onAfterDisconnect={() => router.push("/dashboard")}
              supportsChatInput={true}
              supportsVideoInput={true}
              supportsScreenShare={true}
              audioVisualizerType="aura"
              audioVisualizerColor={undefined}
              audioVisualizerColorShift={0.3}
              audioVisualizerBarCount={5}
              audioVisualizerGridRowCount={25}
              audioVisualizerGridColumnCount={25}
              audioVisualizerRadialRadius={100}
              audioVisualizerRadialBarCount={25}
              audioVisualizerWaveLineWidth={3}
              className="h-full min-h-[420px]"
            />
          </div>
        </div>
        <RoomAudioRenderer />
      </TooltipProvider>
    </SessionProvider>
  );
}
