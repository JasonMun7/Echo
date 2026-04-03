"""Single-node Gemini chat turn."""

from __future__ import annotations

from typing import Any

from echo_prism_agent.langgraph.state.schemas import ChatTurnState
from echo_prism_agent.modalities.chat import process_chat_turn


async def chat_turn_node(state: ChatTurnState) -> dict[str, Any]:
    text_resp, fn_calls, model_content = await process_chat_turn(
        state["history"], state["client"], state["model"]
    )
    return {
        "text_resp": text_resp,
        "fn_calls": fn_calls,
        "model_content": model_content,
    }
