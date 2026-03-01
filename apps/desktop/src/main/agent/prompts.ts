/**
 * EchoPrism system prompt and action space (UI-TARS-style) — TypeScript/Electron version.
 * Mirrors backend/agent/echo_prism/prompts.py exactly.
 * Output format: Thought: ... then Action: <action>(<params>)
 */

export type WorkflowType = "browser" | "desktop";

const DESKTOP_ACTION_SPACE = `
## Action Space — Desktop (output exactly one per turn)

- Click(x, y) - Left-click at normalized coordinates (0-1000). (0,0)=top-left, (1000,1000)=bottom-right.
- RightClick(x, y) - Right-click at (x, y) to open context menus
- DoubleClick(x, y) - Double-click at (x, y) to open files or apps
- Drag(x1, y1, x2, y2) - Click and drag from (x1,y1) to (x2,y2)
- Scroll(x, y, direction, distance=300) - Scroll at (x, y); direction: up|down|left|right; distance in pixels
- Type(content) - Type the specified text
- Hotkey(key1, key2, ...) - Press a key combination e.g. Hotkey("cmd", "c")
- Wait(seconds) - Pause for N seconds (max 30)
- PressKey(key) - Press a single key e.g. PressKey("enter")
- OpenApp(appName) - Launch an application by name e.g. OpenApp("Safari")
- FocusApp(appName) - Bring an app to the foreground e.g. FocusApp("Finder")
- Finished() - Mark task as complete
- CallUser(reason) - Request human intervention. Use ONLY when:
    (a) you have tried 2+ different approaches and ALL have failed,
    (b) the task requires credentials, a CAPTCHA, or an irreversible human decision,
    (c) a required UI element is completely absent after scrolling and waiting,
    (d) you are in a loop repeating the same failing action with no alternative.
  DO NOT call after a single failure — try at least one alternative approach first.
  reason: one sentence explaining what you tried and exactly what is blocking you.

CRITICAL: Output ONLY the Thought line and Action line. No markdown, no headers, no extra text before or after.

Output format (strict):
Thought: <your reasoning about what to do next>
Action: <action>(<params>)

Examples:
Thought: The search box is in the top navigation bar. I will click its center to focus it.
Action: Click(250, 45)

Thought: I need to open the file manager. I'll double-click the Finder icon on the Dock.
Action: DoubleClick(62, 982)

Thought: My last click had no effect — the button appears to be lower on the page than I estimated. I'll scroll down to reveal it.
Action: Scroll(500, 500, "down", 400)
`;

const BROWSER_ACTION_SPACE = `
## Action Space — Browser (output exactly one per turn)

- Click(x, y) - Click at normalized coordinates (0-1000). (0,0)=top-left, (1000,1000)=bottom-right.
- Scroll(x, y, direction, distance=300) - Scroll at (x, y); direction: up|down|left|right
- Type(content) - Type the specified text
- Wait(seconds) - Pause for N seconds (max 30)
- PressKey(key) - Press a single key e.g. PressKey("enter") or PressKey("tab")
- Navigate(url) - Go to a URL
- SelectOption(x, y, value) - Select a dropdown option at (x, y)
- Hover(x, y) - Hover over an element to reveal tooltips or dropdowns
- Finished() - Mark task as complete
- CallUser(reason) - Request human intervention. Use ONLY when:
    (a) you have tried 2+ different approaches and ALL have failed,
    (b) the task requires credentials, a CAPTCHA, or an irreversible human decision,
    (c) a required UI element is completely absent after scrolling and waiting,
    (d) you are in a loop repeating the same failing action with no alternative.
  DO NOT call after a single failure — try at least one alternative approach first.
  reason: one sentence explaining what you tried and exactly what is blocking you.

CRITICAL: Output ONLY the Thought line and Action line. No markdown, no headers, no extra text before or after.

Output format (strict):
Thought: <your reasoning about what to do next>
Action: <action>(<params>)

Examples:
Thought: The Submit button is visible at the bottom center of the form. I will click it.
Action: Click(500, 820)

Thought: I need to navigate to the login page to begin authentication.
Action: Navigate("https://app.example.com/login")

Thought: My previous click did not submit the form. I notice the cursor is still in the field — pressing Enter should trigger form submission instead.
Action: PressKey("enter")
`;

/**
 * Build system prompt for EchoPrism (Observe → Think → Act).
 * History summary is passed separately as a user-message part via historySummaryText().
 */
export function systemPrompt(
  instruction: string,
  workflowType: WorkflowType = "browser"
): string {
  const actionSpace = workflowType === "desktop" ? DESKTOP_ACTION_SPACE : BROWSER_ACTION_SPACE;
  const envContext =
    workflowType === "desktop"
      ? "You are controlling a native desktop application. Use OS-level actions (Hotkey, OpenApp, FocusApp, RightClick, DoubleClick) as needed."
      : "You are controlling a web browser. Use browser-aware actions (Navigate, SelectOption, Hover, PressKey) as needed.";

  return (
    `You are EchoPrism, a UI automation agent. You observe screenshots, reason about the interface, and output executable actions.\n\n` +
    `${envContext}\n\n` +
    `You follow these reasoning patterns:\n` +
    `- Task Decomposition: Break complex tasks into subtasks; track the overall goal\n` +
    `- Long-term Consistency: Reference the original task goal; avoid drifting to unrelated actions\n` +
    `- Milestone Recognition: Explicitly note when an intermediate step completes before moving on\n` +
    `- Trial and Error: Hypothesize an action, reason about its likely outcome, then execute\n` +
    `- Reflection: After an error, identify what went wrong and state a corrected strategy\n` +
    `- Recovery: When a previous attempt failed, RE-EXAMINE the current screenshot — the element may have moved, require scrolling, or be behind a modal. Do NOT repeat the identical action — adapt your approach.\n` +
    `- Stuck: If you have tried 2+ genuinely different approaches and all have failed, use CallUser(reason). Never call after just one failure — always attempt at least one alternative strategy first.\n\n` +
    `Coordinates are normalized 0-1000. (0,0) = top-left corner, (1000,1000) = bottom-right corner.\n` +
    actionSpace +
    `\n\n## Current Instruction\n${instruction}`
  );
}

/**
 * Format prior step history for injection as a user-message part (not system prompt).
 */
export function historySummaryText(summaryText: string): string {
  if (!summaryText) return "";
  return `## Prior Steps (summary)\n${summaryText}`;
}

/**
 * Tier 1: Dense caption of the full UI screenshot.
 */
export function denseCaptionPrompt(): string {
  return (
    "Provide a dense caption of this GUI screenshot. Include:\n" +
    "(a) overall layout and structure,\n" +
    "(b) main regions (header, sidebar, content area, footer),\n" +
    "(c) key interactive elements and their spatial relationships,\n" +
    "(d) any embedded images, icons, or badges and their apparent roles.\n" +
    "Be comprehensive but do not hallucinate elements that are not clearly visible."
  );
}

/**
 * Perception: before/after comparison to verify whether an action succeeded.
 * Call with two image parts: [before_screenshot, after_screenshot].
 */
export function stateTransitionPrompt(actionStr = "", expectedOutcome = ""): string {
  let text =
    "Compare the BEFORE and AFTER screenshots of a UI to determine if the last action succeeded.\n\n";
  if (actionStr) text += `Action taken: ${actionStr}\n`;
  if (expectedOutcome) text += `Expected outcome: ${expectedOutcome}\n`;
  text +=
    "\nRespond in this exact format — no other text after the VERDICT line:\n\n" +
    "DESCRIPTION: <one sentence describing what changed or did not change>\n" +
    "VERDICT: success\n\n" +
    "OR:\n\n" +
    "DESCRIPTION: <one sentence describing what changed or did not change>\n" +
    "VERDICT: failed\n\n" +
    "Rules:\n" +
    "- VERDICT: success — the UI changed meaningfully in the expected direction\n" +
    "- VERDICT: failed — the screenshots are identical or the change is unrelated to the intended action\n" +
    "- You MUST output the VERDICT line. It MUST be the last line of your response.\n" +
    "- Do NOT add any text after the VERDICT line.";
  return text;
}

/**
 * Perception: QA-style grounding — ask a specific question about the current screenshot.
 */
export function elementQaPrompt(question: string): string {
  return (
    `${question}\n\n` +
    "Base your answer only on what is clearly visible in the screenshot. " +
    "For coordinates, use normalized values 0-1000 where (0,0) is the top-left corner. " +
    "If the element is not visible, say so explicitly."
  );
}

/**
 * Format a CallUser reason for storage and UI display.
 */
export function callUserPrompt(reason: string): string {
  let clean = reason.trim();
  if (clean.toLowerCase().startsWith("thought:")) clean = clean.slice("thought:".length).trim();
  else if (clean.toLowerCase().startsWith("reflection:")) clean = clean.slice("reflection:".length).trim();
  return clean;
}

export interface StepData {
  action?: string;
  context?: string;
  params?: Record<string, unknown>;
  expected_outcome?: string;
}

/**
 * Convert a workflow step to instruction text for the agent.
 */
export function stepInstruction(step: StepData, stepIndex: number, total: number): string {
  const action = step.action ?? "wait";
  const params = step.params ?? {};
  const context = (step.context ?? "").trim();
  const expectedOutcome = (step.expected_outcome ?? "").trim();

  const parts: string[] = [`Step ${stepIndex}/${total}:`];
  if (context) parts.push(`Context: ${context}`);
  if (expectedOutcome) parts.push(`Expected outcome: ${expectedOutcome}`);

  const desc = (params.description as string | undefined) ?? context ?? "the element";
  const x = params.x as number | undefined;
  const y = params.y as number | undefined;

  if (action === "navigate") {
    parts.push(`Go to ${params.url ?? "https://www.google.com"}`);
  } else if (action === "click_at") {
    parts.push(`Click ${desc}. Locate it visually in the screenshot and provide Click(x, y) with normalized coords.`);
    if (x != null && y != null) {
      parts.push(`Synthesized coordinates hint: approximately (${x}, ${y}) — verify visually before clicking.`);
    }
  } else if (action === "type_text_at") {
    parts.push(`Type '${params.text ?? ""}' into ${desc}.`);
  } else if (action === "scroll") {
    const direction = params.direction ?? "down";
    const distance = (params.distance ?? params.amount ?? 300) as number;
    parts.push(`Scroll ${direction} by ${distance}px`);
  } else if (action === "wait") {
    parts.push(`Wait ${params.seconds ?? 2} seconds`);
  } else if (action === "wait_for_element") {
    parts.push(`Wait for ${desc} to appear on screen`);
  } else if (action === "select_option") {
    parts.push(`Select option '${params.value ?? ""}' in ${desc}`);
  } else if (action === "press_key") {
    parts.push(`Press the ${params.key ?? "Enter"} key`);
  } else if (action === "hover") {
    parts.push(`Hover over ${desc}.`);
    if (x != null && y != null) parts.push(`Approximate location: (${x}, ${y}) — verify visually.`);
  } else if (action === "hotkey") {
    const keys = (params.keys as string[] | undefined) ?? [];
    const combo = keys.join("+") || "unknown";
    const hotkeyDesc = params.description as string | undefined;
    parts.push(`Press keyboard shortcut ${combo}${hotkeyDesc ? ` — ${hotkeyDesc}` : ""}`);
  } else if (action === "open_app") {
    parts.push(`Launch the application '${params.appName ?? ""}'`);
  } else if (action === "focus_app") {
    parts.push(`Bring '${params.appName ?? ""}' to the foreground`);
  } else if (action === "double_click") {
    parts.push(`Double-click ${desc}.`);
    if (x != null && y != null) parts.push(`Approximate location: (${x}, ${y}) — verify visually.`);
  } else if (action === "right_click") {
    parts.push(`Right-click ${desc} to open context menu.`);
    if (x != null && y != null) parts.push(`Approximate location: (${x}, ${y}) — verify visually.`);
  } else if (action === "drag") {
    const x2 = params.x2 as number | undefined;
    const y2 = params.y2 as number | undefined;
    parts.push(`Drag ${desc}.`);
    if (x != null && y != null && x2 != null && y2 != null) {
      parts.push(`From approximately (${x}, ${y}) to (${x2}, ${y2}) — verify visually.`);
    }
  } else {
    parts.push(`${action}: ${JSON.stringify(params)}`);
  }

  return parts.join(" ");
}
