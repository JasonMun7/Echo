"""LangGraph testing patterns (MemorySaver optional, subgraph nodes, Command routing)."""

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from echo_prism_agent.agent import build_inference_graph, build_synthesis_graph
from echo_prism_agent.langgraph.graphs.inference import build_context_subgraph
from echo_prism_agent.langgraph.nodes.inference.parse_act import parse_and_validate


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


def test_coordinate_transformer():
    from echo_prism_agent.ui_tars.parse_actions import CoordinateTransformer

    t = CoordinateTransformer(1920, 1080)
    x, y = t.to_pixel(500, 500)
    assert x == 960
    assert y == 540


def test_synthesis_graph_smoke():
    g = build_synthesis_graph().compile()
    assert g is not None
