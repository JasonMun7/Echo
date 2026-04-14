"""
EchoPrism LangGraph — graph construction and primary orchestration API.

Graphs are built in `utils.tools` (inference, chat-turn, synthesis). Public inference
entrypoints (`run_ambiguous_step_inference`, `verify_state_transition`) and
`run_ambiguous_step_inference_langgraph` live in this module.
"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Awaitable, Callable
from typing import Any, Literal

from echo_prism_agent.execution.operator import (
    merge_type_text_at_workflow_literal,
    resolve_coords_for_action,
)
from echo_prism_agent.model_prompts import WorkflowType, step_instruction
from echo_prism_agent.utils.state import (
    MAX_INFERENCE_FAILURES,
    GuiRunState,
    InferenceStepState,
)
from echo_prism_agent.utils.tools import (
    build_chat_turn_graph,
    build_gui_run_graph,
    build_inference_graph,
    build_synthesis_graph,
)
from echo_prism_agent.vision.thought_utils import extract_thought
from google import genai

logger = logging.getLogger(__name__)

AgentSignal = Literal["finished", "calluser"]


def _inference_thread_id(
    workflow_id: str | None,
    run_id: str | None,
    step_index: int,
    *,
    retry_suffix: str = "",
) -> str:
    """
    LangGraph ``thread_id`` for this inference invocation.

    Without a compiled checkpointer, state is not persisted between ``ainvoke`` calls; we still
    use a **per-run** id so LangSmith traces do not collide across workflows, and so a future
    optional checkpointer cannot merge unrelated runs (see LangGraph persistence docs: thread_id
    is the checkpoint key when a checkpointer is enabled).
    """
    wf = (workflow_id or "adhoc").replace("/", "_")[:80]
    rid = (run_id or "run").replace("/", "_")[:80]
    base = f"{wf}-{rid}-s{step_index}"
    return f"{base}{retry_suffix}" if retry_suffix else base


def _type_text_at_pointer_only_guardrail(step_data: dict[str, Any], parsed: dict[str, Any] | None) -> bool:
    """True when step is type_text_at but the model returned a pointer-only action (no typing)."""
    if not parsed:
        return False
    a = (step_data.get("action") or "").lower().replace("_", "")
    if a != "typetextat":
        return False
    pa = (parsed.get("action") or "").lower()
    if pa in ("type", "clickandtype"):
        return False
    if pa == "finished":
        return False
    if pa in ("click", "rightclick", "doubleclick", "scroll", "hover", "longpress"):
        return True
    return False


def _retry_extra_type_text_at(step_data: dict[str, Any]) -> str:
    pt = str((step_data.get("params") or {}).get("text") or "").strip()
    return (
        "CRITICAL: This workflow step is type_text_at. "
        f"The literal text {pt!r} must appear in the UI. "
        "Output Action: ClickAndType(x,y,...) with that exact string in the third argument, "
        "or type(content='...') with that exact string — not only click() or click(start_box=...) without typing."
    )


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
    workflow_id: str | None = None,
    run_id: str | None = None,
    cached_prompt: str | None = None,
    last_error_from_client: str = "",
    goal_only: bool = False,
    goal: str | None = None,
    thinking_delta_cb: Callable[[str], Awaitable[None]] | None = None,
    typing_override: str = "",
) -> tuple[bool | AgentSignal, str, str, dict[str, Any] | None, str | None]:
    """
    Inference-only: screenshot → OpenRouter + UI-TARS via LangGraph (``think_llm`` → ``parse_and_validate``).

    Returns (result, thought, action_str, parsed_action_dict, error).
    """
    if not (os.environ.get("OPENROUTER_API_KEY") or "").strip():
        return (
            False,
            "",
            "",
            None,
            "OPENROUTER_API_KEY is required for UI-TARS inference",
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
            workflow_id,
            run_id,
            cached_prompt,
            last_error_from_client,
            goal_only,
            goal,
            thinking_delta_cb,
            typing_override,
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
    UI-TARS-desktop ``BrowserGUIAgent`` parity: no pixel-delta block (see ``browser-gui-agent.ts``).

    If both captures exist, the step succeeds so history can advance; the next
    inference call uses the after screenshot regardless of whether pixels changed
    (static-screen adaptation is prompt-driven, ``prompt_t5.ts``).
    """
    _ = (action_str, expected_outcome, api_key)
    if not before_bytes or not after_bytes:
        return "Missing before or after screenshot", False
    return "Post-action screenshot recorded", True


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
    workflow_id: str | None = None,
    run_id: str | None = None,
    cached_prompt: str | None = None,
    last_error_from_client: str = "",
    goal_only: bool = False,
    goal: str | None = None,
    thinking_delta_cb: Callable[[str], Awaitable[None]] | None = None,
    typing_override: str = "",
) -> tuple[bool | Any, str, str, dict[str, Any] | None, str | None]:
    """
    Same contract as `run_ambiguous_step_inference` (WebSocket / OpenRouter entry).
    Uses LangGraph context → reasoning (think → parse + Command retries) with OpenRouter for think.

    Cross-step "memory" is the explicit ``history`` list from the client, not LangGraph checkpoint
    state (inference graph is compiled without a checkpointer; each ``ainvoke`` supplies full state).
    """
    history = history or []
    if goal_only and goal:
        instruction = (
            goal.strip() + "\n\nThere is no fixed step list—use each screenshot to choose the best next action. "
            "If the goal appears achieved, call Finished(). "
            "If stuck, try a different approach; never use CallUser."
        )
    else:
        instruction = step_instruction(step_data, step_index, total)

    if typing_override:
        instruction += (
            "\n\n## Run-time typing override\n"
            "Use this exact string in type(content='...') or ClickAndType when the step requires "
            "entering text — it takes precedence over synthesised placeholder text in workflow "
            f"params if they conflict: {typing_override!r}"
        )

    extra_context = ""
    if last_error_from_client:
        extra_context = f"Previous attempt failed: {last_error_from_client}\nTry a clearly different action."

    initial: InferenceStepState = {
        "screenshot_bytes": screenshot_bytes,
        "instruction": instruction,
        "workflow_type": workflow_type,
        "history": history,
        "extra_context": extra_context,
        "failure_count": 0,
        "max_failures": MAX_INFERENCE_FAILURES,
    }
    tid = _inference_thread_id(workflow_id, run_id, step_index)
    t0 = time.perf_counter()
    try:
        out = await _get_compiled_inference().ainvoke(
            initial,
            config={
                "configurable": {
                    "thread_id": tid,
                    "thinking_delta_cb": thinking_delta_cb,
                }
            },
        )
    except Exception as e:
        logger.exception("LangGraph inference failed")
        return False, "", "", None, str(e)
    finally:
        if (os.environ.get("ECHOPRISM_PERF_LOG") or "").strip() in ("1", "true", "yes"):
            logger.info(
                "perf inference step_index=%s wall_s=%.3f",
                step_index,
                time.perf_counter() - t0,
            )

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

    parsed = merge_type_text_at_workflow_literal(step_data, parsed, typing_override=typing_override)

    if not goal_only and _type_text_at_pointer_only_guardrail(step_data, parsed):
        logger.info(
            "type_text_at guardrail: model returned %r — retrying inference once",
            (parsed.get("action") or ""),
        )
        retry_block = _retry_extra_type_text_at(step_data)
        merged_ctx = "\n\n".join(x for x in (extra_context, retry_block) if x).strip()
        initial_retry: InferenceStepState = {
            **initial,
            "extra_context": merged_ctx,
            "failure_count": 0,
        }
        try:
            out = await _get_compiled_inference().ainvoke(
                initial_retry,
                config={
                    "configurable": {
                        "thread_id": _inference_thread_id(
                            workflow_id, run_id, step_index, retry_suffix="-typetext-retry"
                        ),
                        "thinking_delta_cb": thinking_delta_cb,
                    }
                },
            )
        except Exception as e:
            logger.exception("LangGraph inference retry failed: %s", e)
            return False, "", "", None, str(e)
        err = out.get("error")
        if err:
            return False, "", "", None, err
        if out.get("inference_terminal") == "calluser_exhausted":
            raw_text = out.get("raw_text") or ""
            thought = extract_thought(raw_text)
            parsed2 = out.get("parsed") or {}
            parsed_action_name = (parsed2.get("action") or "").lower()
            skip_keys = {"action"}
            kv = {k: v for k, v in parsed2.items() if k not in skip_keys}
            action_str = f"{parsed_action_name}({', '.join(str(v) for v in kv.values())})"
            return "finished", thought, action_str, None, None
        raw_text = out.get("raw_text") or ""
        thought = out.get("thought") or extract_thought(raw_text)
        parsed = out.get("parsed")
        if not parsed:
            return False, "", "", None, "Could not parse action from model output (retry)"
        parsed = merge_type_text_at_workflow_literal(step_data, parsed, typing_override=typing_override)

    client = genai.Client(api_key=api_key or os.environ.get("GEMINI_API_KEY", ""))
    parsed, _loc = await resolve_coords_for_action(
        parsed,
        screenshot_bytes,
        client,
        step_data,
    )
    parsed = merge_type_text_at_workflow_literal(step_data, parsed, typing_override=typing_override)

    parsed_action_name = (parsed.get("action") or "").lower()
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
    history: list[Any],
    client: Any,
    model: str,
    uid: str | None = None,
    *,
    composio_connection_id: str | None = None,
) -> tuple[str | None, list[Any] | None, Any]:
    """Single chat model turn inside a LangGraph node (same contract as `process_chat_turn`)."""
    cid = (composio_connection_id or "").strip()
    if uid:
        thread_id = f"echo-prism-chat-ws-{uid}-{cid}" if cid else f"echo-prism-chat-ws-{uid}"
    else:
        thread_id = "echo-prism-chat-ws"
    out = await _compiled_chat_turn().ainvoke(
        {
            "history": history,
            "client": client,
            "model": model,
            "uid": uid,
            "composio_connection_id": composio_connection_id,
        },
        config={"configurable": {"thread_id": thread_id}},
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


# --- GUI run graph (multi-step inference → execute → verify) -------------------


_compiled_gui_run: Any = None


def _get_compiled_gui_run(checkpointer: Any | None = None) -> Any:
    """Return compiled gui run graph; pass a checkpointer to enable interrupt/resume."""
    global _compiled_gui_run
    if checkpointer is not None:
        return build_gui_run_graph().compile(checkpointer=checkpointer)
    if _compiled_gui_run is None:
        _compiled_gui_run = build_gui_run_graph().compile()
    return _compiled_gui_run


async def run_gui_workflow_langgraph(
    initial: GuiRunState,
    *,
    thread_id: str = "gui-run-default",
    checkpointer: Any | None = None,
    configurable: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Run the nested inference → execute → verify loop (`build_gui_run_graph`).

    **thread_id**: LangGraph `config.configurable["thread_id"]` for tracing and optional checkpointing.

    **checkpointer**: Pass `MemorySaver()` (or a persistent store) if you use `interrupt()` or need
    resume semantics; without it, execution is stateless aside from in-memory run state.

    **configurable**: Merged into `config.configurable`. Common keys:
    - **gui_execute_fn**: async ``(state: GuiRunState, parsed: dict) -> dict`` — must return
      ``{"after_screenshot_bytes": bytes}`` (or ``screenshot_bytes``) after performing the action.

    **Interrupt / HITL**: Not enabled by default. To pause before side effects, compile with
    ``interrupt_before=["execute"]`` and supply a checkpointer (see LangGraph interrupt docs).
    """
    app = _get_compiled_gui_run(checkpointer)
    cfg: dict[str, Any] = {"configurable": {"thread_id": thread_id}}
    if configurable:
        cfg["configurable"] = {**cfg["configurable"], **configurable}
    return await app.ainvoke(initial, config=cfg)


# Compiled graphs for LangGraph CLI / LangSmith (no checkpointer; platform injects persistence when deployed)
inference_graph = build_inference_graph().compile()
chat_turn_graph = build_chat_turn_graph().compile()
synthesis_graph = build_synthesis_graph().compile()
gui_run_graph = build_gui_run_graph().compile()


__all__ = [
    "AgentSignal",
    "build_chat_turn_graph",
    "build_gui_run_graph",
    "build_inference_graph",
    "build_synthesis_graph",
    "chat_turn_graph",
    "gui_run_graph",
    "inference_graph",
    "run_ambiguous_step_inference",
    "run_ambiguous_step_inference_langgraph",
    "run_chat_turn_via_langgraph",
    "run_gui_workflow_langgraph",
    "synthesis_graph",
    "synthesize_via_langgraph",
    "verify_state_transition",
]
