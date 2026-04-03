"""Reasoning subgraph: OpenRouter vision LLM call."""

from __future__ import annotations

from echo_prism_agent.langgraph.state.schemas import InferenceStepState
from echo_prism_agent.model_prompts import system_prompt
from echo_prism_agent.ui_tars.openrouter_vision import chat_completions_vision


async def think_llm(state: InferenceStepState) -> dict[str, Any]:
    sys = system_prompt(state["instruction"], state.get("workflow_type", "desktop") or "desktop")
    user_parts = []
    if state.get("history_text"):
        user_parts.append(f"Prior steps summary:\n{state['history_text']}\n")
    if state.get("extra_context"):
        user_parts.append(state["extra_context"])
    user_parts.append(
        "Current screenshot is attached. Output Thought: then Action: following the system contract."
    )
    user_text = "\n".join(user_parts)
    extra = state.get("extra_images") or []
    raw, err = await chat_completions_vision(
        system=sys,
        user_text=user_text,
        image_png_bytes=state["screenshot_bytes"],
        extra_image_parts=list(extra) if extra else None,
    )
    if err:
        return {"raw_text": "", "error": err}
    return {"raw_text": raw or "", "error": None}
