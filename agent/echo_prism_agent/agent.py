"""
EchoPrism LangGraph — graph construction and primary orchestration API.

Builds inference (context subgraph → reasoning subgraph), chat-turn, and synthesis
graphs. Public inference entrypoints (`run_ambiguous_step_inference`, `verify_state_transition`)
and `run_ambiguous_step_inference_langgraph` live in this module.
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Any, Literal

from google import genai

from echo_prism_agent.ui_tars.parse_actions import extract_thought
from echo_prism_agent.model_prompts import WorkflowType, step_instruction
from echo_prism_agent.execution.operator import resolve_coords_for_action
from echo_prism_agent.langgraph.graphs.chat_turn import build_chat_turn_graph
from echo_prism_agent.langgraph.graphs.inference import build_inference_graph
from echo_prism_agent.langgraph.graphs.synthesis import build_synthesis_graph
from echo_prism_agent.langgraph.state.schemas import MAX_INFERENCE_FAILURES, InferenceStepState

logger = logging.getLogger(__name__)

AgentSignal = Literal["finished", "calluser"]


def _screenshot_hash(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


async def run_ambiguous_step_inference(
    screenshot_bytes: bytes,
    step_data: dict[str, Any],
    step_index: int,
    total: int,
    history: list[dict[str, Any]] | None = None,
    workflow_type: str = "browser",
    api_key: str | None = None,
    owner_uid: str | None = None,
    db: Any | None = None,
    cached_prompt: str | None = None,
    last_error_from_client: str = "",
    goal_only: bool = False,
    goal: str | None = None,
) -> tuple[bool | AgentSignal, str, str, dict[str, Any] | None, str | None]:
    """
    Inference-only: screenshot → OpenRouter/UI-TARS via LangGraph. No Gemini orchestration fallback.

    Returns (result, thought, action_str, parsed_action_dict, error).
    """
    if not (os.environ.get("OPENROUTER_API_KEY") or "").strip():
        return (
            False,
            "",
            "",
            None,
            "OPENROUTER_API_KEY is required; Gemini orchestration fallback has been removed",
        )
    try:
        return await run_ambiguous_step_inference_langgraph(
            screenshot_bytes,
            step_data,
            step_index,
            total,
            history,
            workflow_type,
            api_key,
            owner_uid,
            db,
            cached_prompt,
            last_error_from_client,
            goal_only,
            goal,
        )
    except Exception as e:
        logger.exception("LangGraph/OpenRouter inference failed: %s", e)
        return False, "", "", None, str(e)


async def verify_state_transition(
    before_bytes: bytes,
    after_bytes: bytes,
    action_str: str = "",
    expected_outcome: str = "",
    api_key: str | None = None,
) -> tuple[str, bool]:
    """
    Compare before/after screenshots by pixel hash. No Gemini/VLM call.

    Returns (description, succeeded). `api_key` is ignored (kept for call-site compatibility).
    """
    _ = action_str, expected_outcome, api_key
    if _screenshot_hash(before_bytes) != _screenshot_hash(after_bytes):
        return "Pixel change detected between before and after screenshots", True
    return "Screenshots identical — no visible change detected", False


# --- Inference graph ---


_compiled_inference = None


def _get_compiled_inference():
    global _compiled_inference
    if _compiled_inference is None:
        _compiled_inference = build_inference_graph().compile()
    return _compiled_inference


async def run_ambiguous_step_inference_langgraph(
    screenshot_bytes: bytes,
    step_data: dict[str, Any],
    step_index: int,
    total: int,
    history: list[dict[str, Any]] | None = None,
    workflow_type: WorkflowType = "browser",
    api_key: str | None = None,
    owner_uid: str | None = None,
    db: Any | None = None,
    cached_prompt: str | None = None,
    last_error_from_client: str = "",
    goal_only: bool = False,
    goal: str | None = None,
) -> tuple[bool | Any, str, str, dict[str, Any] | None, str | None]:
    """
    Same contract as `run_ambiguous_step_inference` (WebSocket / OpenRouter entry).
    Uses LangGraph context → reasoning (think → parse + Command retries) with OpenRouter for think.
    """
    history = history or []
    if goal_only and goal:
        instruction = (
            goal.strip()
            + "\n\nIf the goal appears achieved, call Finished(). "
            "If stuck, try a different approach; never use CallUser."
        )
    else:
        instruction = step_instruction(step_data, step_index, total)

    extra_context = ""
    if last_error_from_client:
        extra_context = (
            f"Previous attempt failed: {last_error_from_client}\nTry a clearly different action."
        )

    initial: InferenceStepState = {
        "screenshot_bytes": screenshot_bytes,
        "instruction": instruction,
        "workflow_type": workflow_type,
        "history": history,
        "extra_context": extra_context,
        "failure_count": 0,
        "max_failures": MAX_INFERENCE_FAILURES,
    }
    tid = f"inf-{step_index}"
    try:
        out = await _get_compiled_inference().ainvoke(
            initial,
            config={"configurable": {"thread_id": tid}},
        )
    except Exception as e:
        logger.exception("LangGraph inference failed")
        return False, "", "", None, str(e)

    err = out.get("error")
    if err:
        return False, "", "", None, err

    if out.get("inference_terminal") == "calluser_exhausted":
        raw_text = out.get("raw_text") or ""
        thought = out.get("thought") or extract_thought(raw_text)
        parsed = out.get("parsed") or {}
        parsed_action_name = (parsed.get("action") or "").lower()
        skip_keys = {"action"}
        kv = {k: v for k, v in parsed.items() if k not in skip_keys}
        action_str = f"{parsed_action_name}({', '.join(str(v) for v in kv.values())})"
        return "finished", thought, action_str, None, None

    raw_text = out.get("raw_text") or ""
    thought = out.get("thought") or extract_thought(raw_text)
    parsed = out.get("parsed")
    if not parsed:
        return False, "", "", None, "Could not parse action from model output"

    parsed_action_name = (parsed.get("action") or "").lower()
    client = genai.Client(api_key=api_key or os.environ.get("GEMINI_API_KEY", ""))
    parsed, _loc = await resolve_coords_for_action(
        parsed,
        screenshot_bytes,
        client,
        step_data,
    )

    skip_keys = {"action"}
    kv = {k: v for k, v in parsed.items() if k not in skip_keys}
    action_str = f"{parsed_action_name}({', '.join(str(v) for v in kv.values())})"

    if parsed_action_name == "finished":
        return "finished", thought, action_str, None, None

    return True, thought, action_str, parsed, None


# --- Chat turn graph ---


_compiled_chat = None


def _compiled_chat_turn():
    global _compiled_chat
    if _compiled_chat is None:
        _compiled_chat = build_chat_turn_graph().compile()
    return _compiled_chat


async def run_chat_turn_via_langgraph(
    history: list[Any], client: Any, model: str
) -> tuple[str | None, list[Any] | None, Any]:
    """Single chat model turn inside a LangGraph node (same contract as `process_chat_turn`)."""
    out = await _compiled_chat_turn().ainvoke(
        {"history": history, "client": client, "model": model},
        config={"configurable": {"thread_id": "echo-prism-chat-ws"}},
    )
    return out["text_resp"], out["fn_calls"], out["model_content"]


# --- Synthesis graph ---


_synth_compiled = None


def _compiled_synthesis():
    global _synth_compiled
    if _synth_compiled is None:
        _synth_compiled = build_synthesis_graph().compile()
    return _synth_compiled


async def synthesize_via_langgraph(client: Any, parts: list[Any]) -> dict[str, Any]:
    """Run synthesis inside a LangGraph (no checkpointer)."""
    out = await _compiled_synthesis().ainvoke(
        {"client": client, "parts": parts},
        config={"configurable": {"thread_id": "synthesis-main"}},
    )
    if out.get("error"):
        raise RuntimeError(out["error"])
    return {
        "steps": out["steps_data"],
        "variables": out.get("variables") or [],
        "title": out.get("title"),
        "workflow_type": out.get("workflow_type") or "browser",
    }


# Compiled graphs for LangGraph CLI / LangSmith (no checkpointer; platform injects persistence when deployed)
inference_graph = build_inference_graph().compile()
chat_turn_graph = build_chat_turn_graph().compile()
synthesis_graph = build_synthesis_graph().compile()


__all__ = [
    "AgentSignal",
    "build_chat_turn_graph",
    "build_inference_graph",
    "build_synthesis_graph",
    "chat_turn_graph",
    "inference_graph",
    "run_ambiguous_step_inference",
    "run_ambiguous_step_inference_langgraph",
    "run_chat_turn_via_langgraph",
    "synthesis_graph",
    "synthesize_via_langgraph",
    "verify_state_transition",
]
