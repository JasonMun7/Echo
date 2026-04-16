"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { IconTrash } from "@tabler/icons-react";
import { ChevronDown, Loader2 } from "lucide-react";
import { WorkflowApiCallFields } from "@/components/workflow-api-call-fields";
import { OpenAppBrandSearchFields } from "@/components/echo-flow/open-app-brand-search-fields";
import { StepContextComposer } from "@/components/echo-flow/step-context-composer";
import { StepContextTagField } from "@/components/echo-flow/step-context-tag-field";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { formatAction } from "@/lib/workflow-action-labels";
import { migratePromptTokensToCanonical } from "@/lib/context-prompt-tokens";
import {
  SYNTHETIC_FRAME_ATTACHMENT_PREFIX,
  isSyntheticFrameAttachment,
  normalizeContextAttachments,
  type ContextAttachment,
} from "@/lib/workflow-step-context-attachments";
import {
  getStepContextTagsMode,
  publishIssuesForStep,
} from "@/lib/workflow-step-publish-validation";
import { displayNameFromBrandHit } from "@/app/dashboard/integrations/_lib/brandfetch-search";

export interface WorkflowStepEditorStep {
  id: string;
  order: number;
  action: string;
  context: string;
  params: Record<string, unknown>;
  expected_outcome?: string;
  /** Scribe-style screenshot URL from synthesis (optional). */
  frame_image_url?: string;
  /** Normalized or pixel bbox for highlight overlay in Echo Flow. */
  click_overlay?: Record<string, unknown>;
  /** Extra images, videos, or files for collaborators (Firebase Storage URLs). */
  context_attachments?: ContextAttachment[] | unknown;
}

export { formatAction };

/** Actions whose primary narrative lives in `params.description` and is edited in {@link StepContextComposer}. */
const ACTIONS_WITH_DESCRIPTION_IN_COMPOSER = new Set([
  "wait_for_element",
  "click_at",
  "type_text_at",
  "hover",
  "right_click",
  "double_click",
  "drag_drop",
  "drag",
  "select_option",
]);

/** Prefer non-empty `params.description`; fall back to `context` when description is blank (legacy / sync). */
function waitForElementPromptFromStep(step: WorkflowStepEditorStep): string {
  const raw = step.params?.description;
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  return String(step.context ?? "");
}

/** Single prompt string for {@link StepContextComposer} (matches publish validation fields). */
function primaryPromptFromStep(step: WorkflowStepEditorStep): string {
  if (ACTIONS_WITH_DESCRIPTION_IN_COMPOSER.has(step.action)) {
    return waitForElementPromptFromStep(step);
  }
  return String(step.context ?? "");
}

function primaryPromptPatch(
  step: WorkflowStepEditorStep,
  value: string,
): Partial<WorkflowStepEditorStep> {
  if (ACTIONS_WITH_DESCRIPTION_IN_COMPOSER.has(step.action)) {
    return {
      params: { ...step.params, description: value },
      context: value,
    };
  }
  return { context: value };
}

/**
 * Synthesis sometimes keeps a signed `frame_image_url` while `context_attachments` is empty or
 * dropped during hydrate — tokens like `{{c1}}` still need a matching row for chips + thumbnails.
 */
function buildComposerAttachments(step: WorkflowStepEditorStep): ContextAttachment[] {
  const base = normalizeContextAttachments(step.context_attachments);
  const fu = typeof step.frame_image_url === "string" ? step.frame_image_url.trim() : "";
  if (!fu) return base;
  if (base.some((a) => a.url.trim() === fu)) return base;

  const prompt = migratePromptTokensToCanonical(primaryPromptFromStep(step));
  const byRef = new Map(base.map((a) => [(a.ref_label ?? "c1").toLowerCase(), a]));
  const missingRefs = [...prompt.matchAll(/\{\{c(\d+)\}\}/gi)]
    .map((m) => `c${m[1]}`.toLowerCase())
    .filter((ref) => !byRef.has(ref));

  if (missingRefs.length > 0) {
    const ref = missingRefs[0]!;
    return [
      ...base,
      {
        id: `${SYNTHETIC_FRAME_ATTACHMENT_PREFIX}${step.id}:${ref}`,
        kind: "image",
        name: "Step capture",
        url: fu,
        ref_label: ref,
      },
    ];
  }

  if (base.length === 0) {
    return [
      {
        id: `${SYNTHETIC_FRAME_ATTACHMENT_PREFIX}${step.id}:c1`,
        kind: "image",
        name: "Step capture",
        url: fu,
        ref_label: "c1",
      },
    ];
  }

  return base;
}

function contextComposerPlaceholder(action: string): string {
  switch (action) {
    case "wait_for_element":
      return "Describe what the agent should wait for. @refs appear when you add files.";
    case "click_at":
      return "Describe what to click. @refs appear when you add files.";
    case "type_text_at":
      return "Describe where to type. @refs appear when you add files.";
    case "hover":
    case "right_click":
    case "double_click":
      return "Describe the control or region. @refs appear when you add files.";
    case "drag_drop":
    case "drag":
      return "Describe the drag (what moves where). @refs appear when you add files.";
    case "select_option":
      return "Describe the dropdown or control. @refs appear when you add files.";
    default:
      return "Notes for this step, @refs for attachments, or use the mic.";
  }
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
      return { description: "" };
    case "type_text_at":
      return { description: "", text: "" };
    case "hover":
    case "right_click":
    case "double_click":
      return { description: "" };
    case "drag_drop":
      return { description: "" };
    case "drag":
      return { description: "" };
    case "wait_for_element":
      return { description: "" };
    case "scroll":
      return { direction: "down" };
    case "wait":
      return { seconds: 2 };
    case "select_option":
      return { description: "", value: "" };
    case "press_key":
    case "hotkey":
      return { key: "" };
    case "open_app":
    case "focus_app":
      return { app: "", brand_domain: "" };
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
  /** When true, narrative lives in {@link StepContextComposer}; omit duplicate textareas. */
  richContextEnabled,
}: {
  action: string;
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
  richContextEnabled: boolean;
}) {
  const update = (k: string, v: unknown) => {
    onChange({ ...params, [k]: v });
  };
  if (action === "navigate") {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-foreground/80">URL</label>
        <input
          type="text"
          value={(params.url as string) || ""}
          onChange={(e) => update("url", e.target.value)}
          placeholder="https://..."
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
    );
  }
  if (action === "click_at") {
    if (richContextEnabled) return null;
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-foreground/80">What to click</label>
        <textarea
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="e.g. blue “Submit” button at the bottom of the form"
          rows={3}
          className="w-full min-w-0 resize-y rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 break-words"
        />
      </div>
    );
  }
  if (action === "type_text_at") {
    return (
      <div className="space-y-2">
        {!richContextEnabled ? (
          <>
            <label className="block text-xs font-medium text-foreground/80">Where to type</label>
            <textarea
              value={(params.description as string) || ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="e.g. email field in the login form"
              rows={2}
              className="w-full min-w-0 resize-y rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 break-words"
            />
          </>
        ) : null}
        <label className="block text-xs font-medium text-foreground/80">Text to type</label>
        <input
          type="text"
          value={(params.text as string) || ""}
          onChange={(e) => update("text", e.target.value)}
          placeholder="Literal text or {{variable}}"
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
    );
  }
  if (action === "hover" || action === "right_click" || action === "double_click") {
    if (richContextEnabled) return null;
    const verb =
      action === "hover" ? "hover" : action === "right_click" ? "right-click" : "double-click";
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-foreground/80">What to {verb}</label>
        <textarea
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="Describe the control or region clearly"
          rows={3}
          className="w-full min-w-0 resize-y rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 break-words"
        />
      </div>
    );
  }
  if (action === "drag_drop") {
    if (richContextEnabled) return null;
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-foreground/80">Drag</label>
        <textarea
          value={(params.description as string) || ""}
          onChange={(e) => update("description", e.target.value)}
          placeholder="What to drag and where it should land (no pixel coordinates needed)"
          rows={3}
          className="w-full min-w-0 resize-y rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 break-words"
        />
      </div>
    );
  }
  if (action === "drag") {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-foreground/80">
          Drag <span className="font-normal text-foreground/50">(from → to)</span>
        </label>
        {richContextEnabled ? (
          <p className="text-[11px] text-muted-foreground">
            Describe what to drag and where it should land—the run will locate controls from your
            description.
          </p>
        ) : (
          <textarea
            value={(params.description as string) || ""}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Drag the handle from the left panel to the canvas"
            rows={2}
            className="w-full min-w-0 resize-y rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 break-words"
          />
        )}
      </div>
    );
  }
  if (action === "wait_for_element") {
    /** Prompt + media live in `StepContextComposer` (single field). */
    return null;
  }
  if (action === "scroll") {
    return (
      <div className="space-y-1.5">
        <div>
          <label className="block text-xs font-medium text-foreground/80">Direction</label>
          <select
            value={(params.direction as string) || "down"}
            onChange={(e) => onChange({ direction: e.target.value })}
            className="rounded border border-border bg-background px-3 py-1.5 text-sm text-foreground"
          >
            <option value="down">Down</option>
            <option value="up">Up</option>
          </select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          How far to scroll is chosen automatically at run time from the page view.
        </p>
      </div>
    );
  }
  if (action === "wait") {
    return (
      <div>
        <label className="block text-xs font-medium text-foreground/80">Seconds</label>
        <input
          type="number"
          min={0}
          value={(params.seconds as number) ?? 2}
          onChange={(e) => update("seconds", clampNonNegativeInt(e.target.value, 2))}
          className="w-24 rounded border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>
    );
  }
  if (action === "select_option") {
    return (
      <div className="space-y-2">
        {!richContextEnabled ? (
          <>
            <label className="block text-xs font-medium text-foreground/80">
              Dropdown or control
            </label>
            <textarea
              value={(params.description as string) || ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="e.g. Country in the billing section"
              rows={2}
              className="w-full min-w-0 resize-y rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 break-words"
            />
          </>
        ) : null}
        <label className="block text-xs font-medium text-foreground/80">Option value</label>
        <input
          type="text"
          value={(params.value as string) || ""}
          onChange={(e) => update("value", e.target.value)}
          placeholder="e.g. US"
          className="w-full rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>
    );
  }
  if (action === "press_key" || action === "hotkey") {
    return (
      <div>
        <label className="block text-xs font-medium text-foreground/80">
          {action === "hotkey" ? "Shortcut" : "Key"}
        </label>
        <input
          type="text"
          value={(params.key as string) || ""}
          onChange={(e) => update("key", e.target.value)}
          placeholder={action === "hotkey" ? "ctrl+c" : "Enter"}
          className="w-32 rounded border border-border bg-background px-3 py-1.5 text-sm"
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
  workflowId: string;
  step: WorkflowStepEditorStep;
  dirtyStepIds: Set<string>;
  invalidStepIds: Set<string>;
  handleStepUpdate: (stepId: string, data: Partial<WorkflowStepEditorStep>) => void;
  handleDeleteStep: (stepId: string) => void;
  onSaveStep?: () => void | Promise<void>;
  saveStepDisabled?: boolean;
  savingStep?: boolean;
  setInvalidStepIds: Dispatch<SetStateAction<Set<string>>>;
  /** Opens the same action picker as Add step; choose a type to replace this step’s action. */
  onOpenStepTypePicker?: () => void;
  /** Another collaborator holds the edit lock on this step (§7b). */
  readOnly?: boolean;
  lockOwnerLabel?: string | null;
};

function contextTagsHelperText(action: string): string | null {
  if (
    action === "take_screenshot" ||
    action === "open_web_browser" ||
    action === "close_web_browser"
  ) {
    return "Optional notes for your team—each line is a tag you can remove anytime.";
  }
  return null;
}

export function StepEditorPanel({
  workflowId,
  step,
  dirtyStepIds,
  invalidStepIds,
  handleStepUpdate,
  handleDeleteStep,
  onSaveStep,
  saveStepDisabled = true,
  savingStep = false,
  setInvalidStepIds,
  onOpenStepTypePicker,
  readOnly = false,
  lockOwnerLabel,
}: StepEditorPanelProps) {
  const applyParams = (nextParams: Record<string, unknown>) => {
    handleStepUpdate(step.id, { params: nextParams });
    if (publishIssuesForStep({ ...step, params: nextParams }).length === 0) {
      setInvalidStepIds((prev) => {
        const next = new Set(prev);
        next.delete(step.id);
        return next;
      });
    }
  };

  const applyContextTags = (context: string) => {
    handleStepUpdate(step.id, { context });
    if (publishIssuesForStep({ ...step, context }).length === 0) {
      setInvalidStepIds((prev) => {
        const next = new Set(prev);
        next.delete(step.id);
        return next;
      });
    }
  };

  const contextTagsMode = getStepContextTagsMode(step);
  const contextTagsHint = contextTagsHelperText(step.action);

  const composerAttachments = useMemo(() => buildComposerAttachments(step), [step]);

  return (
    <div className="space-y-4">
      {readOnly && lockOwnerLabel ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span className="font-medium">{lockOwnerLabel}</span> is editing this step. You can review
          fields but not save changes until they finish.
        </p>
      ) : null}
      {dirtyStepIds.has(step.id) && (
        <p className="text-xs font-medium text-primary">Unsaved changes</p>
      )}
      {invalidStepIds.has(step.id) ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-xs text-red-900"
        >
          <p className="font-semibold text-red-950">Complete this step before publishing</p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-red-900/95">
            {publishIssuesForStep(step).map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <label className="block text-xs font-medium text-foreground/80" htmlFor="step-type-trigger">
          Step type
        </label>
        {readOnly ? (
          <p
            id="step-type-trigger"
            className="mt-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground/90"
          >
            {formatAction(step.action)}
          </p>
        ) : (
          <button
            id="step-type-trigger"
            type="button"
            onClick={() => onOpenStepTypePicker?.()}
            className="mt-1.5 flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground shadow-sm transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <span className="min-w-0 truncate font-medium">{formatAction(step.action)}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-foreground/45" aria-hidden />
          </button>
        )}
      </div>
      {auth?.currentUser?.uid ? (
        <StepContextComposer
          workflowId={workflowId}
          stepId={step.id}
          uid={auth.currentUser.uid}
          prompt={primaryPromptFromStep(step)}
          placeholder={contextComposerPlaceholder(step.action)}
          onPromptChange={(v) => {
            const patch = primaryPromptPatch(step, v);
            handleStepUpdate(step.id, patch);
            const nextStep: WorkflowStepEditorStep = {
              ...step,
              ...patch,
              params: patch.params ? { ...step.params, ...patch.params } : step.params,
            };
            if (publishIssuesForStep(nextStep).length === 0) {
              setInvalidStepIds((prev) => {
                const n = new Set(prev);
                n.delete(step.id);
                return n;
              });
            }
          }}
          attachments={composerAttachments}
          onAttachmentsChange={(next) => {
            const persisted = next.filter((a) => !isSyntheticFrameAttachment(a));
            handleStepUpdate(step.id, { context_attachments: persisted });
            const nextStep: WorkflowStepEditorStep = { ...step, context_attachments: persisted };
            if (publishIssuesForStep(nextStep).length === 0) {
              setInvalidStepIds((prev) => {
                const n = new Set(prev);
                n.delete(step.id);
                return n;
              });
            }
          }}
          onRemoveSyntheticFrame={() => {
            handleStepUpdate(step.id, { frame_image_url: undefined });
          }}
          disabled={readOnly}
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Sign in to edit rich context, @refs, and attachments for this step.
        </p>
      )}
      <fieldset disabled={readOnly} className="min-w-0 space-y-4 border-0 p-0 disabled:opacity-80">
        {step.action === "open_app" || step.action === "focus_app" ? (
          <OpenAppBrandSearchFields
            action={step.action}
            app={String(step.params?.app ?? "").trim()}
            brandDomain={String(step.params?.brand_domain ?? "").trim()}
            onPickBrand={(hit) => {
              const name = displayNameFromBrandHit(hit);
              const context = step.action === "open_app" ? `Open ${name}` : `Focus ${name}`;
              handleStepUpdate(step.id, {
                params: { ...step.params, app: name, brand_domain: hit.domain },
                context,
              });
              if (name.trim()) {
                setInvalidStepIds((prev) => {
                  const next = new Set(prev);
                  next.delete(step.id);
                  return next;
                });
              }
            }}
            onClearSelection={() => {
              handleStepUpdate(step.id, {
                params: { ...step.params, app: "", brand_domain: "" },
                context: "",
              });
            }}
          />
        ) : (
          <>
            <ParamFields
              action={step.action}
              params={step.params}
              onChange={applyParams}
              richContextEnabled={Boolean(auth?.currentUser?.uid)}
            />
            {contextTagsMode !== "hidden" && !auth?.currentUser?.uid ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <label
                    className="text-xs font-medium text-foreground/80"
                    htmlFor={`step-ctx-tags-${step.id}`}
                  >
                    Context
                  </label>
                  {contextTagsMode === "optional" ? (
                    <span className="text-[11px] font-normal text-foreground/45">optional</span>
                  ) : (
                    <span className="text-[11px] font-medium text-foreground/55">required</span>
                  )}
                </div>
                {contextTagsHint ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {contextTagsHint}
                  </p>
                ) : null}
                <div id={`step-ctx-tags-${step.id}`}>
                  <StepContextTagField
                    value={step.context}
                    onChange={applyContextTags}
                    disabled={readOnly}
                    inputPlaceholder={
                      contextTagsMode === "required"
                        ? "Describe what should happen, then Enter or +"
                        : "Add a note, then Enter or +"
                    }
                  />
                </div>
              </div>
            ) : null}
          </>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {onSaveStep ? (
            <Button
              type="button"
              size="sm"
              className="echo-btn-primary h-9 gap-2 px-4"
              disabled={saveStepDisabled}
              onClick={() => void onSaveStep()}
            >
              {savingStep ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              ) : null}
              Save step
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => handleDeleteStep(step.id)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
          >
            <IconTrash className="h-3.5 w-3.5" />
            Delete step
          </button>
        </div>
      </fieldset>
    </div>
  );
}
