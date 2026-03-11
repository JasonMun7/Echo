import { useState, useEffect } from "react";
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconEdit,
  IconTrash,
  IconExternalLink,
} from "@tabler/icons-react";

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
          style={{
            background: "none",
            border: "none",
            color: "#A577FF",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            marginBottom: 16,
            padding: 0,
          }}
        >
          <IconArrowLeft size={18} /> Back
        </button>
        <p style={{ color: "#6b7280", fontSize: 14 }}>Loading workflow…</p>
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "#A577FF",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 14,
            marginBottom: 16,
            padding: 0,
          }}
        >
          <IconArrowLeft size={18} /> Back
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: "var(--echo-cetacean)",
              opacity: 0.7,
              display: "flex",
              alignItems: "center",
              padding: 4,
            }}
          >
            <IconArrowLeft size={20} />
          </button>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "var(--echo-cetacean)",
              margin: 0,
            }}
          >
            {workflow.name || workflowId}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="echo-btn-danger"
            onClick={handleDelete}
            disabled={deleting}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <IconTrash size={16} />
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            className="echo-btn-secondary"
            onClick={onEdit}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <IconEdit size={16} />
            Edit
          </button>
          <button
            type="button"
            className="echo-btn-primary"
            onClick={handleRun}
            disabled={!canRun || steps.length === 0}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <IconPlayerPlay size={16} />
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
          <span style={{ fontSize: 14, color: "var(--echo-cetacean)" }}>
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
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
            Source:{" "}
            <code
              style={{
                background: "rgba(21,10,53,0.05)",
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
            color: "var(--echo-cetacean)",
            marginBottom: 12,
            marginTop: 0,
          }}
        >
          Steps ({steps.length})
        </h3>
        {steps.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: 14 }}>No steps defined.</p>
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
                  background: "rgba(245,247,252,0.5)",
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
                        color: "var(--echo-cetacean)",
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
                        color: "#6b7280",
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
                              background: "rgba(0,0,0,0.04)",
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "#A577FF",
          background: "none",
          border: "1px solid rgba(165,119,255,0.3)",
          borderRadius: 6,
          padding: "6px 12px",
        }}
      >
        <IconExternalLink size={14} />
        View full details in web
      </button>
    </div>
  );
}
