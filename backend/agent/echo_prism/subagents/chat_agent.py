"""
EchoPrism Chat Subagent — text chat with function calling.
Owns the generate_content call; router handles WebSocket I/O and tool execution.
"""
from __future__ import annotations

from typing import Any

try:
    from google.genai import types
except ImportError:
    types = None  # type: ignore[assignment]


SYSTEM_PROMPT = """You are EchoPrism, an intelligent assistant for the Echo workflow automation platform.

Your capabilities:
- List, create, run, pause, and manage workflows
- Start screen recordings for workflow synthesis
- Create workflows from natural language descriptions
- Redirect running agents with new instructions
- Dismiss CallUser alerts when the user has resolved the issue
- Answer questions about EchoPrism's status and capabilities
- Execute connected app integrations (Slack, Gmail, etc.)

Be concise, helpful, and proactive. When a user asks to run something, confirm with the workflow name only — never mention IDs, UUIDs, or internal identifiers in your responses.
When a user asks to change what the agent is doing mid-run, use redirect_run with their exact instruction.
When synthesizing from description, use the synthesize_from_description tool immediately — do not ask for confirmation first.

IMPORTANT: Never reveal workflow IDs, run IDs, document IDs, or any internal identifier to the user in your text responses. Use only human-readable names. IDs are for tool calls only, not for conversation.

Current session context: you have access to the user's Firestore data via tool calls.
Always use tools to get real data — never make up workflow names."""


def get_tool_declarations() -> list:
    """Return function declarations for EchoPrism Chat tools."""
    if not types:
        return []
    return [
        types.FunctionDeclaration(
            name="list_workflows",
            description="List the user's workflows. Returns names and IDs.",
            parameters=types.Schema(type="OBJECT", properties={}, required=[]),
        ),
        types.FunctionDeclaration(
            name="run_workflow",
            description="Start running a workflow by ID. Actually triggers the EchoPrism agent.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "workflow_id": types.Schema(type="STRING", description="The workflow ID to run"),
                    "workflow_name": types.Schema(type="STRING", description="Human-readable name for confirmation"),
                },
                required=["workflow_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="redirect_run",
            description="Inject a mid-run instruction for EchoPrism to follow on its next step.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "workflow_id": types.Schema(type="STRING"),
                    "run_id": types.Schema(type="STRING"),
                    "instruction": types.Schema(type="STRING"),
                },
                required=["workflow_id", "run_id", "instruction"],
            ),
        ),
        types.FunctionDeclaration(
            name="cancel_run",
            description="Cancel a running workflow execution.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "workflow_id": types.Schema(type="STRING"),
                    "run_id": types.Schema(type="STRING"),
                },
                required=["workflow_id", "run_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="dismiss_calluser",
            description="Dismiss a workflow run that is awaiting user input (status=awaiting_user).",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "workflow_id": types.Schema(type="STRING"),
                    "run_id": types.Schema(type="STRING"),
                },
                required=["workflow_id", "run_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="synthesize_from_description",
            description="Create a new workflow from a natural language description. Generates steps via EchoPrism.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "description": types.Schema(type="STRING", description="What the workflow should do"),
                    "workflow_name": types.Schema(type="STRING", description="Name for the new workflow"),
                    "workflow_type": types.Schema(type="STRING", description="'browser' or 'desktop'"),
                },
                required=["description", "workflow_name"],
            ),
        ),
        types.FunctionDeclaration(
            name="start_screen_recording",
            description="Tell the frontend to start a screen recording for workflow synthesis.",
            parameters=types.Schema(type="OBJECT", properties={}, required=[]),
        ),
        types.FunctionDeclaration(
            name="list_integrations",
            description="List the user's connected app integrations (Slack, Gmail, etc.)",
            parameters=types.Schema(type="OBJECT", properties={}, required=[]),
        ),
        types.FunctionDeclaration(
            name="call_integration",
            description="Execute a connected app integration action (send Slack message, create GitHub issue, etc.).",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "integration": types.Schema(type="STRING"),
                    "method": types.Schema(type="STRING"),
                    "args": types.Schema(type="OBJECT"),
                },
                required=["integration", "method"],
            ),
        ),
    ]


def get_tools() -> list:
    """Return Tool list for Live API config (voice session)."""
    if not types:
        return []
    return [types.Tool(function_declarations=get_tool_declarations())]


async def process_chat_turn(
    history: list[Any],
    client: Any,
    model: str,
) -> tuple[str | None, list[Any] | None, Any]:
    """
    Run one generate_content turn. Subagent owns the model call.

    Returns:
        (text_response, tool_calls, model_content)
        - If model returned text: (text, None, model_content)
        - If model returned tool calls: (None, list_of_function_calls, model_content)
    """
    if not types:
        return "EchoPrism Chat requires google-genai.", None, None

    fn_decls = get_tool_declarations()
    gen_config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=[types.Tool(function_declarations=fn_decls)],
        temperature=0.4,
    )

    response = await client.aio.models.generate_content(
        model=model,
        contents=history,
        config=gen_config,
    )

    candidate = response.candidates[0] if response.candidates else None
    if not candidate or not candidate.content:
        return "", None, None

    model_content = candidate.content
    fn_calls = [
        p.function_call
        for p in (model_content.parts or [])
        if p.function_call
    ]

    if fn_calls:
        return None, fn_calls, model_content

    text_parts = [p.text for p in (model_content.parts or []) if p.text]
    full_text = "".join(text_parts).strip()
    return full_text, None, model_content
