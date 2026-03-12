import { useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import {
  IconGripVertical,
  IconPlayerPause,
  IconPlayerPlay,
  IconBolt,
  IconBrain,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LiveEntry {
  thought: string;
  action: string;
  step: number;
}

interface RunHudProps {
  runPaused: boolean;
  setRunPaused: (p: boolean) => void;
  liveProgress: LiveEntry[];
  callUserReason?: string | null;
  isAwaitingUser?: boolean;
  onCallUserFeedbackSent?: () => void;
}

export default function RunHud({
  runPaused,
  setRunPaused,
  liveProgress,
  callUserReason,
  isAwaitingUser,
  onCallUserFeedbackSent,
}: RunHudProps) {
  const [callUserInput, setCallUserInput] = useState("");
  const [sendingCallUserFeedback, setSendingCallUserFeedback] = useState(false);
  const thoughtsEndRef = useRef<HTMLDivElement>(null);

  const handlePauseResume = () => {
    const next = !runPaused;
    setRunPaused(next);
    next ? window.electronAPI?.pauseRun?.() : window.electronAPI?.resumeRun?.();
  };

  const handleCancel = async () => {
    await window.electronAPI?.cancelRun?.();
    window.electronAPI?.exitRunMode?.();
  };

  const handleSendCallUserFeedback = async () => {
    if (!callUserInput.trim()) return;
    setSendingCallUserFeedback(true);
    try {
      const result = await window.electronAPI?.sendCallUserFeedback?.(
        callUserInput.trim()
      );
      if (result?.ok) {
        setCallUserInput("");
        onCallUserFeedbackSent?.();
      }
    } finally {
      setSendingCallUserFeedback(false);
    }
  };

  const lastEntry =
    liveProgress.length > 0 ? liveProgress[liveProgress.length - 1] : null;
  const thoughts = liveProgress.slice(-12);

  useEffect(() => {
    thoughtsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thoughts.length]);

  return (
    <TooltipProvider>
    <div
      className="echo-hud-run"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: "100%",
        boxSizing: "border-box",
        borderRadius: 12,
        background: "var(--echo-surface-solid)",
        border: "1px solid rgba(165, 119, 255, 0.2)",
        boxShadow: "var(--echo-card-shadow)",
        overflow: "hidden",
      }}
    >
      {/* Header with grab handle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 12px",
          borderBottom: "1px solid rgba(165, 119, 255, 0.15)",
          background: "rgba(165, 119, 255, 0.04)",
        }}
      >
        <div
          className="echo-hud-grab-handle"
          style={{ width: 24, padding: "0 4px", marginRight: 8 }}
        >
          <IconGripVertical size={14} style={{ color: "#A577FF" }} />
        </div>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--echo-text)",
          }}
        >
          EchoPrism
        </span>
      </div>

      {/* Action section */}
      {lastEntry?.action && (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(165, 119, 255, 0.1)",
            WebkitAppRegion: "no-drag",
            appRegion: "no-drag",
          } as CSSProperties}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              fontWeight: 600,
              color: "#A577FF",
              marginBottom: 4,
            }}
          >
            <IconBolt size={12} />
            Action
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
              color: "var(--echo-text)",
              wordBreak: "break-all",
            }}
          >
            {lastEntry.action}
          </div>
        </div>
      )}

      {/* Thought stream - newest at bottom */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "10px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          WebkitAppRegion: "no-drag",
          appRegion: "no-drag",
        } as CSSProperties}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            fontWeight: 600,
            color: "#A577FF",
            marginBottom: 4,
          }}
        >
          <IconBrain size={12} />
          Thoughts
        </div>
        {thoughts.length === 0 ? (
          <p
            style={{
              fontSize: 12,
              color: "var(--echo-text-secondary)",
              margin: 0,
            }}
          >
            EchoPrism is taking control…
          </p>
        ) : (
          thoughts.map((e, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: "var(--echo-text)",
                lineHeight: 1.5,
                padding: "8px 10px",
                borderRadius: 8,
                background: "rgba(165, 119, 255, 0.06)",
                border: "1px solid rgba(165, 119, 255, 0.1)",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--echo-text-secondary)",
                  marginRight: 6,
                }}
              >
                Step {e.step + 1}
              </span>
              <span style={{ color: "var(--echo-text)" }}>{e.thought}</span>
            </div>
          ))
        )}
        <div ref={thoughtsEndRef} />
      </div>

      {/* CallUser section */}
      {isAwaitingUser && callUserReason && (
        <div
          style={{
            padding: 12,
            background: "rgba(251, 191, 36, 0.12)",
            borderTop: "1px solid rgba(251, 191, 36, 0.3)",
            WebkitAppRegion: "no-drag",
            appRegion: "no-drag",
          } as CSSProperties}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--echo-text)",
              margin: "0 0 8px",
            }}
          >
            EchoPrism needs your help
          </p>
          <p
            style={{
              fontSize: 10,
              color: "var(--echo-text-secondary)",
              margin: "0 0 8px",
            }}
          >
            {callUserReason}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              value={callUserInput}
              onChange={(e) => setCallUserInput(e.target.value)}
              placeholder="Type feedback to resume…"
              onKeyDown={(e) =>
                e.key === "Enter" && handleSendCallUserFeedback()
              }
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 8,
                border: "1px solid rgba(251, 191, 36, 0.5)",
                padding: "8px 12px",
                fontSize: 12,
                outline: "none",
                background: "var(--echo-input-bg)",
                color: "var(--echo-text)",
              }}
            />
            <Button
              size="sm"
              className="echo-btn-primary"
              onClick={handleSendCallUserFeedback}
              disabled={!callUserInput.trim() || sendingCallUserFeedback}
            >
              {sendingCallUserFeedback ? "Sending…" : "Send feedback"}
            </Button>
          </div>
        </div>
      )}

      {/* Controls - icons only */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          padding: "12px 16px",
          borderTop: "1px solid rgba(165, 119, 255, 0.15)",
          WebkitAppRegion: "no-drag",
          appRegion: "no-drag",
        } as CSSProperties}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handlePauseResume}
              className="h-9 w-9 rounded-lg border-[#A577FF]/40 bg-[#A577FF]/5 text-[#A577FF] hover:bg-[#A577FF]/15"
            >
              {runPaused ? (
                <IconPlayerPlay size={16} />
              ) : (
                <IconPlayerPause size={16} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{runPaused ? "Resume" : "Pause"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCancel}
              className="h-9 w-9 rounded-lg border-[#ef4444]/50 bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20"
            >
              <IconX size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cancel run</TooltipContent>
        </Tooltip>
      </div>
    </div>
    </TooltipProvider>
  );
}
