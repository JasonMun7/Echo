import { useState, useEffect } from "react";
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconEdit,
  IconTrash,
  IconExternalLink,
} from "@tabler/icons-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StepData {
  id: string;
  order: number;
  action: string;
  context: string;
  params: Record<string, unknown>;
}

interface WorkflowData {
  id: string;
  name?: string;
  status?: string;
  workflow_type?: string;
  source_recording_id?: string;
}

interface Props {
  workflowId: string;
  token: string;
  apiUrl: string;
  onBack: () => void;
  onEdit: () => void;
  onRun: (args: {
    workflowId: string;
    steps: Array<Record<string, unknown>>;
    workflowType: string;
  }) => void;
  onDeleted: () => void;
  onOpenWebUI: (path: string) => void;
}

export default function WorkflowDetailView({
  workflowId,
  token,
  apiUrl,
  onBack,
  onEdit,
  onRun,
  onDeleted,
  onOpenWebUI,
}: Props) {
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [steps, setSteps] = useState<StepData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      const base = apiUrl.replace(/\/$/, "");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      try {
        const [wfRes, stepsRes] = await Promise.all([
          fetch(`${base}/api/workflows/${encodeURIComponent(workflowId)}`, { headers }),
          fetch(`${base}/api/workflows/${encodeURIComponent(workflowId)}/steps`, { headers }),
        ]);
        if (cancelled) return;
        if (!wfRes.ok) throw new Error(`Workflow: ${wfRes.status} ${wfRes.statusText}`);
        if (!stepsRes.ok) throw new Error(`Steps: ${stepsRes.status} ${stepsRes.statusText}`);
        const wfData = await wfRes.json();
        const stepsData = await stepsRes.json();
        setWorkflow({ id: workflowId, ...wfData });
        const stepsList = Array.isArray(stepsData) ? stepsData : stepsData.steps ?? [];
        setSteps(stepsList.sort((a: StepData, b: StepData) => a.order - b.order));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [workflowId, token, apiUrl]);

  const handleDelete = async () => {
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const base = apiUrl.replace(/\/$/, "");
      const res = await fetch(`${base}/api/workflows/${encodeURIComponent(workflowId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete workflow");
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  };

  const handleRun = () => {
    if (!workflow || steps.length === 0) return;
    onRun({
      workflowId,
      steps: steps as unknown as Array<Record<string, unknown>>,
      workflowType: workflow.workflow_type ?? "desktop",
    });
  };

  if (loading) {
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          className="echo-btn-secondary-accent mb-3 flex shrink-0 items-center justify-center rounded-lg p-1.5"
          aria-label="Back"
        >
          <IconArrowLeft size={20} className="echo-icon-gradient" />
        </button>
        <Skeleton className="mb-2 h-4 w-48 rounded-md" />
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-14 rounded-md" />
          <Skeleton className="h-8 w-14 rounded-md" />
        </div>
        <Skeleton className="mb-4 h-4 w-32 rounded-md" />
        <Skeleton className="h-24 w-full rounded-lg" style={{ marginBottom: 12 }} />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          className="echo-btn-secondary-accent mb-4 flex shrink-0 items-center justify-center rounded-lg p-1.5"
          aria-label="Back"
        >
          <IconArrowLeft size={20} className="echo-icon-gradient" />
        </button>
        <p style={{ color: "#ef4444", fontSize: 14 }}>{error}</p>
      </div>
    );
  }

  if (!workflow) return null;

  const canRun = workflow.status === "active" || workflow.status === "ready";

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={onBack}
          className="echo-btn-secondary-accent mb-3 flex shrink-0 items-center justify-center rounded-lg p-1.5"
          aria-label="Back"
        >
          <IconArrowLeft size={20} className="echo-icon-gradient" />
        </button>
        <h2
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--echo-text)",
            margin: "0 0 8px 0",
            minWidth: 0,
          }}
        >
          {workflow.name || workflowId}
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button
            type="button"
            className="echo-btn-danger flex items-center gap-1.5 rounded-md px-2 py-1 text-sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            <IconTrash size={14} />
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            className="echo-btn-secondary-accent flex items-center gap-1.5 rounded-md px-2 py-1 text-sm"
            onClick={onEdit}
          >
            <IconEdit size={14} />
            Edit
          </button>
          <button
            type="button"
            className="echo-btn-cyan-lavender flex items-center gap-1.5 rounded-md px-2 py-1 text-sm disabled:opacity-50"
            onClick={handleRun}
            disabled={!canRun || steps.length === 0}
          >
            <IconPlayerPlay size={14} />
            Run
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: "var(--echo-error)", fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      )}

      {/* Info card */}
      <section className="echo-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: "var(--echo-text)" }}>
            Status:{" "}
            <strong
              style={{
                color:
                  workflow.status === "active" || workflow.status === "ready"
                    ? "var(--echo-success)"
                    : workflow.status === "failed"
                      ? "var(--echo-error)"
                      : "var(--echo-lavender)",
              }}
            >
              {workflow.status}
            </strong>
          </span>
          {workflow.workflow_type && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 99,
                background:
                  workflow.workflow_type === "desktop"
                    ? "rgba(165,119,255,0.15)"
                    : "rgba(34,197,94,0.12)",
                color:
                  workflow.workflow_type === "desktop" ? "#A577FF" : "#16a34a",
              }}
            >
              {workflow.workflow_type === "desktop" ? "Desktop" : "Browser"}
            </span>
          )}
        </div>
        {workflow.source_recording_id && (
          <p style={{ fontSize: 13, color: "var(--echo-text-secondary)", marginTop: 8 }}>
            Source:{" "}
            <code
              style={{
                background: "rgba(165,119,255,0.08)",
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 12,
                fontFamily: "monospace",
              }}
            >
              {workflow.source_recording_id}
            </code>
          </p>
        )}
      </section>

      {/* Steps */}
      <section className="echo-card" style={{ padding: 20, marginBottom: 20 }}>
        <h3
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--echo-text)",
            marginBottom: 12,
            marginTop: 0,
          }}
        >
          Steps ({steps.length})
        </h3>
        {steps.length === 0 ? (
          <p style={{ color: "var(--echo-text-secondary)", fontSize: 14 }}>No steps defined.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {steps.map((step, i) => (
              <div
                key={step.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: 12,
                  borderRadius: 8,
                  border: "1px solid rgba(165,119,255,0.15)",
                  background: "var(--echo-surface)",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "rgba(165,119,255,0.12)",
                    color: "#A577FF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "monospace",
                      background: "rgba(165,119,255,0.12)",
                      color: "#A577FF",
                      padding: "2px 8px",
                      borderRadius: 4,
                      marginBottom: 4,
                    }}
                  >
                    {step.action}
                  </span>
                  {step.context && (
                    <p
                      style={{
                        fontSize: 13,
                        color: "var(--echo-text)",
                        margin: "4px 0 0",
                        lineHeight: 1.4,
                      }}
                    >
                      {step.context}
                    </p>
                  )}
                  {step.params && Object.keys(step.params).length > 0 && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        color: "var(--echo-text-secondary)",
                        fontFamily: "monospace",
                      }}
                    >
                      {Object.entries(step.params)
                        .filter(([, v]) => v !== undefined && v !== null && v !== "")
                        .map(([k, v]) => (
                          <span
                            key={k}
                            style={{
                              display: "inline-block",
                              background: "rgba(165,119,255,0.1)",
                              padding: "1px 6px",
                              borderRadius: 3,
                              marginRight: 4,
                              marginBottom: 2,
                            }}
                          >
                            {k}={typeof v === "object" ? JSON.stringify(v) : String(v)}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Open in web */}
      <button
        type="button"
        onClick={() => onOpenWebUI(`/dashboard/workflows/${workflowId}`)}
        className="echo-btn-secondary-accent flex items-center gap-2 text-sm"
      >
        <IconExternalLink size={14} />
        View full details in web
      </button>
    </div>
  );
}
