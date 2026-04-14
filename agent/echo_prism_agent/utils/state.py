"""TypedDict state schemas for EchoPrism LangGraph graphs."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from echo_prism_agent.constants import DEFAULT_GUI_RUN_MAX_LOOPS, MAX_INFERENCE_FAILURES


class InferenceStepState(TypedDict, total=False):
    """State for one inference step (OpenRouter / UI-TARS path)."""

    screenshot_bytes: bytes
    instruction: str
    workflow_type: str
    history: list[dict[str, Any]]
    extra_context: str
    screen_width_px: int
    screen_height_px: int
    # Smart-resize dimensions sent to the VLM (matches compress_screenshot / UI-TARS wBar x hBar).
    vlm_resize_width: int
    vlm_resize_height: int
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
    # muscle-mem / Kimi path
    muscle_run_id: str | None


class GuiRunState(InferenceStepState, total=False):
    """
    Parent state for multi-step observe → inference → execute → verify loops.
    Includes all inference channels plus raw verify / loop metadata (Thinking in LangGraph: raw state, format prompts in nodes).
    """

    loop_count: int
    max_loop_count: int
    before_screenshot_bytes: bytes
    after_screenshot_bytes: bytes | None
    verify_delta_ok: bool | None
    verification_hint: str
    verify_failure_count: int
    max_verify_retries: int
    gui_run_terminal: Literal["finished", "max_loops", "error", "inference_failed"] | None
    gui_error: str | None
    execute_skipped: bool | None
    thread_label: str
    # Optional context for logging / prompts; semantic verification (Kimi) uses these + screenshots
    expected_outcome: str
    action_str: str
    is_code_agent_verification: bool
    # Muscle replay + procedural-memory self-healing (verify failure clears cached trajectory)
    cache_clear_on_fail: bool
    muscle_replay_active: bool
    procedural_memory_key: str | None
    outcome_met: bool | None


class ChatTurnState(TypedDict, total=False):
    """State for one Gemini chat turn (text)."""

    history: list[Any]
    client: Any
    model: str
    uid: str | None
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

__all__ = [
    "DEFAULT_GUI_RUN_MAX_LOOPS",
    "MAX_INFERENCE_FAILURES",
    "ChatTurnState",
    "GuiRunState",
    "InferenceGraphState",
    "InferenceStepState",
    "SynthesisGraphState",
]
