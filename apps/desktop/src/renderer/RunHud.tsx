import { useMemo, useState, type CSSProperties } from "react";
import {
  IconGripVertical,
  IconPlayerPause,
  IconPlayerPlay,
  IconBrain,
  IconX,
  IconBrandGoogle,
  IconBrandGithub,
  IconBrandSlack,
  IconExternalLink,
  IconShieldCheck,
  IconCircleCheck,
  IconMicrophone,
} from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { dedupeHudActions, formatHudAction } from "./run-hud-action-display";

/** Set true to show the mic shortcut in the footer; IPC still works (e.g. global shortcut). */
const SHOW_VOICE_INTERRUPT_UI = false;

const dragStyle = {
  WebkitAppRegion: "no-drag",
  appRegion: "no-drag",
} as CSSProperties;

function IntegrationBrandIcon({ integration }: { integration: string }) {
  const i = integration.trim().toLowerCase();
  const common = { size: 26 as const, stroke: 1.5 as const };
  if (i === "google") return <IconBrandGoogle {...common} className="text-[#4285F4]" />;
  if (i === "github") return <IconBrandGithub {...common} className="text-(--echo-text)" />;
  if (i === "slack") return <IconBrandSlack {...common} className="text-[#4A154B]" />;
  return <IconShieldCheck size={26} stroke={1.5} className="text-(--echo-cyan)" />;
}

function formatArgValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") {
    return v.length > 1200 ? `${v.slice(0, 1200)}…` : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const API_ARG_ORDER = [
  "to",
  "to_email",
  "subject",
  "body",
  "text",
  "channel",
  "owner",
  "repo",
  "title",
  "verb",
  "url",
  "timeMin",
  "timeMax",
  "timeZone",
];

function ApiCallArgsPreview({ preview }: { preview: string }) {
  let parsed: Record<string, unknown> | null = null;
  try {
    const p = JSON.parse(preview) as unknown;
    if (p && typeof p === "object" && !Array.isArray(p)) {
      parsed = p as Record<string, unknown>;
    }
  } catch {
    /* not JSON */
  }

  if (!parsed) {
    return (
      <div
        className="max-h-[200px] overflow-y-auto rounded-lg border border-(--echo-border)/50 bg-(--echo-surface)/50 px-3 py-2 text-xs leading-relaxed text-(--echo-text)"
        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {preview.trim() || "—"}
      </div>
    );
  }

  const keys = Object.keys(parsed);
  if (keys.length === 0) {
    return (
      <p className="rounded-lg border border-(--echo-border)/40 bg-(--echo-surface)/40 px-3 py-2 text-xs text-(--echo-text-secondary)">
        No arguments
      </p>
    );
  }

  const rest = keys.filter((k) => !API_ARG_ORDER.includes(k)).sort();
  const ordered = [...API_ARG_ORDER.filter((k) => k in parsed), ...rest];

  return (
    <div className="max-h-[220px] min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border border-(--echo-border)/50 bg-(--echo-surface)/50 p-3">
      {ordered.map((key) => (
        <div key={key} className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-(--echo-text-secondary)">
            {key.replace(/_/g, " ")}
          </p>
          <p
            className="text-sm leading-snug text-(--echo-text)"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {formatArgValue(parsed![key])}
          </p>
        </div>
      ))}
    </div>
  );
}

interface LiveEntry {
  thought: string;
  action: string;
  step: number;
}

export type RunHitlState = {
  kind: string;
  payload: Record<string, unknown>;
  step: number;
} | null;

interface RunHudProps {
  runPaused: boolean;
  setRunPaused: (p: boolean) => void;
  liveProgress: LiveEntry[];
  hitl: RunHitlState;
}

/** Draggable strip so the overlay can move when HITL fills the panel (no separate title bar). */
function HitlDragHeader({ title }: { title: string }) {
  return (
    <div
      className="echo-hud-grab-handle flex shrink-0 cursor-grab items-center gap-2 border-b border-(--echo-border)/80 px-2 py-2 active:cursor-grabbing"
      style={
        {
          WebkitAppRegion: "drag",
          appRegion: "drag",
        } as CSSProperties
      }
    >
      <IconGripVertical size={16} className="shrink-0 text-(--echo-text-secondary)" />
      <span className="text-xs font-semibold text-(--echo-text-secondary)">{title}</span>
    </div>
  );
}

function RunHitlCard({
  hitl,
  reopenBusy,
  onSubmitResume,
  onReopenOauth,
}: {
  hitl: NonNullable<RunHitlState>;
  reopenBusy: boolean;
  onSubmitResume: (value: unknown) => void;
  onReopenOauth: () => void;
}) {
  const shellClass =
    "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border bg-(--echo-surface)/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

  if (hitl.kind === "api_call_approval") {
    const integration = String(hitl.payload.integration ?? "");
    const method = String(hitl.payload.method ?? "");
    const message = String(hitl.payload.message ?? `Approve API call: ${integration}.${method}`);
    const argsPreview = String(hitl.payload.args_preview ?? "{}");
    return (
      <div className={`${shellClass} border-(--echo-cyan)/35`}>
        <HitlDragHeader title="API call approval" />
        <div
          className="echo-hud-no-drag flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 pt-3"
          style={dragStyle}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-(--echo-border)/50 bg-(--echo-surface)/80 shadow-sm">
                <IntegrationBrandIcon integration={integration} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold tracking-tight text-(--echo-text)">
                  {integration}.{method}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-(--echo-text-secondary)">
                  {message}
                </p>
                <p className="mt-2 text-[10px] text-(--echo-text-secondary)/80">Step {hitl.step}</p>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-(--echo-text-secondary)/90">
                Request details
              </p>
              <ApiCallArgsPreview preview={argsPreview} />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-(--echo-border)/60 pt-3">
            <Button
              type="button"
              size="default"
              className="echo-run-hud-btn-gradient h-9 border-0 px-5 text-sm font-semibold shadow-sm"
              onClick={() => onSubmitResume(true)}
            >
              <IconCircleCheck size={16} stroke={2} />
              Approve
            </Button>
            <Button
              type="button"
              variant="outline"
              size="default"
              className="h-9 border-(--echo-border) bg-transparent text-sm text-(--echo-text-secondary) hover:text-destructive"
              onClick={() => onSubmitResume({ approved: false })}
            >
              Reject
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (hitl.kind === "integration_auth") {
    const message = String(
      hitl.payload.message ?? "Finish signing in in your browser, then tap Continue in EchoPrism.",
    );
    const integration = String(hitl.payload.integration ?? "integration");
    return (
      <div className={`${shellClass} border-(--echo-lavender)/40`}>
        <HitlDragHeader title={`Connect ${integration}`} />
        <div
          className="echo-hud-no-drag flex min-h-0 flex-1 flex-col justify-between gap-4 px-4 pb-4 pt-4"
          style={dragStyle}
        >
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--echo-lavender)/15 text-(--echo-lavender)">
              <IconBrandGoogle size={24} stroke={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-(--echo-text)">Sign in to {integration}</p>
              <p className="mt-2 text-sm leading-relaxed text-(--echo-text-secondary)">{message}</p>
              <p className="mt-3 text-[10px] text-(--echo-text-secondary)/80">Step {hitl.step}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-(--echo-border)/60 pt-4">
            <Button
              type="button"
              size="default"
              className="echo-run-hud-btn-gradient h-9 border-0 px-5 text-sm font-semibold shadow-sm"
              onClick={() => onSubmitResume(true)}
            >
              <IconCircleCheck size={16} stroke={2} />
              Continue
            </Button>
            <Button
              type="button"
              variant="outline"
              size="default"
              className="h-9 border-(--echo-border) bg-transparent text-sm"
              disabled={reopenBusy}
              onClick={onReopenOauth}
            >
              <IconExternalLink size={16} className="text-(--echo-cyan)" />
              Open sign-in again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shellClass} border-(--echo-border)`}>
      <HitlDragHeader title="Action required" />
      <div
        className="echo-hud-no-drag flex min-h-0 flex-1 flex-col justify-between px-4 pb-4 pt-4"
        style={dragStyle}
      >
        <div>
          <p className="text-sm font-medium text-(--echo-text)">{hitl.kind.replace(/_/g, " ")}</p>
          <p className="mt-2 text-sm text-(--echo-text-secondary)">
            Step {hitl.step} — continue when ready.
          </p>
        </div>
        <div className="border-t border-(--echo-border)/60 pt-4">
          <Button
            type="button"
            size="default"
            className="echo-run-hud-btn-gradient h-9 border-0 px-5 text-sm"
            onClick={() => onSubmitResume(true)}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

function SingleStepPanel({
  stepNum,
  thoughts,
  actions,
}: {
  stepNum: number;
  thoughts: string[];
  actions: string[];
}) {
  const displayActions = useMemo(() => dedupeHudActions(actions), [actions]);
  const empty = thoughts.length === 0 && displayActions.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
      <div className="mb-3 flex items-center gap-1.5 text-(--echo-text-secondary)">
        <IconBrain size={14} className="shrink-0" />
        <span className="text-xs font-semibold">Step {stepNum}</span>
      </div>
      {empty ? (
        <p className="text-sm text-(--echo-text-secondary)">EchoPrism is taking control…</p>
      ) : (
        <div className="echo-card flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-(--echo-border) bg-(--echo-surface)/80 px-3 py-3">
          {thoughts.length > 0 && (
            <div className="space-y-2">
              {thoughts.map((thought, i) => (
                <div key={i} className="flex gap-2">
                  <IconBrain size={16} className="mt-0.5 shrink-0 text-(--echo-lavender)" />
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
          {displayActions.length > 0 && (
            <div
              className={
                thoughts.length > 0
                  ? "mt-3 space-y-2 border-t border-(--echo-border)/60 pt-3"
                  : "space-y-2"
              }
            >
              {displayActions.map((action, i) => {
                const { summary, Icon } = formatHudAction(action);
                return (
                  <div key={`${action}-${i}`} className="flex gap-2">
                    <Icon
                      size={16}
                      stroke={1.5}
                      className="mt-0.5 shrink-0 text-(--echo-cyan)"
                      aria-hidden
                    />
                    <p
                      className="min-w-0 flex-1 text-sm leading-relaxed text-(--echo-text)"
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {summary}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RunHud({ runPaused, setRunPaused, liveProgress, hitl }: RunHudProps) {
  const [reopenBusy, setReopenBusy] = useState(false);

  const handlePauseResume = () => {
    const next = !runPaused;
    setRunPaused(next);
    next ? window.electronAPI?.pauseRun?.() : window.electronAPI?.resumeRun?.();
  };

  const handleCancel = async () => {
    await window.electronAPI?.cancelRun?.();
    window.electronAPI?.exitRunMode?.();
  };

  const handleSubmitResume = (value: unknown) => {
    void window.electronAPI?.hitlSubmitResume?.(value);
  };

  const handleHitlReopen = async () => {
    setReopenBusy(true);
    try {
      await window.electronAPI?.hitlReopenOauth?.();
    } finally {
      setReopenBusy(false);
    }
  };

  const { currentStepNum, currentThoughts, currentActions } = useMemo(() => {
    const recent = liveProgress;
    if (!recent.length) {
      return { currentStepNum: 0, currentThoughts: [] as string[], currentActions: [] as string[] };
    }
    const currentStep = Math.max(...recent.map((e) => e.step || 1));
    const byStep = recent.reduce(
      (acc, e) => {
        const step = e.step || 1;
        if (step !== currentStep) return acc;
        const t = (e.thought ?? "").trim();
        if (t && !acc.thoughts.includes(t)) acc.thoughts.push(t);
        const a = (e.action ?? "").trim();
        if (a && !acc.actions.includes(a)) acc.actions.push(a);
        return acc;
      },
      { thoughts: [] as string[], actions: [] as string[] },
    );
    return {
      currentStepNum: currentStep,
      currentThoughts: byStep.thoughts,
      currentActions: byStep.actions,
    };
  }, [liveProgress]);

  return (
    <TooltipProvider>
      <div
        className="echo-run-hud flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
        style={{
          background: "var(--echo-recording-hud-bg)",
          borderColor: "var(--echo-recording-hud-border)",
        }}
      >
        {!hitl ? (
          <div className="flex shrink-0 items-center gap-2 border-b px-2 py-2.5 pr-3">
            <div
              className="echo-hud-grab-handle flex w-7 shrink-0 cursor-grab items-center justify-center px-1 text-(--echo-text-secondary) active:cursor-grabbing"
              aria-hidden
            >
              <IconGripVertical size={16} />
            </div>
            <span className="text-sm font-semibold text-(--echo-text)">EchoPrism</span>
          </div>
        ) : null}

        <div
          className="echo-hud-no-drag flex min-h-0 flex-1 flex-col overflow-hidden"
          style={dragStyle}
        >
          {hitl ? (
            <div className="flex min-h-0 flex-1 flex-col px-2 pb-1 pt-2">
              <RunHitlCard
                hitl={hitl}
                reopenBusy={reopenBusy}
                onSubmitResume={handleSubmitResume}
                onReopenOauth={handleHitlReopen}
              />
            </div>
          ) : (
            <SingleStepPanel
              stepNum={currentStepNum || 1}
              thoughts={currentThoughts}
              actions={currentActions}
            />
          )}
        </div>

        <div
          className="echo-hud-no-drag flex shrink-0 items-center justify-end gap-2 border-t border-(--echo-border) px-3 py-2.5"
          style={dragStyle}
        >
          {SHOW_VOICE_INTERRUPT_UI ? (
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
                <span className="ml-1.5 text-[10px] opacity-70">Ctrl+Shift+V</span>
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handlePauseResume}
                className="echo-run-hud-btn-gradient flex h-9 w-9 shrink-0 items-center justify-center p-0"
                aria-label={runPaused ? "Resume" : "Pause"}
              >
                {runPaused ? <IconPlayerPlay size={16} /> : <IconPlayerPause size={16} />}
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
    </TooltipProvider>
  );
}
