import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";
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

function IntegrationBrandIcon({ integration, toolkit }: { integration: string; toolkit?: string }) {
  const i = (toolkit || integration).trim().toLowerCase();
  const common = { size: 26 as const, stroke: 1.5 as const };
  if (i === "google" || i === "googlecalendar" || i === "gmail")
    return <IconBrandGoogle {...common} className="text-[#4285F4]" />;
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

function IntegrationAuthHitl({
  hitl,
  onSubmitResume,
}: {
  hitl: NonNullable<RunHitlState>;
  onSubmitResume: (value: unknown) => void;
}) {
  const [reopenBusy, setReopenBusy] = useState(false);
  const [connectionReady, setConnectionReady] = useState(false);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null | undefined>(
    undefined,
  );
  const [oauthCallbackPreview, setOauthCallbackPreview] = useState<string | null | undefined>(
    undefined,
  );

  const integration = String(hitl.payload.integration ?? "integration");
  const toolkit = String(hitl.payload.toolkit ?? "");
  const message = String(
    hitl.payload.message ??
      "Tap Connect to open Composio in your browser. We’ll enable Continue when your account is connected.",
  );

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const api = window.electronAPI;
      if (!api?.hitlIntegrationStatus) return;
      const r = await api.hitlIntegrationStatus();
      if (cancelled || !r) return;
      if (r.ok && "ready" in r) {
        setConnectionReady(Boolean(r.ready));
        setConnectedAccountId(
          "connected_account_id" in r
            ? (r.connected_account_id as string | null | undefined)
            : undefined,
        );
        setOauthCallbackPreview(
          "oauth_callback_url" in r
            ? (r.oauth_callback_url as string | null | undefined)
            : undefined,
        );
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hitl.step, integration, toolkit]);

  const openConnect = async () => {
    const api = window.electronAPI;
    if (!api?.hitlReopenOauth) return;
    setReopenBusy(true);
    try {
      const r = await api.hitlReopenOauth();
      if (!r) {
        toast.error("Connect failed");
        return;
      }
      if (r.ok === false) {
        const err = "error" in r ? r.error : "Connect failed";
        toast.error(err === "no_pending" ? "Session expired — cancel the run or try again." : err);
        return;
      }
      if (r.ok && "urlOpened" in r && r.urlOpened) {
        toast.success("Opened browser — finish signing in with Composio");
      }
    } finally {
      setReopenBusy(false);
    }
  };

  const shellClass =
    "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border bg-(--echo-surface)/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

  return (
    <div className={`${shellClass} border-(--echo-lavender)/40`}>
      <HitlDragHeader title={`Connect ${toolkit || integration}`} />
      <div
        className="echo-hud-no-drag flex min-h-0 flex-1 flex-col justify-between gap-4 px-4 pb-4 pt-4"
        style={dragStyle}
      >
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-(--echo-border)/50 bg-(--echo-surface)/80 shadow-sm">
            <IntegrationBrandIcon integration={integration} toolkit={toolkit} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-(--echo-text)">
              Connect {toolkit || integration} via Composio
            </p>
            <p className="mt-2 text-sm leading-relaxed text-(--echo-text-secondary)">{message}</p>
            <p className="mt-3 text-[10px] text-(--echo-text-secondary)/80">Step {hitl.step}</p>
            {!connectionReady ? (
              <p className="mt-2 text-[11px] text-(--echo-text-secondary)/90">
                Checking connection… (updates every few seconds)
              </p>
            ) : (
              <p className="mt-2 text-[11px] font-medium text-emerald-600/90">
                Connection detected — tap Continue to resume the run.
                {connectedAccountId ? (
                  <span className="mt-1 block font-mono text-[10px] text-emerald-700/90">
                    Connected account: {connectedAccountId}
                  </span>
                ) : null}
              </p>
            )}
            {oauthCallbackPreview !== undefined &&
            oauthCallbackPreview !== null &&
            oauthCallbackPreview !== "" ? (
              <p className="mt-2 text-[10px] leading-snug text-(--echo-text-secondary)/75">
                OAuth return URL (API):{" "}
                <span className="break-all font-mono">{oauthCallbackPreview}</span>
              </p>
            ) : connectionReady ? null : (
              <p className="mt-2 text-[10px] text-(--echo-text-secondary)/70">
                If the browser does not return to Echo after OAuth, the connection can still
                complete — this panel polls Composio directly. Set{" "}
                <span className="font-mono">COMPOSIO_OAUTH_CALLBACK_URL</span> or{" "}
                <span className="font-mono">FRONTEND_ORIGIN</span> on the API for a branded
                redirect.
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-(--echo-border)/60 pt-4">
          {connectionReady ? (
            <>
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
                onClick={() => void openConnect()}
              >
                <IconExternalLink size={16} className="text-(--echo-cyan)" />
                Open OAuth again
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="default"
              className="echo-run-hud-btn-gradient h-9 border-0 px-5 text-sm font-semibold shadow-sm"
              disabled={reopenBusy}
              onClick={() => void openConnect()}
            >
              <IconExternalLink size={16} stroke={2} />
              {reopenBusy ? "Opening…" : "Connect"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function RunHitlCard({
  hitl,
  onSubmitResume,
}: {
  hitl: NonNullable<RunHitlState>;
  onSubmitResume: (value: unknown) => void;
}) {
  const shellClass =
    "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border bg-(--echo-surface)/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

  if (hitl.kind === "api_call_approval") {
    const integration = String(hitl.payload.integration ?? "");
    const toolkit = String(hitl.payload.toolkit ?? "");
    const composioSlug = String(hitl.payload.composio_slug ?? "");
    const message = String(
      hitl.payload.message ??
        (composioSlug
          ? `Confirm sensitive Composio action: ${composioSlug}`
          : `Approve API call: ${toolkit || integration || "integration"}`),
    );
    const argsPreview = String(hitl.payload.args_preview ?? "{}");
    const sensitive = Boolean(hitl.payload.requires_approval_reason);
    const headline =
      composioSlug || (toolkit || integration ? `${toolkit || integration}` : "Integration action");
    return (
      <div className={`${shellClass} border-(--echo-cyan)/35`}>
        <HitlDragHeader title="Confirm action" />
        <div
          className="echo-hud-no-drag flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 pt-3"
          style={dragStyle}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-(--echo-border)/50 bg-(--echo-surface)/80 shadow-sm">
                <IntegrationBrandIcon integration={integration} toolkit={toolkit} />
              </div>
              <div className="min-w-0 flex-1">
                {sensitive ? (
                  <span className="mb-1 inline-flex rounded-full border border-[#ef4444]/35 bg-[#ef4444]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ef4444]">
                    Sensitive
                  </span>
                ) : null}
                <p className="font-mono text-sm font-semibold tracking-tight text-(--echo-text)">
                  {headline}
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
    return <IntegrationAuthHitl hitl={hitl} onSubmitResume={onSubmitResume} />;
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
              <RunHitlCard hitl={hitl} onSubmitResume={handleSubmitResume} />
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
