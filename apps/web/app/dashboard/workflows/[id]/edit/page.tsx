"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { IconPlus, IconTrash, IconCheck, IconArrowLeft, IconX } from "@tabler/icons-react";
import { WorkflowStepGraph } from "@/components/workflow-step-graph";
import { WorkflowApiCallFields } from "@/components/workflow-api-call-fields";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

function formatAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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

type BrowserAction = (typeof BROWSER_ACTIONS)[number];
type DesktopAction = (typeof DESKTOP_ACTIONS)[number];
type AnyAction = BrowserAction | DesktopAction;

interface Step {
  id: string;
  order: number;
  action: string;
  context: string;
  params: Record<string, unknown>;
  expected_outcome?: string;
}

interface Workflow {
  id: string;
  status: string;
  name?: string;
  workflow_type?: "browser" | "desktop";
  source_recording_id?: string;
}

function ParamFields({
  action,
  params,
  onChange,
}: {
  action: string;
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const update = (k: string, v: unknown) => {
    onChange({ ...params, [k]: v });
  };
  if (action === "navigate") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-[#150A35]/70">URL</label>
        <input
          type="text"
          value={(params.url as string) || ""}
          onChange={(e) => update("url", e.target.value)}
          placeholder="https://..."
          className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
        />
      </div>
    );
  }
  if (action === "click_at" || action === "type_text_at") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-[#150A35]/70">
          Description
          <span className="ml-1 text-[#150A35]/40">
            (e.g. blue &apos;Submit&apos; button in the bottom-center of the form)
          </span>
        </label>
        <textarea
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="blue 'Submit' button in the bottom-center of the form"
          rows={2}
          className="w-full min-w-0 resize-y rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40 break-words"
        />
        {action === "type_text_at" && (
          <>
            <label className="block text-xs text-[#150A35]/70">Text</label>
            <input
              type="text"
              value={(params.text as string) || ""}
              onChange={(e) => update("text", e.target.value)}
              placeholder="{{variable}}"
              className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
            />
          </>
        )}
      </div>
    );
  }
  if (action === "wait_for_element") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-[#150A35]/70">
          Element Description
          <span className="ml-1 text-[#150A35]/40">(describe what to wait for visually)</span>
        </label>
        <textarea
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="loading spinner disappears and dashboard is visible"
          rows={2}
          className="w-full min-w-0 resize-y rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40 break-words"
        />
      </div>
    );
  }
  if (action === "scroll") {
    return (
      <div className="flex gap-4">
        <div>
          <label className="block text-xs text-[#150A35]/70">Direction</label>
          <select
            value={(params.direction as string) || "down"}
            onChange={(e) => update("direction", e.target.value)}
            className="rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm text-[#150A35]"
          >
            <option value="down">down</option>
            <option value="up">up</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#150A35]/70">Amount</label>
          <input
            type="number"
            value={(params.amount as number) ?? 500}
            onChange={(e) => update("amount", parseInt(e.target.value, 10) || 0)}
            className="w-24 rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm"
          />
        </div>
      </div>
    );
  }
  if (action === "wait") {
    return (
      <div>
        <label className="block text-xs text-[#150A35]/70">Seconds</label>
        <input
          type="number"
          value={(params.seconds as number) ?? 2}
          onChange={(e) => update("seconds", parseInt(e.target.value, 10) || 0)}
          className="w-24 rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm"
        />
      </div>
    );
  }
  if (action === "select_option") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-[#150A35]/70">
          Description
          <span className="ml-1 text-[#150A35]/40">
            (e.g. country dropdown in the billing section)
          </span>
        </label>
        <textarea
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="country dropdown in the billing section"
          rows={2}
          className="w-full min-w-0 resize-y rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40 break-words"
        />
        <label className="block text-xs text-[#150A35]/70">Value</label>
        <input
          type="text"
          value={(params.value as string) || ""}
          onChange={(e) => update("value", e.target.value)}
          placeholder="US"
          className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
        />
      </div>
    );
  }
  if (action === "press_key" || action === "hotkey") {
    return (
      <div>
        <label className="block text-xs text-[#150A35]/70">Key</label>
        <input
          type="text"
          value={(params.key as string) || ""}
          onChange={(e) => update("key", e.target.value)}
          placeholder={action === "hotkey" ? "ctrl+c" : "Enter"}
          className="w-32 rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm"
        />
      </div>
    );
  }
  if (action === "open_app" || action === "focus_app") {
    return (
      <div>
        <label className="block text-xs text-[#150A35]/70">App Name</label>
        <input
          type="text"
          value={(params.app as string) || ""}
          onChange={(e) => update("app", e.target.value)}
          placeholder="Google Chrome"
          className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm"
        />
      </div>
    );
  }
  if (action === "api_call") {
    return <WorkflowApiCallFields params={params} onChange={onChange} />;
  }
  return null;
}

export default function WorkflowEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [invalidStepIds, setInvalidStepIds] = useState<Set<string>>(new Set());
  const [dirtyStepIds, setDirtyStepIds] = useState<Set<string>>(new Set());

  const availableActions: readonly AnyAction[] = [
    ...new Set([...BROWSER_ACTIONS, ...DESKTOP_ACTIONS]),
  ] as AnyAction[];

  useEffect(() => {
    if (!db || !auth?.currentUser) return;
    const wfRef = doc(db, "workflows", id);
    const unsubWf = onSnapshot(wfRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d?.owner_uid !== auth?.currentUser?.uid) {
          router.replace("/dashboard/workflows");
          return;
        }
        const wf = { id: snap.id, ...d } as Workflow;
        setWorkflow(wf);
        setWorkflowName((prev) => prev || wf.name || "");
      } else {
        setWorkflow(null);
      }
    });
    const stepsRef = collection(db, "workflows", id, "steps");
    const q = query(stepsRef, orderBy("order"));
    const unsubSteps = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Step)
        .sort((a, b) => a.order - b.order);
      setSteps(list);
      setLoading(false);
    });
    return () => {
      unsubWf();
      unsubSteps();
    };
  }, [id, router]);

  const handleStepUpdate = (stepId: string, data: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === stepId ? { ...s, ...data } : s)));
    setDirtyStepIds((prev) => {
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
  };

  const handleDeleteStep = async (stepId: string) => {
    if (selectedStepId === stepId) setSelectedStepId(null);
    try {
      await apiFetch(`/api/workflows/${id}/steps/${stepId}`, {
        method: "DELETE",
      });
    } catch (e) {
      toast.error("Failed to delete step");
      console.error("Failed to delete step:", e);
    }
  };

  const handleAddStep = async (action: AnyAction) => {
    try {
      await apiFetch(`/api/workflows/${id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          context: "",
          params: {},
          expected_outcome: "",
        }),
      });
    } catch (e) {
      toast.error("Failed to add step");
      console.error("Failed to add step:", e);
    }
  };

  const handleSave = async () => {
    const emptyContextIds = new Set(steps.filter((s) => !s.context?.trim()).map((s) => s.id));
    if (emptyContextIds.size > 0) {
      setInvalidStepIds(emptyContextIds);
      return;
    }
    setSaving(true);
    try {
      const dirtySteps = steps.filter((s) => dirtyStepIds.has(s.id));
      await Promise.all(
        dirtySteps.map((s) =>
          apiFetch(`/api/workflows/${id}/steps/${s.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: s.action,
              context: s.context,
              params: s.params,
              expected_outcome: s.expected_outcome ?? "",
            }),
          }),
        ),
      );
      await apiFetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "active",
          name: workflowName || undefined,
        }),
      });
      setDirtyStepIds(new Set());
      router.push(`/dashboard/workflows/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save workflow");
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !workflow) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 md:p-10">
          {/* Header row: Back icon + Save button */}
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          {/* Steps row + Add Step */}
          <div className="flex justify-between gap-4">
            <Skeleton className="h-7 w-24 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
          {/* Graph area */}
          <Skeleton className="h-[400px] w-full rounded-xl" />
          {/* Step detail panel */}
          <div className="flex flex-col gap-3 rounded-xl border border-[#A577FF]/20 p-4">
            <Skeleton className="h-5 w-32 rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 md:p-10">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/dashboard/workflows"
            className="echo-btn-secondary-accent flex shrink-0 items-center justify-center rounded-lg p-1.5"
            aria-label="Back"
          >
            <IconArrowLeft className="h-5 w-5 text-[#21C4DD]" />
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="echo-btn-cyan-lavender flex shrink-0 items-center gap-2 disabled:opacity-50"
          >
            <IconCheck className="h-5 w-5 shrink-0 text-white" />
            {saving ? "Saving..." : "Save & Activate"}
          </button>
        </div>

        {workflow.source_recording_id && (
          <p
            className="text-sm text-[#150A35]/60"
            title="Recording used to create this workflow — correlate with logs"
          >
            Source:{" "}
            <code className="rounded bg-[#150A35]/5 px-1.5 py-0.5 font-mono text-xs">
              {workflow.source_recording_id}
            </code>
          </p>
        )}

        {/* Steps section */}
        <div className="flex flex-1 flex-col gap-3 overflow-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-[#150A35]">Steps</h2>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="echo-btn-secondary-accent flex items-center gap-2"
                  >
                    <IconPlus className="h-5 w-5 shrink-0 text-[#21C4DD]" />
                    Add Step
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                  {availableActions.map((a) => (
                    <DropdownMenuItem
                      key={a}
                      onSelect={() => handleAddStep(a)}
                      className="echo-dropdown-item cursor-pointer text-sm"
                    >
                      {a === "api_call"
                        ? `⚡ ${formatAction(a)} (App Integration)`
                        : formatAction(a)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-4">
            <WorkflowStepGraph steps={steps} onNodeSelect={setSelectedStepId} />
            {selectedStepId &&
              (() => {
                const step = steps.find((s) => s.id === selectedStepId);
                if (!step) return null;
                const stepIndex = steps.findIndex((s) => s.id === selectedStepId);
                return (
                  <div className="rounded-xl border border-[#A577FF]/40 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[#150A35]">
                        Step {stepIndex + 1} — Edit
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSelectedStepId(null)}
                        className="rounded p-1 text-[#150A35]/40 hover:text-[#150A35]"
                        aria-label="Close step editor"
                      >
                        <IconX className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    {dirtyStepIds.has(step.id) && (
                      <p className="text-xs font-medium text-[#A577FF]">Unsaved changes</p>
                    )}
                    {invalidStepIds.has(step.id) && (
                      <p className="text-xs font-medium text-echo-error">
                        Context is required before saving
                      </p>
                    )}
                    <div>
                      <label className="block text-xs text-[#150A35]/70">Action</label>
                      <select
                        value={step.action}
                        onChange={(e) => handleStepUpdate(step.id, { action: e.target.value })}
                        className="mt-1 rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm text-[#150A35]"
                      >
                        {availableActions.map((a) => (
                          <option key={a} value={a}>
                            {formatAction(a)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#150A35]/70">Context</label>
                      <textarea
                        value={step.context}
                        onChange={(e) => {
                          handleStepUpdate(step.id, { context: e.target.value });
                          if (e.target.value.trim()) {
                            setInvalidStepIds((prev) => {
                              const next = new Set(prev);
                              next.delete(step.id);
                              return next;
                            });
                          }
                        }}
                        placeholder="Description of this step"
                        rows={2}
                        className="mt-1 w-full resize-y rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
                      />
                    </div>
                    <ParamFields
                      action={step.action}
                      params={step.params}
                      onChange={(p) => handleStepUpdate(step.id, { params: p })}
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteStep(step.id)}
                      className="flex items-center gap-1.5 text-xs text-echo-text-muted hover:text-echo-error"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                      Delete step
                    </button>
                  </div>
                );
              })()}
          </div>

          {steps.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#A577FF]/40 p-8 text-center text-[#150A35]/60">
              No steps yet. Click <span className="font-medium text-[#A577FF]">Add Step</span> to
              create one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
