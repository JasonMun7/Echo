import { useState, useEffect } from "react";
import {
  IconGripVertical,
  IconRefresh,
  IconTrash,
  IconPlayerPause,
  IconPlayerPlay,
  IconSquare,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
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
  };

  const handleRedo = () => {
    window.electronAPI?.recordingRedo?.();
    setRecordingDuration(0);
    setRecordingPaused(false);
  };

  const handleDiscard = () => {
    window.electronAPI?.recordingDiscard?.();
  };

  return (
    <div
      className="echo-recording-hud flex w-full min-h-full items-stretch overflow-hidden rounded-lg backdrop-blur-xl border shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
      style={{
        background: "var(--echo-recording-hud-bg)",
        borderColor: "var(--echo-recording-hud-border)",
      }}
    >
      {/* Grab handle */}
      <div
        className={cn(
          "echo-hud-grab-handle flex shrink-0 w-7 items-center justify-center px-1",
          "text-(--echo-text-secondary)",
        )}
      >
        <IconGripVertical size={16} />
      </div>

      {/* Controls */}
      <div className="echo-hud-no-drag flex flex-1 items-center gap-2 p-3 pl-2">
        {/* Recording indicator */}
        <div
          className={cn(
            "echo-recording-dot shrink-0",
            recordingPaused && "paused",
          )}
        />
        <span className="text-sm font-semibold text-(--echo-text) min-w-[48px] tabular-nums">
          {formatDuration(recordingDuration)}
        </span>

        <div className="flex grow items-center gap-3">
          {/* Pause / Resume - theme-aware secondary */}
          <button
            type="button"
            onClick={handlePause}
            className="echo-recording-hud-btn-secondary flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all"
          >
            {recordingPaused ? (
              <IconPlayerPlay size={16} />
            ) : (
              <IconPlayerPause size={16} />
            )}
            <span className="hidden sm:inline">
              {recordingPaused ? "Resume" : "Pause"}
            </span>
          </button>

          {/* Stop - primary CTA, gradient button */}
          <button
            type="button"
            onClick={handleStop}
            className="echo-btn-cyan-lavender flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white"
          >
            <IconSquare size={14} fill="currentColor" />
            Stop
          </button>

          {/* Redo - icon only */}
          <button
            type="button"
            onClick={handleRedo}
            className="echo-recording-hud-btn-secondary flex shrink-0 items-center justify-center rounded-lg border p-2 transition-all"
            aria-label="Redo: discard and restart"
          >
            <IconRefresh size={16} />
          </button>

          {/* Discard - icon only */}
          <button
            type="button"
            onClick={handleDiscard}
            className="echo-btn-danger flex shrink-0 items-center justify-center rounded-lg p-2"
            aria-label="Discard"
          >
            <IconTrash size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
