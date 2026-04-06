"""LangGraph testing patterns (MemorySaver optional, subgraph nodes, Command routing)."""

import asyncio

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END
from langgraph.types import Command

from echo_prism_agent.agent import (
    build_inference_graph,
    build_synthesis_graph,
    verify_state_transition,
)
from echo_prism_agent.utils.nodes import (
    gui_route_after_verify,
    gui_run_verify,
    parse_and_validate,
    route_after_inference,
)
from echo_prism_agent.utils.tools import build_context_subgraph, build_gui_run_graph
from echo_prism_agent.utils.state import MAX_INFERENCE_FAILURES


def test_context_subgraph_observe_screen_node_only():
    """Per-node invoke avoids OpenRouter (no network)."""
    g = build_context_subgraph()
    cp = MemorySaver()
    compiled = g.compile(checkpointer=cp)
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    initial = {
        "screenshot_bytes": png,
        "instruction": "Click the submit button.",
        "workflow_type": "desktop",
        "history": [],
        "extra_context": "",
    }
    out = compiled.nodes["observe_screen"].invoke(initial)
    assert "screen_width_px" in out
    assert "vlm_resize_width" in out
    assert "vlm_resize_height" in out
    assert "img_bytes" in out


def test_inference_parent_has_context_and_reasoning_nodes():
    g = build_inference_graph()
    compiled = g.compile()
    assert "context" in compiled.nodes
    assert "reasoning" in compiled.nodes


def test_parse_and_validate_command_retry_on_unparseable():
    state = {
        "raw_text": "Thought: x\nNo valid Action line",
        "failure_count": 0,
        "max_failures": 4,
        "error": None,
    }
    out = parse_and_validate(state)
    assert isinstance(out, Command)
    assert getattr(out, "goto", None) == "think_llm"
    assert out.update.get("failure_count") == 1


def test_parse_and_validate_exhausted_returns_error_dict():
    state = {
        "raw_text": "garbage",
        "failure_count": 3,
        "max_failures": 4,
        "error": None,
    }
    out = parse_and_validate(state)
    assert isinstance(out, dict)
    assert out.get("error")


def test_parse_and_validate_remaps_vlm_pixels_to_norm1000(monkeypatch: pytest.MonkeyPatch):
    """Same path as UI-TARS-desktop: VLM canvas pixels → 0–1000 before execute/resolve."""
    monkeypatch.setenv("ECHOPRISM_UI_TARS_COORD_MODE", "vlm_pixel")
    state = {
        "raw_text": "Thought: tap\nAction: Click(838, 326)",
        "failure_count": 0,
        "max_failures": 4,
        "error": None,
        "vlm_resize_width": 1932,
        "vlm_resize_height": 1092,
    }
    out = parse_and_validate(state)
    assert isinstance(out, dict)
    assert out.get("error") is None
    p = out.get("parsed") or {}
    assert p.get("x") == int(round((838 / 1932) * 1000))
    assert p.get("y") == int(round((326 / 1092) * 1000))


def test_coordinate_transformer():
    from echo_prism_agent.ui_tars.parse_actions import CoordinateTransformer

    t = CoordinateTransformer(1920, 1080)
    x, y = t.to_pixel(500, 500)
    assert x == 960
    assert y == 540


def test_synthesis_graph_smoke():
    g = build_synthesis_graph().compile()
    assert g is not None


def test_build_gui_run_graph_has_prepare_and_route_verify():
    g = build_gui_run_graph().compile()
    assert "prepare" in g.nodes
    assert "inference" in g.nodes
    assert "route_verify" in g.nodes


def test_verify_state_transition_succeeds_without_pixel_delta():
    """Matches UI-TARS-desktop: both captures present is enough to advance."""
    a, b = b"before-bytes", b"after-bytes"
    desc, ok = asyncio.run(verify_state_transition(a, b))
    assert ok is True
    assert "recorded" in desc
    _, missing = asyncio.run(verify_state_transition(b"", b"y"))
    assert missing is False


def test_gui_run_verify_passes_when_before_after_identical():
    """UI-TARS does not retry when pixels are unchanged — next VLM turn decides."""
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    state = {
        "execute_skipped": False,
        "before_screenshot_bytes": png,
        "after_screenshot_bytes": png,
        "screenshot_bytes": png,
    }
    out = asyncio.run(gui_run_verify(state))
    assert out["verify_delta_ok"] is True
    assert out["outcome_met"] is True


def test_route_after_inference_branches():
    assert route_after_inference({"error": "e"}) == "end_error"
    assert route_after_inference({"parsed": {"action": "finished"}, "error": None}) == "end_success"
    assert route_after_inference({"parsed": {"action": "click"}, "error": None}) == "execute"


def test_gui_route_after_verify_failure_command_to_inference():
    out = gui_route_after_verify(
        {
            "verify_delta_ok": False,
            "verification_hint": "identical",
            "verify_failure_count": 0,
            "max_verify_retries": 3,
        }
    )
    assert isinstance(out, Command)
    assert out.goto == "inference"
    assert out.update.get("failure_count") == 0


def test_gui_route_after_verify_exhausted_goes_end():
    out = gui_route_after_verify(
        {
            "verify_delta_ok": False,
            "verification_hint": "x",
            "verify_failure_count": 3,
            "max_verify_retries": 3,
        }
    )
    assert isinstance(out, Command)
    assert out.goto == END


def test_gui_run_finished_with_mocked_think_llm(monkeypatch):
    async def fake_think_llm(state, config):
        return {"raw_text": "Thought: done\nAction: Finished()", "error": None}

    # Patch `tools.think_llm` — `build_inference_graph` closes over the import in `utils.tools`.
    monkeypatch.setattr(
        "echo_prism_agent.utils.tools.think_llm",
        fake_think_llm,
    )
    # Compile after patch so the nested inference graph binds the patched think_llm
    # (module-level `gui_run_graph` may have been built at import time).
    app = build_gui_run_graph().compile()

    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    initial = {
        "screenshot_bytes": png,
        "instruction": "Task.",
        "workflow_type": "desktop",
        "history": [],
        "extra_context": "",
        "failure_count": 0,
        "max_failures": MAX_INFERENCE_FAILURES,
    }

    async def _run():
        return await app.ainvoke(
            initial,
            config={"configurable": {"thread_id": "pytest-gui-finished"}},
        )

    out = asyncio.run(_run())
    assert out.get("gui_run_terminal") == "finished"
