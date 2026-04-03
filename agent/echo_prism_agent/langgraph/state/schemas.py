"""TypedDict state schemas for EchoPrism LangGraph graphs."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

# Max outer-loop-style retries (matches legacy `range(MAX_RETRIES + 1)`).
MAX_INFERENCE_FAILURES = 4


class InferenceStepState(TypedDict, total=False):
    """State for one inference step (OpenRouter / UI-TARS path)."""

    screenshot_bytes: bytes
    instruction: str
    workflow_type: str
    history: list[dict[str, Any]]
    extra_context: str
    screen_width_px: int
    screen_height_px: int
    img_bytes: bytes
    history_text: str
    extra_images: list[bytes] | None
    raw_text: str
    thought: str
    parsed: dict[str, Any] | None
    error: str | None
    # In-graph retry control (Command loop in reasoning subgraph)
    failure_count: int
    max_failures: int
    inference_terminal: Literal["calluser_exhausted"] | None


class ChatTurnState(TypedDict, total=False):
    """State for one Gemini chat turn (text)."""

    history: list[Any]
    client: Any
    model: str
    text_resp: str | None
    fn_calls: list[Any] | None
    model_content: Any


class SynthesisGraphState(TypedDict, total=False):
    """State for media → steps synthesis."""

    client: Any
    parts: list[Any]
    steps_data: list[dict[str, Any]]
    variables: list[str]
    title: str | None
    workflow_type: str
    error: str | None


InferenceGraphState = InferenceStepState
