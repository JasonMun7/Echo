"""
POST /api/synthesize: create workflow from video or screenshots using Gemini 2.5 Pro.
"""

import asyncio
import json
import re
import time
import uuid
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from google import genai
from google.genai import types
import firebase_admin.firestore
from google.cloud.firestore import SERVER_TIMESTAMP

from app.auth import get_current_uid, get_firebase_app
from app.config import GEMINI_API_KEY
from app.services.gcs import upload_file, download_file as gcs_download_file

router = APIRouter(prefix="/synthesize", tags=["synthesis"])

SYNTHESIS_PROMPT = """You are an expert workflow extraction system designed to produce training data for a pure Vision-Language Model (VLM) UI agent called EchoPrism. EchoPrism NEVER reads the DOM — it relies entirely on visual descriptions and normalized pixel coordinates to locate and interact with UI elements. Your output must be precise enough that EchoPrism can re-locate every element purely from screenshots.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 0 — RECOGNIZE INTEGRATION OPPORTUNITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before extracting steps, scan all frames for the following known applications:
- Slack (slack.com, app.slack.com) → use action "api_call" with integration "slack"
- Gmail (mail.google.com) → use action "api_call" with integration "gmail"
- Google Sheets (docs.google.com/spreadsheets) → use action "api_call" with integration "google_sheets"
- Google Calendar (calendar.google.com) → use action "api_call" with integration "google_calendar"
- Notion (notion.so) → use action "api_call" with integration "notion"
- GitHub (github.com) → use action "api_call" with integration "github"
- Linear (linear.app) → use action "api_call" with integration "linear"

When you see the user performing a simple action in one of these apps (sending a message, creating an issue, writing to a spreadsheet), prefer generating a single "api_call" step with the appropriate method and inferred args over multiple click/type steps.

For api_call steps: action="api_call", params={"integration": "slack", "method": "send_message", "args": {"channel": "#general", "text": "..."}}
Only fall back to click_at steps for these apps if the action is too complex or ambiguous to represent as an api_call.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — CLASSIFY WORKFLOW TYPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before extracting steps, determine the workflow type:
- "browser": Activity is primarily inside a web browser (Chrome, Safari, Firefox, Edge). Steps involve navigating URLs, clicking web elements, filling forms, selecting dropdowns.
- "desktop": Activity involves native OS applications (Finder, terminal, desktop apps, system menus). Steps involve opening apps, hotkeys, right-clicking, double-clicking native UI.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — STUDY EVERY FRAME BEFORE WRITING COORDINATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For each interactive action (click_at, type_text_at, select_option, hover, right_click, double_click, drag):
a. Identify the target element across MULTIPLE frames to confirm its position is stable.
b. Measure the element's center in raw pixels: (pixel_x, pixel_y).
c. Convert to normalized 0-1000 scale:
   x = round(pixel_x / screen_width * 1000)
   y = round(pixel_y / screen_height * 1000)
d. Clamp x and y to [0, 1000].
e. NEVER use exactly 500/500 as a guess — only if the element is genuinely in the exact center.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — WRITE MAXIMALLY SPECIFIC DESCRIPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every "description" field must enable EchoPrism to re-locate the element from a screenshot alone. Include ALL of:
- Element type (button, link, text input, dropdown, checkbox, icon, tab, menu item, etc.)
- Visible label text (exact, in single quotes) OR a clear visual descriptor if there is no text
- Color or visual style if distinctive (blue, green, outlined, filled, icon-only)
- Screen region (top-left, top-center, top-right, bottom-left, bottom-center, bottom-right, center, left sidebar, right panel, header, footer, modal, etc.)
- Any parent container or section that helps disambiguate (e.g. "inside the 'Billing' card", "in the navigation bar", "in the search results row")

Examples of GOOD descriptions:
- "blue 'Sign In' button in the bottom-center of the login modal"
- "white 'Email' text input field with placeholder 'you@example.com' in the top-center of the login form"
- "grey 'Country' dropdown labeled 'Select country' in the middle of the 'Shipping Address' section"
- "red trash-can icon button in the top-right corner of the 'Item 2' card"
- "left-sidebar 'Dashboard' menu item with a house icon, highlighted with a blue background"

Examples of BAD descriptions (do NOT produce these):
- "the button" — too vague
- "input field" — no location or label
- "Submit" — missing element type and region
- "#submit-btn" — CSS selector, FORBIDDEN

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "title": "<5-8 word descriptive title summarising what the workflow accomplishes>",
  "workflow_type": "browser" | "desktop",
  "steps": [
    {
      "action": "<action_type>",
      "context": "<WHY this step is needed — purpose in the overall flow, not just what it does>",
      "params": { ... action-specific params ... },
      "expected_outcome": "<what is VISUALLY DIFFERENT on screen AFTER this action succeeds>"
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BROWSER ACTIONS (use only when workflow_type is "browser")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- navigate:
  { "url": "https://...", "description": "Navigate to the target URL" }
  expected_outcome: "Page loads and URL bar shows <url>"

- click_at:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<maximally specific description>" }
  expected_outcome: "<visible change: modal opens, page navigates, button highlights, etc.>"

- type_text_at:
  { "x": <int 0-1000>, "y": <int 0-1000>, "text": "{{variable_name}}", "description": "<maximally specific description of the input field>" }
  expected_outcome: "Text '{{variable_name}}' appears in the field"

- scroll:
  { "x": <int 0-1000>, "y": <int 0-1000>, "direction": "down" | "up", "distance": <pixels> }
  expected_outcome: "Page content scrolls <direction> revealing more content"

- wait_for_element:
  { "description": "<what to wait for — describe the element that must become visible or disappear>" }
  expected_outcome: "<element description> becomes visible / loading indicator disappears"
  USE THIS whenever waiting for a page load, navigation, API response, or content to appear. Do NOT use "wait" for these cases.

- select_option:
  { "x": <int 0-1000>, "y": <int 0-1000>, "value": "<option_value>", "description": "<maximally specific description of the dropdown>" }
  expected_outcome: "Dropdown shows '<option_value>' as selected"

- hover:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<element> that reveals a submenu or tooltip on hover" }
  expected_outcome: "Submenu or tooltip becomes visible"

- press_key:
  { "key": "Enter" | "Tab" | "Escape" | "ArrowDown" | etc., "description": "<why pressing this key>" }
  expected_outcome: "<visible result: form submits, dialog closes, focus moves, etc.>"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESKTOP ACTIONS (use only when workflow_type is "desktop")
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- click_at:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<maximally specific description>" }
  expected_outcome: "<visible change>"

- right_click:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<maximally specific description>" }
  expected_outcome: "Context menu appears with options"

- double_click:
  { "x": <int 0-1000>, "y": <int 0-1000>, "description": "<maximally specific description>" }
  expected_outcome: "<file opens / app launches / item is renamed>"

- type_text_at:
  { "x": <int 0-1000>, "y": <int 0-1000>, "text": "{{variable_name}}", "description": "<maximally specific description of the input field>" }
  expected_outcome: "Text '{{variable_name}}' appears in the field"

- hotkey:
  { "keys": ["cmd", "c"], "description": "<what this hotkey accomplishes>" }
  expected_outcome: "<visible result>"

- press_key:
  { "key": "enter" | "escape" | "tab" | etc., "description": "<why pressing this key>" }
  expected_outcome: "<visible result>"

- scroll:
  { "x": <int 0-1000>, "y": <int 0-1000>, "direction": "down" | "up", "distance": <pixels> }
  expected_outcome: "Content scrolls <direction>"

- drag:
  { "x": <int 0-1000>, "y": <int 0-1000>, "x2": <int 0-1000>, "y2": <int 0-1000>, "description": "Drag <source description> to <destination description>" }
  expected_outcome: "<item moved / window resized>"

- wait:
  { "seconds": <int> }
  expected_outcome: "Application completes its operation after the wait"

- open_app:
  { "appName": "<AppName>", "description": "Launch <AppName> to begin the workflow" }
  expected_outcome: "<AppName> window opens and is in focus"

- focus_app:
  { "appName": "<AppName>", "description": "Bring <AppName> to the foreground" }
  expected_outcome: "<AppName> window becomes the active window"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RULES — VIOLATIONS WILL BREAK THE AGENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. COORDINATES: Study multiple frames. Use real pixel positions converted to 0-1000 scale. Never fabricate or guess with 500/500.
2. DESCRIPTION: Every action with a target element MUST have a maximally specific "description" (see Step 3 above). This is the ONLY way EchoPrism can find the element.
3. EXPECTED_OUTCOME: Every step MUST include "expected_outcome" at the top level, describing the VISUAL change on screen.
4. CONTEXT: Each "context" must explain WHY the step is needed, not just what it does. Include the workflow goal this step serves.
5. NO SELECTORS: STRICTLY FORBIDDEN — do NOT output CSS selectors, XPath, DOM IDs, class names, or any HTML/DOM reference. This is a pure vision system.
6. NO RISK FIELD: Do not include a "risk" field.
7. VARIABLES: Use {{variable_name}} for any user-provided input (email, password, search terms, filenames). Use descriptive snake_case variable names (e.g. {{recipient_email}}, {{search_query}}).
8. WAIT_FOR_ELEMENT over WAIT: For any page load, navigation, content appearing, or API response — use wait_for_element. Only use wait for fixed-duration pauses (animations, system dialogs).
9. INSERT WAIT_FOR_ELEMENT AFTER: navigate, click_at that triggers navigation/modal/content load, press_key that submits a form, or any step that causes a visible page transition.
10. DEDUPLICATION: Skip consecutive identical (action + params) steps.
11. OUTPUT: ONLY valid JSON, no markdown fences, no extra text."""


def _upload_to_gemini(content: bytes, mime_type: str) -> types.Part:
    """Upload file to Gemini Files API and return Part for generate_content."""
    client = genai.Client(api_key=GEMINI_API_KEY)
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        f.write(content)
        path = f.name
    try:
        uploaded = client.files.upload(
            file=path, config=types.UploadFileConfig(mime_type=mime_type)
        )
        # Poll until active
        while getattr(uploaded.state, "name", str(uploaded.state)) == "PROCESSING":
            time.sleep(1)
            uploaded = client.files.get(name=uploaded.name)
        state_name = getattr(uploaded.state, "name", str(uploaded.state))
        if state_name != "ACTIVE":
            raise ValueError(f"File upload failed: {state_name}")
        uri = getattr(uploaded, "uri", None) or uploaded.name
        return types.Part.from_uri(file_uri=uri, mime_type=mime_type)
    finally:
        Path(path).unlink(missing_ok=True)


@router.post("")
async def synthesize(
    uid: str = Depends(get_current_uid),
    video: UploadFile | None = File(None),
    video_gcs_path: str | None = Form(None),
    workflow_name: str | None = Form(None),
    screenshots: list[UploadFile] = File(default=[]),
):
    """Create workflow from video or screenshots via Gemini 2.5 Pro.

    Video can be supplied either as a direct upload (``video`` field) **or** as
    a pre-uploaded GCS path (``video_gcs_path``).  The latter avoids the Cloud
    Run 32 MB request-body limit for large video files.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    has_video = bool(video or video_gcs_path)

    # Accept video XOR screenshots
    if has_video and screenshots:
        raise HTTPException(
            status_code=400, detail="Provide either video or screenshots, not both"
        )
    if not has_video and not screenshots:
        raise HTTPException(status_code=400, detail="Provide video or screenshots")

    workflow_id = str(uuid.uuid4())
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)

    # Create workflow doc (processing)
    workflow_ref = db.collection("workflows").document(workflow_id)
    workflow_ref.set(
        {
            "owner_uid": uid,
            "name": workflow_name or "Processing…",
            "status": "processing",
            "createdAt": SERVER_TIMESTAMP,
            "updatedAt": SERVER_TIMESTAMP,
        }
    )

    try:
        # Upload to GCS
        gcs_prefix = f"{uid}/{workflow_id}"
        parts: list[types.Part] = []
        mime_map = {
            "video/mp4": "video/mp4",
            "image/png": "image/png",
            "image/jpeg": "image/jpeg",
            "image/webp": "image/webp",
        }

        if video:
            content = await video.read()
            ct = video.content_type or "video/mp4"
            blob_name = f"{gcs_prefix}/{video.filename or 'video.mp4'}"
            upload_file(blob_name, content, ct)
            mime = mime_map.get(ct, "video/mp4")
            part = _upload_to_gemini(content, mime)
            parts.append(part)
        elif video_gcs_path:
            # File was uploaded directly to GCS by the browser via signed URL.
            # Parse gs://bucket/blob-name  (bucket portion is ignored; we use
            # the configured GCS_BUCKET so we don't trust user input for it).
            match = re.match(r"gs://[^/]+/(.+)", video_gcs_path)
            if not match:
                raise HTTPException(
                    status_code=400, detail="Invalid video_gcs_path format"
                )
            blob_name = match.group(1)
            # Determine MIME from path extension
            ext = blob_name.rsplit(".", 1)[-1].lower() if "." in blob_name else ""
            ct = {
                "mp4": "video/mp4",
                "webm": "video/webm",
                "mov": "video/mp4",
                "quicktime": "video/mp4",
            }.get(ext, "video/mp4")
            content = gcs_download_file(blob_name)
            # Keep a copy in the workflow-scoped GCS prefix for reference
            dest_blob = f"{gcs_prefix}/{blob_name.rsplit('/', 1)[-1]}"
            upload_file(dest_blob, content, ct)
            mime = mime_map.get(ct, "video/mp4")
            part = _upload_to_gemini(content, mime)
            parts.append(part)
        else:
            sorted_screenshots = sorted(screenshots, key=lambda f: f.filename or "")
            for i, f in enumerate(sorted_screenshots):
                content = await f.read()
                ct = f.content_type or "image/png"
                blob_name = f"{gcs_prefix}/{f.filename or f'image_{i}.png'}"
                upload_file(blob_name, content, ct)
                mime = mime_map.get(ct, "image/png")
                part = _upload_to_gemini(content, mime)
                parts.append(part)

        # Call Gemini 2.5 Pro
        client = genai.Client(api_key=GEMINI_API_KEY)
        contents = [
            types.Content(
                role="user", parts=[types.Part.from_text(text=SYNTHESIS_PROMPT)] + parts
            )
        ]
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        )
        response = client.models.generate_content(
            model="gemini-2.5-pro",
            contents=contents,
            config=config,
        )
        if not response.text:
            raise ValueError("Empty response from Gemini")
        data = json.loads(response.text)
        steps_data = data.get("steps", [])

        # Post-processing: clamp coords, deduplicate, extract variables
        variables: set[str] = set()
        processed_steps: list[dict] = []
        prev_key: tuple | None = None
        for s in steps_data:
            params = dict(s.get("params", {}))
            # Clamp normalized coords to [0, 1000]
            for coord_key in ("x", "y", "x2", "y2"):
                if coord_key in params:
                    try:
                        params[coord_key] = max(0, min(1000, int(float(params[coord_key]))))
                    except (TypeError, ValueError):
                        params[coord_key] = 500
            # Extract {{variable}} templates
            for val in list(params.values()) + [s.get("context", "")]:
                if isinstance(val, str):
                    for m in re.findall(r"\{\{(\w+)\}\}", val):
                        variables.add(m)
            # Deduplicate consecutive identical (action, params) steps
            step_key = (s.get("action", ""), json.dumps(params, sort_keys=True))
            if step_key == prev_key:
                continue
            prev_key = step_key
            s_copy = dict(s)
            s_copy["params"] = params
            processed_steps.append(s_copy)

        steps_data = processed_steps

        # Batch-write steps (no risk field)
        for i, s in enumerate(steps_data):
            step_id = str(uuid.uuid4())
            step_ref = workflow_ref.collection("steps").document(step_id)
            step_ref.set(
                {
                    "order": i,
                    "action": s.get("action", "wait"),
                    "context": s.get("context", ""),
                    "params": s.get("params", {}),
                    "expected_outcome": s.get("expected_outcome", ""),
                }
            )

        # User-provided name takes priority over Gemini-generated title
        title = workflow_name or data.get("title") or f"Workflow {workflow_id[:8]}"
        workflow_type = data.get("workflow_type", "browser")
        if workflow_type not in ("browser", "desktop"):
            workflow_type = "browser"

        # Store the first image/frame GCS path as a thumbnail reference
        from app.config import GCS_BUCKET as _GCS_BUCKET
        thumbnail_gcs_path: str | None = None
        if not has_video and screenshots:
            first_ss = sorted(screenshots, key=lambda f: f.filename or "")[0]
            blob_name_thumb = f"{gcs_prefix}/{first_ss.filename or 'image_0.png'}"
            thumbnail_gcs_path = f"gs://{_GCS_BUCKET}/{blob_name_thumb}"
        elif has_video:
            # Use first screenshot taken during synthesis if we stored one,
            # otherwise leave unset — video thumbnails can be extracted later.
            pass

        update_payload: dict = {
            "name": title,
            "workflow_type": workflow_type,
                "status": "ready",
                "updatedAt": SERVER_TIMESTAMP,
            "variables": sorted(variables),
            }
        if thumbnail_gcs_path:
            update_payload["thumbnail_gcs_path"] = thumbnail_gcs_path
        workflow_ref.update(update_payload)
        return {"workflow_id": workflow_id}
    except Exception as e:
        workflow_ref.update(
            {
                "status": "failed",
                "error": str(e),
                "updatedAt": SERVER_TIMESTAMP,
            }
        )
        raise HTTPException(status_code=500, detail=str(e))


FROM_DESCRIPTION_PROMPT = """You are an expert workflow synthesis system for EchoPrism, a pure Vision-Language Model UI automation agent.

Given a natural language description of a workflow, produce a structured list of steps.

STEP 0 — INTEGRATION RECOGNITION:
If the description mentions any of these apps, prefer api_call steps over click sequences:
- Slack → action "api_call", integration "slack"
- Gmail / email → action "api_call", integration "gmail"
- Google Sheets / spreadsheet → action "api_call", integration "google_sheets"
- Google Calendar → action "api_call", integration "google_calendar"
- Notion → action "api_call", integration "notion"
- GitHub → action "api_call", integration "github"
- Linear → action "api_call", integration "linear"

For UI actions (navigate, click, type, scroll, etc.), provide:
- action: one of navigate | click_at | type_text_at | scroll | wait | press_key | select_option | hover
- params: url (for navigate), description (for click_at/type_text_at), text (for type_text_at), direction+distance (for scroll), key (for press_key), value+description (for select_option)
- context: what the user is trying to accomplish at this step
- expected_outcome: what should be visible after this action succeeds

For api_call actions, provide:
- action: "api_call"
- params: { integration, method, args: {} }  (args are best-guess based on description)
- context: what API operation this represents

Output ONLY valid JSON — no markdown, no code fences. Format:
{
  "title": "short workflow title",
  "workflow_type": "browser" or "desktop",
  "steps": [
    {
      "action": "...",
      "context": "...",
      "params": {},
      "expected_outcome": "..."
    }
  ]
}"""


async def synthesize_from_description_impl(
    uid: str,
    name: str,
    description: str,
    workflow_type: str,
    db,
) -> str:
    """Generate workflow steps from a natural language description. Returns workflow_id."""
    workflow_id = str(uuid.uuid4())
    workflow_ref = db.collection("workflows").document(workflow_id)
    workflow_ref.set({
        "name": name,
        "status": "processing",
        "owner_uid": uid,
        "workflow_type": workflow_type if workflow_type in ("browser", "desktop") else "browser",
        "createdAt": SERVER_TIMESTAMP,
        "updatedAt": SERVER_TIMESTAMP,
    })

    client = genai.Client(api_key=GEMINI_API_KEY)
    prompt = FROM_DESCRIPTION_PROMPT + f"\n\nWorkflow description:\n{description}"

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-pro",
        contents=prompt,
    )

    raw = response.text or ""
    # Strip markdown fences
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r"\s*```\s*$", "", raw.strip(), flags=re.MULTILINE)
    raw = raw.strip()

    data = json.loads(raw)
    steps_data = data.get("steps", [])

    for i, s in enumerate(steps_data):
        step_id = str(uuid.uuid4())
        workflow_ref.collection("steps").document(step_id).set({
            "order": i,
            "action": s.get("action", "wait"),
            "context": s.get("context", ""),
            "params": s.get("params", {}),
            "expected_outcome": s.get("expected_outcome", ""),
        })

    actual_type = data.get("workflow_type", workflow_type)
    if actual_type not in ("browser", "desktop"):
        actual_type = "browser"

    workflow_ref.update({
        "name": data.get("title") or name,
        "workflow_type": actual_type,
        "status": "ready",
        "updatedAt": SERVER_TIMESTAMP,
    })
    return workflow_id


from pydantic import BaseModel as PydanticBaseModel


class DescriptionSynthesisRequest(PydanticBaseModel):
    name: str = "My Workflow"
    description: str
    workflow_type: str = "browser"


@router.post("/from-description")
async def synthesize_from_description_endpoint(
    body: DescriptionSynthesisRequest,
    uid: str = Depends(get_current_uid),
):
    """Create a workflow from a natural language description (no video required)."""
    app = get_firebase_app()
    db = firebase_admin.firestore.client(app)
    try:
        workflow_id = await synthesize_from_description_impl(
            uid, body.name, body.description, body.workflow_type, db
        )
        return {"workflow_id": workflow_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
