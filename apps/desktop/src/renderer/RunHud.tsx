import { useState, useRef, useEffect } from "react";
import {
  IconGripVertical,
  IconPlayerPause,
  IconPlayerPlay,
  IconBolt,
  IconBrain,
  IconX,
  IconMicrophone,
} from "@tabler/icons-react";
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

  // Show all entries we have (RunHudWrapper caps at RUN_PROGRESS_MAX_ENTRIES so this stays bounded)
  const recent = liveProgress;
  // Group by step so each step has one card: thoughts in order, then actions in order
  const byStep = recent.reduce(
    (acc, e) => {
      const step = e.step || 1;
      if (!acc[step]) acc[step] = { thoughts: [] as string[], actions: [] as string[] };
      if (e.thought != null && e.thought !== "") acc[step].thoughts.push(e.thought);
      if (e.action != null && e.action !== "") acc[step].actions.push(e.action);
      return acc;
    },
    {} as Record<number, { thoughts: string[]; actions: string[] }>
  );
  const stepNumbers = [...new Set(recent.map((e) => e.step || 1))].sort((a, b) => a - b);

  useEffect(() => {
    thoughtsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [stepNumbers.length]);

  return (
    <TooltipProvider>
      <div
        className="echo-run-hud flex w-full min-h-full flex-col overflow-hidden rounded-lg border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
        style={{
          background: "var(--echo-recording-hud-bg)",
          borderColor: "var(--echo-recording-hud-border)",
        }}
      >
        {/* Header: grab handle + title (like RecordingHud) */}
        <div className="flex shrink-0 items-center gap-2 border-b px-2 py-2.5 pr-3">
          <div
            className="echo-hud-grab-handle flex w-7 shrink-0 cursor-grab items-center justify-center px-1 text-(--echo-text-secondary) active:cursor-grabbing"
            aria-hidden
          >
            <IconGripVertical size={16} />
          </div>
          <span className="text-sm font-semibold text-(--echo-text)">
            EchoPrism
          </span>
        </div>

        {/* Scrollable thought + action stream */}
        <div
          className="echo-hud-no-drag flex min-h-0 flex-1 flex-col overflow-hidden"
          style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" }}
        >
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
            <div className="flex items-center gap-1.5 text-(--echo-text-secondary)">
              <IconBrain size={12} className="shrink-0" />
              <span className="text-xs font-semibold">Thinking…</span>
            </div>
            {stepNumbers.length === 0 ? (
              <p className="text-sm text-(--echo-text-secondary)">
                EchoPrism is taking control…
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {stepNumbers.map((stepNum) => {
                  const group = byStep[stepNum];
                  if (!group || (group.thoughts.length === 0 && group.actions.length === 0))
                    return null;
                  return (
                    <li
                      key={stepNum}
                      className="echo-card rounded-lg border border-(--echo-border) bg-(--echo-surface)/80 px-3 py-2.5"
                    >
                      <div className="mb-2 text-xs font-semibold text-(--echo-text-secondary)">
                        Step {stepNum}
                      </div>
                      <div className="flex flex-col gap-2">
                        {group.thoughts.length > 0 && (
                          <div className="space-y-1.5">
                            {group.thoughts.map((thought, i) => (
                              <div key={i} className="flex gap-2">
                                <IconBrain
                                  size={14}
                                  className="mt-0.5 shrink-0 text-(--echo-lavender)"
                                />
                                <p
                                  className="min-w-0 flex-1 text-sm leading-relaxed text-(--echo-text)"
                                  style={{
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {thought}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                        {group.actions.length > 0 && (
                          <div className="space-y-1 border-t border-(--echo-border)/60 pt-2">
                            {group.actions.map((action, i) => (
                              <div key={i} className="flex gap-2">
                                <IconBolt
                                  size={14}
                                  className="mt-0.5 shrink-0 text-(--echo-cyan)"
                                />
                                <code className="min-w-0 flex-1 break-all text-xs text-(--echo-text)">
                                  {action}
                                </code>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div ref={thoughtsEndRef} />
          </div>

          {/* CallUser section */}
          {isAwaitingUser && callUserReason ? (
            <div
              className="echo-hud-no-drag shrink-0 border-t border-amber-500/30 bg-amber-500/10 px-3 py-3"
              style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" }}
            >
              <p className="mb-1 text-sm font-semibold text-(--echo-text)">
                EchoPrism needs your help
              </p>
              <p className="mb-3 text-xs text-(--echo-text-secondary)">
                {callUserReason}
              </p>
              <div className="flex gap-2">
                <input
                  value={callUserInput}
                  onChange={(e) => setCallUserInput(e.target.value)}
                  placeholder="Type feedback to resume…"
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleSendCallUserFeedback()
                  }
                  className="min-w-0 flex-1 rounded-lg border border-(--echo-input-border) bg-(--echo-input-bg) px-3 py-2 text-sm text-(--echo-text) outline-none placeholder:text-(--echo-text-dim)"
                />
                <button
                  type="button"
                  onClick={handleSendCallUserFeedback}
                  disabled={!callUserInput.trim() || sendingCallUserFeedback}
                  className="echo-btn-cyan-lavender shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {sendingCallUserFeedback ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          ) : null}

          {/* Footer controls (like RecordingHud) */}
          <div
            className="echo-hud-no-drag flex shrink-0 items-center justify-end gap-2 border-t border-(--echo-border) px-3 py-2.5"
            style={{ WebkitAppRegion: "no-drag", appRegion: "no-drag" }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => window.electronAPI?.openVoiceInterruption?.()}
                  className="echo-recording-hud-btn-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border p-0 transition-all"
                  aria-label="Voice interruption"
                >
                  <IconMicrophone size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Voice interruption
                <span className="ml-1.5 text-[10px] opacity-70">
                  Ctrl+Shift+V
                </span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handlePauseResume}
                  className="echo-run-hud-btn-gradient flex h-9 w-9 shrink-0 items-center justify-center p-0"
                  aria-label={runPaused ? "Resume" : "Pause"}
                >
                  {runPaused ? (
                    <IconPlayerPlay size={16} />
                  ) : (
                    <IconPlayerPause size={16} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>{runPaused ? "Resume" : "Pause"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="echo-run-hud-btn-cancel flex shrink-0 items-center justify-center"
                  aria-label="Cancel run"
                >
                  <IconX size={18} strokeWidth={2.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Cancel run</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
