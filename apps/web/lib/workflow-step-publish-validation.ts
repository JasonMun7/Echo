/**
 * Client-side checks before publishing a workflow (aligned with fields in the step editor).
 */

export type StepForPublishCheck = {
  id: string;
  action: string;
  context: string;
  params?: Record<string, unknown>;
};

function str(p: Record<string, unknown>, key: string): string {
  return String(p[key] ?? "").trim();
}

export function publishIssuesForStep(s: StepForPublishCheck): string[] {
  const issues: string[] = [];
  const p = s.params ?? {};

  switch (s.action) {
    case "navigate":
      if (!str(p, "url")) issues.push("Add a destination URL.");
      break;

    case "api_call":
      if (!str(p, "slug")) issues.push("Choose an app integration action.");
      break;

    case "open_app":
    case "focus_app":
      if (!str(p, "app")) issues.push("Choose an app.");
      break;

    case "click_at":
    case "hover":
    case "right_click":
    case "double_click":
      if (!str(p, "description")) issues.push("Describe what to target on screen.");
      break;

    case "type_text_at":
      if (!str(p, "description")) issues.push("Describe the field or area to type into.");
      if (!str(p, "text")) issues.push("Add the text to type.");
      break;

    case "wait_for_element":
      if (!str(p, "description")) issues.push("Describe what should appear or change.");
      break;

    case "select_option":
      if (!str(p, "description")) issues.push("Describe the dropdown or control.");
      if (!str(p, "value")) issues.push("Add the option value to select.");
      break;

    case "scroll":
    case "wait":
      // Defaults in params are sufficient.
      break;

    case "press_key":
    case "hotkey":
      if (!str(p, "key")) issues.push("Add a key or shortcut (e.g. Enter or ctrl+c).");
      break;

    case "drag":
    case "drag_drop":
      if (!str(p, "description")) issues.push("Describe the drag (what to move and where).");
      break;

    case "take_screenshot":
    case "open_web_browser":
    case "close_web_browser":
      break;

    default:
      if (!s.context?.trim()) {
        issues.push("Add a short description of what should happen in this step.");
      }
      break;
  }

  return issues;
}

export function validateStepsForPublish(steps: StepForPublishCheck[]): {
  invalidIds: Set<string>;
  /** First failing step’s issues (for toast / focus) */
  firstFailureIssues: string[];
  firstFailureStepId: string | null;
} {
  const invalidIds = new Set<string>();
  let firstFailureIssues: string[] = [];
  let firstFailureStepId: string | null = null;

  for (const s of steps) {
    const issues = publishIssuesForStep(s);
    if (issues.length > 0) {
      invalidIds.add(s.id);
      if (!firstFailureStepId) {
        firstFailureStepId = s.id;
        firstFailureIssues = issues;
      }
    }
  }

  return { invalidIds, firstFailureIssues, firstFailureStepId };
}
