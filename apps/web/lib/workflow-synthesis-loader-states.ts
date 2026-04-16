/** Steps shown while a screen recording is analyzed into workflow steps (browser upload path). */
export const WORKFLOW_VIDEO_SYNTHESIS_STEPS = [
  { text: "Understanding your request" },
  { text: "Identifying workflow steps" },
  { text: "Generating step parameters" },
  { text: "Saving workflow" },
] as const;

export const BLANK_WORKFLOW_READY_STEPS = [
  { text: "Creating your workspace" },
  { text: "Opening the canvas" },
] as const;

export const ECHOPRISM_SESSION_READY_STEPS = [
  { text: "Preparing EchoPrism" },
  { text: "Starting your session" },
] as const;
