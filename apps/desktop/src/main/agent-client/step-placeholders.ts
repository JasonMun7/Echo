/**
 * Replace `{{var_name}}` in workflow step strings with run-time values.
 */
import type { Step, StepParams } from "@echo/types";

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function interpolateString(
  s: string,
  vars: Record<string, string>,
): string {
  if (!vars || !Object.keys(vars).length) return s;
  return s.replace(PLACEHOLDER, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

export function interpolateStep(
  step: Step,
  vars: Record<string, string>,
): Step {
  if (!vars || !Object.keys(vars).length) return step;
  const o = structuredClone(step);
  if (typeof o.context === "string") {
    o.context = interpolateString(o.context, vars);
  }
  if (typeof o.expected_outcome === "string") {
    o.expected_outcome = interpolateString(o.expected_outcome, vars);
  }
  const p: StepParams = { ...o.params };
  for (const k of ["text", "content", "description", "url"] as const) {
    const v = p[k];
    if (typeof v === "string") {
      p[k] = interpolateString(v, vars);
    }
  }
  o.params = p;
  return o;
}

export function interpolateSteps(
  steps: Step[],
  vars: Record<string, string>,
): Step[] {
  if (!vars || !Object.keys(vars).length) return steps;
  return steps.map((s) => interpolateStep(s, vars));
}
