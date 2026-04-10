"""LangGraph graph builders, Gemini chat tools, and muscle-mem verification tool providers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict

from langchain_core.tools import tool
from langgraph.graph import END, START, StateGraph
from langgraph.types import RetryPolicy
from langchain_google_genai._function_utils import convert_to_genai_function_declarations

try:
    from google.genai import types
except ImportError:
    types = None  # type: ignore[assignment]

try:
    from muscle_mem.agents.tools.registry import tool_action
except ImportError:

    def tool_action(fn):  # type: ignore[no-redef]
        """No-op when ``muscle_mem`` is not installed (UI-TARS inference does not require it)."""
        return fn

from echo_prism_agent.constants import VERIFICATION_CONCLUSIONS
from echo_prism_agent.model_prompts import CHAT_SYSTEM_PROMPT
from echo_prism_agent.models_config import CHAT_MODEL
from echo_prism_agent.utils.nodes import (
    build_history_context,
    chat_turn_node,
    gui_infeasible_optional,
    gui_route_after_verify,
    gui_run_execute,
    gui_run_prepare,
    gui_run_verify,
    gui_tag_end_error,
    gui_tag_end_success,
    observe_screen,
    parse_and_validate,
    route_after_inference,
    synthesis_node,
    think_llm,
)
from echo_prism_agent.utils.state import ChatTurnState, GuiRunState, InferenceStepState, SynthesisGraphState

# Back-compat alias (same string as CHAT_SYSTEM_PROMPT in model_prompts)
SYSTEM_PROMPT = CHAT_SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# Chat tools — LangChain @tool (schemas only; router executes via Firestore/HTTP)
# ---------------------------------------------------------------------------


@tool
def list_workflows() -> str:
    """List the user's workflows. Returns names and IDs."""
    return ""


@tool
def run_workflow(workflow_id: str, workflow_name: str = "") -> str:
    """Start running a workflow by ID. Actually triggers the EchoPrism agent.

    Args:
        workflow_id: The workflow ID to run.
        workflow_name: Human-readable name for confirmation.
    """
    return ""


@tool
def redirect_run(workflow_id: str, run_id: str, instruction: str) -> str:
    """Inject a mid-run instruction for EchoPrism to follow on its next step.

    Args:
        workflow_id: Workflow document ID.
        run_id: Run document ID.
        instruction: Instruction text for the next step.
    """
    return ""


@tool
def cancel_run(workflow_id: str, run_id: str) -> str:
    """Cancel a running workflow execution.

    Args:
        workflow_id: Workflow document ID.
        run_id: Run document ID.
    """
    return ""


@tool
def dismiss_calluser(workflow_id: str, run_id: str) -> str:
    """Dismiss a workflow run that is awaiting user input (status=awaiting_user).

    Args:
        workflow_id: Workflow document ID.
        run_id: Run document ID.
    """
    return ""


@tool
def run_adhoc(
    instruction: str,
    workflow_type: str = "browser",
    workflow_name: str = "",
) -> str:
    """Execute a one-off task immediately without saving a workflow.

    WHEN TO USE run_adhoc (do it now):
    - 'Navigate to X and sign in' / 'Open Discord and log in' / 'Go to Gmail'
    - 'Take me to my Slack' / requests to DO something on a site or app without 'create a workflow'

    WHEN TO USE synthesize_from_description INSTEAD:
    - 'Create a workflow that...' / user explicitly wants reusable automation

    WHEN TO USE run_workflow INSTEAD:
    - User names an existing workflow to run

    Args:
        instruction: Clear imperative task (site/app and what to do).
        workflow_type: 'browser' for web, 'desktop' for native OS apps.
        workflow_name: Short label for the ephemeral run (optional).
    """
    return ""


@tool
def synthesize_from_description(
    description: str,
    workflow_name: str,
    workflow_type: str = "browser",
) -> str:
    """Create a new workflow from a natural language description. Generates steps via EchoPrism.

    Args:
        description: What the workflow should do.
        workflow_name: Name for the new workflow.
        workflow_type: 'browser' or 'desktop'.
    """
    return ""


@tool
def start_screen_recording() -> str:
    """Tell the frontend to start a screen recording for workflow synthesis."""
    return ""


@tool
def list_integrations() -> str:
    """List the user's connected app integrations (Slack, Gmail, etc.)."""
    return ""


@tool
def call_integration(
    integration: str, method: str, arguments: dict[str, Any] | None = None
) -> str:
    """Execute a connected app integration action (Slack, GitHub, etc.).

    Args:
        integration: Integration id (e.g. slack).
        method: API method name.
        arguments: Optional JSON object of arguments.
    """
    return ""


ECHO_PRISM_CHAT_TOOLS: list[Any] = [
    list_workflows,
    run_workflow,
    redirect_run,
    cancel_run,
    dismiss_calluser,
    run_adhoc,
    synthesize_from_description,
    start_screen_recording,
    list_integrations,
    call_integration,
]

tools_by_name = {t.name: t for t in ECHO_PRISM_CHAT_TOOLS}


# ---------------------------------------------------------------------------
# Verification agent (ToolRegistry / muscle-mem `tool_action`)
# ---------------------------------------------------------------------------


if TYPE_CHECKING:
    from echo_prism_agent.verification.manager import VerificationAgentManager


class VerificationResultToolProvider:
    """Registers report_verification_plan and report_verification_result for semantic GUI verify."""

    def __init__(self, manager: "VerificationAgentManager") -> None:
        self.manager = manager

    @tool_action
    def report_verification_plan(
        self,
        task_understanding: str,
        possible_failures: str,
        screenshot_observation: str,
        verification_plan: str,
    ) -> Dict[str, str]:
        """Record the verification plan before taking other actions."""
        payload = {
            "task_understanding": (task_understanding or "").strip(),
            "possible_failures": (possible_failures or "").strip(),
            "screenshot_observation": (screenshot_observation or "").strip(),
            "verification_plan": (verification_plan or "").strip(),
        }
        self.manager.last_reported_plan = payload
        return payload

    @tool_action
    def report_verification_result(self, conclusion: str, explanation: str) -> Dict[str, str]:
        """Report the final verification result."""
        normalized = (conclusion or "").strip().upper()
        if normalized not in VERIFICATION_CONCLUSIONS:
            raise ValueError(
                f"Invalid conclusion '{conclusion}'. Must be one of: {', '.join(VERIFICATION_CONCLUSIONS)}."
            )
        payload = {"conclusion": normalized, "explanation": (explanation or "").strip()}
        self.manager.last_reported_result = payload
        return payload


VerificationResultToolProvider.report_verification_result.tool_input_schema = {
    "type": "object",
    "description": "Report the verification conclusion and explanation.",
    "properties": {
        "conclusion": {
            "type": "string",
            "enum": list(VERIFICATION_CONCLUSIONS),
            "description": "Verification conclusion.",
        },
        "explanation": {
            "type": "string",
            "description": "Brief evidence or reasoning.",
        },
    },
    "required": ["conclusion", "explanation"],
    "additionalProperties": False,
}

VerificationResultToolProvider.report_verification_plan.tool_input_schema = {
    "type": "object",
    "description": "Report the verification plan, including observations, task understanding, and plan.",
    "properties": {
        "task_understanding": {
            "type": "string",
            "description": "How you interpret the task.",
        },
        "possible_failures": {
            "type": "string",
            "description": "What could cause the verification to fail.",
        },
        "screenshot_observation": {
            "type": "string",
            "description": "What you observed from the screenshots.",
        },
        "verification_plan": {
            "type": "string",
            "description": "Your verification plan.",
        },
    },
    "required": [
        "task_understanding",
        "possible_failures",
        "screenshot_observation",
        "verification_plan",
    ],
    "additionalProperties": False,
}


def get_tool_declarations() -> list[Any]:
    """Flatten Gemini `FunctionDeclaration` list for legacy callers."""
    if not types:
        return []
    genai_tools = convert_to_genai_function_declarations(ECHO_PRISM_CHAT_TOOLS)
    fds: list[Any] = []
    for t in genai_tools:
        fdecl = getattr(t, "function_declarations", None)
        if fdecl:
            fds.extend(fdecl)
    return fds


def get_tools() -> list[Any]:
    """Return `google.genai.types.Tool` list for Gemini Live API config."""
    if not types:
        return []
    return convert_to_genai_function_declarations(ECHO_PRISM_CHAT_TOOLS)


async def process_chat_turn(
    history: list[Any],
    client: Any,
    model: str | None = None,
) -> tuple[str | None, list[Any] | None, Any]:
    """
    Run one generate_content turn.

    Returns:
        (text_response, tool_calls, model_content)
        - If model returned text: (text, None, model_content)
        - If model returned tool calls: (None, list_of_function_calls, model_content)
    """
    if not types:
        return "EchoPrism Chat requires google-genai.", None, None

    mid = model or CHAT_MODEL
    gen_config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        tools=convert_to_genai_function_declarations(ECHO_PRISM_CHAT_TOOLS),
        temperature=0.4,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(
            maximum_remote_calls=100,
        ),
    )

    response = await client.aio.models.generate_content(
        model=mid,
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


# ---------------------------------------------------------------------------
# LangGraph graphs
# ---------------------------------------------------------------------------


def build_chat_turn_graph() -> StateGraph:
    g = StateGraph(ChatTurnState)
    g.add_node("turn", chat_turn_node)
    g.add_edge(START, "turn")
    g.add_edge("turn", END)
    return g


def build_context_subgraph() -> StateGraph:
    g = StateGraph(InferenceStepState)
    g.add_node("observe_screen", observe_screen)
    g.add_node("build_history_context", build_history_context)
    g.add_edge(START, "observe_screen")
    g.add_edge("observe_screen", "build_history_context")
    g.add_edge("build_history_context", END)
    return g


def build_reasoning_subgraph() -> StateGraph:
    """OpenRouter + UI-TARS (``think_llm`` → ``parse_and_validate`` with ``Command`` retries)."""
    g = StateGraph(InferenceStepState)
    g.add_node(
        "think_llm",
        think_llm,
        retry_policy=RetryPolicy(max_attempts=3, initial_interval=1.0),
    )
    g.add_node("parse_and_validate", parse_and_validate)
    g.add_edge(START, "think_llm")
    g.add_edge("think_llm", "parse_and_validate")
    g.add_edge("parse_and_validate", END)
    return g


def build_inference_graph() -> StateGraph:
    context_sg = build_context_subgraph().compile()
    reasoning_sg = build_reasoning_subgraph().compile()
    g = StateGraph(InferenceStepState)
    g.add_node("context", context_sg)
    g.add_node("reasoning", reasoning_sg)
    g.add_edge(START, "context")
    g.add_edge("context", "reasoning")
    g.add_edge("reasoning", END)
    return g


def build_gui_run_graph() -> StateGraph:
    """
    Multi-step GUI loop: prepare → inference subgraph → execute → verify → route (Command).
    Nests `build_inference_graph` unchanged. Use `compile(checkpointer=...)` for interrupt/HITL.
    """
    inference_compiled = build_inference_graph().compile()
    g = StateGraph(GuiRunState)
    g.add_node("prepare", gui_run_prepare)
    g.add_node("infeasible_optional", gui_infeasible_optional)
    g.add_node("inference", inference_compiled)
    g.add_node("execute", gui_run_execute)
    g.add_node("verify", gui_run_verify)
    g.add_node("route_verify", gui_route_after_verify)
    g.add_node("tag_end_error", gui_tag_end_error)
    g.add_node("tag_end_success", gui_tag_end_success)

    g.add_edge(START, "prepare")
    g.add_edge("prepare", "infeasible_optional")
    g.add_edge("infeasible_optional", "inference")
    g.add_conditional_edges(
        "inference",
        route_after_inference,
        {
            "execute": "execute",
            "end_error": "tag_end_error",
            "end_success": "tag_end_success",
        },
    )
    g.add_edge("execute", "verify")
    g.add_edge("verify", "route_verify")
    g.add_edge("tag_end_error", END)
    g.add_edge("tag_end_success", END)
    return g


def build_synthesis_graph() -> StateGraph:
    g = StateGraph(SynthesisGraphState)
    g.add_node("synthesize", synthesis_node)
    g.add_edge(START, "synthesize")
    g.add_edge("synthesize", END)
    return g


__all__ = [
    "CHAT_MODEL",
    "ECHO_PRISM_CHAT_TOOLS",
    "SYSTEM_PROMPT",
    "VerificationResultToolProvider",
    "build_chat_turn_graph",
    "build_context_subgraph",
    "build_gui_run_graph",
    "build_inference_graph",
    "build_reasoning_subgraph",
    "build_synthesis_graph",
    "get_tool_declarations",
    "get_tools",
    "process_chat_turn",
    "think_llm",
    "tools_by_name",
]
