"""Inference parent graph: context subgraph → reasoning subgraph."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph
from langgraph.types import RetryPolicy

from echo_prism_agent.langgraph.nodes.inference.observe import build_history_context, observe_screen
from echo_prism_agent.langgraph.nodes.inference.parse_act import parse_and_validate
from echo_prism_agent.langgraph.nodes.inference.think import think_llm
from echo_prism_agent.langgraph.state.schemas import InferenceStepState


def build_context_subgraph() -> StateGraph:
    g = StateGraph(InferenceStepState)
    g.add_node("observe_screen", observe_screen)
    g.add_node("build_history_context", build_history_context)
    g.add_edge(START, "observe_screen")
    g.add_edge("observe_screen", "build_history_context")
    g.add_edge("build_history_context", END)
    return g


def build_reasoning_subgraph() -> StateGraph:
    g = StateGraph(InferenceStepState)
    g.add_node(
        "think_llm",
        think_llm,
        retry_policy=RetryPolicy(max_attempts=3, initial_interval=1.0),
    )
    g.add_node("parse_and_validate", parse_and_validate)
    g.add_edge(START, "think_llm")
    g.add_edge("think_llm", "parse_and_validate")
    g.add_edge("parse_and_validate", END)
    return g


def build_inference_graph() -> StateGraph:
    context_sg = build_context_subgraph().compile()
    reasoning_sg = build_reasoning_subgraph().compile()
    g = StateGraph(InferenceStepState)
    g.add_node("context", context_sg)
    g.add_node("reasoning", reasoning_sg)
    g.add_edge(START, "context")
    g.add_edge("context", "reasoning")
    g.add_edge("reasoning", END)
    return g
