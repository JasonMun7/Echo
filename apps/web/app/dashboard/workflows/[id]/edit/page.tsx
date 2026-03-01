"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconGripVertical,
  IconPlus,
  IconTrash,
  IconCheck,
  IconArrowLeft,
  IconBinaryTree2,
  IconList,
  IconDeviceLaptop,
  IconBrandChrome,
} from "@tabler/icons-react";
import { WorkflowStepGraph } from "@/components/workflow-step-graph";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
        <input
          type="text"
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="blue 'Submit' button in the bottom-center of the form"
          className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-[#150A35]/70">
              X <span className="text-[#150A35]/40">(0–1000)</span>
            </label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.x as number) ?? ""}
              onChange={(e) =>
                update("x", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              placeholder="500"
              className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-[#150A35]/70">
              Y <span className="text-[#150A35]/40">(0–1000)</span>
            </label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.y as number) ?? ""}
              onChange={(e) =>
                update("y", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              placeholder="500"
              className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
            />
          </div>
        </div>
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
          <span className="ml-1 text-[#150A35]/40">
            (describe what to wait for visually)
          </span>
        </label>
        <input
          type="text"
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="loading spinner disappears and dashboard is visible"
          className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
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
            onChange={(e) =>
              update("amount", parseInt(e.target.value, 10) || 0)
            }
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
        <input
          type="text"
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="country dropdown in the billing section"
          className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-[#150A35]/70">
              X <span className="text-[#150A35]/40">(0–1000)</span>
            </label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.x as number) ?? ""}
              onChange={(e) =>
                update("x", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              placeholder="500"
              className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-[#150A35]/70">
              Y <span className="text-[#150A35]/40">(0–1000)</span>
            </label>
            <input
              type="number"
              min={0}
              max={1000}
              value={(params.y as number) ?? ""}
              onChange={(e) =>
                update("y", e.target.value === "" ? undefined : Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)))
              }
              placeholder="500"
              className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
            />
          </div>
        </div>
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
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[#150A35]/70">Integration</label>
          <select
            value={(params.integration as string) || ""}
            onChange={(e) => update("integration", e.target.value)}
            className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm"
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
          <label className="block text-xs text-[#150A35]/70">Method</label>
          <input
            type="text"
            value={(params.method as string) || ""}
            onChange={(e) => update("method", e.target.value)}
            placeholder="e.g. send_message, list_channels"
            className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-[#150A35]/70">
            Args <span className="text-[#150A35]/40">(JSON object)</span>
          </label>
          <textarea
            value={typeof params.args === "object" ? JSON.stringify(params.args, null, 2) : ((params.args as string) || "")}
            onChange={(e) => {
              try { update("args", JSON.parse(e.target.value)); } catch { update("args", e.target.value); }
            }}
            placeholder='{"channel": "general", "text": "Hello!"}'
            rows={3}
            className="w-full rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 font-mono text-xs"
          />
        </div>
      </div>
    );
  }
  return null;
}

function StepCard({
  step,
  availableActions,
  isNew,
  isInvalid,
  isDirty,
  onUpdate,
  onDelete,
  onContextFilled,
  onInvalidCleared,
}: {
  step: Step;
  availableActions: readonly AnyAction[];
  isNew: boolean;
  isInvalid: boolean;
  isDirty: boolean;
  onUpdate: (s: Partial<Step>) => void;
  onDelete: () => void;
  onContextFilled: () => void;
  onInvalidCleared: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
  };

  const needsContext = isNew && !step.context;
  // Priority: invalid (red) > dirty (purple) > new (purple)
  const ringClass = isInvalid
    ? "ring-2 ring-echo-error ring-offset-2"
    : isDirty || needsContext
      ? "ring-2 ring-[#A577FF] ring-offset-2"
      : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "echo-card flex items-start gap-3 bg-white p-4 transition-all duration-300",
        isDragging ? "opacity-60" : "",
        ringClass,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="mt-1 cursor-grab touch-none text-[#150A35]/50 hover:text-[#A577FF]"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1 space-y-3">
        {isInvalid && (
          <p className="text-xs font-medium text-echo-error">
            Context is required before saving
          </p>
        )}
        {!isInvalid && isDirty && (
          <p className="text-xs font-medium text-[#A577FF]">Unsaved changes</p>
        )}
        {!isInvalid && !isDirty && needsContext && (
          <p className="text-xs font-medium text-[#A577FF]">
            Fill in the context below to complete this step
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <select
            value={step.action}
            onChange={(e) => onUpdate({ action: e.target.value })}
            className="rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm text-[#150A35]"
          >
            {availableActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#150A35]/70">Context</label>
          <textarea
            value={step.context}
            onChange={(e) => {
              onUpdate({ context: e.target.value });
              if (e.target.value) {
                onContextFilled();
                if (isInvalid) onInvalidCleared();
              }
            }}
            placeholder="Description of this step"
            rows={2}
            className={[
              "mt-1 w-full rounded border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2",
              isInvalid
                ? "border-echo-error/60 focus:ring-echo-error/40"
                : "border-[#A577FF]/40 focus:ring-[#A577FF]/40",
            ].join(" ")}
          />
        </div>
        <ParamFields
          action={step.action}
          params={step.params}
          onChange={(p) => onUpdate({ params: p })}
        />
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="mt-1 text-echo-text-muted transition-colors hover:text-echo-error"
      >
        <IconTrash className="h-5 w-5" />
      </button>
    </div>
  );
}

export default function WorkflowEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [saving, setSaving] = useState(false);
  const [newStepId, setNewStepId] = useState<string | null>(null);
  const [invalidStepIds, setInvalidStepIds] = useState<Set<string>>(new Set());
  const [dirtyStepIds, setDirtyStepIds] = useState<Set<string>>(new Set());
  const isReorderingRef = useRef(false);
  const nameSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newStepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the step count before an add so we can detect the new one from snapshot
  const stepCountBeforeAddRef = useRef<number>(0);

  const availableActions: readonly AnyAction[] =
    workflow?.workflow_type === "desktop" ? DESKTOP_ACTIONS : BROWSER_ACTIONS;

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
      if (isReorderingRef.current) return;
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Step)
        .sort((a, b) => a.order - b.order);

      // If we just added a step, pick out the new one by it being the last
      setSteps((prev) => {
        if (
          list.length > stepCountBeforeAddRef.current &&
          stepCountBeforeAddRef.current > 0
        ) {
          // Find the step that didn't exist before
          const prevIds = new Set(prev.map((s) => s.id));
          const newStep = list.find((s) => !prevIds.has(s.id));
          if (newStep) {
            setNewStepId(newStep.id);
            // Auto-clear highlight after 10s
            if (newStepTimeoutRef.current)
              clearTimeout(newStepTimeoutRef.current);
            newStepTimeoutRef.current = setTimeout(
              () => setNewStepId(null),
              10_000,
            );
          }
          stepCountBeforeAddRef.current = 0;
        }
        return list;
      });
      setLoading(false);
    });
    return () => {
      unsubWf();
      unsubSteps();
      if (nameSaveRef.current) clearTimeout(nameSaveRef.current);
      if (newStepTimeoutRef.current) clearTimeout(newStepTimeoutRef.current);
    };
  }, [id, router]);

  const handleNameChange = (name: string) => {
    setWorkflowName(name);
    if (nameSaveRef.current) clearTimeout(nameSaveRef.current);
    nameSaveRef.current = setTimeout(async () => {
      try {
        await apiFetch(`/api/workflows/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      } catch (e) {
        toast.error("Failed to save workflow name");
        console.error("Failed to save workflow name:", e);
      }
    }, 500);
  };

  const handleStepUpdate = (stepId: string, data: Partial<Step>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, ...data } : s)),
    );
    setDirtyStepIds((prev) => {
      const next = new Set(prev);
      next.add(stepId);
      return next;
    });
  };

  const handleDeleteStep = async (stepId: string) => {
    if (newStepId === stepId) setNewStepId(null);
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
    stepCountBeforeAddRef.current = steps.length;
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
      stepCountBeforeAddRef.current = 0;
      toast.error("Failed to add step");
      console.error("Failed to add step:", e);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex((s) => s.id === active.id);
    const newIdx = steps.findIndex((s) => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(steps, oldIdx, newIdx);
    isReorderingRef.current = true;
    setSteps(reordered);
    apiFetch(`/api/workflows/${id}/steps/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step_ids: reordered.map((s) => s.id),
        }),
    })
      .catch((e) => { toast.error("Failed to reorder steps"); console.error("Failed to reorder:", e); })
      .finally(() => {
        isReorderingRef.current = false;
      });
  };

  const handleSave = async () => {
    const emptyContextIds = new Set(
      steps.filter((s) => !s.context?.trim()).map((s) => s.id),
    );
    if (emptyContextIds.size > 0) {
      setInvalidStepIds(emptyContextIds);
      return;
    }
    setSaving(true);
    try {
      // Flush all locally-edited steps to the backend in parallel
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 1 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (loading || !workflow) {
    return (
      <div className="flex flex-1">
        <div className="flex w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
          {/* Header row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-7 w-64 rounded-lg" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
          </div>
          {/* View toggle */}
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-lg" />
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
    <div className="flex flex-1">
      <div className="flex h-full w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link
              href="/dashboard/workflows"
              className="shrink-0 cursor-pointer text-[#150A35]/70 hover:text-[#A577FF]"
            >
              <IconArrowLeft className="h-5 w-5" />
            </Link>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Untitled workflow"
              className="min-w-0 flex-1 truncate rounded-md bg-transparent px-2 py-1 text-2xl font-semibold text-[#150A35] outline-none ring-0 transition-all hover:bg-[#A577FF]/5 focus:bg-[#A577FF]/5 focus:ring-2 focus:ring-[#A577FF]/40"
            />
            {/* Workflow type pill */}
            {workflow.workflow_type && (
              <Badge
                className={[
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  workflow.workflow_type === "desktop"
                    ? "bg-[#A577FF]/15 text-[#A577FF] hover:bg-[#A577FF]/20"
                    : "bg-echo-success/15 text-echo-success hover:bg-echo-success/20",
                ].join(" ")}
                variant="outline"
              >
                {workflow.workflow_type === "desktop" ? (
                  <IconDeviceLaptop className="h-3 w-3" />
                ) : (
                  <IconBrandChrome className="h-3 w-3" />
                )}
                {workflow.workflow_type === "desktop" ? "Desktop" : "Browser"}
              </Badge>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="echo-btn-primary flex shrink-0 items-center gap-2 disabled:opacity-50"
          >
            <IconCheck className="h-5 w-5" />
            {saving ? "Saving..." : "Save & Activate"}
          </button>
        </div>

        {/* Steps section */}
        <div className="flex flex-1 flex-col gap-3 overflow-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-[#150A35]">Steps</h2>
            <div className="flex items-center gap-2">
              {/* List / Graph toggle */}
              <div className="flex rounded-lg border border-[#A577FF]/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`rounded px-2 py-1 text-sm ${
                    viewMode === "list"
                      ? "bg-[#A577FF]/20 text-[#A577FF]"
                      : "text-[#150A35]/70"
                  }`}
                >
                  <IconList className="inline h-4 w-4" /> List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("graph")}
                  className={`rounded px-2 py-1 text-sm ${
                    viewMode === "graph"
                      ? "bg-[#A577FF]/20 text-[#A577FF]"
                      : "text-[#150A35]/70"
                  }`}
                >
                  <IconBinaryTree2 className="inline h-4 w-4" /> Graph
                </button>
              </div>

              {/* Add Step → action picker dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="echo-btn-secondary flex items-center gap-2"
            >
              <IconPlus className="h-5 w-5" />
              Add Step
            </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-h-72 overflow-y-auto"
                >
                  {availableActions.map((a) => (
                    <DropdownMenuItem
                      key={a}
                      onSelect={() => handleAddStep(a)}
                      className="cursor-pointer font-mono text-sm"
                    >
                      {a === "api_call" ? "⚡ api_call (App Integration)" : a}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Graph view */}
          {viewMode === "graph" && (
            <div className="flex flex-1 flex-col">
              <WorkflowStepGraph steps={steps} />
            </div>
          )}

          {/* List view */}
          {viewMode === "list" && (
            <div className="mx-2 mb-10">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
                  <div className="flex flex-col gap-3 bg-white">
                {steps.map((step) => (
                  <StepCard
                    key={step.id}
                    step={step}
                        availableActions={availableActions}
                        isNew={newStepId === step.id}
                        isInvalid={invalidStepIds.has(step.id)}
                        isDirty={dirtyStepIds.has(step.id)}
                    onUpdate={(d) => handleStepUpdate(step.id, d)}
                    onDelete={() => handleDeleteStep(step.id)}
                        onContextFilled={() => setNewStepId(null)}
                        onInvalidCleared={() =>
                          setInvalidStepIds((prev) => {
                            const next = new Set(prev);
                            next.delete(step.id);
                            return next;
                          })
                        }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
            </div>
          )}

          {steps.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#A577FF]/40 p-8 text-center text-[#150A35]/60">
              No steps yet. Click{" "}
              <span className="font-medium text-[#A577FF]">Add Step</span> to
              create one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
