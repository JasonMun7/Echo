import { useState } from "react";
import type { CSSProperties } from "react";
import {
  IconGripVertical,
  IconPlayerPause,
  IconPlayerPlay,
  IconPhoneCall,
  IconBolt,
  IconBrain,
} from "@tabler/icons-react";

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
  const [interruptText, setInterruptText] = useState("");
  const [sendingInterrupt, setSendingInterrupt] = useState(false);
  const [callUserInput, setCallUserInput] = useState("");
  const [sendingCallUserFeedback, setSendingCallUserFeedback] = useState(false);

  const handlePauseResume = () => {
    const next = !runPaused;
    setRunPaused(next);
    next ? window.electronAPI?.pauseRun?.() : window.electronAPI?.resumeRun?.();
  };

  const handleCancel = async () => {
    await window.electronAPI?.cancelRun?.();
    window.electronAPI?.exitRunMode?.();
  };

  const handleInterrupt = async () => {
    if (!interruptText.trim()) return;
    setSendingInterrupt(true);
    try {
      await window.electronAPI?.sendInterrupt?.(interruptText.trim());
      setInterruptText("");
    } finally {
      setSendingInterrupt(false);
    }
  };

  const handleSendCallUserFeedback = async () => {
    if (!callUserInput.trim()) return;
    setSendingCallUserFeedback(true);
    try {
      const result = await window.electronAPI?.sendCallUserFeedback?.(callUserInput.trim());
      if (result?.ok) {
        setCallUserInput("");
        onCallUserFeedbackSent?.();
      }
    } finally {
      setSendingCallUserFeedback(false);
    }
  };

  const lastEntry = liveProgress.length > 0 ? liveProgress[liveProgress.length - 1] : null;
  const thoughts = liveProgress.slice(-5).reverse();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: "100%",
        boxSizing: "border-box",
        borderRadius: 12,
        background: "rgba(245, 247, 252, 0.98)",
        border: "1px solid rgba(165, 119, 255, 0.2)",
        boxShadow: "0 4px 24px rgba(21, 10, 53, 0.12)",
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
            color: "#150A35",
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
              fontFamily: "monospace",
              color: "#150A35",
              wordBreak: "break-all",
            }}
          >
            {lastEntry.action}
          </div>
        </div>
      )}

      {/* Thought section */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "10px 16px",
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
            marginBottom: 6,
          }}
        >
          <IconBrain size={12} />
          Thought
        </div>
        {thoughts.length === 0 ? (
          <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>
            EchoPrism is taking control…
          </p>
        ) : (
          thoughts.map((e, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: "#150A35",
                marginBottom: 8,
                lineHeight: 1.5,
              }}
            >
              <span style={{ color: "#9ca3af" }}>Step {e.step + 1}: </span>
              {e.thought.slice(0, 150)}
              {e.thought.length > 150 ? "…" : ""}
            </div>
          ))
        )}
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
          <p style={{ fontSize: 11, fontWeight: 600, color: "#150A35", margin: "0 0 8px" }}>
            EchoPrism needs your help
          </p>
          <p style={{ fontSize: 10, color: "#6b7280", margin: "0 0 8px" }}>
            {callUserReason}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              value={callUserInput}
              onChange={(e) => setCallUserInput(e.target.value)}
              placeholder="Type feedback to resume…"
              onKeyDown={(e) => e.key === "Enter" && handleSendCallUserFeedback()}
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 8,
                border: "1px solid rgba(251, 191, 36, 0.5)",
                padding: "8px 12px",
                fontSize: 12,
                outline: "none",
                background: "white",
                color: "#150A35",
              }}
            />
            <button
              type="button"
              onClick={handleSendCallUserFeedback}
              disabled={!callUserInput.trim() || sendingCallUserFeedback}
              style={btnPrimary}
            >
              Send feedback &amp; resume
            </button>
          </div>
        </div>
      )}

      {/* Controls row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderTop: "1px solid rgba(165, 119, 255, 0.15)",
          flexWrap: "wrap",
          WebkitAppRegion: "no-drag",
          appRegion: "no-drag",
        } as CSSProperties}
      >
        <button
          type="button"
          onClick={handlePauseResume}
          style={{
            ...btnSecondary,
            border: "1px solid rgba(165, 119, 255, 0.4)",
            background: "#F5F7FC",
            color: "#150A35",
          }}
        >
          {runPaused ? <IconPlayerPlay size={14} /> : <IconPlayerPause size={14} />}
          {runPaused ? "Resume" : "Pause"}
        </button>
        <button type="button" onClick={handleCancel} style={btnDanger}>
          Cancel run
        </button>
        <input
          value={interruptText}
          onChange={(e) => setInterruptText(e.target.value)}
          placeholder="Interrupt (e.g. click the green button)"
          onKeyDown={(e) => e.key === "Enter" && handleInterrupt()}
          style={{
            flex: 1,
            minWidth: 140,
            borderRadius: 8,
            border: "1px solid rgba(165, 119, 255, 0.4)",
            padding: "8px 12px",
            fontSize: 12,
            outline: "none",
            background: "white",
            color: "#150A35",
          }}
        />
        <button
          type="button"
          onClick={handleInterrupt}
          disabled={!interruptText.trim() || sendingInterrupt}
          style={btnPrimary}
          title="Send instruction to agent"
        >
          <IconPhoneCall size={14} />
          Interrupt
        </button>
      </div>
    </div>
  );
}

const btnBase = {
  WebkitAppRegion: "no-drag" as const,
  appRegion: "no-drag" as const,
  fontSize: 12,
  padding: "8px 14px",
  borderRadius: 8,
  cursor: "pointer" as const,
  border: "none",
  display: "flex" as const,
  alignItems: "center" as const,
  gap: 4,
};
const btnSecondary = { ...btnBase };
const btnPrimary = {
  ...btnBase,
  background: "linear-gradient(to right, #150A35, #A577FF)",
  color: "white",
};
const btnDanger = {
  ...btnBase,
  border: "1px solid rgba(239,68,68,0.5)",
  background: "rgba(239,68,68,0.1)",
  color: "#ef4444",
};
