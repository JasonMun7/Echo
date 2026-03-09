import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { IconGripVertical, IconRefresh, IconTrash } from "@tabler/icons-react";

interface RecordingHudProps {}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RecordingHud(_props: RecordingHudProps) {
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingPaused, setRecordingPaused] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!recordingPaused) setRecordingDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [recordingPaused]);
  const handlePause = () => {
    window.electronAPI?.recordingPause?.();
    setRecordingPaused((p) => !p);
  };

  const handleStop = () => {
    window.electronAPI?.recordingStop?.(recordingDuration);
    // Main window receives, stops recorder, calls exitRecordingMode
  };

  const handleRedo = () => {
    window.electronAPI?.recordingRedo?.();
    setRecordingDuration(0);
    setRecordingPaused(false);
  };

  const handleDiscard = () => {
    window.electronAPI?.recordingDiscard?.();
    // Main window receives, discards, calls exitRecordingMode
  };

  const btnBase = {
    WebkitAppRegion: "no-drag" as const,
    appRegion: "no-drag" as const,
    fontSize: 13,
    padding: "10px 20px",
    borderRadius: 8,
    cursor: "pointer" as const,
    border: "none",
  };
  const btnSecondary = {
    ...btnBase,
    border: "1px solid rgba(255,255,255,0.3)",
    background: "rgba(255,255,255,0.1)",
    color: "white",
  };
  const btnPrimary = {
    ...btnBase,
    background: "linear-gradient(to right, #150A35, #A577FF)",
    color: "white",
  };
  const btnDanger = {
    ...btnBase,
    border: "1px solid rgba(239,68,68,0.5)",
    background: "rgba(239,68,68,0.2)",
    color: "#fca5a5",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        width: "100%",
        minHeight: "100%",
        boxSizing: "border-box",
        borderRadius: 12,
        background: "#150A35",
        border: "1px solid rgba(165, 119, 255, 0.4)",
        boxShadow: "0 4px 24px rgba(21, 10, 53, 0.4)",
      }}
    >
      <div
        className="echo-hud-grab-handle"
        style={{ width: 28, padding: "0 4px" }}
      >
        <IconGripVertical size={16} style={{ color: "rgba(255,255,255,0.6)" }} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "16px 20px",
          flex: 1,
          WebkitAppRegion: "no-drag",
          appRegion: "no-drag",
        } as CSSProperties}
      >
        <div
          className={`echo-recording-dot${recordingPaused ? " paused" : ""}`}
        />
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "white",
            minWidth: 48,
          }}
        >
          {formatDuration(recordingDuration)}
        </span>
        <button type="button" onClick={handlePause} style={btnSecondary}>
          {recordingPaused ? "Resume" : "Pause"}
        </button>
        <button type="button" onClick={handleStop} style={btnPrimary}>
          Stop
        </button>
        <button
          type="button"
          onClick={handleRedo}
          title="Redo: discard and restart"
          style={{ ...btnSecondary, minWidth: 44, padding: "10px" }}
        >
          <IconRefresh size={16} style={{ verticalAlign: "middle" }} />
        </button>
        <button type="button" onClick={handleDiscard} style={btnDanger}>
          <IconTrash size={16} style={{ marginRight: 4, verticalAlign: "middle" }} />
          Discard
        </button>
      </div>
    </div>
  );
}
