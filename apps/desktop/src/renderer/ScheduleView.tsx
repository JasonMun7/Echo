import { useState, useEffect, useCallback } from "react";
import {
  IconArrowLeft,
  IconPlus,
  IconTrash,
  IconCalendarClock,
  IconClock,
} from "@tabler/icons-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* ── Types ───────────────────────────────────────────────────────────────── */

interface WorkflowInfo {
  id: string;
  name?: string;
  status?: string;
  schedule?: { cron?: string; timezone?: string };
}

interface ScheduleEntry {
  workflowId: string;
  workflowName: string;
  cron: string;
  timezone: string;
}

interface Props {
  token: string;
  apiUrl: string;
  onBack: () => void;
}

/* ── Cron presets ────────────────────────────────────────────────────────── */

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every Monday at 8am", value: "0 8 * * 1" },
  { label: "Every weekday at 9am", value: "0 9 * * 1-5" },
  { label: "Every Sunday at midnight", value: "0 0 * * 0" },
  { label: "Custom", value: "__custom__" },
];

const TIMEZONES = [
  { label: "UTC", value: "UTC" },
  { label: "Eastern (ET)", value: "America/New_York" },
  { label: "Pacific (PT)", value: "America/Los_Angeles" },
  { label: "Central (CT)", value: "America/Chicago" },
  { label: "London (GMT)", value: "Europe/London" },
  { label: "Tokyo (JST)", value: "Asia/Tokyo" },
];

function parseCronHuman(cron: string): string {
  const match = CRON_PRESETS.find((p) => p.value === cron);
  if (match) return match.label;
  return cron;
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function ScheduleView({ token, apiUrl, onBack }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [cronPreset, setCronPreset] = useState(CRON_PRESETS[0].value);
  const [customCron, setCustomCron] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);

  const base = apiUrl.replace(/\/$/, "");

  const headers = useCallback((): Record<string, string> => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }), [token]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${base}/api/workflows`, { headers: headers() });
      if (!res.ok) throw new Error(`Failed to load workflows: ${res.status}`);
      const data = await res.json();
      const wfList: WorkflowInfo[] = (data.workflows ?? []).map((w: Record<string, unknown>) => ({
        id: w.id as string,
        name: (w.name as string) || "Untitled",
        status: w.status as string,
        schedule: w.schedule as WorkflowInfo["schedule"],
      }));
      setWorkflows(wfList);

      // Extract schedules from workflows that have the schedule field
      const sched: ScheduleEntry[] = wfList
        .filter((w) => w.schedule?.cron)
        .map((w) => ({
          workflowId: w.id,
          workflowName: w.name || "Untitled",
          cron: w.schedule!.cron!,
          timezone: w.schedule!.timezone || "UTC",
        }));
      setSchedules(sched);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [base, headers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeWorkflows = workflows.filter(
    (w) => (w.status === "active" || w.status === "ready") && !schedules.some((s) => s.workflowId === w.id),
  );

  const handleCreate = async () => {
    const cron = cronPreset === "__custom__" ? customCron : cronPreset;
    if (!selectedWorkflow || !cron) {
      setError("Please select a workflow and schedule");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${base}/api/schedule/${encodeURIComponent(selectedWorkflow)}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ cron, timezone }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (text.includes("not set") || text.includes("not available")) {
          // Cloud Scheduler not configured — still saved locally
        } else {
          throw new Error(text);
        }
      }
      setShowCreate(false);
      setSelectedWorkflow("");
      setCronPreset(CRON_PRESETS[0].value);
      setCustomCron("");
      setTimezone("UTC");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (workflowId: string) => {
    try {
      const res = await fetch(`${base}/api/schedule/${encodeURIComponent(workflowId)}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) throw new Error("Failed to remove schedule");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove schedule");
    }
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: 6,
    border: "1px solid var(--echo-input-border)",
    background: "var(--echo-input-bg)",
    padding: "8px 10px",
    fontSize: 13,
    color: "var(--echo-text)",
    outline: "none",
  };

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
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={onBack}
            style={{ background: "none", border: "none", color: "var(--echo-text)", opacity: 0.7, display: "flex", alignItems: "center", padding: 4 }}
          >
            <IconArrowLeft size={20} />
          </button>
          <div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--echo-text)", margin: 0 }}>
              Scheduled Runs
            </h2>
            <p style={{ fontSize: 13, color: "var(--echo-text-secondary)", margin: 0 }}>
              Automatically run workflows on a schedule.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="echo-btn-primary"
          onClick={() => setShowCreate((o) => !o)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <IconPlus size={16} />
          New Schedule
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

      {/* Create form */}
      {showCreate && (
        <section className="echo-card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--echo-text)", marginTop: 0, marginBottom: 16 }}>
            Create Schedule
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Workflow picker */}
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--echo-text-secondary)", marginBottom: 4 }}>Workflow</label>
              <select value={selectedWorkflow} onChange={(e) => setSelectedWorkflow(e.target.value)} style={selectStyle}>
                <option value="">Select a workflow…</option>
                {activeWorkflows.map((w) => (
                  <option key={w.id} value={w.id}>{w.name || w.id}</option>
                ))}
              </select>
              {activeWorkflows.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--echo-text-secondary)", marginTop: 4 }}>
                  No active workflows available. Activate a workflow first.
                </p>
              )}
            </div>

            {/* Frequency */}
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--echo-text-secondary)", marginBottom: 4 }}>Frequency</label>
              <select value={cronPreset} onChange={(e) => setCronPreset(e.target.value)} style={selectStyle}>
                {CRON_PRESETS.map((p) => (
                  <option key={p.label} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Custom cron */}
            {cronPreset === "__custom__" && (
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--echo-text-secondary)", marginBottom: 4 }}>Custom Cron Expression</label>
                <input
                  type="text"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  placeholder="0 9 * * 1-5"
                  style={{ ...selectStyle, fontFamily: "monospace" }}
                />
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                  Format: minute hour day month weekday
                </p>
              </div>
            )}

            {/* Timezone */}
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--echo-text-secondary)", marginBottom: 4 }}>Timezone</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} style={selectStyle}>
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="echo-btn-secondary"
                onClick={() => setShowCreate(false)}
                style={{ fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="echo-btn-primary"
                onClick={handleCreate}
                disabled={!selectedWorkflow || (!cronPreset || (cronPreset === "__custom__" && !customCron)) || saving}
                style={{ fontSize: 13 }}
              >
                {saving ? "Saving…" : "Create Schedule"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Schedules list */}
      {loading ? (
        <p style={{ color: "var(--echo-text-secondary)", fontSize: 14 }}>Loading schedules…</p>
      ) : schedules.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "48px 24px",
            color: "#9ca3af",
            textAlign: "center",
          }}
        >
          <IconCalendarClock size={48} style={{ opacity: 0.3 }} />
          <div>
            <p style={{ fontWeight: 500, color: "var(--echo-text)", margin: 0, marginBottom: 4 }}>No schedules yet</p>
            <p style={{ fontSize: 13, margin: 0 }}>Create a schedule to automatically run workflows.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {schedules.map((sched) => (
            <div
              key={sched.workflowId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 16,
                borderRadius: 12,
                border: "1px solid rgba(165,119,255,0.2)",
                background: "rgba(245,243,255,0.3)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "rgba(165,119,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#A577FF",
                    flexShrink: 0,
                  }}
                >
                  <IconClock size={20} />
                </div>
                <div>
                  <p style={{ fontWeight: 500, color: "var(--echo-text)", margin: 0, fontSize: 14 }}>
                    {sched.workflowName}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        padding: "2px 8px",
                        borderRadius: 4,
                        border: "1px solid rgba(165,119,255,0.3)",
                        color: "#A577FF",
                      }}
                    >
                      {sched.cron}
                    </span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{parseCronHuman(sched.cron)}</span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>·</span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{sched.timezone}</span>
                  </div>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleDelete(sched.workflowId)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      padding: 6,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <IconTrash size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Remove schedule</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
