"""
EchoPrism system prompt and action space (UI-TARS-style).
Output format: Thought: ... then Action: <action>(<params>)
"""
from typing import Any, Literal

WorkflowType = Literal["browser", "desktop"]

DESKTOP_ACTION_SPACE = """
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
"""

BROWSER_ACTION_SPACE = """
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
"""


def system_prompt(
    instruction: str,
    workflow_type: WorkflowType = "browser",
) -> str:
    """Build system prompt for EchoPrism (Observe → Think → Act).
    History summary is passed separately as a user-message part, not in the system prompt.
    """
    action_space = DESKTOP_ACTION_SPACE if workflow_type == "desktop" else BROWSER_ACTION_SPACE
    env_context = (
        "You are controlling a native desktop application. Use OS-level actions "
        "(Hotkey, OpenApp, FocusApp, RightClick, DoubleClick) as needed."
        if workflow_type == "desktop"
        else "You are controlling a web browser. Use browser-aware actions "
        "(Navigate, SelectOption, Hover, PressKey) as needed."
    )

    base = f"""You are EchoPrism, a UI automation agent. You observe screenshots, reason about the interface, and output executable actions.

{env_context}

You follow these reasoning patterns:
- Task Decomposition: Break complex tasks into subtasks; track the overall goal
- Long-term Consistency: Reference the original task goal; avoid drifting to unrelated actions
- Milestone Recognition: Explicitly note when an intermediate step completes before moving on
- Trial and Error: Hypothesize an action, reason about its likely outcome, then execute
- Reflection: After an error, identify what went wrong and state a corrected strategy
- Recovery: When a previous attempt failed, RE-EXAMINE the current screenshot — the element may have moved, require scrolling, or be behind a modal. Do NOT repeat the identical action — adapt your approach.
- Stuck: If you have tried 2+ genuinely different approaches and all have failed, use CallUser(reason). Never call after just one failure — always attempt at least one alternative strategy first.

Coordinates are normalized 0-1000. (0,0) = top-left corner, (1000,1000) = bottom-right corner.
"""
    base += action_space
    base += "\n\n## Current Instruction\n" + instruction
    return base


def history_summary_text(history_text: str) -> str:
    """Format prior step history for injection as a user-message part (not system prompt)."""
    if not history_text:
        return ""
    return f"## Prior Steps (summary)\n{history_text}"


def dense_caption_prompt() -> str:
    """
    Perception: full interface description (used before complex multi-step tasks
    or when the agent needs broad context about the current screen).
    """
    return (
        "Provide a dense caption of this GUI screenshot. Include:\n"
        "(a) overall layout and structure,\n"
        "(b) main regions (header, sidebar, content area, footer),\n"
        "(c) key interactive elements and their spatial relationships,\n"
        "(d) any embedded images, icons, or badges and their apparent roles.\n"
        "Be comprehensive but do not hallucinate elements that are not clearly visible."
    )


def state_transition_prompt(action_str: str = "", expected_outcome: str = "") -> str:
    """
    Perception: before/after comparison to verify whether an action succeeded.
    Call with two image parts: [before_screenshot, after_screenshot].
    Response MUST end with exactly 'VERDICT: success' or 'VERDICT: failed'.
    """
    parts = ["Compare the BEFORE and AFTER screenshots of a UI to determine if the last action succeeded.\n\n"]
    if action_str:
        parts.append(f"Action taken: {action_str}\n")
    if expected_outcome:
        parts.append(f"Expected outcome: {expected_outcome}\n")
    parts.append(
        "\nRespond in this exact format — no other text after the VERDICT line:\n\n"
        "DESCRIPTION: <one sentence describing what changed or did not change>\n"
        "VERDICT: success\n\n"
        "OR:\n\n"
        "DESCRIPTION: <one sentence describing what changed or did not change>\n"
        "VERDICT: failed\n\n"
        "Rules:\n"
        "- VERDICT: success — the UI changed meaningfully in the expected direction\n"
        "- VERDICT: failed — the screenshots are identical or the change is unrelated to the intended action\n"
        "- You MUST output the VERDICT line. It MUST be the last line of your response.\n"
        "- Do NOT add any text after the VERDICT line."
    )
    return "".join(parts)


def element_qa_prompt(question: str) -> str:
    """
    Perception: QA-style grounding — ask a specific question about the current screenshot.
    E.g. 'Where is the Submit button? Provide normalized coordinates (0-1000) for its center.'
    """
    return (
        f"{question}\n\n"
        "Base your answer only on what is clearly visible in the screenshot. "
        "For coordinates, use normalized values 0-1000 where (0,0) is the top-left corner. "
        "If the element is not visible, say so explicitly."
    )


def call_user_prompt(reason: str) -> str:
    """
    Format a CallUser reason for Firestore storage and UI display.
    Strips any 'Thought:' prefix from the agent's raw thought text.
    """
    clean = reason.strip()
    if clean.lower().startswith("thought:"):
        clean = clean[len("thought:"):].strip()
    elif clean.lower().startswith("reflection:"):
        clean = clean[len("reflection:"):].strip()
    return clean


def step_instruction(step: dict[str, Any], step_index: int, total: int) -> str:
    """Convert a workflow step to instruction text for the agent."""
    action = step.get("action", "wait")
    params = step.get("params", {})
    context = step.get("context", "").strip()
    expected_outcome = step.get("expected_outcome", "").strip()

    parts = [f"Step {step_index}/{total}:"]
    if context:
        parts.append(f"Context: {context}")
    if expected_outcome:
        parts.append(f"Expected outcome: {expected_outcome}")

    if action == "navigate":
        url = params.get("url", "https://www.google.com")
        parts.append(f"Go to {url}")
    elif action == "click_at":
        desc = params.get("description", context or "the element")
        x = params.get("x")
        y = params.get("y")
        parts.append(f"Click {desc}. Locate it visually in the screenshot and provide Click(x, y) with normalized coords.")
        if x is not None and y is not None:
            parts.append(f"Synthesized coordinates hint: approximately ({x}, {y}) — verify visually before clicking.")
    elif action == "type_text_at":
        text = params.get("text", "")
        desc = params.get("description", "the input field")
        parts.append(f"Type '{text}' into {desc}.")
    elif action == "scroll":
        direction = params.get("direction", "down")
        distance = params.get("distance", params.get("amount", 300))
        parts.append(f"Scroll {direction} by {distance}px")
    elif action == "wait":
        secs = params.get("seconds", 2)
        parts.append(f"Wait {secs} seconds")
    elif action == "wait_for_element":
        desc = params.get("description", "the expected element")
        parts.append(f"Wait for {desc} to appear on screen")
    elif action == "select_option":
        value = params.get("value", "")
        desc = params.get("description", "the dropdown")
        parts.append(f"Select option '{value}' in {desc}")
    elif action == "press_key":
        key = params.get("key", "Enter")
        parts.append(f"Press the {key} key")
    elif action == "hover":
        desc = params.get("description", "the element")
        x = params.get("x")
        y = params.get("y")
        parts.append(f"Hover over {desc}.")
        if x is not None and y is not None:
            parts.append(f"Approximate location: ({x}, {y}) — verify visually.")
    elif action == "hotkey":
        keys = params.get("keys", [])
        desc = params.get("description", "")
        combo = "+".join(keys) if keys else "unknown"
        parts.append(f"Press keyboard shortcut {combo}" + (f" — {desc}" if desc else ""))
    elif action == "open_app":
        app_name = params.get("appName", "")
        parts.append(f"Launch the application '{app_name}'")
    elif action == "focus_app":
        app_name = params.get("appName", "")
        parts.append(f"Bring '{app_name}' to the foreground")
    elif action == "double_click":
        desc = params.get("description", "the element")
        x = params.get("x")
        y = params.get("y")
        parts.append(f"Double-click {desc}.")
        if x is not None and y is not None:
            parts.append(f"Approximate location: ({x}, {y}) — verify visually.")
    elif action == "right_click":
        desc = params.get("description", "the element")
        x = params.get("x")
        y = params.get("y")
        parts.append(f"Right-click {desc} to open context menu.")
        if x is not None and y is not None:
            parts.append(f"Approximate location: ({x}, {y}) — verify visually.")
    elif action == "drag":
        desc = params.get("description", "from source to destination")
        x = params.get("x")
        y = params.get("y")
        x2 = params.get("x2")
        y2 = params.get("y2")
        parts.append(f"Drag {desc}.")
        if all(v is not None for v in [x, y, x2, y2]):
            parts.append(f"From approximately ({x}, {y}) to ({x2}, {y2}) — verify visually.")
    else:
        parts.append(f"{action}: {params}")

    return " ".join(parts)
