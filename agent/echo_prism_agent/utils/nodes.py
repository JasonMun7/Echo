"""LangGraph nodes — backward-compatible re-exports and legacy helpers."""

from __future__ import annotations

from typing import Any

from echo_prism_agent.langgraph.nodes.chat_turn import chat_turn_node
from echo_prism_agent.langgraph.nodes.inference.observe import build_history_context, observe_screen
from echo_prism_agent.langgraph.nodes.inference.think import think_llm
from echo_prism_agent.langgraph.nodes.synthesis import synthesis_node
from echo_prism_agent.ui_tars.parse_actions import extract_thought, parse_action

# Legacy: `range(MAX_RETRIES + 1)` was four attempts; `max_failures` in state uses the same total.
MAX_RETRIES = 3


def observe_inference(state: InferenceStepState) -> dict[str, Any]:
    """Single-node equivalent of context subgraph (observe_screen → build_history_context)."""
    merged = {**state, **observe_screen(state)}
    return {**merged, **build_history_context(merged)}


async def think_inference(state: InferenceStepState) -> dict[str, Any]:
    return await think_llm(state)


def act_inference(state: InferenceStepState) -> dict[str, Any]:
    """Parse-only step matching pre-subgraph `act` node (no Command routing)."""
    raw = state.get("raw_text") or ""
    thought = extract_thought(raw)
    parsed = parse_action(raw)
    return {"thought": thought, "parsed": parsed, "error": None}


__all__ = [
    "MAX_RETRIES",
    "act_inference",
    "chat_turn_node",
    "observe_inference",
    "synthesis_node",
    "think_inference",
]

