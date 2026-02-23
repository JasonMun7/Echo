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
} from "@tabler/icons-react";

const ACTIONS = [
  "open_web_browser",
  "close_web_browser",
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
] as const;

interface Step {
  id: string;
  order: number;
  action: string;
  context: string;
  params: Record<string, unknown>;
  risk: string;
}

interface Workflow {
  id: string;
  status: string;
  name?: string;
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
          className="w-full rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
        />
      </div>
    );
  }
  if (action === "click_at" || action === "type_text_at" || action === "wait_for_element") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-[#150A35]/70">Selector</label>
        <input
          type="text"
          value={(params.selector as string) || ""}
          onChange={(e) => update("selector", e.target.value)}
          placeholder="button#submit"
          className="w-full rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
        />
        {action === "type_text_at" && (
          <>
            <label className="block text-xs text-[#150A35]/70">Text</label>
            <input
              type="text"
              value={(params.text as string) || ""}
              onChange={(e) => update("text", e.target.value)}
              placeholder="{{variable}}"
              className="w-full rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
            />
          </>
        )}
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
            className="rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
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
            className="w-24 rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
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
          className="w-24 rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
        />
      </div>
    );
  }
  if (action === "select_option") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-[#150A35]/70">Selector</label>
        <input
          type="text"
          value={(params.selector as string) || ""}
          onChange={(e) => update("selector", e.target.value)}
          placeholder="select#country"
          className="w-full rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
        />
        <label className="block text-xs text-[#150A35]/70">Value</label>
        <input
          type="text"
          value={(params.value as string) || ""}
          onChange={(e) => update("value", e.target.value)}
          placeholder="US"
          className="w-full rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
        />
      </div>
    );
  }
  if (action === "press_key") {
    return (
      <div>
        <label className="block text-xs text-[#150A35]/70">Key</label>
        <input
          type="text"
          value={(params.key as string) || ""}
          onChange={(e) => update("key", e.target.value)}
          placeholder="Enter"
          className="w-32 rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
        />
      </div>
    );
  }
  return null;
}

function StepCard({
  step,
  onUpdate,
  onDelete,
}: {
  step: Step;
  onUpdate: (s: Partial<Step>) => void;
  onDelete: () => void;
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
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`echo-card flex items-start gap-3 p-4 ${
        isDragging ? "opacity-60" : ""
      }`}
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
        <div className="flex flex-wrap gap-2">
          <select
            value={step.action}
            onChange={(e) => onUpdate({ action: e.target.value })}
            className="rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm text-[#150A35]"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={step.risk}
            onChange={(e) => onUpdate({ risk: e.target.value })}
            className="rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm text-[#150A35]"
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-[#150A35]/70">Context</label>
          <textarea
            value={step.context}
            onChange={(e) => onUpdate({ context: e.target.value })}
            placeholder="Description of this step"
            rows={2}
            className="mt-1 w-full rounded border border-[#A577FF]/40 px-3 py-1.5 text-sm"
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
        className="text-[#ef4444] hover:text-[#ef4444]/80"
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
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
        setWorkflow({ id: snap.id, ...d } as Workflow);
      } else {
        setWorkflow(null);
      }
    });
    const stepsRef = collection(db, "workflows", id, "steps");
    const q = query(stepsRef, orderBy("order"));
    const unsubSteps = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Step))
        .sort((a, b) => a.order - b.order);
      setSteps(list);
      setLoading(false);
    });
    return () => {
      unsubWf();
      unsubSteps();
      Object.values(debounceRef.current).forEach(clearTimeout);
    };
  }, [id, router]);

  const debouncedUpdate = (stepId: string, data: Partial<Step>) => {
    if (debounceRef.current[stepId]) clearTimeout(debounceRef.current[stepId]);
    debounceRef.current[stepId] = setTimeout(async () => {
      try {
        await apiFetch(`/api/workflows/${id}/steps/${stepId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch (e) {
        console.error("Failed to update step:", e);
      }
      delete debounceRef.current[stepId];
    }, 400);
  };

  const handleStepUpdate = (stepId: string, data: Partial<Step>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, ...data } : s))
    );
    debouncedUpdate(stepId, data);
  };

  const handleDeleteStep = async (stepId: string) => {
    try {
      await apiFetch(`/api/workflows/${id}/steps/${stepId}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error("Failed to delete step:", e);
    }
  };

  const handleAddStep = async () => {
    try {
      await apiFetch(`/api/workflows/${id}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "wait",
          context: "",
          params: {},
          risk: "low",
        }),
      });
    } catch (e) {
      console.error("Failed to add step:", e);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex((s) => s.id === active.id);
    const newIdx = steps.findIndex((s) => s.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(steps, oldIdx, newIdx);
    setSteps(reordered);
    try {
      await apiFetch(`/api/workflows/${id}/steps/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step_ids: reordered.map((s) => s.id),
        }),
      });
    } catch (e) {
      console.error("Failed to reorder:", e);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      router.push(`/dashboard/workflows/${id}`);
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (loading || !workflow) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#A577FF]/20 border-t-[#A577FF]" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="flex h-full w-full flex-1 flex-col gap-4 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/workflows"
              className="cursor-pointer text-[#150A35]/70 hover:text-[#A577FF]"
            >
              <IconArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-semibold text-[#150A35]">
              Edit Workflow
            </h1>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="echo-btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <IconCheck className="h-5 w-5" />
            {saving ? "Saving..." : "Save & Activate"}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-[#150A35]">Steps</h2>
            <button
              type="button"
              onClick={handleAddStep}
              className="echo-btn-secondary flex items-center gap-2"
            >
              <IconPlus className="h-5 w-5" />
              Add Step
            </button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={steps.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-3">
                {steps.map((step) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    onUpdate={(d) => handleStepUpdate(step.id, d)}
                    onDelete={() => handleDeleteStep(step.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {steps.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#A577FF]/40 p-8 text-center text-[#150A35]/60">
              No steps. Click Add Step to create one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
