"""Parse model output; route with Command for retries (LangGraph dynamic edges)."""

from __future__ import annotations

from typing import Any

from langgraph.types import Command

from echo_prism_agent.langgraph.state.schemas import (
    MAX_INFERENCE_FAILURES,
    InferenceStepState,
)
from echo_prism_agent.ui_tars.parse_actions import extract_thought, parse_action


def _extra_context_for_retry(message: str) -> str:
    return f"Previous attempt failed: {message}\nTry a clearly different action."


def parse_and_validate(
    state: InferenceStepState,
) -> Command | dict[str, Any]:
    fc = int(state.get("failure_count") or 0)
    max_f = int(state.get("max_failures") or MAX_INFERENCE_FAILURES)

    def _exhausted_error(message: str) -> dict[str, Any]:
        raw = state.get("raw_text") or ""
        return {
            "error": message,
            "thought": extract_thought(raw),
            "parsed": None,
        }

    def _retry_think(message: str) -> Command | dict[str, Any]:
        nfc = fc + 1
        if nfc >= max_f:
            return _exhausted_error(message)
        return Command(
            update={
                "failure_count": nfc,
                "extra_context": _extra_context_for_retry(message),
                "raw_text": "",
                "error": None,
                "parsed": None,
                "thought": "",
            },
            goto="think_llm",
        )

    err = state.get("error")
    if err:
        return _retry_think(err)

    raw = state.get("raw_text") or ""
    thought = extract_thought(raw)
    parsed = parse_action(raw)

    if not parsed:
        return _retry_think(f"Could not parse action from model output: {raw[:200]}")

    action = (parsed.get("action") or "").lower()
    if action == "finished":
        return {"thought": thought, "parsed": parsed, "error": None}

    if action == "calluser":
        msg = (thought.strip() if thought else "Model attempted CallUser") + " — try a different approach"
        nfc = fc + 1
        if nfc >= max_f:
            return {
                "thought": thought,
                "parsed": parsed,
                "error": None,
                "inference_terminal": "calluser_exhausted",
            }
        return Command(
            update={
                "failure_count": nfc,
                "extra_context": _extra_context_for_retry(msg),
                "raw_text": "",
                "error": None,
                "parsed": None,
                "thought": "",
            },
            goto="think_llm",
        )

    return {"thought": thought, "parsed": parsed, "error": None, "inference_terminal": None}
