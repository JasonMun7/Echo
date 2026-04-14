"use client";

import type { Dispatch, SetStateAction } from "react";
import { IconTrash, IconX } from "@tabler/icons-react";
import { WorkflowApiCallFields } from "@/components/workflow-api-call-fields";

export interface WorkflowStepEditorStep {
  id: string;
  order: number;
  action: string;
  context: string;
  params: Record<string, unknown>;
  expected_outcome?: string;
}

export function formatAction(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function clampNonNegativeInt(raw: string, fallbackWhenInvalid: number): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return Math.max(0, fallbackWhenInvalid);
  return Math.max(0, n);
}

/** Reset params when the step action changes so stale keys are not saved. */
export function getDefaultParamsForAction(action: string): Record<string, unknown> {
  switch (action) {
    case "navigate":
      return { url: "" };
    case "click_at":
    case "type_text_at":
      return { description: "", text: "" };
    case "hover":
    case "right_click":
    case "double_click":
      return { description: "" };
    case "drag":
      return { description: "", x1: 0, y1: 0, x2: 0, y2: 0 };
    case "wait_for_element":
      return { description: "" };
    case "scroll":
      return { direction: "down", amount: 500 };
    case "wait":
      return { seconds: 2 };
    case "select_option":
      return { description: "", value: "" };
    case "press_key":
    case "hotkey":
      return { key: "" };
    case "open_app":
    case "focus_app":
      return { app: "" };
    case "api_call":
      return {};
    default:
      return {};
  }
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
  if (
    action === "click_at" ||
    action === "type_text_at" ||
    action === "hover" ||
    action === "right_click" ||
    action === "double_click"
  ) {
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
  if (action === "drag") {
    return (
      <div className="space-y-2">
        <label className="block text-xs text-[#150A35]/70">
          Description
          <span className="ml-1 text-[#150A35]/40">(what to drag from → to)</span>
        </label>
        <textarea
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Drag the handle from the left panel to the canvas"
          rows={2}
          className="w-full min-w-0 resize-y rounded border border-[#A577FF]/40 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40 break-words"
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-[#150A35]/70">Start X</label>
            <input
              type="number"
              min={0}
              value={(params.x1 as number) ?? 0}
              onChange={(e) => update("x1", clampNonNegativeInt(e.target.value, 0))}
              className="w-full rounded border border-[#A577FF]/40 bg-white px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[#150A35]/70">Start Y</label>
            <input
              type="number"
              min={0}
              value={(params.y1 as number) ?? 0}
              onChange={(e) => update("y1", clampNonNegativeInt(e.target.value, 0))}
              className="w-full rounded border border-[#A577FF]/40 bg-white px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[#150A35]/70">End X</label>
            <input
              type="number"
              min={0}
              value={(params.x2 as number) ?? 0}
              onChange={(e) => update("x2", clampNonNegativeInt(e.target.value, 0))}
              className="w-full rounded border border-[#A577FF]/40 bg-white px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[#150A35]/70">End Y</label>
            <input
              type="number"
              min={0}
              value={(params.y2 as number) ?? 0}
              onChange={(e) => update("y2", clampNonNegativeInt(e.target.value, 0))}
              className="w-full rounded border border-[#A577FF]/40 bg-white px-2 py-1 text-sm"
            />
          </div>
        </div>
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
            min={0}
            value={(params.amount as number) ?? 500}
            onChange={(e) => update("amount", clampNonNegativeInt(e.target.value, 500))}
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
          min={0}
          value={(params.seconds as number) ?? 2}
          onChange={(e) => update("seconds", clampNonNegativeInt(e.target.value, 2))}
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

export type StepEditorPanelProps = {
  step: WorkflowStepEditorStep;
  stepIndex: number;
  availableActions: readonly string[];
  dirtyStepIds: Set<string>;
  invalidStepIds: Set<string>;
  onClose: () => void;
  handleStepUpdate: (stepId: string, data: Partial<WorkflowStepEditorStep>) => void;
  handleDeleteStep: (stepId: string) => void;
  setInvalidStepIds: Dispatch<SetStateAction<Set<string>>>;
};

export function StepEditorPanel({
  step,
  stepIndex,
  availableActions,
  dirtyStepIds,
  invalidStepIds,
  onClose,
  handleStepUpdate,
  handleDeleteStep,
  setInvalidStepIds,
}: StepEditorPanelProps) {
  return (
    <div className="rounded-xl border border-[#A577FF]/40 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#150A35]">Step {stepIndex + 1} — Edit</h3>
        <button
          type="button"
          onClick={onClose}
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
        <p className="text-xs font-medium text-echo-error">Context is required before saving</p>
      )}
      <div>
        <label className="block text-xs text-[#150A35]/70">Action</label>
        <select
          value={step.action}
          onChange={(e) => {
            const newAction = e.target.value;
            handleStepUpdate(step.id, {
              action: newAction,
              params: getDefaultParamsForAction(newAction),
            });
          }}
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
}
