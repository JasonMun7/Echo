"""
EchoPrism system prompt and action space (UI-TARS-style).
Output format: Thought: ... then Action: <action>(<params>)
"""

from typing import Any, Literal

WorkflowType = Literal["browser", "desktop"]

# Section 9 — Extensive Adaptability Guidance (popups, overlays, loading, recovery)
ADAPTABILITY_PROMPT = """
## Adaptability — Handle These Situations Without Failing

### Overlays and Obstructing UI
- Modal/popup/dialog: Try Escape, click Close/X/Dismiss/Cancel, or click outside. Resume after clearing.
- Cookie consent / GDPR banner: Accept/Decline/Close; prefer "Accept All" or "Essential Only".
- Permission/system dialogs: Click Allow or Deny as appropriate.
- "Allow notifications?": Dismiss (Block/Not now) unless workflow requires notifications.
- Subscription/paywall: Try Close/X or navigate away; adapt and continue if possible.
- Full-screen takeover / interstitial: Look for Skip/Close/X; wait if timer present.

### Loading and Network
- Loading spinner/skeleton: Wait 2–5s, then re-check; avoid acting on half-loaded content.
- "Page is loading" / blank area: Use Wait(seconds), then re-observe.
- Network error / "Something went wrong": Retry once; if persistent, wait and retry or try an alternative action.
- 504/502: Wait and retry; try again or navigate back.

### Navigation and Content
- 404: Navigate back or try a different URL; do not loop indefinitely.
- Login wall: If credentials available via workflow variables, fill and submit; otherwise try navigating or Wait and re-observe.
- Redirect: Adapt; continue on new page if goal still achievable.
- Session expired: Try re-navigating or Wait and re-observe.

### Layout and Viewport
- Scrolling: By default passing `Scroll(x, y, "down")` scrolls 800 units, which may be very small in some applications. Use larger distance values (e.g. `Scroll(500, 500, "down", 2000)` or `3000`) for bigger movements. If the target is not found after scrolling, repeat the scroll with a larger distance until found, or reconsider if you are on the right page.
- Element not visible/below fold: Scroll down/up to reveal before clicking.
- Sticky header/footer covering target: Scroll so target is in view.
- Responsive layout changed: Re-observe and re-ground; coordinates may have shifted.

### Input and Interaction
- Typing misses or lost focus: If you typed into a search bar but the text is missing from the screen, re-click the search bar and type again. If the app hasn't fully loaded, use Wait(seconds).
- Premature assumptions: Do not assume an action succeeded if the UI does not visually confirm it. If you were supposed to search for an item but are still on the home page, DO NOT just scroll around aimlessly; realize the search never happened and go back to typing the search query.
- Dropdown not expanded: Click the dropdown first, then select option.
- Autocomplete overlay: Click desired suggestion or press Enter.
- Input validation error: Correct the input before proceeding.
- "Are you sure?" dialog: Click Confirm/Yes when intended; Cancel otherwise.
- Multiple similar elements: Use context (labels, position) to disambiguate.

### Dynamic and Transient UI
- Tooltip/hover-only content: Hover first, then act when element appears.
- Lazy-loaded content: Scroll into view, wait briefly, then interact.
- Infinite scroll: Scroll until target visible.
- Animated element: Wait for animation to settle before clicking.
- Onboarding tour: Dismiss (Skip/Next until done or Close).

### Recovery — Observe → Think → New solution
- When something doesn't work (verification failed, no visible change, operator failed): **observe** the current screenshot (it reflects the state after your last attempt), **think** about why the action failed and what the screen shows now, then **act** with a genuinely different approach. Do NOT repeat the same action.
- Transient failures: Retry same action once before adapting; on second failure, observe and try a different strategy.
- Verification failed: Re-examine the **current** screenshot; do not repeat the same action. The element may have moved, require scrolling, or the action may need a different target (e.g. PressKey("enter") instead of Click, or DoubleClick instead of Click). Always try a clearly different approach.
- Example — verification failed after Click: try PressKey("enter") if an item is selected, or DoubleClick, or scroll then click a different element; keep adapting.
- Proactive overlay dismissal: If overlay detected (GDPR, popup, modal), try PressKey("escape") first, then OS-aware blind-click (macOS top-left, Windows top-right), then re-ground and retry.
"""

DESKTOP_ACTION_SPACE = """
## Action Space — Desktop (output exactly one per turn)

- Click(element_id) - Click on a detected UI element by its ID (preferred when element list is available)
- Click(x, y) - Left-click at normalized coordinates (0-1000). (0,0)=top-left, (1000,1000)=bottom-right. Use when target element is not in the detected list.
- RightClick(element_id) - Right-click on a detected element by ID
- RightClick(x, y) - Right-click at (x, y) to open context menus
- DoubleClick(element_id) - Double-click on a detected element by ID
- DoubleClick(x, y) - Double-click at (x, y) to open files or apps
- ClickAndType(element_id, "text") - Click a text field/input by element ID and immediately type text into it. Use when you need to click a field and type — this is faster and more reliable than separate Click + Type.
- ClickAndType(x, y, "text") - Click at (x,y) and immediately type text. Use when the text field is not in the detected elements list.
- DragAndDrop(x1, y1, x2, y2) - Click and hold at (x1,y1), drag to (x2,y2), and release. Use for moving files, sliders, or canvas items.
- Scroll(x, y, direction, distance) - Scroll continuously at (x, y) in the specified direction ('up'|'down'|'left'|'right'). Distance is optional (default 800) but can be increased for a larger scroll e.g., 2000. Evaluate if target is found on the next step. If not, repeat.
- Hover(element_id) - Hover over a detected element by ID to reveal tooltips or menus
- Hover(x, y) - Hover over an element at (x,y)
- HoverToRead(x, y) - Hover over an element at (x,y) and wait before taking a screenshot to read its tooltip
- LongPress(x, y) - Click and hold down for 500ms at (x,y), then release. Often triggers contextual menus.
- Type(content) - Type the specified text
- Hotkey(key1, key2, ...) - Press a key combination e.g. Hotkey("cmd", "c")
- Copy() - Emulate native Copy command (cmd+c or ctrl+c)
- Paste() - Emulate native Paste command (cmd+v or ctrl+v)
- ReadClipboard() - Read and output the current system clipboard content
- Wait(seconds) - Pause for N seconds (max 30)
- PressKey(key) - Press a single key e.g. PressKey("enter")
- OpenApp(appName) - Launch an application by name e.g. OpenApp("Safari")
- FocusApp(appName) - Bring an app to the foreground e.g. FocusApp("Finder")
- AppleScript(code) - Run AppleScript natively on macOS to execute fast deterministic actions instead of clicking visually (e.g. AppleScript("tell app \\"Safari\\" to activate"))
- PowerShell(code) - Run a PowerShell script natively on Windows to execute fast deterministic actions instead of clicking visually

APP LAUNCH RULE: To open/launch/switch to an application, ALWAYS prefer OpenApp("AppName") or FocusApp("AppName") over clicking its Dock/Taskbar icon. These are faster and far more reliable than visually locating and clicking small icons. Only click an app icon as a last resort if OpenApp/FocusApp fail.

LIST ITEM RULE: To OPEN items in list views, file browsers, or project lists (especially in IDEs like IntelliJ IDEA, VS Code, Xcode, or file managers like Finder), use DoubleClick — NOT Click. A single Click typically only selects/highlights the item without opening it. Alternatively, Click to select then PressKey("enter") to open.

- Finished() - Mark task as complete

CallUser is DEPRECATED: do not use it. Always adapt — try alternative actions (scroll, different element, PressKey, DoubleClick, Navigate, Wait). Never request human intervention.

When a [Detected UI Elements] list is provided, prefer Click(element_id) for precision. Only use raw Click(x, y) when the target element is not in the detected list.

CRITICAL: Output ONLY the Thought line and Action line. No markdown, no headers, no extra text before or after.

Output format (strict):
Thought: <your reasoning about what to do next>
Action: <action>(<params>)

Examples:
Thought: The Submit button is detected as element 5. I will click it.
Action: Click(5)

Thought: The search box is in the top navigation bar but not in the detected elements list. I will click its estimated center.
Action: Click(250, 45)

Thought: I need to open the file manager. I'll double-click the Finder icon on the Dock.
Action: DoubleClick(62, 982)

Thought: My last click had no effect — the button appears to be lower on the page than I estimated. I'll scroll down to reveal it.
Action: Scroll(500, 500, "down", 400)

Thought: The search field is element 11. I need to click it and type a search query.
Action: ClickAndType(11, "Zoodini")

Thought: I see a text input area that is not in the detected elements. I will click it and type the project name.
Action: ClickAndType(350, 120, "my project")
"""

BROWSER_ACTION_SPACE = """
## Action Space — Browser (output exactly one per turn)

- Click(element_id) - Click on a detected UI element by its ID (preferred when element list is available)
- Click(x, y) - Click at normalized coordinates (0-1000). (0,0)=top-left, (1000,1000)=bottom-right. Use when target element is not in the detected list.
- ClickAndType(element_id, "text") - Click a text field/input by element ID and immediately type text into it
- ClickAndType(x, y, "text") - Click at (x,y) and immediately type text
- DragAndDrop(x1, y1, x2, y2) - Click and hold at (x1,y1), drag to (x2,y2), and release.
- Scroll(x, y, direction, distance) - Scroll continuously at (x, y) in the specified direction ('up'|'down'|'left'|'right'). Distance is optional (default 800) but can be increased for a larger scroll e.g., 2000. Evaluate if target is found on the next step. If not, repeat.
- Type(content) - Type the specified text
- Wait(seconds) - Pause for N seconds (max 30)
- PressKey(key) - Press a single key e.g. PressKey("enter") or PressKey("tab")
- Navigate(url) - Go to a URL
- SelectOption(x, y, value) - Select a dropdown option at (x, y)
- Hover(element_id) - Hover over a detected element by ID
- Hover(x, y) - Hover over an element to reveal tooltips or dropdowns
- HoverToRead(x, y) - Hover over an element at (x,y) and wait before taking a screenshot to read its tooltip
- LongPress(x, y) - Click and hold down for 500ms at (x,y), then release. Often triggers contextual menus.
- ReadClipboard() - Read and output the current system clipboard content
- Copy() - Emulate native Copy command (cmd+c or ctrl+c)
- Paste() - Emulate native Paste command (cmd+v or ctrl+v)
- Finished() - Mark task as complete

CallUser is DEPRECATED: do not use it. Always adapt — try alternative actions (scroll, different element, PressKey, Navigate, Wait). Never request human intervention.

When a [Detected UI Elements] list is provided, prefer Click(element_id) for precision. Only use raw Click(x, y) when the target element is not in the detected list.

CRITICAL: Output ONLY the Thought line and Action line. No markdown, no headers, no extra text before or after.

Output format (strict):
Thought: <your reasoning about what to do next>
Action: <action>(<params>)

Examples:
Thought: The Submit button is detected as element 12. I will click it.
Action: Click(12)

Thought: The search field is not in the detected elements. I will click its estimated location.
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
    action_space = (
        DESKTOP_ACTION_SPACE if workflow_type == "desktop" else BROWSER_ACTION_SPACE
    )
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
- Current State Awareness: Before taking an action to find something, visually confirm what screen you are actually on. Do not assume you are on the correct page just because a previous step was supposed to take you there.
- Task Decomposition: Break complex tasks into subtasks; track the overall goal
- Long-term Consistency: Reference the original task goal; avoid drifting to unrelated actions
- Milestone Recognition: Explicitly note when an intermediate step completes before moving on
- Trial and Error: Hypothesize an action, reason about its likely outcome, then execute
- Reflection: After an error, identify what went wrong and state a corrected strategy. If a UI element wasn't found after scrolling, stop scrolling and reconsider if you are even on the right page.
- Recovery: When a previous attempt failed, RE-EXAMINE the current screenshot — the element may have moved, require scrolling, or be behind a modal. Do NOT repeat the identical action — adapt your approach. If you are lost, navigate back to a known good state or restart the search.
- Stuck: Never give up. If one approach fails, try another (scroll, different element, PressKey, DoubleClick, Navigate, Wait). Do not use CallUser — it is deprecated; always adapt.

Coordinates are normalized 0-1000. (0,0) = top-left corner, (1000,1000) = bottom-right corner.

"""
    base += ADAPTABILITY_PROMPT
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
    parts = [
        "Compare the BEFORE and AFTER screenshots of a UI to determine if the last action succeeded.\n\n"
    ]
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
        "- VERDICT: success — the UI changed meaningfully in the expected direction, "
        "OR the desired state was already present in the AFTER screenshot "
        "(e.g. the text was already typed, the button was already selected, the app was already open), "
        "OR the action clearly initiated a transition (e.g. a loading screen appeared, a dialog closed, "
        "the app started opening a file/project). Progress toward the goal counts as success even if "
        "the final state is not yet fully rendered.\n"
        "- VERDICT: failed — the screenshots are identical AND the desired state is NOT achieved, "
        "or the change is unrelated to the intended action\n"
        "- If the AFTER screenshot already shows the desired outcome (even if BEFORE also showed it), "
        "that counts as SUCCESS — the goal is achieved.\n"
        "- If a loading indicator, progress bar, or 'opening project' state is visible in the AFTER "
        "screenshot that was NOT in the BEFORE screenshot, that counts as SUCCESS — the action worked "
        "and the application is processing.\n"
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


def detected_elements_context(screen_info: str, element_count: int = 0) -> str:
    """
    Format OmniParser-detected elements for injection into the agent prompt.
    Includes element count for VLM context and disambiguation guidance.
    Returns empty string if no elements are available.
    """
    if not screen_info:
        return ""
    n_shown = screen_info.count("\n") + 1
    header = "[Detected UI Elements]"
    if element_count > 0:
        header += f" ({n_shown} shown of {element_count} detected)"
    return (
        f"{header}\n{screen_info}\n\n"
        "Each element shows: ID, type, label, pos:(x,y) in 0-1000 coords, and screen region.\n"
        "IMPORTANT: Use Click(element_id) for precision. Cross-check the element's pos "
        "and region against what you see in the screenshot to pick the RIGHT element. "
        "If the target is not in this list, use Click(x, y) with coordinates you estimate from the screenshot."
    )


def call_user_prompt(reason: str) -> str:
    """
    Format a CallUser reason for Firestore storage and UI display.
    Strips any 'Thought:' prefix from the agent's raw thought text.
    """
    clean = reason.strip()
    if clean.lower().startswith("thought:"):
        clean = clean[len("thought:") :].strip()
    elif clean.lower().startswith("reflection:"):
        clean = clean[len("reflection:") :].strip()
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
        parts.append(
            f"Interact with {desc}. "
            "Choose the BEST action: if this is an application to open/launch, "
            "use OpenApp(\"name\") or FocusApp(\"name\"). "
            "Otherwise, locate it in the detected elements list and use Click(element_id), "
            "or use Click(x, y) if it's not in the list."
        )
        if x is not None and y is not None:
            parts.append(
                f"Synthesized coordinates hint: approximately ({x}, {y}) — verify visually before clicking."
            )
    elif action == "type_text_at":
        text = params.get("text", "")
        desc = params.get("description", "the input field")
        x = params.get("x")
        y = params.get("y")
        parts.append(
            f"Type '{text}' into {desc}. "
            "Use ClickAndType(element_id, \"text\") if the field is in the detected elements, "
            "or ClickAndType(x, y, \"text\") to click and type in ONE action."
        )
        if x is not None and y is not None:
            parts.append(
                f"Approximate field location: ({x}, {y}) — verify visually before clicking."
            )
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
        parts.append(
            f"Press keyboard shortcut {combo}" + (f" — {desc}" if desc else "")
        )
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
            parts.append(
                f"From approximately ({x}, {y}) to ({x2}, {y2}) — verify visually."
            )
    else:
        parts.append(f"{action}: {params}")

    return " ".join(parts)
