"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  IconBrain,
  IconCircleCheck,
  IconAlertCircle,
  IconChevronDown,
  IconChevronRight,
  IconSparkles,
  IconDownload,
  IconRefresh,
  IconRobot,
  IconClock,
  IconX,
  IconThumbUp,
  IconThumbDown,
  IconEdit,
  IconCheck,
  IconTrash,
  IconSquare,
  IconSquareCheckFilled,
  IconSquareMinusFilled,
  IconPlug,
  IconInfoCircle,
  IconChevronUp,
  IconBrandSlack,
  IconBrandGithub,
  IconMail,
  IconTable,
  IconCalendar,
} from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";

const INTEGRATION_ICONS: Record<string, React.ReactNode> = {
  slack: <IconBrandSlack className="h-4 w-4 text-[#A577FF]" />,
  github: <IconBrandGithub className="h-4 w-4 text-[#A577FF]" />,
  gmail: <IconMail className="h-4 w-4 text-[#A577FF]" />,
  google_sheets: <IconTable className="h-4 w-4 text-[#A577FF]" />,
  google_calendar: <IconCalendar className="h-4 w-4 text-[#A577FF]" />,
};

function IntegrationIcon({ integration }: { integration: string }) {
  return <>{INTEGRATION_ICONS[integration] || <IconPlug className="h-4 w-4 text-[#A577FF]" />}</>;
}

function ExplanatoryBanner() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-[#A577FF]/20 bg-[#F5F3FF] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <IconInfoCircle className="h-4 w-4 text-[#A577FF]" />
          <span className="text-sm font-medium text-[#5B3FA0]">What are traces?</span>
        </div>
        {open ? (
          <IconChevronUp className="h-4 w-4 text-[#A577FF]" />
        ) : (
          <IconChevronDown className="h-4 w-4 text-[#A577FF]" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-[#5B3FA0] space-y-3">
          <p>
            EchoPrism records every thought and action during a run. Review them here to approve
            good examples and correct bad ones. These become training data to make EchoPrism smarter
            over time.
          </p>
          <div>
            <p className="font-semibold mb-1">How fine-tuning works:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-[#5B3FA0]/80">
              <li>EchoPrism runs your workflow and records every decision (thought + action)</li>
              <li>After the run, an offline scorer rates each step as good or bad</li>
              <li>You review flagged steps and approve or reject them (human-in-the-loop)</li>
              <li>
                Approved steps become training examples; bad steps with corrections teach the model
                what to do instead
              </li>
              <li>
                When you export, a Vertex AI supervised fine-tuning job updates the global EchoPrism
                model
              </li>
              <li>Everyone using Echo benefits from the improved model automatically</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

interface ModelStatus {
  has_model: boolean;
  job_status: "training" | "ready" | "failed" | null;
  job_name: string | null;
  tuned_model_id: string | null;
  base_model: string | null;
  example_count: number;
  submitted_at: unknown;
  completed_at: unknown;
}

interface TraceDoc {
  id: string;
  workflow_id: string;
  run_id: string;
  step_count: number;
  good_count: number;
  bad_count: number;
  scored_at: unknown;
}

interface TraceStep {
  id: string;
  step_index: number | null;
  thought: string;
  action: string;
  quality: "good" | "bad" | "unknown";
  rule_reason: string;
  vlm_reason: string;
  corrected_thought: string;
  error: string;
  human_quality: "approved" | "rejected" | null;
  human_corrected_thought: string | null;
  reviewed: boolean;
}

function ModelStatusCard({
  status,
  onPoll,
  polling,
}: {
  status: ModelStatus | null;
  onPoll: () => void;
  polling: boolean;
}) {
  if (!status || status.job_status === null) {
    return (
      <div className="rounded-xl border border-[#A577FF]/20 bg-[#F5F7FC] px-5 py-4 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#A577FF]/10 shrink-0">
          <IconRobot className="h-5 w-5 text-[#A577FF]" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#150A35]">No custom model yet</p>
          <p className="text-xs text-echo-text-muted mt-0.5">
            Export traces for fine-tuning to improve the global EchoPrism model for everyone.
          </p>
        </div>
      </div>
    );
  }

  if (status.job_status === "training") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 shrink-0">
          <IconClock className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800">Training in progress…</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Vertex AI is fine-tuning the global EchoPrism model on {status.example_count} examples.
            This takes 2–6 hours.
          </p>
          {status.job_name && (
            <p className="text-xs font-mono text-amber-600/70 mt-1 truncate">{status.job_name}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onPoll}
          disabled={polling}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-sm transition-colors hover:bg-amber-50 disabled:opacity-50 shrink-0"
        >
          <IconRefresh className={`h-3.5 w-3.5 ${polling ? "animate-spin" : ""}`} />
          {polling ? "Checking…" : "Check status"}
        </button>
      </div>
    );
  }

  if (status.job_status === "ready") {
    return (
      <div className="rounded-xl border border-echo-success/30 bg-echo-success/5 px-5 py-4 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-echo-success/10 shrink-0">
          <IconRobot className="h-5 w-5 text-echo-success" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#150A35]">Global EchoPrism model active</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-echo-success/15 px-2 py-0.5 text-xs font-semibold text-echo-success">
              <IconCircleCheck className="h-3 w-3" />
              Ready
            </span>
          </div>
          <p className="text-xs text-echo-text-muted mt-0.5">
            Trained on {status.example_count} examples from all Echo users. Every run now uses this
            improved model.
          </p>
          {status.tuned_model_id && (
            <p className="text-xs font-mono text-[#A577FF] mt-1 truncate">
              {status.tuned_model_id}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onPoll}
          disabled={polling}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-echo-success/30 bg-white px-3 py-1.5 text-xs font-medium text-[#150A35]/60 shadow-sm transition-colors hover:bg-echo-success/5 disabled:opacity-50 shrink-0"
        >
          <IconRefresh className={`h-3.5 w-3.5 ${polling ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
    );
  }

  if (status.job_status === "failed") {
    return (
      <div className="rounded-xl border border-echo-error/30 bg-echo-error/5 px-5 py-4 flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-echo-error/10 shrink-0">
          <IconX className="h-5 w-5 text-echo-error" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#150A35]">Fine-tuning failed</p>
          <p className="text-xs text-echo-text-muted mt-0.5">
            The Vertex AI tuning job did not complete. Export traces again to retry.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

function QualityBadge({ quality }: { quality: string }) {
  if (quality === "good") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-echo-success/15 px-2.5 py-0.5 text-xs font-semibold text-echo-success">
        <IconCircleCheck className="h-3 w-3" />
        good
      </span>
    );
  }
  if (quality === "bad") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-echo-error/15 px-2.5 py-0.5 text-xs font-semibold text-echo-error">
        <IconAlertCircle className="h-3 w-3" />
        bad
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#150A35]/10 px-2.5 py-0.5 text-xs font-medium text-[#150A35]/60">
      unscored
    </span>
  );
}

function StepRow({
  step,
  traceId,
}: {
  step: TraceStep;
  traceId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [humanQuality, setHumanQuality] = useState<"approved" | "rejected" | null>(
    step.human_quality
  );
  const [correctedText, setCorrectedText] = useState(
    step.human_corrected_thought ?? step.corrected_thought ?? ""
  );
  const [reviewed, setReviewed] = useState(step.reviewed);
  const [saving, setSaving] = useState(false);
  const [savedThought, setSavedThought] = useState(false);

  const hasCorrected =
    step.quality === "bad" && (step.corrected_thought || humanQuality === "approved");

  const borderColor =
    humanQuality === "approved"
      ? "border-l-4 border-l-echo-success"
      : humanQuality === "rejected"
      ? "border-l-4 border-l-echo-error"
      : reviewed
      ? "border-l-4 border-l-[#A577FF]"
      : "";

  const patchStep = async (payload: {
    human_quality?: "approved" | "rejected" | null;
    human_corrected_thought?: string | null;
  }) => {
    setSaving(true);
    try {
      await apiFetch(`/api/traces/${traceId}/steps/${step.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setReviewed(true);
    } catch {
      // silently fail — the UI has already updated optimistically
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    const next = humanQuality === "approved" ? null : "approved";
    setHumanQuality(next);
    await patchStep({ human_quality: next });
  };

  const handleReject = async () => {
    const next = humanQuality === "rejected" ? null : "rejected";
    setHumanQuality(next);
    await patchStep({ human_quality: next });
  };

  const handleThoughtBlur = async () => {
    const trimmed = correctedText.trim();
    if (
      trimmed === (step.human_corrected_thought ?? step.corrected_thought ?? "").trim()
    )
      return;
    await patchStep({ human_corrected_thought: trimmed || null });
    setSavedThought(true);
    setTimeout(() => setSavedThought(false), 2000);
  };

  return (
    <div
      className={`border-b border-[#A577FF]/10 last:border-0 ${borderColor} ${
        humanQuality === "rejected" ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#A577FF]/5"
      >
        <span className="mt-0.5 shrink-0 text-xs font-mono text-echo-text-muted w-6 text-right">
          {step.step_index ?? "?"}
        </span>
        <div className="flex-1 min-w-0">
          {step.action?.toLowerCase().startsWith("api_call") ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#A577FF]/20 border border-[#A577FF]/40 px-2.5 py-1 text-xs font-semibold text-[#A577FF]">
                {(() => {
                  const m = step.action.match(/api_call\(["']?(\w+)["']?,\s*["']?(\w+)/i);
                  const integration = m?.[1] || "api";
                  return <IntegrationIcon integration={integration} />;
                })()}
                API Step
              </span>
              <p className="text-xs font-mono text-[#A577FF]">{step.action}</p>
              {reviewed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#A577FF]/15 px-2 py-0.5 text-xs font-semibold text-[#A577FF] shrink-0">
                  <IconCheck className="h-2.5 w-2.5" />
                  Auto-scored
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-[#150A35] font-medium">
                  {step.thought || (
                    <span className="italic text-echo-text-muted">No thought recorded</span>
                  )}
                </p>
                {reviewed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#A577FF]/15 px-2 py-0.5 text-xs font-semibold text-[#A577FF] shrink-0">
                    <IconCheck className="h-2.5 w-2.5" />
                    Reviewed
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs font-mono text-[#A577FF]">{step.action}</p>
            </>
          )}
        </div>
        <QualityBadge quality={step.quality} />
        <span className="mt-0.5 shrink-0 text-echo-text-muted">
          {expanded ? (
            <IconChevronDown className="h-4 w-4" />
          ) : (
            <IconChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3">
          {(step.rule_reason || step.vlm_reason) && (
            <div className="rounded-lg bg-[#150A35]/5 px-3 py-2">
              <p className="text-xs font-semibold text-[#150A35]/60 uppercase tracking-wide mb-1">
                Reason
              </p>
              <p className="text-sm text-[#150A35]/80 leading-relaxed whitespace-pre-wrap wrap-break-word">
                {step.rule_reason || step.vlm_reason}
              </p>
            </div>
          )}
          {step.error && (
            <div className="rounded-lg border border-echo-error/20 bg-echo-error/5 px-3 py-2">
              <p className="text-xs font-semibold text-echo-error uppercase tracking-wide mb-1">
                Error
              </p>
              <p className="text-sm text-echo-error/80 font-mono whitespace-pre-wrap wrap-break-word">
                {step.error}
              </p>
            </div>
          )}
          {hasCorrected && step.corrected_thought && (
            <div className="rounded-lg border border-[#A577FF]/30 bg-[#A577FF]/5 px-3 py-2">
              <p className="text-xs font-semibold text-[#A577FF] uppercase tracking-wide mb-1">
                Gemini Corrected Thought (T+)
              </p>
              <p className="text-sm text-[#150A35] leading-relaxed whitespace-pre-wrap wrap-break-word">
                {step.corrected_thought}
              </p>
            </div>
          )}

          {/* Human Review Panel */}
          <div className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] px-3 py-3 space-y-3">
            <p className="text-xs font-semibold text-[#150A35]/60 uppercase tracking-wide flex items-center gap-1.5">
              <IconEdit className="h-3.5 w-3.5" />
              Human Review
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleApprove();
                }}
                disabled={saving}
                title="Approve — include as positive training example"
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  humanQuality === "approved"
                    ? "border-echo-success bg-echo-success/10 text-echo-success"
                    : "border-[#150A35]/20 bg-white text-[#150A35]/60 hover:border-echo-success/60 hover:text-echo-success"
                }`}
              >
                <IconThumbUp className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReject();
                }}
                disabled={saving}
                title="Reject — exclude from fine-tuning dataset"
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  humanQuality === "rejected"
                    ? "border-echo-error bg-echo-error/10 text-echo-error"
                    : "border-[#150A35]/20 bg-white text-[#150A35]/60 hover:border-echo-error/60 hover:text-echo-error"
                }`}
              >
                <IconThumbDown className="h-3.5 w-3.5" />
                Reject
              </button>
              {saving && (
                <span className="text-xs text-echo-text-muted animate-pulse">Saving…</span>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-[#150A35]/60 block mb-1">
                Corrected Thought (overrides Gemini&apos;s T+)
              </label>
              <div className="relative">
                <textarea
                  value={correctedText}
                  onChange={(e) => setCorrectedText(e.target.value)}
                  onBlur={handleThoughtBlur}
                  onClick={(e) => e.stopPropagation()}
                  rows={3}
                  placeholder="Write an improved thought that leads to the correct action…"
                  className="w-full resize-none rounded-lg border border-[#A577FF]/30 bg-white px-3 py-2 text-sm text-[#150A35] placeholder:text-echo-text-muted focus:border-[#A577FF] focus:outline-none focus:ring-1 focus:ring-[#A577FF]/30"
                />
                {savedThought && (
                  <span className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-echo-success font-medium">
                    <IconCheck className="h-3.5 w-3.5" />
                    Saved
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-echo-text-muted">
                Edit then click outside to save. This will be used in the fine-tuning dataset.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TraceCard({
  trace,
  selected,
  onToggleSelect,
}: {
  trace: TraceDoc;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);

  const handleExpand = async () => {
    if (!expanded && steps.length === 0) {
      setLoadingSteps(true);
      try {
        const res = await apiFetch(`/api/traces/${trace.id}/steps`);
        const data = await res.json();
        setSteps(data.steps || []);
      } catch {
        // silently fail
      } finally {
        setLoadingSteps(false);
      }
    }
    setExpanded((v) => !v);
  };

  const badRatio =
    trace.step_count > 0 ? Math.round((trace.bad_count / trace.step_count) * 100) : 0;

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-colors ${
        selected ? "border-[#A577FF] ring-2 ring-[#A577FF]/20" : "border-[#A577FF]/20"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-4">
        {/* Checkbox */}
        <button
          type="button"
          onClick={() => onToggleSelect(trace.id)}
          className="shrink-0 cursor-pointer text-[#A577FF] transition-colors hover:text-[#A577FF]/70"
          aria-label={selected ? "Deselect trace" : "Select trace"}
        >
          {selected ? (
            <IconSquareCheckFilled className="h-5 w-5" />
          ) : (
            <IconSquare className="h-5 w-5 text-[#150A35]/25 hover:text-[#A577FF]" />
          )}
        </button>

        {/* Expand / collapse row */}
        <button
          type="button"
          onClick={handleExpand}
          className="flex flex-1 cursor-pointer items-center gap-4 text-left min-w-0"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#A577FF]/10 shrink-0">
            <IconBrain className="h-5 w-5 text-[#A577FF]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#150A35] truncate">
              Run {trace.run_id.slice(0, 8)}…
            </p>
            <p className="text-xs text-echo-text-muted">
              Workflow {trace.workflow_id.slice(0, 8)}… · {trace.step_count} steps
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1 text-xs text-echo-success font-medium">
              <IconCircleCheck className="h-3.5 w-3.5" />
              {trace.good_count}
            </span>
            <span className="flex items-center gap-1 text-xs text-echo-error font-medium">
              <IconAlertCircle className="h-3.5 w-3.5" />
              {trace.bad_count}
            </span>
            {badRatio > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {badRatio}% needs correction
              </span>
            )}
            {expanded ? (
              <IconChevronDown className="h-4 w-4 text-echo-text-muted" />
            ) : (
              <IconChevronRight className="h-4 w-4 text-echo-text-muted" />
            )}
          </div>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[#A577FF]/10">
          {loadingSteps ? (
            <div className="flex flex-col gap-2 px-4 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3 py-2">
                  <Skeleton className="h-4 w-4 shrink-0 rounded-md mt-0.5" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-3/4 rounded-md" />
                    <Skeleton className="h-3 w-1/2 rounded-md" />
                  </div>
                  <Skeleton className="h-5 w-12 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          ) : steps.length === 0 ? (
            <p className="px-5 py-4 text-sm text-echo-text-muted">No scored steps.</p>
          ) : (
            <div className="divide-y divide-[#A577FF]/5">
              {steps.map((step) => (
                <StepRow key={step.id} step={step} traceId={trace.id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TracesPage() {
  const [traces, setTraces] = useState<TraceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    job_name: string;
    example_count: number;
    gcs_path: string;
  } | null>(null);
  const [exportError, setExportError] = useState("");
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [polling, setPolling] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    apiFetch("/api/traces")
      .then((r) => r.json())
      .then((d) => setTraces(d.traces || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    apiFetch("/api/traces/model-status")
      .then((r) => r.json())
      .then((d) => setModelStatus(d))
      .catch(() => {});
  }, []);

  const handleExport = async () => {
    setExporting(true);
    setExportError("");
    setExportResult(null);
    try {
      const res = await apiFetch("/api/traces/export", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setExportError(data.detail || "Export failed");
      } else {
        setExportResult(data);
        apiFetch("/api/traces/model-status")
          .then((r) => r.json())
          .then((d) => setModelStatus(d))
          .catch(() => {});
      }
    } catch (e) {
      setExportError(String(e));
    } finally {
      setExporting(false);
    }
  };

  const handlePollModel = async () => {
    setPolling(true);
    try {
      const res = await apiFetch("/api/traces/poll-model", { method: "POST" });
      await res.json();
      const statusRes = await apiFetch("/api/traces/model-status");
      const statusData = await statusRes.json();
      setModelStatus(statusData);
    } catch {
      // silently fail
    } finally {
      setPolling(false);
    }
  };

  const allSelected = traces.length > 0 && selectedIds.size === traces.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(traces.map((t) => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} trace${count > 1 ? "s" : ""}? This cannot be undone.`)) return;

    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    await Promise.all(
      ids.map((id) => apiFetch(`/api/traces/${id}`, { method: "DELETE" }).catch(() => {}))
    );
    setTraces((prev) => prev.filter((t) => !selectedIds.has(t.id)));
    setSelectedIds(new Set());
    setBulkDeleting(false);
  };

  const totalBad = traces.reduce((sum, t) => sum + t.bad_count, 0);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex w-full flex-1 flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10 overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#150A35]">Trace Review</h1>
            <p className="mt-1 text-sm text-echo-text-muted">
              EchoPrism automatically scores each run after completion. Every workflow you run
              improves the shared global model for everyone.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || traces.length === 0}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#150A35] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2d1b69] disabled:opacity-40"
          >
            <IconSparkles className="h-4 w-4" />
            {exporting ? "Exporting…" : "Export for fine-tuning"}
          </button>
        </div>

        <ExplanatoryBanner />

        <ModelStatusCard status={modelStatus} onPoll={handlePollModel} polling={polling} />

        {exportResult && (
          <div className="rounded-lg border border-[#A577FF]/30 bg-[#A577FF]/5 px-4 py-3 flex items-start gap-3">
            <IconDownload className="h-5 w-5 shrink-0 text-[#A577FF] mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-[#150A35]">
                Vertex AI tuning job submitted — {exportResult.example_count} examples
              </p>
              <p className="text-echo-text-muted mt-0.5 font-mono text-xs break-all">
                {exportResult.job_name}
              </p>
              <p className="text-echo-text-muted mt-0.5 font-mono text-xs break-all">
                {exportResult.gcs_path}
              </p>
            </div>
          </div>
        )}

        {exportError && (
          <div className="rounded-lg border border-echo-error/30 bg-echo-error/5 px-4 py-3 text-sm text-echo-error">
            {exportError}
          </div>
        )}

        {/* Stats row */}
        {!loading && traces.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#A577FF]/20 bg-[#F5F7FC] px-4 py-3">
              <p className="text-xs font-medium text-echo-text-muted uppercase tracking-wide">
                Scored Runs
              </p>
              <p className="mt-1 text-2xl font-bold text-[#150A35]">{traces.length}</p>
            </div>
            <div className="rounded-xl border border-echo-success/20 bg-echo-success/5 px-4 py-3">
              <p className="text-xs font-medium text-echo-success/80 uppercase tracking-wide">
                Good Steps
              </p>
              <p className="mt-1 text-2xl font-bold text-echo-success">
                {traces.reduce((s, t) => s + t.good_count, 0)}
              </p>
            </div>
            <div className="rounded-xl border border-echo-error/20 bg-echo-error/5 px-4 py-3">
              <p className="text-xs font-medium text-echo-error/80 uppercase tracking-wide">
                Bad Steps (T-)
              </p>
              <p className="mt-1 text-2xl font-bold text-echo-error">{totalBad}</p>
            </div>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-10 w-full rounded-lg" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border border-[#A577FF]/20 overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-4">
                  <Skeleton className="h-5 w-5 shrink-0 rounded-md" />
                  <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-40 rounded-md" />
                    <Skeleton className="h-3 w-56 rounded-md" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-4 w-8 rounded-md" />
                    <Skeleton className="h-4 w-8 rounded-md" />
                    <Skeleton className="h-4 w-4 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : traces.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#A577FF]/10">
              <IconBrain className="h-8 w-8 text-[#A577FF]" />
            </div>
            <p className="text-lg font-medium text-[#150A35]">No traces yet</p>
            <p className="max-w-sm text-sm text-echo-text-muted">
              Run workflows to generate trace data. EchoPrism automatically scores each run after it
              completes.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Select-all toolbar */}
            <div className="flex items-center justify-between rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] px-4 py-2.5">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#150A35] transition-colors hover:text-[#A577FF]"
              >
                {allSelected ? (
                  <IconSquareCheckFilled className="h-4 w-4 text-[#A577FF]" />
                ) : someSelected ? (
                  <IconSquareMinusFilled className="h-4 w-4 text-[#A577FF]" />
                ) : (
                  <IconSquare className="h-4 w-4 text-[#150A35]/30" />
                )}
                {allSelected ? "Deselect all" : someSelected ? `${selectedIds.size} selected` : "Select all"}
              </button>

              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-echo-error/30 bg-echo-error/5 px-3 py-1.5 text-xs font-semibold text-echo-error transition-colors hover:bg-echo-error/10 disabled:opacity-50"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                  {bulkDeleting
                    ? "Deleting…"
                    : `Delete ${selectedIds.size} trace${selectedIds.size > 1 ? "s" : ""}`}
                </button>
              )}
            </div>

            {/* Trace cards */}
            {traces.map((trace) => (
              <TraceCard
                key={trace.id}
                trace={trace}
                selected={selectedIds.has(trace.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
