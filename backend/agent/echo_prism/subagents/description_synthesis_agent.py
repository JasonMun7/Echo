"""
EchoPrism Description-to-Workflow Subagent — synthesize workflow from natural language.
"""
import asyncio
import json
import re
from typing import Any

try:
    from google.genai import types as gtypes
except ImportError:
    gtypes = None  # type: ignore[assignment]


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


async def synthesize_workflow_from_description(
    description: str,
    name: str,
    workflow_type: str,
    client: Any,
    model: str = "gemini-2.5-flash",
) -> dict:
    """
    Generate workflow steps from a natural language description.

    Returns dict with keys: title, workflow_type, steps
    """
    prompt = FROM_DESCRIPTION_PROMPT + f"\n\nWorkflow description:\n{description}"

    config = None
    if gtypes:
        config = gtypes.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=prompt,
        config=config,
    )

    raw = response.text or ""
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    raw = re.sub(r"\s*```\s*$", "", raw.strip(), flags=re.MULTILINE)
    raw = raw.strip()

    data = json.loads(raw)
    return {
        "title": data.get("title") or name,
        "workflow_type": data.get("workflow_type", workflow_type),
        "steps": data.get("steps", []),
    }
