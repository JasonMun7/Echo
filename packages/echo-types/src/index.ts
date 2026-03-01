/**
 * Shared Echo types for workflows, steps, runs, and operators.
 * Used by apps/web, apps/desktop, and backend (via manual alignment).
 */

/** Workflow execution environment */
export type WorkflowType = "browser" | "desktop";

/** Browser-specific step actions (Playwright / cloud) */
export type BrowserStepAction =
  | "navigate"
  | "click_at"
  | "type_text_at"
  | "scroll"
  | "wait"
  | "press_key"
  | "select_option"
  | "hover"
  | "wait_for_element"
  | "finished"
  | "call_user"
  | "api_call";

/** Desktop-specific step actions (nut-js / Electron) */
export type DesktopStepAction =
  | "click_at"
  | "right_click"
  | "double_click"
  | "type_text_at"
  | "hotkey"
  | "scroll"
  | "drag"
  | "wait"
  | "press_key"
  | "open_app"
  | "focus_app"
  | "finished"
  | "call_user"
  | "api_call";

/** Union of all step actions (for backwards compat) */
export type StepAction = BrowserStepAction | DesktopStepAction;

/** Execution target: cloud browser, local desktop, or local browser */
export type ExecutionTarget =
  | "cloud_browser"
  | "local_desktop"
  | "local_browser";

export interface StepParams {
  url?: string;
  text?: string;
  direction?: string;
  key?: string;
  /** Multi-key hotkey combination e.g. ["cmd", "c"] */
  keys?: string[];
  value?: string;
  /** Normalized coords 0–1000 for grounding */
  x?: number;
  y?: number;
  /** Drag end coords (normalized 0–1000) */
  x2?: number;
  y2?: number;
  seconds?: number;
  distance?: number;
  /** App name for open_app / focus_app */
  appName?: string;
  amount?: number;
  /** Rich visual description: "<element_type> labeled '<text>' in the <region>" */
  description?: string;
  /** api_call step: integration name e.g. "slack", "gmail", "github" */
  integration?: string;
  /** api_call step: method name e.g. "send_message", "send_email" */
  method?: string;
  /** api_call step: method-specific arguments */
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Step {
  id: string;
  action: StepAction | string;
  params: StepParams;
  context: string;
  order: number;
  /** Expected visual state after this action succeeds */
  expected_outcome?: string;
}

export interface Workflow {
  id: string;
  name: string;
  status: "draft" | "active" | "processing" | "ready" | "failed";
  owner_uid: string;
  /** Whether this workflow targets a browser or native desktop environment */
  workflow_type?: WorkflowType;
  executionTarget?: ExecutionTarget;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Run {
  id: string;
  workflow_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled" | "awaiting_user";
  owner_uid: string;
  confirmation_status?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  startedAt?: unknown;
  /** Set when status transitions to awaiting_user */
  callUserReason?: string;
  pausedAt?: unknown;
  /** Mid-run redirect instruction injected by EchoPrismVoice */
  redirect_instruction?: string | null;
  redirect_at?: unknown;
  redirect_acknowledged_at?: unknown;
  /** Set to true by the cancel endpoint; agent loop polls and exits cleanly */
  cancel_requested?: boolean;
  error?: string;
  lastScreenshotUrl?: string;
}

/** Operator action output (e.g. from EchoPrism action parser) */
export interface OperatorAction {
  action: string;
  x?: number;
  y?: number;
  /** Drag start coords */
  x1?: number;
  y1?: number;
  /** Drag end coords */
  x2?: number;
  y2?: number;
  content?: string;
  url?: string;
  selector?: string;
  value?: string;
  key?: string;
  /** Multi-key hotkey e.g. ["cmd", "c"] */
  keys?: string[];
  direction?: string;
  appName?: string;
  seconds?: number;
  [key: string]: unknown;
}
