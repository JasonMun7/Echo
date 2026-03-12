"""
EchoPrism Chat — Alpha's text modality layer.

Chat is the root agent for text; it IS Alpha for the conversational interface.
Tools (list_workflows, run_workflow, synthesize_from_description, etc.) delegate to
Synthesis and Runner. Router handles WebSocket I/O and tool execution.
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
When the user asks to navigate somewhere, do something on a site, or perform a task without explicitly asking for a workflow, use run_adhoc instead of synthesize_from_description.
After an ad-hoc run starts, say something like: "I've started that for you. You can track it [here]. Would you like to save this as a reusable workflow?"
Differentiate: "create a workflow" → synthesize_from_description; "go to X and do Y" / "navigate to X" → run_adhoc.

IMPORTANT: Never reveal workflow IDs, run IDs, document IDs, or any internal identifier to the user in your text responses. Use only human-readable names. IDs are for tool calls only, not for conversation.

Format responses with clean markdown: use short bullets, avoid excessive asterisks. Structure replies for readability.

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
            name="run_adhoc",
            description=(
                "Execute a one-off task immediately in a browser or desktop, without saving a workflow. "
                "The task runs right away; you can offer to save it as a workflow afterward.\n\n"
                "WHEN TO USE run_adhoc (do it now):\n"
                "- 'Navigate to X and sign in' / 'Open Discord and log in' / 'Go to Gmail'\n"
                "- 'Take me to my Slack' / 'Can you set up my navigate to Discord and sign in'\n"
                "- Any request to DO something on a site or app without the words 'create a workflow' or 'save a workflow'\n\n"
                "WHEN TO USE synthesize_from_description INSTEAD (create for later):\n"
                "- 'Create a workflow that...' / 'I want a workflow to...' / 'Save this as a workflow'\n"
                "- User explicitly wants to store automation for reuse\n\n"
                "WHEN TO USE run_workflow INSTEAD (run existing):\n"
                "- User names an existing workflow or asks to run one they already have"
            ),
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "instruction": types.Schema(
                        type="STRING",
                        description=(
                            "Clear, imperative description of the task. Include the target site/app and what to do. "
                            "Examples: 'Navigate to https://discord.com and sign in to my account', "
                            "'Go to Gmail and compose a new email', 'Open Slack and post a message to #general'. "
                            "Keep it to one coherent flow (single site or single app)."
                        ),
                    ),
                    "workflow_type": types.Schema(
                        type="STRING",
                        description=(
                            "'browser' for web tasks (websites, web apps). "
                            "'desktop' for native OS apps (Finder, terminal, system menus). "
                            "Default to 'browser' when the target is a URL or web service."
                        ),
                    ),
                    "workflow_name": types.Schema(
                        type="STRING",
                        description=(
                            "Short label for the ephemeral run (e.g. 'Discord sign-in', 'Open Gmail'). "
                            "Optional; if omitted, backend derives from instruction."
                        ),
                    ),
                },
                required=["instruction"],
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
        automatic_function_calling=types.AutomaticFunctionCallingConfig(
            maximum_remote_calls=100,
        ),
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
