import { useState, useEffect, useRef, useCallback } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconPlus,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
} from "@tabler/icons-react";

/* ── Action types ────────────────────────────────────────────────────────── */

const BROWSER_ACTIONS = [
  "navigate",
  "click_at",
  "type_text_at",
  "scroll",
  "wait",
  "take_screenshot",
  "select_option",
  "hover",
  "press_key",
  "drag_drop",
  "wait_for_element",
  "open_web_browser",
  "close_web_browser",
  "api_call",
] as const;

const DESKTOP_ACTIONS = [
  "click_at",
  "right_click",
  "double_click",
  "type_text_at",
  "hotkey",
  "scroll",
  "drag",
  "wait",
  "press_key",
  "open_app",
  "focus_app",
  "api_call",
] as const;

type AnyAction = (typeof BROWSER_ACTIONS)[number] | (typeof DESKTOP_ACTIONS)[number];

const ALL_ACTIONS: AnyAction[] = [
  ...new Set([...BROWSER_ACTIONS, ...DESKTOP_ACTIONS]),
] as AnyAction[];

/* ── Types ───────────────────────────────────────────────────────────────── */

interface StepData {
  id: string;
  order: number;
  action: string;
  context: string;
  params: Record<string, unknown>;
  expected_outcome?: string;
}

interface WorkflowData {
  id: string;
  name?: string;
  status?: string;
  workflow_type?: string;
}

interface Props {
  workflowId: string;
  token: string;
  apiUrl: string;
  onBack: () => void;
  onSaved: () => void;
}

/* ── Param fields per action type ────────────────────────────────────────── */

function ParamFields({
  action,
  params,
  onChange,
}: {
  action: string;
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const update = (k: string, v: unknown) => onChange({ ...params, [k]: v });

  const inputStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 6,
    border: "1px solid rgba(165,119,255,0.4)",
    background: "var(--echo-input-bg)",
    padding: "6px 10px",
    fontSize: 13,
    outline: "none",
    color: "var(--echo-text)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    color: "var(--echo-text-secondary)",
    marginBottom: 4,
  };

  if (action === "navigate") {
    return (
      <div>
        <label style={labelStyle}>URL</label>
        <input
          type="text"
          value={(params.url as string) || ""}
          onChange={(e) => update("url", e.target.value)}
          placeholder="https://..."
          style={inputStyle}
        />
      </div>
    );
  }

  if (action === "click_at" || action === "type_text_at" || action === "double_click" || action === "right_click") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <label style={labelStyle}>Description</label>
          <input
            type="text"
            value={(params.description as string) || ""}
            onChange={(e) => update("description", e.target.value)}
            placeholder="blue 'Submit' button in the bottom-center"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>X (0–1000)</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.x as number) ?? ""}
              onChange={(e) =>
                update("x", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              placeholder="500"
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Y (0–1000)</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.y as number) ?? ""}
              onChange={(e) =>
                update("y", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              placeholder="500"
              style={inputStyle}
            />
          </div>
        </div>
        {action === "type_text_at" && (
          <div>
            <label style={labelStyle}>Text</label>
            <input
              type="text"
              value={(params.text as string) || ""}
              onChange={(e) => update("text", e.target.value)}
              placeholder="Text to type"
              style={inputStyle}
            />
          </div>
        )}
      </div>
    );
  }

  if (action === "wait_for_element") {
    return (
      <div>
        <label style={labelStyle}>Element Description</label>
        <input
          type="text"
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="loading spinner disappears and dashboard is visible"
          style={inputStyle}
        />
      </div>
    );
  }

  if (action === "scroll") {
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <div>
          <label style={labelStyle}>Direction</label>
          <select
            value={(params.direction as string) || "down"}
            onChange={(e) => update("direction", e.target.value)}
            style={{ ...inputStyle, width: "auto" }}
          >
            <option value="down">down</option>
            <option value="up">up</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Amount</label>
          <input
            type="number"
            value={(params.amount as number) ?? 500}
            onChange={(e) => update("amount", parseInt(e.target.value, 10) || 0)}
            style={{ ...inputStyle, width: 80 }}
          />
        </div>
      </div>
    );
  }

  if (action === "wait") {
    return (
      <div>
        <label style={labelStyle}>Seconds</label>
        <input
          type="number"
          value={(params.seconds as number) ?? 2}
          onChange={(e) => update("seconds", parseInt(e.target.value, 10) || 0)}
          style={{ ...inputStyle, width: 80 }}
        />
      </div>
    );
  }

  if (action === "select_option") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <label style={labelStyle}>Description</label>
          <input
            type="text"
            value={(params.description as string) || ""}
            onChange={(e) => update("description", e.target.value)}
            placeholder="country dropdown in the billing section"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>X (0–1000)</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.x as number) ?? ""}
              onChange={(e) =>
                update("x", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Y (0–1000)</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.y as number) ?? ""}
              onChange={(e) =>
                update("y", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Value</label>
          <input
            type="text"
            value={(params.value as string) || ""}
            onChange={(e) => update("value", e.target.value)}
            placeholder="US"
            style={inputStyle}
          />
        </div>
      </div>
    );
  }

  if (action === "hover") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <label style={labelStyle}>Description</label>
          <input
            type="text"
            value={(params.description as string) || ""}
            onChange={(e) => update("description", e.target.value)}
            placeholder="user avatar in the top-right"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>X (0–1000)</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.x as number) ?? ""}
              onChange={(e) =>
                update("x", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Y (0–1000)</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.y as number) ?? ""}
              onChange={(e) =>
                update("y", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              style={inputStyle}
            />
          </div>
        </div>
      </div>
    );
  }

  if (action === "press_key" || action === "hotkey") {
    return (
      <div>
        <label style={labelStyle}>Key</label>
        <input
          type="text"
          value={(params.key as string) || ""}
          onChange={(e) => update("key", e.target.value)}
          placeholder={action === "hotkey" ? "ctrl+c" : "Enter"}
          style={{ ...inputStyle, width: 160 }}
        />
      </div>
    );
  }

  if (action === "open_app" || action === "focus_app") {
    return (
      <div>
        <label style={labelStyle}>App Name</label>
        <input
          type="text"
          value={(params.app as string) || ""}
          onChange={(e) => update("app", e.target.value)}
          placeholder="Google Chrome"
          style={inputStyle}
        />
      </div>
    );
  }

  if (action === "drag" || action === "drag_drop") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <label style={labelStyle}>Description</label>
          <input
            type="text"
            value={(params.description as string) || ""}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Drag file to folder"
            style={inputStyle}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start X</label>
            <input type="number" min={0} max={1000} value={(params.x as number) ?? ""} onChange={(e) => update("x", e.target.value === "" ? undefined : parseInt(e.target.value, 10) || 0)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Start Y</label>
            <input type="number" min={0} max={1000} value={(params.y as number) ?? ""} onChange={(e) => update("y", e.target.value === "" ? undefined : parseInt(e.target.value, 10) || 0)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>End X</label>
            <input type="number" min={0} max={1000} value={(params.x2 as number) ?? ""} onChange={(e) => update("x2", e.target.value === "" ? undefined : parseInt(e.target.value, 10) || 0)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>End Y</label>
            <input type="number" min={0} max={1000} value={(params.y2 as number) ?? ""} onChange={(e) => update("y2", e.target.value === "" ? undefined : parseInt(e.target.value, 10) || 0)} style={inputStyle} />
          </div>
        </div>
      </div>
    );
  }

  if (action === "api_call") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <label style={labelStyle}>Integration</label>
          <select
            value={(params.integration as string) || ""}
            onChange={(e) => update("integration", e.target.value)}
            style={inputStyle}
          >
            <option value="">— select integration —</option>
            <option value="slack">Slack</option>
            <option value="gmail">Gmail</option>
            <option value="google_sheets">Google Sheets</option>
            <option value="google_calendar">Google Calendar</option>
            <option value="notion">Notion</option>
            <option value="github">GitHub</option>
            <option value="linear">Linear</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Method</label>
          <input
            type="text"
            value={(params.method as string) || ""}
            onChange={(e) => update("method", e.target.value)}
            placeholder="e.g. send_message, list_channels"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Args (JSON object)</label>
          <textarea
            value={typeof params.args === "object" ? JSON.stringify(params.args, null, 2) : (params.args as string) || ""}
            onChange={(e) => {
              try { update("args", JSON.parse(e.target.value)); } catch { update("args", e.target.value); }
            }}
            placeholder='{"channel": "general", "text": "Hello!"}'
            rows={3}
            style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
          />
        </div>
      </div>
    );
  }

  return null;
}

/* ── Step card ───────────────────────────────────────────────────────────── */

function StepCard({
  step,
  index,
  total,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  step: StepData;
  index: number;
  total: number;
  onUpdate: (data: Partial<StepData>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: 14,
        borderRadius: 8,
        border: "1px solid rgba(165,119,255,0.2)",
        background: "var(--echo-surface)",
      }}
    >
      {/* Reorder buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          style={{
            background: "none",
            border: "none",
            color: index === 0 ? "#ccc" : "#A577FF",
            padding: 2,
            lineHeight: 1,
          }}
          title="Move up"
        >
          <IconChevronUp size={16} />
        </button>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#A577FF",
            textAlign: "center",
          }}
        >
          {index + 1}
        </span>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          style={{
            background: "none",
            border: "none",
            color: index === total - 1 ? "#ccc" : "#A577FF",
            padding: 2,
            lineHeight: 1,
          }}
          title="Move down"
        >
          <IconChevronDown size={16} />
        </button>
      </div>

      {/* Step content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Action selector */}
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--echo-text-secondary)", marginBottom: 4 }}>Action</label>
          <select
            value={step.action}
            onChange={(e) => onUpdate({ action: e.target.value })}
            style={{
              borderRadius: 6,
              border: "1px solid rgba(165,119,255,0.4)",
              background: "var(--echo-input-bg)",
              padding: "6px 10px",
              fontSize: 13,
              color: "var(--echo-text)",
            }}
          >
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {/* Context */}
        <div>
          <label style={{ display: "block", fontSize: 11, color: "var(--echo-text-secondary)", marginBottom: 4 }}>Context</label>
          <textarea
            value={step.context}
            onChange={(e) => onUpdate({ context: e.target.value })}
            placeholder="Description of this step"
            rows={2}
            style={{
              width: "100%",
              borderRadius: 6,
              border: "1px solid rgba(165,119,255,0.4)",
              background: "var(--echo-input-bg)",
              padding: "6px 10px",
              fontSize: 13,
              outline: "none",
              color: "var(--echo-text)",
              resize: "vertical",
            }}
          />
        </div>

        {/* Param fields */}
        <ParamFields
          action={step.action}
          params={step.params}
          onChange={(p) => onUpdate({ params: p })}
        />
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        style={{
          background: "none",
          border: "none",
          color: "var(--echo-text-secondary)",
          padding: 4,
          flexShrink: 0,
          marginTop: 2,
        }}
        title="Delete step"
      >
        <IconTrash size={16} />
      </button>
    </div>
  );
}

/* ── Main edit view ──────────────────────────────────────────────────────── */

export default function WorkflowEditView({ workflowId, token, apiUrl, onBack, onSaved }: Props) {
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [steps, setSteps] = useState<StepData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirtyStepIds, setDirtyStepIds] = useState<Set<string>>(new Set());
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const nameSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const base = apiUrl.replace(/\/$/, "");
  const headers = useCallback((): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [wfRes, stepsRes] = await Promise.all([
          fetch(`${base}/api/workflows/${encodeURIComponent(workflowId)}`, { headers: headers() }),
          fetch(`${base}/api/workflows/${encodeURIComponent(workflowId)}/steps`, { headers: headers() }),
        ]);
        if (cancelled) return;
        if (!wfRes.ok) throw new Error(`Workflow: ${wfRes.status}`);
        if (!stepsRes.ok) throw new Error(`Steps: ${stepsRes.status}`);
        const wfData = await wfRes.json();
        const stepsData = await stepsRes.json();
        const wf = { id: workflowId, ...wfData };
        setWorkflow(wf);
        setWorkflowName(wf.name || "");
        const list = (Array.isArray(stepsData) ? stepsData : stepsData.steps ?? []) as StepData[];
        setSteps(list.sort((a, b) => a.order - b.order));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (nameSaveRef.current) clearTimeout(nameSaveRef.current);
    };
  }, [workflowId, base, headers]);

  const handleNameChange = (name: string) => {
    setWorkflowName(name);
    if (nameSaveRef.current) clearTimeout(nameSaveRef.current);
    nameSaveRef.current = setTimeout(async () => {
      try {
        await fetch(`${base}/api/workflows/${encodeURIComponent(workflowId)}`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ name }),
        });
      } catch {
        // Non-fatal
      }
    }, 500);
  };

  const handleStepUpdate = (stepId: string, data: Partial<StepData>) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...data } : s)));
    setDirtyStepIds((prev) => {
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      const res = await fetch(
        `${base}/api/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(stepId)}`,
        { method: "DELETE", headers: headers() },
      );
      if (!res.ok) throw new Error("Failed to delete step");
      setSteps((prev) => prev.filter((s) => s.id !== stepId));
      setDirtyStepIds((prev) => {
        const next = new Set(prev);
        next.delete(stepId);
        return next;
      });
    } catch {
      setError("Failed to delete step");
    }
  };

  const handleAddStep = async (action: AnyAction) => {
    setAddMenuOpen(false);
    try {
      const res = await fetch(
        `${base}/api/workflows/${encodeURIComponent(workflowId)}/steps`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ action, context: "", params: {}, expected_outcome: "" }),
        },
      );
      if (!res.ok) throw new Error("Failed to add step");
      const newStep = await res.json();
      setSteps((prev) => [...prev, { ...newStep, order: newStep.order ?? prev.length }]);
    } catch {
      setError("Failed to add step");
    }
  };

  const handleMoveStep = async (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const reordered = [...steps];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setSteps(reordered);
    try {
      await fetch(
        `${base}/api/workflows/${encodeURIComponent(workflowId)}/steps/reorder`,
        {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ step_ids: reordered.map((s) => s.id) }),
        },
      );
    } catch {
      // Revert on failure
      setSteps(steps);
      setError("Failed to reorder steps");
    }
  };

  const handleSave = async () => {
    // Validate: all steps need context
    const emptyContext = steps.filter((s) => !s.context?.trim());
    if (emptyContext.length > 0) {
      setError(`${emptyContext.length} step(s) missing context. Fill in all step descriptions before saving.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      // Save dirty steps in parallel
      const dirtySteps = steps.filter((s) => dirtyStepIds.has(s.id));
      await Promise.all(
        dirtySteps.map((s) =>
          fetch(
            `${base}/api/workflows/${encodeURIComponent(workflowId)}/steps/${encodeURIComponent(s.id)}`,
            {
              method: "PUT",
              headers: headers(),
              body: JSON.stringify({
                action: s.action,
                context: s.context,
                params: s.params,
                expected_outcome: s.expected_outcome ?? "",
              }),
            },
          ),
        ),
      );
      // Activate workflow
      await fetch(`${base}/api/workflows/${encodeURIComponent(workflowId)}`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify({ status: "active", name: workflowName || undefined }),
      });
      setDirtyStepIds(new Set());
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{ background: "none", border: "none", color: "#A577FF", display: "flex", alignItems: "center", gap: 6, fontSize: 14, marginBottom: 16, padding: 0 }}
        >
          <IconArrowLeft size={18} /> Back
        </button>
        <p style={{ color: "var(--echo-text-secondary)", fontSize: 14 }}>Loading workflow editor…</p>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{ background: "none", border: "none", color: "#A577FF", display: "flex", alignItems: "center", gap: 6, fontSize: 14, marginBottom: 16, padding: 0 }}
        >
          <IconArrowLeft size={18} /> Back
        </button>
        <p style={{ color: "#ef4444", fontSize: 14 }}>{error || "Workflow not found"}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <button
            type="button"
            onClick={onBack}
            style={{ background: "none", border: "none", color: "var(--echo-text)", opacity: 0.7, display: "flex", alignItems: "center", padding: 4, flexShrink: 0 }}
          >
            <IconArrowLeft size={20} />
          </button>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Untitled workflow"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "var(--echo-text)",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: "4px 8px",
              borderRadius: 6,
            }}
          />
        </div>
        <button
          type="button"
          className="echo-btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
        >
          <IconCheck size={18} />
          {saving ? "Saving…" : "Save & Activate"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            style={{ float: "right", background: "none", border: "none", color: "#ef4444", fontWeight: 600, fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Steps section */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--echo-text)", margin: 0 }}>
          Steps ({steps.length})
        </h3>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            className="echo-btn-secondary"
            onClick={() => setAddMenuOpen((o) => !o)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <IconPlus size={16} />
            Add Step
          </button>
          {addMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                background: "var(--echo-surface-solid)",
                borderRadius: 8,
                border: "1px solid rgba(165,119,255,0.3)",
                boxShadow: "var(--echo-card-shadow)",
                maxHeight: 280,
                overflowY: "auto",
                zIndex: 10,
                minWidth: 180,
              }}
            >
              {ALL_ACTIONS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => handleAddStep(a)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 14px",
                    background: "none",
                    border: "none",
                    fontSize: 13,
                    fontFamily: "monospace",
                    color: "var(--echo-text)",
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = "rgba(165,119,255,0.08)"; }}
                  onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = "none"; }}
                >
                  {a === "api_call" ? "⚡ api_call (Integration)" : a}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Click-away to close add menu */}
      {addMenuOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 5 }}
          onClick={() => setAddMenuOpen(false)}
        />
      )}

      {steps.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            borderRadius: 8,
            border: "2px dashed rgba(165,119,255,0.3)",
            color: "var(--echo-text-secondary)",
            fontSize: 14,
          }}
        >
          No steps yet. Click <span style={{ fontWeight: 600, color: "#A577FF" }}>Add Step</span> to create one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 40 }}>
          {steps.map((step, i) => (
            <StepCard
              key={step.id}
              step={step}
              index={i}
              total={steps.length}
              onUpdate={(data) => handleStepUpdate(step.id, data)}
              onDelete={() => handleDeleteStep(step.id)}
              onMoveUp={() => handleMoveStep(i, "up")}
              onMoveDown={() => handleMoveStep(i, "down")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
